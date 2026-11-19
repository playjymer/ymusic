mod api;
mod auth;
mod proxy;

use api::{TrackItem, UserProfile, WaveBatch, YandexMusicClient};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State, Url};

pub struct AppState {
    client: Mutex<Option<YandexMusicClient>>,
    user: Mutex<Option<UserProfile>>,
    proxy_port: u16,
}

#[tauri::command]
async fn open_login_window(app: AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("yandex-login") {
        let _ = existing.set_focus();
        return Ok(());
    }

    let auth_url = "https://oauth.yandex.ru/authorize?response_type=token&client_id=23cabbbdc6cd418abb4b39c32c41195d";
    let parsed_url: Url = auth_url.parse().map_err(|e| format!("{:?}", e))?;
    let url = tauri::WebviewUrl::External(parsed_url);

    let app_handle = app.clone();
    let init_script = r#"
        (function() {
            function check() {
                try {
                    var h = window.location.href || '';
                    var hash = window.location.hash || '';
                    if (h.indexOf('access_token=') !== -1 || hash.indexOf('access_token=') !== -1) {
                        var m = (h + '&' + hash).match(/access_token=([a-zA-Z0-9_\-]+)/);
                        if (m && m[1]) {
                            window.location.href = 'https://ymusic.local/done?token=' + m[1];
                        }
                    }
                } catch(e) {}
            }
            setInterval(check, 150);
            window.addEventListener('load', check);
            window.addEventListener('hashchange', check);
        })();
    "#;

    let window = tauri::WebviewWindowBuilder::new(&app, "yandex-login", url)
        .title("Вход в Яндекс")
        .inner_size(520.0, 700.0)
        .center()
        .initialization_script(init_script)
        .on_navigation(move |nav_url| {
            let s = nav_url.as_str();
            if let Some(token) = auth::extract_token_from_str(s) {
                let _ = auth::save_token(&token);
                let _ = app_handle.emit("auth-token-received", token);
                if let Some(w) = app_handle.get_webview_window("yandex-login") {
                    let _ = w.close();
                }
                return false;
            }
            true
        })
        .build()
        .map_err(|e| e.to_string())?;

    let _ = window.show();
    Ok(())
}

#[tauri::command]
async fn logout(state: State<'_, AppState>) -> Result<(), String> {
    let _ = auth::clear_token();
    let mut c = state.client.lock().map_err(|e| e.to_string())?;
    *c = None;
    let mut u = state.user.lock().map_err(|e| e.to_string())?;
    *u = None;
    Ok(())
}

#[tauri::command]
async fn init_auth(state: State<'_, AppState>) -> Result<Option<UserProfile>, String> {
    if let Some(token) = auth::get_saved_or_detected_token() {
        let client = YandexMusicClient::new(token.clone());
        match client.get_account_status().await {
            Ok(profile) => {
                let mut c = state.client.lock().map_err(|e| e.to_string())?;
                *c = Some(client);
                let mut u = state.user.lock().map_err(|e| e.to_string())?;
                *u = Some(profile.clone());
                return Ok(Some(profile));
            }
            Err(e) => {
                eprintln!("Auto-auth failed: {}", e);
            }
        }
    }
    Ok(None)
}

#[tauri::command]
async fn login_with_token(token: String, state: State<'_, AppState>) -> Result<UserProfile, String> {
    let clean_token = token.trim().to_string();
    if clean_token.is_empty() {
        return Err("Токен не может быть пустым".to_string());
    }

    let client = YandexMusicClient::new(clean_token.clone());
    let profile = client.get_account_status().await?;

    let _ = auth::save_token(&clean_token);

    let mut c = state.client.lock().map_err(|e| e.to_string())?;
    *c = Some(client);
    let mut u = state.user.lock().map_err(|e| e.to_string())?;
    *u = Some(profile.clone());

    Ok(profile)
}

#[tauri::command]
async fn get_my_wave(station_id: Option<String>, state: State<'_, AppState>) -> Result<WaveBatch, String> {
    let client = {
        let guard = state.client.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Не авторизован")?
    };

    let st = station_id.unwrap_or_else(|| "user:onyourwave".to_string());
    client.get_wave_tracks(&st).await
}

#[tauri::command]
async fn send_wave_feedback(
    station_id: String,
    event_type: String,
    track_id: String,
    batch_id: String,
    played_seconds: f64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let client = {
        let guard = state.client.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Не авторизован")?
    };

    client
        .send_wave_feedback(&station_id, &event_type, &track_id, &batch_id, played_seconds)
        .await
}

#[tauri::command]
async fn get_stream_url(track_id: String, state: State<'_, AppState>) -> Result<String, String> {
    let client = {
        let guard = state.client.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Не авторизован")?
    };

    let direct_url = client.get_track_stream_url(&track_id).await?;
    let proxied_url = format!(
        "http://127.0.0.1:{}/stream?url={}",
        state.proxy_port,
        proxy::url_encode(&direct_url)
    );
    Ok(proxied_url)
}

#[tauri::command]
async fn search_tracks(query: String, state: State<'_, AppState>) -> Result<Vec<TrackItem>, String> {
    let client = {
        let guard = state.client.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Не авторизован")?
    };

    client.search(&query).await
}

#[tauri::command]
async fn toggle_like(track_id: String, add: bool, state: State<'_, AppState>) -> Result<(), String> {
    let (client, uid) = {
        let c_guard = state.client.lock().map_err(|e| e.to_string())?;
        let u_guard = state.user.lock().map_err(|e| e.to_string())?;
        let client = c_guard.clone().ok_or("Не авторизован")?;
        let uid = u_guard.as_ref().map(|u| u.uid).unwrap_or(0);
        (client, uid)
    };

    if uid == 0 {
        return Err("Пользователь не определён".to_string());
    }

    client.toggle_like(uid, &track_id, add).await
}

#[tauri::command]
async fn get_favorites(state: State<'_, AppState>) -> Result<Vec<TrackItem>, String> {
    let (client, uid) = {
        let c_guard = state.client.lock().map_err(|e| e.to_string())?;
        let u_guard = state.user.lock().map_err(|e| e.to_string())?;
        let client = c_guard.clone().ok_or("Не авторизован")?;
        let uid = u_guard.as_ref().map(|u| u.uid).unwrap_or(0);
        (client, uid)
    };

    if uid == 0 {
        return Err("Пользователь не определён".to_string());
    }

    client.get_liked_tracks(uid).await
}

#[tauri::command]
async fn get_artist_info(artist_id: String, state: State<'_, AppState>) -> Result<api::ArtistDetails, String> {
    let client = {
        let guard = state.client.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Не авторизован")?
    };
    client.get_artist_brief_info(&artist_id).await
}

#[tauri::command]
async fn get_artist_tracks(
    artist_id: String,
    page: Option<u32>,
    page_size: Option<u32>,
    state: State<'_, AppState>,
) -> Result<Vec<TrackItem>, String> {
    let client = {
        let guard = state.client.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Не авторизован")?
    };
    client
        .get_artist_tracks(&artist_id, page.unwrap_or(0), page_size.unwrap_or(50))
        .await
}

#[tauri::command]
async fn get_album_tracks(album_id: u64, state: State<'_, AppState>) -> Result<Vec<TrackItem>, String> {
    let client = {
        let guard = state.client.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Не авторизован")?
    };
    client.get_album_tracks(album_id).await
}

#[tauri::command]
async fn get_lyrics(
    track_id: String,
    artist: String,
    title: String,
    state: State<'_, AppState>,
) -> Result<api::LyricsData, String> {
    let client = {
        let guard = state.client.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("Не авторизован")?
    };
    client.get_lyrics(&track_id, &artist, &title).await
}

#[cfg(target_os = "windows")]
fn trim_system_memory() {
    unsafe {
        #[repr(C)]
        struct PROCESSENTRY32W {
            dw_size: u32,
            cnt_usage: u32,
            th32_process_id: u32,
            th32_default_heap_id: usize,
            th32_module_id: u32,
            cnt_threads: u32,
            th32_parent_process_id: u32,
            pc_pri_class_base: i32,
            dw_flags: u32,
            sz_exe_file: [u16; 260],
        }

        extern "system" {
            fn GetCurrentProcess() -> isize;
            fn GetCurrentProcessId() -> u32;
            fn SetProcessWorkingSetSize(
                hProcess: isize,
                dwMinimumWorkingSetSize: usize,
                dwMaximumWorkingSetSize: usize,
            ) -> i32;
            fn CreateToolhelp32Snapshot(dwFlags: u32, th32ProcessID: u32) -> isize;
            fn Process32FirstW(hSnapshot: isize, lppe: *mut PROCESSENTRY32W) -> i32;
            fn Process32NextW(hSnapshot: isize, lppe: *mut PROCESSENTRY32W) -> i32;
            fn OpenProcess(dwDesiredAccess: u32, bInheritHandle: i32, dwProcessId: u32) -> isize;
            fn CloseHandle(hObject: isize) -> i32;
        }

        let cur = GetCurrentProcess();
        SetProcessWorkingSetSize(cur, usize::MAX, usize::MAX);

        let my_pid = GetCurrentProcessId();
        let snapshot = CreateToolhelp32Snapshot(0x00000002, 0);
        if snapshot != -1 && snapshot != 0 {
            let mut pe = PROCESSENTRY32W {
                dw_size: std::mem::size_of::<PROCESSENTRY32W>() as u32,
                cnt_usage: 0,
                th32_process_id: 0,
                th32_default_heap_id: 0,
                th32_module_id: 0,
                cnt_threads: 0,
                th32_parent_process_id: 0,
                pc_pri_class_base: 0,
                dw_flags: 0,
                sz_exe_file: [0u16; 260],
            };

            if Process32FirstW(snapshot, &mut pe) != 0 {
                loop {
                    if pe.th32_parent_process_id == my_pid {
                        let child_h = OpenProcess(0x0500, 0, pe.th32_process_id);
                        if child_h != 0 {
                            SetProcessWorkingSetSize(child_h, usize::MAX, usize::MAX);
                            CloseHandle(child_h);
                        }
                    }
                    if Process32NextW(snapshot, &mut pe) == 0 {
                        break;
                    }
                }
            }
            CloseHandle(snapshot);
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn trim_system_memory() {}

#[tauri::command]
fn trim_memory() {
    trim_system_memory();
}

#[tauri::command]
fn win_minimize(window: tauri::Window) {
    trim_system_memory();
    let _ = window.emit("window-visibility", false);
    let _ = window.minimize();
}

#[tauri::command]
fn win_toggle_maximize(window: tauri::Window) {
    let _ = window.emit("window-visibility", true);
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
}

#[tauri::command]
fn win_close(window: tauri::Window) {
    let _ = window.close();
}

#[derive(serde::Serialize)]
pub struct SystemThemeColors {
    pub accent_hex: Option<String>,
    pub wallpaper_base64: Option<String>,
}

#[tauri::command]
fn get_system_theme_colors() -> SystemThemeColors {
    let mut accent_hex = None;
    let mut wallpaper_base64 = None;

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        
        // 1. Get Windows DWM Accent Color
        if let Ok(output) = Command::new("reg")
            .args(&["query", "HKCU\\Software\\Microsoft\\Windows\\DWM", "/v", "ColorizationColor"])
            .output() 
        {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                for line in text.lines() {
                    if line.contains("ColorizationColor") {
                        if let Some(val_str) = line.split_whitespace().last() {
                            let clean = val_str.trim_start_matches("0x");
                            if let Ok(val) = u32::from_str_radix(clean, 16) {
                                let r = (val >> 16) & 0xFF;
                                let g = (val >> 8) & 0xFF;
                                let b = val & 0xFF;
                                accent_hex = Some(format!("#{:02x}{:02x}{:02x}", r, g, b));
                            }
                        }
                    }
                }
            }
        }

        // 2. Get Desktop Wallpaper
        if let Ok(output) = Command::new("reg")
            .args(&["query", "HKCU\\Control Panel\\Desktop", "/v", "WallPaper"])
            .output()
        {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                for line in text.lines() {
                    if line.contains("WallPaper") {
                        let parts: Vec<&str> = line.split("REG_SZ").collect();
                        if parts.len() > 1 {
                            let path = parts[1].trim();
                            if let Ok(bytes) = std::fs::read(path) {
                                if bytes.len() <= 2_500_000 {
                                    const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
                                    let mut b64 = String::with_capacity((bytes.len() + 2) / 3 * 4);
                                    for chunk in bytes.chunks(3) {
                                        let b = match chunk.len() {
                                            3 => (chunk[0] as u32) << 16 | (chunk[1] as u32) << 8 | (chunk[2] as u32),
                                            2 => (chunk[0] as u32) << 16 | (chunk[1] as u32) << 8,
                                            1 => (chunk[0] as u32) << 16,
                                            _ => 0,
                                        };
                                        b64.push(CHARSET[(b >> 18 & 0x3F) as usize] as char);
                                        b64.push(CHARSET[(b >> 12 & 0x3F) as usize] as char);
                                        if chunk.len() > 1 {
                                            b64.push(CHARSET[(b >> 6 & 0x3F) as usize] as char);
                                        } else {
                                            b64.push('=');
                                        }
                                        if chunk.len() > 2 {
                                            b64.push(CHARSET[(b & 0x3F) as usize] as char);
                                        } else {
                                            b64.push('=');
                                        }
                                    }
                                    wallpaper_base64 = Some(format!("data:image/jpeg;base64,{}", b64));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    SystemThemeColors {
        accent_hex,
        wallpaper_base64,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Configure WebView2 Chromium runtime for minimal RAM footprint
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--js-flags=\"--max-old-space-size=96\" --disk-cache-size=16777216 --media-cache-size=16777216 --disable-gpu-shader-disk-cache --disable-features=RendererCodeIntegrity --enable-low-end-device-mode"
    );

    let proxy_port = tauri::async_runtime::block_on(async {
        proxy::start_local_proxy()
            .await
            .expect("Не удалось запустить локальный аудио-прокси")
    });

    // Periodic memory trimming background task (flushes unused working set pages)
    tauri::async_runtime::spawn(async {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(25));
        loop {
            interval.tick().await;
            trim_system_memory();
        }
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::Resized(_) => {
                    let is_min = window.is_minimized().unwrap_or(false);
                    if is_min {
                        trim_system_memory();
                        let _ = window.emit("window-visibility", false);
                    }
                }
                tauri::WindowEvent::Focused(focused) => {
                    let is_min = window.is_minimized().unwrap_or(false);
                    if is_min || !*focused {
                        trim_system_memory();
                        let _ = window.emit("window-visibility", false);
                    } else {
                        let _ = window.emit("window-visibility", true);
                    }
                }
                _ => {}
            }
        })
        .manage(AppState {
            client: Mutex::new(None),
            user: Mutex::new(None),
            proxy_port,
        })
        .invoke_handler(tauri::generate_handler![
            init_auth,
            login_with_token,
            open_login_window,
            logout,
            get_my_wave,
            send_wave_feedback,
            get_stream_url,
            search_tracks,
            toggle_like,
            get_favorites,
            get_artist_info,
            get_artist_tracks,
            get_album_tracks,
            get_lyrics,
            trim_memory,
            win_minimize,
            win_toggle_maximize,
            win_close,
            get_system_theme_colors
        ])
        .run(tauri::generate_context!())
        .expect("error while running ymusic application");
}

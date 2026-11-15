use std::fs;
use regex::Regex;

pub fn find_installed_yandex_music_token() -> Option<String> {
    let appdata = dirs::data_dir()?; // e.g. C:\Users\<name>\AppData\Roaming
    let leveldb_dir = appdata.join("YandexMusic").join("Local Storage").join("leveldb");

    if !leveldb_dir.exists() {
        return None;
    }

    let token_regex = Regex::new(r"y0_[a-zA-Z0-9_\-]{25,}").ok()?;

    if let Ok(entries) = fs::read_dir(leveldb_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                if ext == "ldb" || ext == "log" {
                    if let Ok(bytes) = fs::read(&path) {
                        // Scan as string (using from_utf8_lossy to handle raw byte chunks)
                        let text = String::from_utf8_lossy(&bytes);
                        if let Some(mat) = token_regex.find(&text) {
                            return Some(mat.as_str().to_string());
                        }
                    }
                }
            }
        }
    }

    None
}

fn get_user_token_file() -> Option<std::path::PathBuf> {
    if let Some(appdata) = dirs::config_dir() {
        let dir = appdata.join("ymusic");
        let _ = fs::create_dir_all(&dir);
        return Some(dir.join(".token"));
    }
    None
}

pub fn get_saved_or_detected_token() -> Option<String> {
    // 1. Check secure AppData directory outside repository
    if let Some(path) = get_user_token_file() {
        if let Ok(token) = fs::read_to_string(path) {
            let t = token.trim();
            if !t.is_empty() {
                return Some(t.to_string());
            }
        }
    }

    // 2. Check local file .yandex_token fallback
    if let Ok(token) = fs::read_to_string(".yandex_token") {
        let t = token.trim();
        if !t.is_empty() {
            return Some(t.to_string());
        }
    }

    // 3. Auto-detect from installed official client
    find_installed_yandex_music_token()
}

pub fn save_token(token: &str) -> std::io::Result<()> {
    if let Some(path) = get_user_token_file() {
        let _ = fs::write(path, token.trim());
    }
    fs::write(".yandex_token", token.trim())
}

pub fn clear_token() -> std::io::Result<()> {
    if let Some(path) = get_user_token_file() {
        let _ = fs::remove_file(path);
    }
    let _ = fs::remove_file(".yandex_token");
    Ok(())
}

pub fn extract_token_from_str(s: &str) -> Option<String> {
    if let Some(pos) = s.find("access_token=") {
        let after = &s[pos + "access_token=".len()..];
        let token: String = after.chars().take_while(|&c| c != '&' && c != ' ' && c != '#' && c != ';' && c != '/').collect();
        if token.starts_with("y0_") || token.len() >= 20 {
            return Some(token);
        }
    }
    if let Some(pos) = s.find("token=") {
        let after = &s[pos + "token=".len()..];
        let token: String = after.chars().take_while(|&c| c != '&' && c != ' ' && c != '#' && c != ';' && c != '/').collect();
        if token.starts_with("y0_") || token.len() >= 20 {
            return Some(token);
        }
    }
    None
}

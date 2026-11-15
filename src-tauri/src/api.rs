use md5::{Digest, Md5};
use regex::Regex;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, USER_AGENT};
use serde::{Deserialize, Serialize};

const SALT: &str = "XGRlBW9FXlekgb0rMjcE";
const CLIENT_USER_AGENT: &str = "YandexMusic/5.127.0 (Windows NT 10.0; Win64; x64)";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackFade {
    pub in_start: Option<f64>,
    pub in_stop: Option<f64>,
    pub out_start: Option<f64>,
    pub out_stop: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackItem {
    pub id: String,
    pub title: String,
    pub artists: Vec<String>,
    #[serde(default)]
    pub artist_ids: Vec<u64>,
    pub cover_url: Option<String>,
    pub duration_ms: u64,
    pub album: Option<String>,
    pub liked: bool,
    #[serde(default)]
    pub bpm: Option<u32>,
    #[serde(default)]
    pub fade: Option<TrackFade>,
    #[serde(default)]
    pub lufs: Option<f64>,
    #[serde(default)]
    pub hue: Option<f64>,
    #[serde(default)]
    pub energy: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyricLine {
    pub time: f64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyricsData {
    pub synced: bool,
    pub lines: Vec<LyricLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtistAlbum {
    pub id: u64,
    pub title: String,
    pub year: Option<u32>,
    pub release_date: Option<String>,
    pub cover_url: Option<String>,
    pub track_count: Option<u32>,
    pub genre: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtistDetails {
    pub id: u64,
    pub name: String,
    pub cover_url: Option<String>,
    pub genres: Vec<String>,
    pub track_count: u32,
    pub album_count: u32,
    pub description: Option<String>,
    pub popular_tracks: Vec<TrackItem>,
    pub latest_albums: Vec<ArtistAlbum>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfile {
    pub uid: u64,
    pub login: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub has_plus: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WaveBatch {
    pub batch_id: String,
    pub tracks: Vec<TrackItem>,
}

#[derive(Clone)]
pub struct YandexMusicClient {
    client: reqwest::Client,
    #[allow(dead_code)]
    token: String,
}

impl YandexMusicClient {
    pub fn new(token: String) -> Self {
        let mut headers = HeaderMap::new();
        let auth_val = format!("OAuth {}", token);
        if let Ok(hv) = HeaderValue::from_str(&auth_val) {
            headers.insert(AUTHORIZATION, hv);
        }
        if let Ok(ua) = HeaderValue::from_str(CLIENT_USER_AGENT) {
            headers.insert(USER_AGENT, ua);
        }
        headers.insert("X-Yandex-Music-Client", HeaderValue::from_static("Windows/5.127.0"));

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .build()
            .unwrap_or_default();

        Self { client, token }
    }

    #[allow(dead_code)]
    pub fn get_token(&self) -> &str {
        &self.token
    }

    pub async fn get_account_status(&self) -> Result<UserProfile, String> {
        let resp = self
            .client
            .get("https://api.music.yandex.net/account/status")
            .send()
            .await
            .map_err(|e| format!("HTTP request error: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Account status error: HTTP {}", resp.status()));
        }

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse JSON: {}", e))?;

        let result = &json["result"];
        let account = &result["account"];
        let plus = &result["plus"];

        let uid = account["uid"].as_u64().unwrap_or(0);
        let login = account["login"].as_str().unwrap_or("").to_string();
        let display_name = account["displayName"]
            .as_str()
            .or_else(|| account["fullName"].as_str())
            .unwrap_or(&login)
            .to_string();

        let avatar_url = if uid > 0 {
            Some(format!("https://avatars.yandex.net/get-yapic/{}/islands-200", uid))
        } else {
            account["avatarUrl"].as_str().map(|p| {
                if p.starts_with("http") {
                    p.to_string()
                } else {
                    format!("https://avatars.yandex.net/get-yapic/{}/islands-200", p)
                }
            })
        };

        let has_plus = plus["hasPlus"].as_bool().unwrap_or(false);

        Ok(UserProfile {
            uid,
            login,
            display_name,
            avatar_url,
            has_plus,
        })
    }

    pub async fn get_wave_tracks(&self, station_id: &str) -> Result<WaveBatch, String> {
        let url = format!(
            "https://api.music.yandex.net/rotor/station/{}/tracks",
            station_id
        );
        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch wave: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Wave error: HTTP {}", resp.status()));
        }

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Wave parse error: {}", e))?;

        let result = &json["result"];
        let batch_id = result["batchId"].as_str().unwrap_or("").to_string();
        let sequence = result["sequence"].as_array();

        let mut tracks = Vec::new();
        if let Some(items) = sequence {
            for item in items {
                let track = &item["track"];
                if let Some(mut t) = parse_track(track) {
                    if t.bpm.is_none() {
                        t.bpm = item["trackParameters"]["bpm"].as_u64().map(|b| b as u32);
                    }
                    if t.hue.is_none() {
                        t.hue = item["trackParameters"]["hue"].as_f64();
                    }
                    if t.energy.is_none() {
                        t.energy = item["trackParameters"]["energy"].as_f64();
                    }
                    if t.fade.is_none() && item["fade"].is_object() {
                        let f = &item["fade"];
                        t.fade = Some(TrackFade {
                            in_start: f["inStart"].as_f64(),
                            in_stop: f["inStop"].as_f64(),
                            out_start: f["outStart"].as_f64(),
                            out_stop: f["outStop"].as_f64(),
                        });
                    }
                    tracks.push(t);
                }
            }
        }

        Ok(WaveBatch { batch_id, tracks })
    }

    pub async fn send_wave_feedback(
        &self,
        station_id: &str,
        event_type: &str,
        track_id: &str,
        batch_id: &str,
        played_seconds: f64,
    ) -> Result<(), String> {
        let url = format!(
            "https://api.music.yandex.net/rotor/station/{}/feedback",
            station_id
        );

        let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let body = serde_json::json!({
            "type": event_type,
            "timestamp": now,
            "trackId": track_id,
            "batchId": batch_id,
            "totalPlayedSeconds": played_seconds
        });

        let resp = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to send feedback: {}", e))?;

        if resp.status().is_success() {
            Ok(())
        } else {
            Err(format!("Feedback failed: HTTP {}", resp.status()))
        }
    }

    pub async fn get_track_stream_url(&self, track_id: &str) -> Result<String, String> {
        let info_url = format!(
            "https://api.music.yandex.net/tracks/{}/download-info",
            track_id
        );

        let resp = self
            .client
            .get(&info_url)
            .send()
            .await
            .map_err(|e| format!("Failed to get download-info: {}", e))?;

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse download-info JSON: {}", e))?;

        let results = json["result"]
            .as_array()
            .ok_or_else(|| "No download-info found in response".to_string())?;

        // Prioritize highest bitrate mp3 (e.g. 320 kbps, then 192)
        let mut download_info_url = None;
        let mut best_bitrate = 0;

        for item in results {
            let codec = item["codec"].as_str().unwrap_or("");
            if codec == "mp3" {
                let bitrate = item["bitrateInKbps"].as_u64().unwrap_or(0);
                if bitrate >= best_bitrate {
                    best_bitrate = bitrate;
                    if let Some(url) = item["downloadInfoUrl"].as_str() {
                        download_info_url = Some(url.to_string());
                    }
                }
            }
        }

        let download_info_url = download_info_url
            .or_else(|| results.first().and_then(|i| i["downloadInfoUrl"].as_str().map(String::from)))
            .ok_or_else(|| "No valid downloadInfoUrl found".to_string())?;

        // Request storage metadata XML
        let meta_resp = self
            .client
            .get(&download_info_url)
            .send()
            .await
            .map_err(|e| format!("Storage XML request failed: {}", e))?;

        let meta_text = meta_resp
            .text()
            .await
            .map_err(|e| format!("Failed to read XML: {}", e))?;

        // Parse host, path, ts, s using regex
        let re_host = Regex::new(r"<host>(.*?)</host>").unwrap();
        let re_path = Regex::new(r"<path>(.*?)</path>").unwrap();
        let re_ts = Regex::new(r"<ts>(.*?)</ts>").unwrap();
        let re_s = Regex::new(r"<s>(.*?)</s>").unwrap();

        let host = re_host
            .captures(&meta_text)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str())
            .ok_or("Failed to extract host from XML")?;
        let path = re_path
            .captures(&meta_text)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str())
            .ok_or("Failed to extract path from XML")?;
        let ts = re_ts
            .captures(&meta_text)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str())
            .ok_or("Failed to extract ts from XML")?;
        let s = re_s
            .captures(&meta_text)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str())
            .ok_or("Failed to extract s from XML")?;

        // Hash: md5(SALT + path[1..] + s)
        let path_without_leading_slash = if path.starts_with('/') {
            &path[1..]
        } else {
            path
        };
        let hash_input = format!("{}{}{}", SALT, path_without_leading_slash, s);

        let mut hasher = Md5::new();
        hasher.update(hash_input.as_bytes());
        let digest = hasher.finalize();
        let sign = format!("{:x}", digest);

        let stream_url = format!("https://{}/get-mp3/{}/{}{}", host, sign, ts, path);
        Ok(stream_url)
    }

    pub async fn search(&self, text: &str) -> Result<Vec<TrackItem>, String> {
        let url = format!(
            "https://api.music.yandex.net/search?text={}&type=all&page=0",
            urlencoding(text)
        );

        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Search failed: {}", e))?;

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Search parse failed: {}", e))?;

        let mut tracks = Vec::new();
        if let Some(items) = json["result"]["tracks"]["results"].as_array() {
            for item in items {
                if let Some(t) = parse_track(item) {
                    tracks.push(t);
                }
            }
        }

        Ok(tracks)
    }

    pub async fn toggle_like(&self, uid: u64, track_id: &str, add: bool) -> Result<(), String> {
        let endpoint = if add { "add" } else { "remove" };
        let url = format!(
            "https://api.music.yandex.net/users/{}/likes/tracks/{}",
            uid, endpoint
        );

        let resp = self
            .client
            .post(&url)
            .form(&[("track-id", track_id), ("track-ids", track_id)])
            .send()
            .await;

        match resp {
            Ok(r) if r.status().is_success() => Ok(()),
            _ => {
                let url_query = format!("{}?track-id={}", url, track_id);
                let resp2 = self
                    .client
                    .post(&url_query)
                    .send()
                    .await
                    .map_err(|e| format!("Like request failed: {}", e))?;
                if resp2.status().is_success() {
                    Ok(())
                } else {
                    Err(format!("Like failed: HTTP {}", resp2.status()))
                }
            }
        }
    }

    pub async fn get_liked_tracks(&self, uid: u64) -> Result<Vec<TrackItem>, String> {
        let url = format!("https://api.music.yandex.net/users/{}/likes/tracks", uid);
        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Get likes failed: {}", e))?;

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Likes parse failed: {}", e))?;

        let mut track_ids = Vec::new();
        if let Some(items) = json["result"]["library"]["tracks"].as_array() {
            for item in items {
                if let Some(id) = item["id"].as_str() {
                    track_ids.push(id.to_string());
                } else if let Some(n) = item["id"].as_u64() {
                    track_ids.push(n.to_string());
                }
            }
        }

        if track_ids.is_empty() {
            return Ok(Vec::new());
        }

        // Fetch track metadata in batches of 150 track IDs
        let meta_url = "https://api.music.yandex.net/tracks";
        let mut tracks_map = std::collections::HashMap::new();

        for chunk in track_ids.chunks(150) {
            let joined_ids = chunk.join(",");
            let meta_resp = self
                .client
                .post(meta_url)
                .form(&[("track-ids", &joined_ids)])
                .send()
                .await;

            if let Ok(resp) = meta_resp {
                if let Ok(meta_json) = resp.json::<serde_json::Value>().await {
                    if let Some(items) = meta_json["result"].as_array() {
                        for item in items {
                            if let Some(mut t) = parse_track(item) {
                                t.liked = true;
                                tracks_map.insert(t.id.clone(), t);
                            }
                        }
                    }
                }
            }
        }

        // Reconstruct in original liked order (most recently liked first)
        let mut ordered_tracks = Vec::new();
        for id in &track_ids {
            if let Some(track) = tracks_map.remove(id) {
                ordered_tracks.push(track);
            }
        }

        Ok(ordered_tracks)
    }

    pub async fn get_artist_brief_info(&self, artist_id: &str) -> Result<ArtistDetails, String> {
        let url = format!("https://api.music.yandex.net/artists/{}/brief-info", artist_id);
        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Artist brief-info failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Artist API error: HTTP {}", resp.status()));
        }

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Artist JSON parse error: {}", e))?;

        let res = &json["result"];
        let art = &res["artist"];

        let id = art["id"].as_u64().unwrap_or(0);
        let name = art["name"].as_str().unwrap_or("Артист").to_string();

        let cover_url = art["cover"]["uri"]
            .as_str()
            .or_else(|| art["ogImage"].as_str())
            .map(|u| {
                let clean = u.replace("%%", "400x400");
                if clean.starts_with("http") { clean } else { format!("https://{}", clean) }
            });

        let mut genres = Vec::new();
        if let Some(g_arr) = art["genres"].as_array() {
            for g in g_arr {
                if let Some(s) = g.as_str() {
                    genres.push(s.to_string());
                }
            }
        }

        let track_count = art["counts"]["tracks"].as_u64().unwrap_or(0) as u32;
        let album_count = art["counts"]["directAlbums"].as_u64().unwrap_or(0) as u32;
        let description = art["description"]["text"].as_str().map(|s| s.to_string());

        let mut popular_tracks = Vec::new();
        if let Some(p_arr) = res["popularTracks"].as_array() {
            for t in p_arr {
                if let Some(track) = parse_track(t) {
                    popular_tracks.push(track);
                }
            }
        }

        let mut latest_albums = Vec::new();
        if let Some(a_arr) = res["albums"].as_array() {
            for alb in a_arr {
                let aid = alb["id"].as_u64().unwrap_or(0);
                let atitle = alb["title"].as_str().unwrap_or("Альбом").to_string();
                let year = alb["year"].as_u64().map(|y| y as u32);
                let release_date = alb["releaseDate"].as_str().map(|s| s.to_string());
                let acover = alb["coverUri"]
                    .as_str()
                    .or_else(|| alb["ogImage"].as_str())
                    .map(|u| {
                        let clean = u.replace("%%", "300x300");
                        if clean.starts_with("http") { clean } else { format!("https://{}", clean) }
                    });
                let t_count = alb["trackCount"].as_u64().map(|c| c as u32);
                let genre = alb["genre"].as_str().map(|g| g.to_string());

                latest_albums.push(ArtistAlbum {
                    id: aid,
                    title: atitle,
                    year,
                    release_date,
                    cover_url: acover,
                    track_count: t_count,
                    genre,
                });
            }
        }

        Ok(ArtistDetails {
            id,
            name,
            cover_url,
            genres,
            track_count,
            album_count,
            description,
            popular_tracks,
            latest_albums,
        })
    }

    pub async fn get_artist_tracks(&self, artist_id: &str, page: u32, page_size: u32) -> Result<Vec<TrackItem>, String> {
        let url = format!(
            "https://api.music.yandex.net/artists/{}/tracks?page={}&page-size={}",
            artist_id, page, page_size
        );
        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Artist tracks request failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Artist tracks failed: HTTP {}", resp.status()));
        }

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Artist tracks JSON error: {}", e))?;

        let mut tracks = Vec::new();
        if let Some(t_arr) = json["result"]["tracks"].as_array() {
            for t in t_arr {
                if let Some(track) = parse_track(t) {
                    tracks.push(track);
                }
            }
        }
        Ok(tracks)
    }

    pub async fn get_album_tracks(&self, album_id: u64) -> Result<Vec<TrackItem>, String> {
        let url = format!("https://api.music.yandex.net/albums/{}/with-tracks", album_id);
        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Album tracks request failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Album tracks failed: HTTP {}", resp.status()));
        }

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Album tracks JSON error: {}", e))?;

        let mut tracks = Vec::new();
        if let Some(v_arr) = json["result"]["volumes"].as_array() {
            for vol in v_arr {
                if let Some(t_arr) = vol.as_array() {
                    for t in t_arr {
                        if let Some(track) = parse_track(t) {
                            tracks.push(track);
                        }
                    }
                }
            }
        }
        Ok(tracks)
    }

    pub async fn get_lyrics(&self, track_id: &str, artist: &str, title: &str) -> Result<LyricsData, String> {
        let clean_art = clean_artist_name(artist);
        let clean_tit = clean_track_title(title);

        // 1. Try LRCLIB exact match for synchronized (.lrc) lyrics
        let lrclib_url = format!(
            "https://lrclib.net/api/get?artist_name={}&track_name={}",
            urlencoding(&clean_art),
            urlencoding(&clean_tit)
        );

        if let Ok(resp) = self.client.get(&lrclib_url).send().await {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if let Some(synced) = json["syncedLyrics"].as_str() {
                        let lines = parse_lrc(synced);
                        if !lines.is_empty() {
                            return Ok(LyricsData {
                                synced: true,
                                lines,
                            });
                        }
                    }
                }
            }
        }

        // 2. Try LRCLIB search for synchronized lyrics (handles variations in titles and featured artists)
        let search_query = format!("{} {}", clean_art, clean_tit);
        let lrclib_search_url = format!(
            "https://lrclib.net/api/search?q={}",
            urlencoding(search_query.trim())
        );

        if let Ok(resp) = self.client.get(&lrclib_search_url).send().await {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if let Some(arr) = json.as_array() {
                        for item in arr {
                            if let Some(synced) = item["syncedLyrics"].as_str() {
                                let lines = parse_lrc(synced);
                                if !lines.is_empty() {
                                    return Ok(LyricsData {
                                        synced: true,
                                        lines,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        // 3. Fallback to Yandex Music /tracks/{track_id}/supplement (Official lyrics)
        let mut candidates = Vec::new();
        if let Some(pos) = track_id.find(':') {
            candidates.push(track_id[..pos].to_string());
            candidates.push(track_id[pos + 1..].to_string());
        }
        candidates.push(track_id.to_string());

        for cid in candidates {
            let yandex_url = format!("https://api.music.yandex.net/tracks/{}/supplement", cid);
            if let Ok(resp) = self.client.get(&yandex_url).send().await {
                if resp.status().is_success() {
                    if let Ok(json) = resp.json::<serde_json::Value>().await {
                        if let Some(lyrics_val) = json["result"]["lyrics"]["fullLyrics"]
                            .as_str()
                            .or_else(|| json["result"]["lyrics"]["lyrics"].as_str())
                        {
                            let lines: Vec<LyricLine> = lyrics_val
                                .lines()
                                .map(|l| l.trim())
                                .filter(|l| !l.is_empty())
                                .enumerate()
                                .map(|(i, l)| LyricLine {
                                    time: i as f64 * 3.5,
                                    text: l.to_string(),
                                })
                                .collect();
                            if !lines.is_empty() {
                                return Ok(LyricsData {
                                    synced: false,
                                    lines,
                                });
                            }
                        }
                    }
                }
            }
        }

        // 4. Fallback to LRCLIB plain lyrics if available
        if let Ok(resp) = self.client.get(&lrclib_url).send().await {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if let Some(plain) = json["plainLyrics"].as_str() {
                        let lines: Vec<LyricLine> = plain
                            .lines()
                            .map(|l| l.trim())
                            .filter(|l| !l.is_empty())
                            .enumerate()
                            .map(|(i, l)| LyricLine {
                                time: i as f64 * 3.5,
                                text: l.to_string(),
                            })
                            .collect();
                        if !lines.is_empty() {
                            return Ok(LyricsData {
                                synced: false,
                                lines,
                            });
                        }
                    }
                }
            }
        }

        Err("Текст для этого трека пока не найден".to_string())
    }
}

fn clean_track_title(raw: &str) -> String {
    let re = regex::Regex::new(r"(?i)\s*[\(\[](?:feat\.|ft\.|with|remix|edit|deluxe|from the series|soundtrack|official)[^\)\]]*[\)\]]").unwrap();
    let cleaned = re.replace_all(raw, "").trim().to_string();
    if cleaned.is_empty() {
        raw.to_string()
    } else {
        cleaned
    }
}

fn clean_artist_name(raw: &str) -> String {
    let re = regex::Regex::new(r"[,&/]").unwrap();
    let first = re.split(raw).next().unwrap_or(raw).trim();
    if first.is_empty() {
        raw.to_string()
    } else {
        first.to_string()
    }
}

fn parse_lrc(lrc_text: &str) -> Vec<LyricLine> {
    let mut lines = Vec::new();
    let re = match regex::Regex::new(r"\[(\d{1,2}):(\d{2}(?:\.\d+)?)\](.*)") {
        Ok(r) => r,
        Err(_) => return lines,
    };

    for line in lrc_text.lines() {
        if let Some(caps) = re.captures(line) {
            let mins: f64 = caps[1].parse().unwrap_or(0.0);
            let secs: f64 = caps[2].parse().unwrap_or(0.0);
            let text = caps[3].trim().to_string();
            if !text.is_empty() {
                lines.push(LyricLine {
                    time: mins * 60.0 + secs,
                    text,
                });
            }
        }
    }
    lines
}

fn parse_track(val: &serde_json::Value) -> Option<TrackItem> {
    let id = if let Some(s) = val["realId"].as_str() {
        s.to_string()
    } else if let Some(n) = val["realId"].as_u64() {
        n.to_string()
    } else if let Some(s) = val["id"].as_str() {
        if let Some(pos) = s.find(':') {
            s[..pos].to_string()
        } else {
            s.to_string()
        }
    } else if let Some(n) = val["id"].as_u64() {
        n.to_string()
    } else {
        return None;
    };

    let title = val["title"].as_str().unwrap_or("Без названия").to_string();

    let mut artists = Vec::new();
    let mut artist_ids = Vec::new();
    if let Some(art_arr) = val["artists"].as_array() {
        for a in art_arr {
            if let Some(name) = a["name"].as_str() {
                artists.push(name.to_string());
            }
            if let Some(aid) = a["id"].as_u64() {
                artist_ids.push(aid);
            }
        }
    }
    if artists.is_empty() {
        artists.push("Неизвестный исполнитель".to_string());
    }

    let cover_uri = val["coverUri"]
        .as_str()
        .or_else(|| val["ogImage"].as_str());
    let cover_url = cover_uri.map(|uri| {
        let clean = uri.replace("%%", "400x400");
        if clean.starts_with("http") {
            clean
        } else {
            format!("https://{}", clean)
        }
    });

    let duration_ms = val["durationMs"].as_u64().unwrap_or(0);

    let album = val["albums"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|alb| alb["title"].as_str())
        .map(|s| s.to_string());

    let fade = if val["fade"].is_object() {
        let f = &val["fade"];
        Some(TrackFade {
            in_start: f["inStart"].as_f64(),
            in_stop: f["inStop"].as_f64(),
            out_start: f["outStart"].as_f64(),
            out_stop: f["outStop"].as_f64(),
        })
    } else {
        None
    };

    let bpm = val["bpm"]
        .as_u64()
        .or_else(|| val["trackParameters"]["bpm"].as_u64())
        .map(|b| b as u32);

    let lufs = val["r128"]["i"].as_f64();

    let hue = val["trackParameters"]["hue"]
        .as_f64()
        .or_else(|| val["hue"].as_f64());
    let energy = val["trackParameters"]["energy"]
        .as_f64()
        .or_else(|| val["energy"].as_f64());

    Some(TrackItem {
        id,
        title,
        artists,
        artist_ids,
        cover_url,
        duration_ms,
        album,
        liked: false,
        bpm,
        fade,
        lufs,
        hue,
        energy,
    })
}

fn urlencoding(s: &str) -> String {
    let mut encoded = String::new();
    for b in s.bytes() {
        match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(b as char)
            }
            _ => encoded.push_str(&format!("%{:02X}", b)),
        }
    }
    encoded
}

use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

pub async fn start_local_proxy() -> Result<u16, Box<dyn std::error::Error + Send + Sync>> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let local_addr = listener.local_addr()?;
    let port = local_addr.port();
    let client = Arc::new(reqwest::Client::builder().build()?);

    let client_clone = client.clone();
    tokio::spawn(async move {
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let client = client_clone.clone();
                    tokio::spawn(async move {
                        let _ = handle_client(stream, client).await;
                    });
                }
                Err(_) => break,
            }
        }
    });

    Ok(port)
}

async fn handle_client(
    mut stream: TcpStream,
    client: Arc<reqwest::Client>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut buf = [0u8; 4096];
    let n = stream.read(&mut buf).await?;
    if n == 0 {
        return Ok(());
    }

    let req_str = String::from_utf8_lossy(&buf[..n]);
    let mut lines = req_str.lines();
    let first_line = match lines.next() {
        Some(l) => l,
        None => return Ok(()),
    };

    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or("GET");
    let path = parts.next().unwrap_or("/");

    if method == "OPTIONS" {
        let resp = "HTTP/1.1 204 No Content\r\n\
                    Access-Control-Allow-Origin: *\r\n\
                    Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n\
                    Access-Control-Allow-Headers: Range, Accept, Origin\r\n\
                    Access-Control-Max-Age: 86400\r\n\
                    Connection: close\r\n\r\n";
        stream.write_all(resp.as_bytes()).await?;
        return Ok(());
    }

    let mut range_header = None;
    for line in lines {
        if line.to_ascii_lowercase().starts_with("range:") {
            if let Some((_, val)) = line.split_once(':') {
                range_header = Some(val.trim().to_string());
            }
        }
    }

    let target_url = if let Some(idx) = path.find("?url=") {
        url_decode(&path[idx + 5..])
    } else {
        return Ok(());
    };

    if target_url.is_empty() {
        return Ok(());
    }

    let mut req = client.get(&target_url);
    if let Some(r) = range_header {
        req = req.header("Range", r);
    }

    let upstream = req.send().await?;
    let status = upstream.status();
    let status_code = status.as_u16();
    let status_text = status.canonical_reason().unwrap_or("OK");

    let mut header_str = format!("HTTP/1.1 {} {}\r\n", status_code, status_text);
    header_str.push_str("Access-Control-Allow-Origin: *\r\n");
    header_str.push_str("Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n");
    header_str.push_str("Access-Control-Allow-Headers: Range, Accept, Origin\r\n");
    header_str.push_str("Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges\r\n");
    header_str.push_str("Connection: close\r\n");

    if let Some(ct) = upstream.headers().get("content-type") {
        if let Ok(v) = ct.to_str() {
            header_str.push_str(&format!("Content-Type: {}\r\n", v));
        }
    } else {
        header_str.push_str("Content-Type: audio/mpeg\r\n");
    }

    if let Some(cl) = upstream.headers().get("content-length") {
        if let Ok(v) = cl.to_str() {
            header_str.push_str(&format!("Content-Length: {}\r\n", v));
        }
    }

    if let Some(cr) = upstream.headers().get("content-range") {
        if let Ok(v) = cr.to_str() {
            header_str.push_str(&format!("Content-Range: {}\r\n", v));
        }
    }

    if let Some(ar) = upstream.headers().get("accept-ranges") {
        if let Ok(v) = ar.to_str() {
            header_str.push_str(&format!("Accept-Ranges: {}\r\n", v));
        }
    } else {
        header_str.push_str("Accept-Ranges: bytes\r\n");
    }

    header_str.push_str("\r\n");
    stream.write_all(header_str.as_bytes()).await?;

    if method != "HEAD" {
        let mut byte_stream = upstream;
        while let Some(chunk) = byte_stream.chunk().await? {
            if stream.write_all(&chunk).await.is_err() {
                break;
            }
        }
    }

    Ok(())
}

pub fn url_encode(input: &str) -> String {
    let mut encoded = String::new();
    for byte in input.bytes() {
        match byte {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    encoded
}

fn url_decode(input: &str) -> String {
    let mut bytes = Vec::new();
    let mut chars = input.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '%' {
            let h1 = chars.next().unwrap_or('0');
            let h2 = chars.next().unwrap_or('0');
            let hex_str: String = [h1, h2].iter().collect();
            if let Ok(b) = u8::from_str_radix(&hex_str, 16) {
                bytes.push(b);
            }
        } else if ch == '+' {
            bytes.push(b' ');
        } else {
            bytes.push(ch as u8);
        }
    }
    String::from_utf8_lossy(&bytes).to_string()
}

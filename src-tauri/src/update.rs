use reqwest::header::{ACCEPT, USER_AGENT};
use semver::Version;
use serde::Deserialize;

use crate::{
    errors::{AppError, AppResult},
    models::UpdateCheckResult,
};

const LATEST_RELEASE_API_URL: &str =
    "https://api.github.com/repos/iridiumcao/iridium-remote/releases/latest";
const LATEST_RELEASE_PAGE_URL: &str =
    "https://github.com/iridiumcao/iridium-remote/releases/latest";

#[derive(Debug, Deserialize)]
struct LatestReleaseApiResponse {
    tag_name: String,
    html_url: String,
}

#[derive(Debug)]
struct LatestRelease {
    version: String,
    download_url: String,
}

pub async fn check_for_updates() -> AppResult<UpdateCheckResult> {
    let client = update_client_builder().build().map_err(|error| {
        AppError::update_check("Failed to create the update checker.", error.to_string())
    })?;

    let latest_release = fetch_latest_release(&client).await?;
    let current_version = Version::parse(env!("CARGO_PKG_VERSION")).map_err(|error| {
        AppError::internal("Failed to read the current app version.", error.to_string())
    })?;
    let latest_version = Version::parse(&latest_release.version).map_err(|error| {
        AppError::update_check(
            "Failed to parse the latest GitHub release version.",
            error.to_string(),
        )
    })?;

    Ok(UpdateCheckResult {
        current_version: current_version.to_string(),
        latest_version: latest_version.to_string(),
        update_available: latest_version > current_version,
        download_url: Some(latest_release.download_url),
    })
}

fn update_client_builder() -> reqwest::ClientBuilder {
    // reqwest's rustls-no-provider feature requires an explicitly installed provider.
    // An existing process-wide provider is retained if one is already installed.
    let _ = rustls::crypto::ring::default_provider().install_default();
    reqwest::Client::builder().tls_backend_rustls()
}

async fn fetch_latest_release(client: &reqwest::Client) -> AppResult<LatestRelease> {
    fetch_latest_release_from_urls(client, LATEST_RELEASE_API_URL, LATEST_RELEASE_PAGE_URL).await
}

async fn fetch_latest_release_from_urls(
    client: &reqwest::Client,
    api_url: &str,
    release_page_url: &str,
) -> AppResult<LatestRelease> {
    match fetch_latest_release_via_api(client, api_url).await {
        Ok(release) => Ok(release),
        Err(api_error) => {
            log::warn!(
                "GitHub latest release API lookup failed, falling back to redirect lookup: {}",
                api_error
            );

            fetch_latest_release_via_redirect(client, release_page_url)
                .await
                .map_err(|redirect_error| {
                    AppError::update_check(
                        "Failed to check GitHub for the latest release.",
                        format!(
                            "API lookup failed: {api_error}; redirect lookup failed: {redirect_error}"
                        ),
                    )
                })
        }
    }
}

async fn fetch_latest_release_via_api(
    client: &reqwest::Client,
    api_url: &str,
) -> Result<LatestRelease, String> {
    let response = client
        .get(api_url)
        .header(ACCEPT, "application/vnd.github+json")
        .header(USER_AGENT, github_user_agent())
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(format!("GitHub API returned HTTP {}.", response.status()));
    }

    let payload: LatestReleaseApiResponse =
        response.json().await.map_err(|error| error.to_string())?;
    let version = normalize_version(&payload.tag_name)
        .ok_or_else(|| format!("Invalid GitHub tag '{}'.", payload.tag_name))?;

    Ok(LatestRelease {
        version,
        download_url: payload.html_url,
    })
}

async fn fetch_latest_release_via_redirect(
    client: &reqwest::Client,
    release_page_url: &str,
) -> Result<LatestRelease, String> {
    let response = client
        .get(release_page_url)
        .header(USER_AGENT, github_user_agent())
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(format!(
            "GitHub release redirect returned HTTP {}.",
            response.status()
        ));
    }

    let final_url = response.url().to_string();
    let tag = release_tag_from_url(&final_url)
        .ok_or_else(|| format!("Could not extract a release tag from '{}'.", final_url))?;
    let version = normalize_version(tag)
        .ok_or_else(|| format!("Invalid GitHub tag '{}' from redirect.", tag))?;

    Ok(LatestRelease {
        version,
        download_url: final_url,
    })
}

fn github_user_agent() -> String {
    format!("{}/{}", env!("CARGO_PKG_NAME"), env!("CARGO_PKG_VERSION"))
}

fn normalize_version(tag: &str) -> Option<String> {
    let normalized = tag.trim().strip_prefix('v').unwrap_or(tag.trim());
    Version::parse(normalized)
        .ok()
        .map(|version| version.to_string())
}

fn release_tag_from_url(url: &str) -> Option<&str> {
    let (before_fragment, _) = url.split_once('#').unwrap_or((url, ""));
    let (without_query, _) = before_fragment
        .split_once('?')
        .unwrap_or((before_fragment, ""));
    without_query
        .split("/releases/tag/")
        .nth(1)
        .filter(|segment| !segment.is_empty())
}

#[cfg(test)]
mod tests {
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
        time::{Duration, Instant},
    };

    use super::{
        fetch_latest_release, fetch_latest_release_from_urls, github_user_agent, normalize_version,
        release_tag_from_url, update_client_builder,
    };

    fn serve_responses(
        responses: Vec<(&'static str, &'static str, &'static str)>,
    ) -> (String, thread::JoinHandle<Vec<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        listener.set_nonblocking(true).unwrap();
        let server = thread::spawn(move || {
            let mut requests = Vec::new();
            for (status, headers, body) in responses {
                let deadline = Instant::now() + Duration::from_secs(5);
                let mut stream = loop {
                    match listener.accept() {
                        Ok((stream, _)) => break stream,
                        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                            assert!(Instant::now() < deadline, "No HTTP request received");
                            thread::sleep(Duration::from_millis(10));
                        }
                        Err(error) => panic!("Failed to accept HTTP request: {error}"),
                    }
                };
                // Windows can inherit the listener's nonblocking mode on accepted sockets.
                stream.set_nonblocking(false).unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut request = Vec::new();
                let mut buffer = [0_u8; 1024];
                while !request.ends_with(b"\r\n\r\n") {
                    let count = stream.read(&mut buffer).unwrap();
                    assert!(count > 0, "Incomplete HTTP request");
                    request.extend_from_slice(&buffer[..count]);
                }
                requests.push(String::from_utf8(request).unwrap());
                write!(
                    stream,
                    "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n{headers}\r\n{body}",
                    body.len()
                )
                .unwrap();
            }
            requests
        });
        (base_url, server)
    }

    #[test]
    fn update_client_can_be_built_repeatedly_with_ring() {
        // Building an HTTPS-capable client must not panic without reqwest's default provider.
        update_client_builder().no_proxy().build().unwrap();
        update_client_builder().no_proxy().build().unwrap();
    }

    #[tokio::test]
    #[ignore = "Requires direct HTTPS access to GitHub"]
    async fn github_release_https_smoke_test() {
        let client = update_client_builder()
            .no_proxy()
            .timeout(Duration::from_secs(20))
            .build()
            .unwrap();
        let release = fetch_latest_release(&client).await.unwrap();
        assert!(normalize_version(&release.version).is_some());
        assert!(release
            .download_url
            .starts_with("https://github.com/iridiumcao/iridium-remote/releases/"));
    }

    #[tokio::test]
    async fn reads_release_json_with_required_headers() {
        let (base_url, server) = serve_responses(vec![(
            "200 OK",
            "Content-Type: application/json\r\n",
            r#"{"tag_name":"v0.2.0","html_url":"https://github.com/iridiumcao/iridium-remote/releases/tag/v0.2.0"}"#,
        )]);
        let client = update_client_builder()
            .no_proxy()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap();
        let release = fetch_latest_release_from_urls(
            &client,
            &format!("{base_url}/api"),
            &format!("{base_url}/latest"),
        )
        .await
        .unwrap();

        assert_eq!(release.version, "0.2.0");
        assert_eq!(
            release.download_url,
            "https://github.com/iridiumcao/iridium-remote/releases/tag/v0.2.0"
        );
        let requests = server.join().unwrap();
        let request = requests[0].to_ascii_lowercase();
        assert!(request.starts_with("get /api http/1.1\r\n"));
        assert!(request.contains("accept: application/vnd.github+json\r\n"));
        assert!(request.contains(&format!("user-agent: {}\r\n", github_user_agent())));
    }

    #[tokio::test]
    async fn follows_release_redirect_when_api_fails() {
        let (base_url, server) = serve_responses(vec![
            ("503 Service Unavailable", "", ""),
            ("302 Found", "Location: /releases/tag/v0.2.0\r\n", ""),
            ("200 OK", "", ""),
        ]);
        let client = update_client_builder()
            .no_proxy()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap();
        let release = fetch_latest_release_from_urls(
            &client,
            &format!("{base_url}/api"),
            &format!("{base_url}/latest"),
        )
        .await
        .unwrap();

        assert_eq!(release.version, "0.2.0");
        assert_eq!(
            release.download_url,
            format!("{base_url}/releases/tag/v0.2.0")
        );
        let requests = server.join().unwrap();
        assert!(requests[1].starts_with("GET /latest HTTP/1.1\r\n"));
        assert!(requests[2].starts_with("GET /releases/tag/v0.2.0 HTTP/1.1\r\n"));
    }

    #[test]
    fn extracts_release_tag_from_redirect_url() {
        assert_eq!(
            release_tag_from_url(
                "https://github.com/iridiumcao/iridium-remote/releases/tag/v0.1.6"
            ),
            Some("v0.1.6")
        );
    }

    #[test]
    fn ignores_query_parameters_when_extracting_release_tag() {
        assert_eq!(
            release_tag_from_url(
                "https://github.com/iridiumcao/iridium-remote/releases/tag/v0.1.6?source=app"
            ),
            Some("v0.1.6")
        );
    }

    #[test]
    fn normalizes_semver_release_tags() {
        assert_eq!(normalize_version("v0.1.6"), Some(String::from("0.1.6")));
    }
}

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
    let client = reqwest::Client::builder().build().map_err(|error| {
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

async fn fetch_latest_release(client: &reqwest::Client) -> AppResult<LatestRelease> {
    match fetch_latest_release_via_api(client).await {
        Ok(release) => Ok(release),
        Err(api_error) => {
            log::warn!(
                "GitHub latest release API lookup failed, falling back to redirect lookup: {}",
                api_error
            );

            fetch_latest_release_via_redirect(client)
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

async fn fetch_latest_release_via_api(client: &reqwest::Client) -> Result<LatestRelease, String> {
    let response = client
        .get(LATEST_RELEASE_API_URL)
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
) -> Result<LatestRelease, String> {
    let response = client
        .get(LATEST_RELEASE_PAGE_URL)
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
    use super::{normalize_version, release_tag_from_url};

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

use super::{
    connect_to_remote, is_visible_remote_entry, join_remote_path, remote_path_file_name,
    REMOTE_LIST_TIMEOUT,
};
use crate::{
    errors::{AppError, AppResult},
    models::{
        ConnectionRecord, RemoteSearchInput, RemoteSearchMatch, RemoteSearchMode,
        RemoteSearchResult,
    },
};
use russh_sftp::{client::SftpSession, protocol::FileAttributes};
use std::time::Duration;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    time::timeout,
};

const SEARCH_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_ENTRIES: usize = 5_000;
const MAX_DIRECTORIES: usize = 256;
const MAX_DEPTH: usize = 32;
const MAX_MATCHES: usize = 100;
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES: u64 = 16 * 1024 * 1024;

pub async fn search_remote_files(
    connection: &ConnectionRecord,
    saved_password: Option<String>,
    input: RemoteSearchInput,
) -> AppResult<RemoteSearchResult> {
    if input.path.trim().is_empty() || input.query.trim().is_empty() || input.query.len() > 1024 {
        return Err(AppError::validation(
            "A path and a search keyword of at most 1024 bytes are required.",
        ));
    }
    // Searching never locks the interactive browser connection and never executes shell commands.
    let client = timeout(
        REMOTE_LIST_TIMEOUT,
        connect_to_remote(connection, saved_password, 60),
    )
    .await
    .map_err(|_| AppError::validation("The SFTP search connection timed out."))??;
    let mut result = RemoteSearchResult::default();
    let search = timeout(
        SEARCH_TIMEOUT,
        search_sftp(&client.sftp, &input, &mut result),
    )
    .await;
    let _ = timeout(REMOTE_LIST_TIMEOUT, client.close()).await;
    match search {
        Ok(outcome) => outcome?,
        Err(_) => result.truncated = true,
    }
    Ok(result)
}

async fn search_sftp(
    sftp: &SftpSession,
    input: &RemoteSearchInput,
    result: &mut RemoteSearchResult,
) -> AppResult<()> {
    let path = input.path.trim();
    let metadata = sftp.symlink_metadata(path).await.map_err(|error| {
        AppError::internal("Failed to inspect the search path.", error.to_string())
    })?;
    if metadata.file_type().is_symlink() {
        result.skipped_entries += 1;
        return Ok(());
    }
    let root = sftp.canonicalize(path).await.map_err(|error| {
        AppError::internal("Failed to resolve the search path.", error.to_string())
    })?;
    let needle = input.query.trim().to_lowercase();
    let mut bytes_read = 0;
    if !metadata.is_dir() {
        result.scanned_entries = 1;
        let name = remote_path_file_name(&root)?;
        if input.mode == RemoteSearchMode::Name {
            match_name(&name, &root, false, &needle, result);
        } else if metadata.is_regular() {
            search_file(
                sftp,
                &root,
                &name,
                &metadata,
                &needle,
                &mut bytes_read,
                result,
            )
            .await;
        } else {
            result.skipped_entries += 1;
        }
        return Ok(());
    }
    let mut stack = vec![(root.clone(), 0)];
    let mut directories = 0;
    while let Some((path, depth)) = stack.pop() {
        if directories >= MAX_DIRECTORIES {
            result.truncated = true;
            break;
        }
        directories += 1;
        let entries = match sftp.read_dir(&path).await {
            Ok(entries) => entries,
            Err(error) if path == root => {
                return Err(AppError::internal(
                    "Failed to read the search directory.",
                    error.to_string(),
                ))
            }
            Err(_) => {
                result.skipped_entries += 1;
                continue;
            }
        };
        for entry in entries {
            let name = entry.file_name();
            // Only single path components can become children; never traverse . or .. or links.
            if !is_visible_remote_entry(&name, input.show_hidden)
                || name.contains('/')
                || name.contains('\0')
            {
                continue;
            }
            if result.scanned_entries >= MAX_ENTRIES {
                result.truncated = true;
                return Ok(());
            }
            result.scanned_entries += 1;
            let child = join_remote_path(&path, &name);
            let kind = entry.file_type();
            if input.mode == RemoteSearchMode::Name {
                match_name(&name, &child, kind.is_dir(), &needle, result);
            }
            if kind.is_symlink() {
                result.skipped_entries += 1;
            } else if kind.is_dir() {
                if depth < MAX_DEPTH {
                    stack.push((child, depth + 1));
                } else {
                    result.truncated = true;
                }
            } else if input.mode == RemoteSearchMode::Content && kind.is_file() {
                search_file(
                    sftp,
                    &child,
                    &name,
                    &entry.metadata(),
                    &needle,
                    &mut bytes_read,
                    result,
                )
                .await;
            }
            if result.matches.len() >= MAX_MATCHES || bytes_read >= MAX_TOTAL_BYTES {
                result.truncated = true;
                return Ok(());
            }
        }
    }
    Ok(())
}

fn match_name(
    name: &str,
    path: &str,
    is_directory: bool,
    needle: &str,
    result: &mut RemoteSearchResult,
) {
    if name.to_lowercase().contains(needle) {
        result.matches.push(RemoteSearchMatch {
            name: name.into(),
            path: path.into(),
            is_directory,
            line: None,
            preview: None,
        });
    }
}

async fn search_file(
    sftp: &SftpSession,
    path: &str,
    name: &str,
    metadata: &FileAttributes,
    needle: &str,
    bytes_read: &mut u64,
    result: &mut RemoteSearchResult,
) {
    if metadata.len() > MAX_FILE_BYTES {
        result.skipped_entries += 1;
        return;
    }
    let read = async {
        let mut file = sftp.open(path).await.map_err(|error| error.to_string())?;
        let mut bytes = Vec::new();
        let limit = (MAX_FILE_BYTES + 1).min(MAX_TOTAL_BYTES - *bytes_read);
        let outcome = (&mut file).take(limit).read_to_end(&mut bytes).await;
        // Account for partial reads too, so unreadable files cannot bypass the byte budget.
        *bytes_read += bytes.len() as u64;
        let _ = file.shutdown().await;
        outcome.map_err(|error| error.to_string())?;
        Ok::<_, String>(bytes)
    };
    // SFTP open/read errors are local to a file, allowing sibling results to remain useful.
    let bytes = match read.await {
        Ok(bytes) => bytes,
        Err(_) => {
            result.skipped_entries += 1;
            return;
        }
    };
    if bytes.len() as u64 > MAX_FILE_BYTES || bytes.contains(&0) {
        result.skipped_entries += 1;
        return;
    }
    let text = match String::from_utf8(bytes) {
        Ok(text) => text,
        Err(_) => {
            result.skipped_entries += 1;
            return;
        }
    };
    match_content(&text, name, path, needle, result);
}

fn match_content(
    text: &str,
    name: &str,
    path: &str,
    needle: &str,
    result: &mut RemoteSearchResult,
) {
    for (index, line) in text.lines().enumerate() {
        if line.to_lowercase().contains(needle) {
            result.matches.push(RemoteSearchMatch {
                name: name.into(),
                path: path.into(),
                is_directory: false,
                line: Some(index + 1),
                preview: Some(line.trim().chars().take(240).collect()),
            });
            if result.matches.len() >= MAX_MATCHES {
                result.truncated = true;
                break;
            }
        }
    }
}

#[cfg(test)]
#[path = "search_tests.rs"]
mod protocol_tests;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn literal_content_search_returns_unicode_lines_and_caps_results() {
        let mut result = RemoteSearchResult::default();
        match_content(
            "first\r\n部署 ERROR [literal].*\nlast",
            "test.txt",
            "/test.txt",
            "error [literal].*",
            &mut result,
        );
        assert_eq!(result.matches.len(), 1);
        assert_eq!(result.matches[0].line, Some(2));
        assert_eq!(
            result.matches[0].preview.as_deref(),
            Some("部署 ERROR [literal].*")
        );
        let many = "error\n".repeat(200);
        let mut result = RemoteSearchResult::default();
        match_content(&many, "test.txt", "/test.txt", "error", &mut result);
        assert_eq!(result.matches.len(), MAX_MATCHES);
        assert!(result.truncated);
    }
}

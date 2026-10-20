use super::*;
use russh_sftp::protocol::{Attrs, Data, File, Handle, Name, OpenFlags, Status, StatusCode};
use std::collections::HashSet;

#[derive(Default)]
struct SearchServer {
    listed: HashSet<String>,
}

fn entry(name: &str, mode: u32, size: u64) -> File {
    let mut file = File::dummy(name);
    file.attrs.permissions = Some(mode);
    file.attrs.size = Some(size);
    file
}

fn files(path: &str) -> Option<Vec<File>> {
    Some(match path {
        "/root" => vec![
            entry("src", 0o040755, 0),
            entry(".secret", 0o040755, 0),
            entry("denied", 0o040755, 0),
            entry("loop", 0o120777, 0),
            entry("README.TXT", 0o100644, 30),
            entry("binary.bin", 0o100644, 4),
            entry("huge.txt", 0o100644, MAX_FILE_BYTES + 1),
            entry("../escape", 0o040755, 0),
        ],
        "/root/src" => vec![
            entry("main.rs", 0o100644, 40),
            entry("private.txt", 0o100644, 20),
        ],
        "/root/.secret" => vec![entry("hidden.txt", 0o100644, 20)],
        "/many" => (0..MAX_ENTRIES + 10)
            .map(|index| entry(&format!("file{index}.txt"), 0o100644, 0))
            .collect(),
        _ => return None,
    })
}

fn contents(path: &str) -> Result<Vec<u8>, StatusCode> {
    Ok(match path {
        "/root/README.TXT" => b"first\nHello from README".to_vec(),
        "/root/src/main.rs" => "first\r\nHELLO [literal].*\n部署成功".as_bytes().to_vec(),
        "/root/.secret/hidden.txt" => b"Hello hidden".to_vec(),
        "/root/binary.bin" => vec![0, 1, 2, 3],
        "/root/src/private.txt" => return Err(StatusCode::PermissionDenied),
        "/root/huge.txt" => panic!("oversized files must not be opened"),
        _ => return Err(StatusCode::NoSuchFile),
    })
}

impl russh_sftp::server::Handler for SearchServer {
    type Error = StatusCode;
    fn unimplemented(&self) -> Self::Error {
        StatusCode::OpUnsupported
    }

    async fn realpath(&mut self, id: u32, path: String) -> Result<Name, Self::Error> {
        Ok(Name {
            id,
            files: vec![File::dummy(path)],
        })
    }
    async fn lstat(&mut self, id: u32, path: String) -> Result<Attrs, Self::Error> {
        let file = if files(&path).is_some() || path == "/root/denied" {
            entry(&path, 0o040755, 0)
        } else if path == "/root/loop" {
            entry(&path, 0o120777, 0)
        } else {
            entry(&path, 0o100644, contents(&path)?.len() as u64)
        };
        Ok(Attrs {
            id,
            attrs: file.attrs,
        })
    }
    async fn opendir(&mut self, id: u32, path: String) -> Result<Handle, Self::Error> {
        assert_ne!(path, "/root/loop", "symbolic links must never be traversed");
        assert!(
            !path.contains(".."),
            "parent path components must never be traversed"
        );
        if path == "/root/denied" {
            return Err(StatusCode::PermissionDenied);
        }
        if files(&path).is_none() {
            return Err(StatusCode::NoSuchFile);
        }
        self.listed.remove(&path);
        Ok(Handle { id, handle: path })
    }
    async fn readdir(&mut self, id: u32, handle: String) -> Result<Name, Self::Error> {
        if !self.listed.insert(handle.clone()) {
            return Err(StatusCode::Eof);
        }
        Ok(Name {
            id,
            files: files(&handle).ok_or(StatusCode::NoSuchFile)?,
        })
    }
    async fn open(
        &mut self,
        id: u32,
        path: String,
        flags: OpenFlags,
        _: FileAttributes,
    ) -> Result<Handle, Self::Error> {
        assert!(!flags.contains(OpenFlags::WRITE));
        contents(&path)?;
        Ok(Handle { id, handle: path })
    }
    async fn read(
        &mut self,
        id: u32,
        handle: String,
        offset: u64,
        len: u32,
    ) -> Result<Data, Self::Error> {
        let bytes = contents(&handle)?;
        if offset as usize >= bytes.len() {
            return Err(StatusCode::Eof);
        }
        Ok(Data {
            id,
            data: bytes[offset as usize..bytes.len().min(offset as usize + len as usize)].to_vec(),
        })
    }
    async fn close(&mut self, id: u32, _: String) -> Result<Status, Self::Error> {
        Ok(Status {
            id,
            status_code: StatusCode::Ok,
            error_message: String::new(),
            language_tag: String::new(),
        })
    }
}

async fn fixture() -> (SftpSession, tokio::task::JoinHandle<()>) {
    let (client, server) = tokio::io::duplex(256 * 1024);
    let task = tokio::spawn(async move {
        russh_sftp::server::run(server, SearchServer::default()).await;
    });
    (SftpSession::new(client).await.unwrap(), task)
}

async fn search(
    sftp: &SftpSession,
    path: &str,
    mode: RemoteSearchMode,
    query: &str,
    show_hidden: bool,
) -> AppResult<RemoteSearchResult> {
    let input = RemoteSearchInput {
        connection_id: "fixture".into(),
        path: path.into(),
        mode,
        query: query.into(),
        show_hidden,
    };
    let mut result = RemoteSearchResult::default();
    timeout(
        Duration::from_secs(5),
        search_sftp(sftp, &input, &mut result),
    )
    .await
    .unwrap()?;
    Ok(result)
}

#[tokio::test]
async fn recursively_finds_names_and_respects_hidden_files_and_traversal_boundaries() {
    let (sftp, task) = fixture().await;
    let result = search(&sftp, "/root", RemoteSearchMode::Name, ".TXT", false)
        .await
        .unwrap();
    let names: Vec<_> = result
        .matches
        .iter()
        .map(|entry| entry.name.as_str())
        .collect();
    assert!(names.contains(&"README.TXT"));
    assert!(names.contains(&"private.txt"));
    assert!(!names.contains(&"hidden.txt"));
    assert!(result.skipped_entries >= 2);
    assert!(!result.truncated);
    let result = search(&sftp, "/root", RemoteSearchMode::Name, "hidden", true)
        .await
        .unwrap();
    assert_eq!(result.matches[0].path, "/root/.secret/hidden.txt");
    sftp.close().await.unwrap();
    task.abort();
}

#[tokio::test]
async fn content_search_returns_lines_skips_unreadable_binary_and_oversized_files() {
    let (sftp, task) = fixture().await;
    let result = search(&sftp, "/root", RemoteSearchMode::Content, "hello", false)
        .await
        .unwrap();
    assert_eq!(result.matches.len(), 2);
    assert!(result.matches.iter().all(|entry| entry.line == Some(2)));
    assert!(result.skipped_entries >= 5);
    assert!(!result.truncated);
    let result = search(
        &sftp,
        "/root/src/main.rs",
        RemoteSearchMode::Content,
        "[literal].*",
        false,
    )
    .await
    .unwrap();
    assert_eq!(result.matches.len(), 1);
    assert_eq!(
        result.matches[0].preview.as_deref(),
        Some("HELLO [literal].*")
    );
    let result = search(
        &sftp,
        "/root/loop",
        RemoteSearchMode::Content,
        "hello",
        false,
    )
    .await
    .unwrap();
    assert_eq!(result.skipped_entries, 1);
    assert!(result.matches.is_empty());
    assert!(search(
        &sftp,
        "/root/denied",
        RemoteSearchMode::Content,
        "hello",
        false
    )
    .await
    .is_err());
    sftp.close().await.unwrap();
    task.abort();
}

#[tokio::test]
async fn reports_incomplete_results_at_the_entry_budget() {
    let (sftp, task) = fixture().await;
    let result = search(&sftp, "/many", RemoteSearchMode::Name, "no-match", false)
        .await
        .unwrap();
    assert!(result.matches.is_empty());
    assert!(result.truncated);
    assert_eq!(result.scanned_entries, MAX_ENTRIES);
    sftp.close().await.unwrap();
    task.abort();
}

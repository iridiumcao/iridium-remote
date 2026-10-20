use std::{
    collections::HashMap,
    env,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use russh::{
    client::{self, AuthResult, KeyboardInteractiveAuthResponse},
    keys::{known_hosts, PrivateKeyWithHashAlg, PublicKeyOrCertificate},
    Disconnect,
};
use russh_sftp::{
    client::{Config as SftpConfig, SftpSession},
    protocol::OpenFlags,
};
use tokio::{
    fs as async_fs,
    io::{self, AsyncReadExt, AsyncWriteExt},
    sync::Mutex as AsyncMutex,
    time::timeout,
};

use crate::{
    errors::{AppError, AppResult},
    models::{
        ConnectionRecord, FileTransferDirection, FileTransferInput, FileTransferResult,
        RemotePathEntry, RemotePathListing, RemotePathOpening,
    },
};

const REMOTE_LIST_TIMEOUT: Duration = Duration::from_secs(15);
const TRANSFER_IDLE_TIMEOUT: Duration = Duration::from_secs(300);
const DEFAULT_SFTP_REQUEST_TIMEOUT_SECS: u64 = 15;
const BROWSER_IDLE_TIMEOUT: Duration = Duration::from_secs(60);

mod search;
pub use search::search_remote_files;

struct BrowserSlot {
    connection_id: String,
    updated_at: String,
    last_used: Instant,
    client: Arc<AsyncMutex<Option<TransferConnection>>>,
}

/// Browsing uses a short-lived cached connection per panel; transfers use their own connection.
#[derive(Default)]
pub struct RemoteBrowserManager {
    browsers: Mutex<HashMap<String, BrowserSlot>>,
}

impl RemoteBrowserManager {
    pub async fn list(
        &self,
        browser_id: String,
        connection: &ConnectionRecord,
        saved_password: Option<String>,
        path: Option<String>,
        show_hidden: bool,
    ) -> AppResult<RemotePathListing> {
        self.browse(
            browser_id,
            connection,
            saved_password,
            path,
            show_hidden,
            false,
        )
        .await
        .map(|opened| opened.listing)
    }

    pub async fn open(
        &self,
        browser_id: String,
        connection: &ConnectionRecord,
        saved_password: Option<String>,
        path: String,
        show_hidden: bool,
    ) -> AppResult<RemotePathOpening> {
        self.browse(
            browser_id,
            connection,
            saved_password,
            Some(path),
            show_hidden,
            true,
        )
        .await
    }

    async fn browse(
        &self,
        browser_id: String,
        connection: &ConnectionRecord,
        saved_password: Option<String>,
        path: Option<String>,
        show_hidden: bool,
        resolve_file: bool,
    ) -> AppResult<RemotePathOpening> {
        let client = {
            let mut browsers = self.browsers.lock().expect("remote browser mutex poisoned");
            browsers.retain(|_, slot| slot.last_used.elapsed() < BROWSER_IDLE_TIMEOUT);
            let slot = browsers.entry(browser_id).or_insert_with(|| BrowserSlot {
                connection_id: connection.id.clone(),
                updated_at: connection.updated_at.clone(),
                last_used: Instant::now(),
                client: Arc::new(AsyncMutex::new(None)),
            });
            if slot.connection_id != connection.id || slot.updated_at != connection.updated_at {
                slot.connection_id = connection.id.clone();
                slot.updated_at = connection.updated_at.clone();
                slot.client = Arc::new(AsyncMutex::new(None));
            }
            slot.last_used = Instant::now();
            slot.client.clone()
        };
        let mut guard = timeout(REMOTE_LIST_TIMEOUT, client.lock())
            .await
            .map_err(|_| {
                AppError::validation("The remote browser is busy. Retry the directory listing.")
            })?;
        let result = timeout(REMOTE_LIST_TIMEOUT, async {
            if guard.is_none() {
                *guard = Some(
                    connect_to_remote(connection, saved_password, BROWSER_IDLE_TIMEOUT.as_secs())
                        .await?,
                );
            }
            let sftp = &guard.as_ref().unwrap().sftp;
            if resolve_file {
                open_remote_path(sftp, path.unwrap_or_default(), show_hidden).await
            } else {
                let listing = read_remote_directory(sftp, path, show_hidden).await?;
                let selected_entry = RemotePathEntry {
                    name: listing.current_path.clone(),
                    path: listing.current_path.clone(),
                    is_directory: true,
                };
                Ok(RemotePathOpening {
                    listing,
                    selected_entry,
                })
            }
        })
        .await;
        let result = result.unwrap_or_else(|_| {
            Err(AppError::validation(
                "The remote directory listing timed out. Retry to reconnect.",
            ))
        });
        if result.is_err() {
            // A timed-out or failed connection must never be returned to the next request.
            *guard = None;
        }
        result
    }

    pub async fn close(&self, browser_id: &str) {
        let slot = self
            .browsers
            .lock()
            .expect("remote browser mutex poisoned")
            .remove(browser_id);
        if let Some(slot) = slot {
            let _ = timeout(REMOTE_LIST_TIMEOUT, async {
                if let Some(connection) = slot.client.lock().await.take() {
                    let _ = connection.close().await;
                }
            })
            .await;
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RemotePathKind {
    File,
    Directory,
    Missing,
}

#[derive(Debug)]
struct RemotePathInfo {
    canonical_path: String,
    kind: RemotePathKind,
}

struct TransferConnection {
    ssh: client::Handle<TransferClientHandler>,
    sftp: SftpSession,
}

#[derive(Clone, Debug)]
struct VerifiedHostConfig {
    ssh: russh_config::Config,
    known_hosts_path: Option<PathBuf>,
    strict_host_key_checking: bool,
}

#[derive(Clone, Debug)]
struct TransferClientHandler {
    host: String,
    port: u16,
    known_hosts_path: Option<PathBuf>,
    strict_host_key_checking: bool,
    rejection_reason: Arc<Mutex<Option<String>>>,
}

impl client::Handler for TransferClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        if !self.strict_host_key_checking {
            return Ok(true);
        }

        // Trust remains based on pinned host keys. Host CA validation is not configured.
        let PublicKeyOrCertificate::PublicKey {
            key: server_public_key,
            ..
        } = server_public_key
        else {
            *self.rejection_reason.lock().expect("host verification mutex poisoned") = Some(
                "SFTP host certificate verification is not supported. Configure the server to offer a trusted plain host key.".to_string(),
            );
            return Ok(false);
        };

        let verification = if let Some(path) = self.known_hosts_path.as_ref() {
            known_hosts::check_known_hosts_path(&self.host, self.port, server_public_key, path)
        } else {
            known_hosts::check_known_hosts(&self.host, self.port, server_public_key)
        };

        match verification {
            Ok(true) => Ok(true),
            Ok(false) => {
                let mut guard = self
                    .rejection_reason
                    .lock()
                    .expect("host verification mutex poisoned");
                *guard = Some(format!(
                    "The host key for {}:{} is not trusted. Add the host to known_hosts or disable strict host key checking in SSH config for this host.",
                    self.host, self.port
                ));
                Ok(false)
            }
            Err(error) => {
                let mut guard = self
                    .rejection_reason
                    .lock()
                    .expect("host verification mutex poisoned");
                *guard = Some(format!(
                    "Failed to verify the host key for {}:{} against known_hosts: {}",
                    self.host, self.port, error
                ));
                Ok(false)
            }
        }
    }
}

pub async fn transfer_file(
    connection: &ConnectionRecord,
    saved_password: Option<String>,
    input: FileTransferInput,
) -> AppResult<FileTransferResult> {
    let local_path = input.local_path.trim();
    let remote_path = input.remote_path.trim();

    if local_path.is_empty() || remote_path.is_empty() {
        return Err(AppError::validation(
            "Local path and remote path are required for file transfers.",
        ));
    }

    let connection = timeout(
        REMOTE_LIST_TIMEOUT,
        connect_to_remote(connection, saved_password, TRANSFER_IDLE_TIMEOUT.as_secs()),
    )
    .await
    .map_err(|_| AppError::validation("The SFTP connection timed out."))??;
    let result = match input.direction {
        FileTransferDirection::Upload => {
            upload_path(&connection.sftp, local_path, remote_path).await
        }
        FileTransferDirection::Download => {
            download_path(&connection.sftp, remote_path, local_path).await
        }
    };
    let closed = timeout(REMOTE_LIST_TIMEOUT, connection.close()).await;
    let message = result?;
    closed.map_err(|_| AppError::validation("Timed out closing the SFTP connection."))??;
    Ok(FileTransferResult { message })
}

pub async fn list_remote_directory(
    connection: &ConnectionRecord,
    saved_password: Option<String>,
    path: Option<String>,
    show_hidden: bool,
) -> AppResult<RemotePathListing> {
    timeout(REMOTE_LIST_TIMEOUT, async {
        let connection =
            connect_to_remote(connection, saved_password, REMOTE_LIST_TIMEOUT.as_secs()).await?;
        let result = read_remote_directory(&connection.sftp, path, show_hidden).await;
        let closed = connection.close().await;
        let listing = result?;
        closed?;
        Ok(listing)
    })
    .await
    .map_err(|_| {
        AppError::internal(
            "The remote path listing timed out while waiting for the remote host.",
            format!(
                "The directory listing exceeded {} seconds.",
                REMOTE_LIST_TIMEOUT.as_secs()
            ),
        )
    })?
}

// Resolve the object type before listing: permission and connection errors are never
// treated as evidence that a requested directory was actually a file.
async fn open_remote_path(
    sftp: &SftpSession,
    path: String,
    show_hidden: bool,
) -> AppResult<RemotePathOpening> {
    let requested = if path.trim().is_empty() {
        "."
    } else {
        path.trim()
    };
    let canonical = sftp.canonicalize(requested).await.map_err(|error| {
        AppError::internal("Failed to open the remote path.", error.to_string())
    })?;
    let metadata = sftp.metadata(&canonical).await.map_err(|error| {
        AppError::internal("Failed to inspect the remote path.", error.to_string())
    })?;
    let is_directory = metadata.file_type().is_dir();
    if !is_directory && !metadata.file_type().is_file() {
        return Err(AppError::validation(
            "The remote path is not a regular file or directory.",
        ));
    }
    let directory = if is_directory {
        canonical.clone()
    } else {
        canonical
            .rsplit_once('/')
            .map(|(parent, _)| if parent.is_empty() { "/" } else { parent })
            .unwrap_or("/")
            .to_string()
    };
    // Keep an explicitly requested hidden file visible without changing the preference.
    let mut listing = read_remote_directory(sftp, Some(directory), true).await?;
    let selected_entry = if is_directory {
        RemotePathEntry {
            name: canonical.clone(),
            path: canonical,
            is_directory: true,
        }
    } else {
        listing
            .entries
            .iter()
            .find(|entry| entry.path == canonical)
            .cloned()
            .ok_or_else(|| {
                AppError::validation("The remote file is no longer present in its directory.")
            })?
    };
    listing.entries.retain(|entry| {
        is_visible_remote_entry(&entry.name, show_hidden) || entry.path == selected_entry.path
    });
    Ok(RemotePathOpening {
        listing,
        selected_entry,
    })
}

async fn read_remote_directory(
    sftp: &SftpSession,
    path: Option<String>,
    show_hidden: bool,
) -> AppResult<RemotePathListing> {
    let requested_path = path.unwrap_or_default();
    let current_path = if requested_path.trim().is_empty() {
        sftp.canonicalize(".").await.map_err(|error| {
            AppError::internal(
                "Failed to determine the current remote path.",
                error.to_string(),
            )
        })?
    } else {
        sftp.canonicalize(requested_path.trim())
            .await
            .map_err(|error| {
                AppError::internal("Failed to list the remote path.", error.to_string())
            })?
    };

    let mut entries = sftp
        .read_dir(&current_path)
        .await
        .map_err(|error| AppError::internal("Failed to list the remote path.", error.to_string()))?
        .filter(|entry| is_visible_remote_entry(&entry.file_name(), show_hidden))
        .map(|entry| RemotePathEntry {
            name: entry.file_name(),
            path: join_remote_path(&current_path, &entry.file_name()),
            is_directory: entry.file_type().is_dir(),
        })
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| {
        right
            .is_directory
            .cmp(&left.is_directory)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    Ok(RemotePathListing {
        current_path,
        entries,
    })
}

impl TransferConnection {
    async fn close(self) -> AppResult<()> {
        self.sftp.close().await.map_err(|error| {
            AppError::internal("Failed to close the SFTP session.", error.to_string())
        })?;
        self.ssh
            .disconnect(Disconnect::ByApplication, "", "en")
            .await
            .map_err(|error| {
                AppError::internal("Failed to close the SSH session.", error.to_string())
            })?;
        Ok(())
    }
}

async fn connect_to_remote(
    connection: &ConnectionRecord,
    saved_password: Option<String>,
    request_timeout_secs: u64,
) -> AppResult<TransferConnection> {
    let ssh_config = resolve_ssh_config(connection);
    let rejection_reason = Arc::new(Mutex::new(None));
    let handler = TransferClientHandler {
        host: ssh_config.ssh.host().to_string(),
        port: ssh_config.ssh.port(),
        known_hosts_path: ssh_config.known_hosts_path.clone(),
        strict_host_key_checking: ssh_config.strict_host_key_checking,
        rejection_reason: rejection_reason.clone(),
    };

    let russh_config = Arc::new(client::Config {
        inactivity_timeout: Some(Duration::from_secs(request_timeout_secs)),
        ..Default::default()
    });
    let stream = ssh_config.ssh.stream().await.map_err(|error| {
        AppError::ssh_launch(
            "Failed to open the SSH connection stream.",
            error.to_string(),
        )
    })?;

    let mut ssh = client::connect_stream(russh_config, stream, handler)
        .await
        .map_err(|error| {
            if let Some(reason) = rejection_reason
                .lock()
                .expect("host verification mutex poisoned")
                .clone()
            {
                AppError::validation(reason)
            } else {
                AppError::ssh_launch("Failed to connect to the remote host.", error.to_string())
            }
        })?;

    authenticate_connection(
        &mut ssh,
        &ssh_config.ssh.user(),
        saved_password,
        collect_identity_files(&ssh_config.ssh),
    )
    .await?;

    let channel = ssh.channel_open_session().await.map_err(|error| {
        AppError::internal("Failed to open the SFTP channel.", error.to_string())
    })?;
    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|error| {
            AppError::internal("Failed to start the SFTP subsystem.", error.to_string())
        })?;

    let mut sftp_config = SftpConfig::default();
    sftp_config.request_timeout_secs = DEFAULT_SFTP_REQUEST_TIMEOUT_SECS;
    let sftp = SftpSession::new_with_config(channel.into_stream(), sftp_config)
        .await
        .map_err(|error| {
            AppError::internal("Failed to initialize the SFTP client.", error.to_string())
        })?;

    Ok(TransferConnection { ssh, sftp })
}

async fn authenticate_connection(
    ssh: &mut client::Handle<TransferClientHandler>,
    username: &str,
    saved_password: Option<String>,
    identity_files: Vec<PathBuf>,
) -> AppResult<()> {
    if let Some(password) = saved_password {
        if password_auth_succeeded(ssh, username, &password).await? {
            return Ok(());
        }
    }

    for identity_file in identity_files {
        let key = match russh::keys::load_secret_key(&identity_file, None) {
            Ok(key) => key,
            Err(_) => continue,
        };
        let best_hash = ssh
            .best_supported_rsa_hash()
            .await
            .map_err(|error| {
                AppError::ssh_launch(
                    "Failed while checking SSH key algorithms.",
                    error.to_string(),
                )
            })?
            .flatten();
        let auth_result = ssh
            .authenticate_publickey(
                username.to_string(),
                PrivateKeyWithHashAlg::new(Arc::new(key), best_hash),
            )
            .await
            .map_err(|error| {
                AppError::ssh_launch("Failed during SSH key authentication.", error.to_string())
            })?;

        if matches!(auth_result, AuthResult::Success) {
            return Ok(());
        }
    }

    Err(AppError::validation(
        "File transfer needs a saved password or non-interactive SSH key authentication for this host.",
    ))
}

async fn password_auth_succeeded(
    ssh: &mut client::Handle<TransferClientHandler>,
    username: &str,
    password: &str,
) -> AppResult<bool> {
    let auth_result = ssh
        .authenticate_password(username.to_string(), password.to_string())
        .await
        .map_err(|error| {
            AppError::ssh_launch("Failed during password authentication.", error.to_string())
        })?;
    if matches!(auth_result, AuthResult::Success) {
        return Ok(true);
    }

    let mut response = ssh
        .authenticate_keyboard_interactive_start(username.to_string(), None::<String>)
        .await
        .map_err(|error| {
            AppError::ssh_launch(
                "Failed to start keyboard-interactive authentication.",
                error.to_string(),
            )
        })?;

    loop {
        match response {
            KeyboardInteractiveAuthResponse::Success => return Ok(true),
            KeyboardInteractiveAuthResponse::Failure { .. } => return Ok(false),
            KeyboardInteractiveAuthResponse::InfoRequest { prompts, .. } => {
                let responses = prompts
                    .into_iter()
                    .map(|prompt| {
                        if prompt.echo {
                            String::new()
                        } else {
                            password.to_string()
                        }
                    })
                    .collect::<Vec<_>>();
                response = ssh
                    .authenticate_keyboard_interactive_respond(responses)
                    .await
                    .map_err(|error| {
                        AppError::ssh_launch(
                            "Failed to continue keyboard-interactive authentication.",
                            error.to_string(),
                        )
                    })?;
            }
        }
    }
}

async fn upload_path(sftp: &SftpSession, local_path: &str, remote_path: &str) -> AppResult<String> {
    let metadata = async_fs::metadata(local_path)
        .await
        .map_err(|_| AppError::validation("The local path does not exist."))?;

    if metadata.is_dir() {
        let remote_info = inspect_remote_path(sftp, remote_path).await?;
        if remote_info.kind != RemotePathKind::Directory {
            return Err(AppError::validation(
                "Remote path must be an existing directory when uploading a local directory.",
            ));
        }

        let root_name = local_path_file_name(Path::new(local_path))?;
        let target_root = join_remote_path(&remote_info.canonical_path, &root_name);
        upload_directory_recursive(sftp, Path::new(local_path), &target_root).await?;
        return Ok(format!("Uploaded {} to {}.", local_path, remote_path));
    }

    let target_path = resolve_upload_target_path(sftp, Path::new(local_path), remote_path).await?;
    upload_single_file(sftp, Path::new(local_path), &target_path).await?;
    Ok(format!("Uploaded {} to {}.", local_path, remote_path))
}

async fn download_path(
    sftp: &SftpSession,
    remote_path: &str,
    local_path: &str,
) -> AppResult<String> {
    let remote_info = inspect_remote_path(sftp, remote_path).await?;
    if remote_info.kind == RemotePathKind::Missing {
        return Err(AppError::validation("The remote path does not exist."));
    }

    if remote_info.kind == RemotePathKind::Directory {
        let local_root = Path::new(local_path);
        let metadata = async_fs::metadata(local_root).await.map_err(|_| {
            AppError::validation(
                "Choose an existing local directory when downloading a remote directory.",
            )
        })?;
        if !metadata.is_dir() {
            return Err(AppError::validation(
                "Choose an existing local directory when downloading a remote directory.",
            ));
        }

        let folder_name = remote_path_file_name(&remote_info.canonical_path)?;
        let target_root = local_root.join(folder_name);
        download_directory_recursive(sftp, &remote_info.canonical_path, &target_root).await?;
        return Ok(format!("Downloaded {} to {}.", remote_path, local_path));
    }

    let target_path =
        resolve_download_target_path(Path::new(local_path), &remote_info.canonical_path).await?;
    download_single_file(sftp, &remote_info.canonical_path, &target_path).await?;
    Ok(format!("Downloaded {} to {}.", remote_path, local_path))
}

async fn resolve_upload_target_path(
    sftp: &SftpSession,
    local_path: &Path,
    remote_path: &str,
) -> AppResult<String> {
    let remote_info = inspect_remote_path(sftp, remote_path).await?;
    if remote_info.kind == RemotePathKind::Directory {
        return Ok(join_remote_path(
            &remote_info.canonical_path,
            &local_path_file_name(local_path)?,
        ));
    }

    if remote_info.kind == RemotePathKind::Missing {
        return Ok(remote_path.trim().to_string());
    }

    Ok(remote_info.canonical_path)
}

async fn resolve_download_target_path(
    local_path: &Path,
    remote_file_path: &str,
) -> AppResult<PathBuf> {
    match async_fs::metadata(local_path).await {
        Ok(metadata) if metadata.is_dir() => {
            Ok(local_path.join(remote_path_file_name(remote_file_path)?))
        }
        Ok(_) => {
            ensure_local_parent_exists(local_path).await?;
            Ok(local_path.to_path_buf())
        }
        Err(_) => {
            ensure_local_parent_exists(local_path).await?;
            Ok(local_path.to_path_buf())
        }
    }
}

async fn upload_directory_recursive(
    sftp: &SftpSession,
    local_root: &Path,
    remote_root: &str,
) -> AppResult<()> {
    let mut stack = vec![(local_root.to_path_buf(), remote_root.to_string())];

    while let Some((current_local, current_remote)) = stack.pop() {
        ensure_remote_directory(sftp, &current_remote).await?;
        let mut entries = async_fs::read_dir(&current_local).await.map_err(|error| {
            AppError::internal("Failed to read the local directory.", error.to_string())
        })?;

        while let Some(entry) = entries.next_entry().await.map_err(|error| {
            AppError::internal(
                "Failed to enumerate the local directory.",
                error.to_string(),
            )
        })? {
            let child_path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let child_remote = join_remote_path(&current_remote, &name);
            let child_metadata = entry.metadata().await.map_err(|error| {
                AppError::internal("Failed to inspect the local path.", error.to_string())
            })?;

            if child_metadata.is_dir() {
                stack.push((child_path, child_remote));
            } else if child_metadata.is_file() {
                upload_single_file(sftp, &child_path, &child_remote).await?;
            }
        }
    }

    Ok(())
}

async fn download_directory_recursive(
    sftp: &SftpSession,
    remote_root: &str,
    local_root: &Path,
) -> AppResult<()> {
    let mut stack = vec![(remote_root.to_string(), local_root.to_path_buf())];

    while let Some((current_remote, current_local)) = stack.pop() {
        async_fs::create_dir_all(&current_local)
            .await
            .map_err(|error| {
                AppError::internal("Failed to create the local directory.", error.to_string())
            })?;

        let entries = sftp.read_dir(&current_remote).await.map_err(|error| {
            AppError::internal("Failed to read the remote directory.", error.to_string())
        })?;

        for entry in entries {
            let name = entry.file_name();
            let child_remote = join_remote_path(&current_remote, &name);
            let child_local = current_local.join(&name);
            if entry.file_type().is_dir() {
                stack.push((child_remote, child_local));
            } else {
                download_single_file(sftp, &child_remote, &child_local).await?;
            }
        }
    }

    Ok(())
}

async fn ensure_remote_directory(sftp: &SftpSession, path: &str) -> AppResult<()> {
    let exists = sftp.try_exists(path).await.map_err(|error| {
        AppError::internal("Failed to inspect the remote directory.", error.to_string())
    })?;

    if exists {
        let metadata = sftp.metadata(path).await.map_err(|error| {
            AppError::internal("Failed to inspect the remote directory.", error.to_string())
        })?;
        if metadata.file_type().is_dir() {
            return Ok(());
        }

        return Err(AppError::validation(
            "Remote path must be a directory for directory transfers.",
        ));
    }

    sftp.create_dir(path).await.map_err(|error| {
        AppError::internal("Failed to create the remote directory.", error.to_string())
    })
}

async fn upload_single_file(
    sftp: &SftpSession,
    local_path: &Path,
    remote_path: &str,
) -> AppResult<()> {
    let mut local_file = async_fs::File::open(local_path)
        .await
        .map_err(|error| AppError::internal("Failed to open the local file.", error.to_string()))?;
    let mut remote_file = sftp
        .open_with_flags(
            remote_path,
            OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE,
        )
        .await
        .map_err(|error| {
            AppError::internal("Failed to open the remote file.", error.to_string())
        })?;

    copy_with_idle_timeout(&mut local_file, &mut remote_file, TRANSFER_IDLE_TIMEOUT)
        .await
        .map_err(|error| {
            AppError::internal("Failed to upload the local file.", error.to_string())
        })?;
    remote_file.shutdown().await.map_err(|error| {
        AppError::internal(
            "Failed to finalize the remote file upload.",
            error.to_string(),
        )
    })?;

    Ok(())
}

async fn download_single_file(
    sftp: &SftpSession,
    remote_path: &str,
    local_path: &Path,
) -> AppResult<()> {
    ensure_local_parent_exists(local_path).await?;
    let mut remote_file = sftp.open(remote_path).await.map_err(|error| {
        AppError::internal("Failed to open the remote file.", error.to_string())
    })?;
    let mut local_file = async_fs::File::create(local_path).await.map_err(|error| {
        AppError::internal("Failed to create the local file.", error.to_string())
    })?;

    copy_with_idle_timeout(&mut remote_file, &mut local_file, TRANSFER_IDLE_TIMEOUT)
        .await
        .map_err(|error| {
            AppError::internal("Failed to download the remote file.", error.to_string())
        })?;
    local_file.flush().await.map_err(|error| {
        AppError::internal("Failed to flush the local file.", error.to_string())
    })?;
    remote_file.shutdown().await.map_err(|error| {
        AppError::internal(
            "Failed to finalize the remote file download.",
            error.to_string(),
        )
    })?;

    Ok(())
}

async fn copy_with_idle_timeout<R: io::AsyncRead + Unpin, W: io::AsyncWrite + Unpin>(
    reader: &mut R,
    writer: &mut W,
    idle_timeout: Duration,
) -> io::Result<u64> {
    let mut buffer = vec![0; 64 * 1024];
    let mut total = 0;
    loop {
        let count = timeout(idle_timeout, reader.read(&mut buffer))
            .await
            .map_err(|_| {
                io::Error::new(
                    io::ErrorKind::TimedOut,
                    "File transfer stalled while reading.",
                )
            })??;
        if count == 0 {
            return Ok(total);
        }
        timeout(idle_timeout, writer.write_all(&buffer[..count]))
            .await
            .map_err(|_| {
                io::Error::new(
                    io::ErrorKind::TimedOut,
                    "File transfer stalled while writing.",
                )
            })??;
        total += count as u64;
    }
}

async fn ensure_local_parent_exists(path: &Path) -> AppResult<()> {
    let Some(parent) = path.parent() else {
        return Ok(());
    };
    if parent.as_os_str().is_empty() {
        return Ok(());
    }

    let metadata = async_fs::metadata(parent)
        .await
        .map_err(|_| AppError::validation("The target local directory does not exist."))?;
    if !metadata.is_dir() {
        return Err(AppError::validation(
            "The target local directory does not exist.",
        ));
    }

    Ok(())
}

async fn inspect_remote_path(sftp: &SftpSession, path: &str) -> AppResult<RemotePathInfo> {
    let trimmed_path = path.trim();
    let canonical_path = match sftp.canonicalize(trimmed_path).await {
        Ok(path) => path,
        Err(error) => {
            let exists = sftp
                .try_exists(trimmed_path)
                .await
                .map_err(|exists_error| {
                    AppError::internal(
                        "Failed to inspect the remote path.",
                        format!("{exists_error}; canonicalize failed: {error}"),
                    )
                })?;
            if !exists {
                return Ok(RemotePathInfo {
                    canonical_path: trimmed_path.to_string(),
                    kind: RemotePathKind::Missing,
                });
            }

            return Err(AppError::internal(
                "Failed to inspect the remote path.",
                error.to_string(),
            ));
        }
    };

    let metadata = sftp
        .symlink_metadata(&canonical_path)
        .await
        .map_err(|error| {
            AppError::internal("Failed to inspect the remote path.", error.to_string())
        })?;
    let file_type = metadata.file_type();

    Ok(RemotePathInfo {
        canonical_path,
        kind: if file_type.is_dir() {
            RemotePathKind::Directory
        } else {
            RemotePathKind::File
        },
    })
}

fn resolve_ssh_config(connection: &ConnectionRecord) -> VerifiedHostConfig {
    let mut ssh = russh_config::parse_home(&connection.host)
        .unwrap_or_else(|_| russh_config::Config::default(&connection.host));
    ssh.user = Some(connection.username.clone());
    ssh.port = Some(connection.port);

    VerifiedHostConfig {
        known_hosts_path: ssh.host_config.user_known_hosts_file.clone(),
        strict_host_key_checking: ssh.host_config.strict_host_key_checking.unwrap_or(true),
        ssh,
    }
}

fn collect_identity_files(config: &russh_config::Config) -> Vec<PathBuf> {
    let configured = config.host_config.identity_file.clone().unwrap_or_default();
    let defaults = default_identity_files();

    configured
        .into_iter()
        .chain(defaults)
        .filter(|path| path.is_file())
        .collect::<Vec<_>>()
}

fn default_identity_files() -> Vec<PathBuf> {
    let Some(home) = env::var_os("USERPROFILE").or_else(|| env::var_os("HOME")) else {
        return Vec::new();
    };

    let ssh_dir = PathBuf::from(home).join(".ssh");
    [
        "id_ed25519",
        "id_ecdsa",
        "id_ecdsa_sk",
        "id_rsa",
        "identity",
    ]
    .into_iter()
    .map(|name| ssh_dir.join(name))
    .collect()
}

fn local_path_file_name(path: &Path) -> AppResult<String> {
    path.file_name()
        .and_then(|value| value.to_str())
        .map(ToString::to_string)
        .ok_or_else(|| AppError::validation("The selected local path is invalid."))
}

fn remote_path_file_name(path: &str) -> AppResult<String> {
    path.trim_end_matches('/')
        .rsplit('/')
        .find(|segment| !segment.is_empty())
        .map(ToString::to_string)
        .ok_or_else(|| AppError::validation("The selected remote path is invalid."))
}

fn join_remote_path(base: &str, name: &str) -> String {
    if base == "/" {
        format!("/{name}")
    } else {
        format!("{}/{}", base.trim_end_matches('/'), name)
    }
}

fn is_visible_remote_entry(name: &str, show_hidden: bool) -> bool {
    name != "." && name != ".." && (show_hidden || !name.starts_with('.'))
}

#[cfg(test)]
mod protocol_tests;

#[cfg(test)]
mod tests {
    use super::{
        copy_with_idle_timeout, default_identity_files, is_visible_remote_entry, join_remote_path,
        remote_path_file_name, Duration,
    };

    #[tokio::test]
    async fn streams_files_larger_than_the_copy_buffer() {
        let source = vec![42u8; 200_000];
        let mut reader = source.as_slice();
        let mut destination = Vec::new();
        assert_eq!(
            copy_with_idle_timeout(&mut reader, &mut destination, Duration::from_secs(1))
                .await
                .unwrap(),
            200_000
        );
        assert_eq!(destination, source);
    }

    #[tokio::test]
    async fn times_out_a_stalled_reader() {
        let (_sender, mut reader) = tokio::io::duplex(64);
        let error = copy_with_idle_timeout(
            &mut reader,
            &mut tokio::io::sink(),
            Duration::from_millis(10),
        )
        .await
        .unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::TimedOut);
    }

    #[tokio::test]
    async fn times_out_a_stalled_writer() {
        let (mut writer, _receiver) = tokio::io::duplex(1);
        let error =
            copy_with_idle_timeout(&mut &[1u8, 2][..], &mut writer, Duration::from_millis(10))
                .await
                .unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::TimedOut);
    }

    #[test]
    fn joins_remote_paths_from_root() {
        assert_eq!(join_remote_path("/", "file.txt"), "/file.txt");
    }

    #[test]
    fn joins_remote_paths_from_nested_directory() {
        assert_eq!(
            join_remote_path("/home/demo/folder/", "file.txt"),
            "/home/demo/folder/file.txt"
        );
    }

    #[test]
    fn extracts_remote_file_names() {
        assert_eq!(
            remote_path_file_name("/home/demo/folder/file.txt").unwrap(),
            "file.txt"
        );
        assert_eq!(
            remote_path_file_name("/home/demo/folder/").unwrap(),
            "folder"
        );
    }

    #[test]
    fn default_identity_candidates_are_relative_to_ssh_dir() {
        for path in default_identity_files() {
            assert!(path.to_string_lossy().contains(".ssh"));
        }
    }

    #[test]
    fn hides_dot_prefixed_remote_entries() {
        assert!(is_visible_remote_entry("notes.txt", false));
        assert!(!is_visible_remote_entry(".ssh", false));
        assert!(!is_visible_remote_entry(".env", false));
        assert!(is_visible_remote_entry(".ssh", true));
        assert!(is_visible_remote_entry(".env", true));
        assert!(!is_visible_remote_entry(".", true));
        assert!(!is_visible_remote_entry("..", true));
    }
}

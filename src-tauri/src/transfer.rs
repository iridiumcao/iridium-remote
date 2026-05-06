use std::{
    fs,
    io::{Read, Write},
    path::Path,
    process::{Command as ProcessCommand, ExitStatus as ProcessExitStatus, Stdio},
    sync::mpsc,
    thread,
    time::Duration,
};

use portable_pty::{native_pty_system, CommandBuilder, ExitStatus as PtyExitStatus, PtySize};

use crate::{
    errors::{AppError, AppResult},
    models::{
        ConnectionRecord, FileTransferDirection, FileTransferInput, FileTransferResult,
        RemotePathEntry, RemotePathListing,
    },
    terminal_detection::{append_recent_output, contains_password_prompt, contains_sftp_prompt},
};

const REMOTE_LIST_TIMEOUT: Duration = Duration::from_secs(15);
const TRANSFER_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RemotePathKind {
    File,
    Directory,
    Missing,
}

pub fn transfer_file(
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

    let command_text = match input.direction {
        FileTransferDirection::Upload => {
            build_upload_command(connection, saved_password.clone(), local_path, remote_path)?
        }
        FileTransferDirection::Download => {
            build_download_command(connection, saved_password.clone(), remote_path, local_path)?
        }
    };

    let (success, transcript) = run_transfer_command(connection, saved_password, &command_text)?;
    let error_re =
        regex::Regex::new(r"(?i)(permission denied|no such file|failure|couldn't|error)").unwrap();
    if !success || error_re.is_match(&transcript) {
        return Err(AppError::internal(
            "The file transfer did not complete successfully.",
            tail_transcript(&transcript),
        ));
    }

    let message = match input.direction {
        FileTransferDirection::Upload => format!("Uploaded {} to {}.", local_path, remote_path),
        FileTransferDirection::Download => format!("Downloaded {} to {}.", remote_path, local_path),
    };

    Ok(FileTransferResult { message })
}

pub fn list_remote_directory(
    connection: &ConnectionRecord,
    saved_password: Option<String>,
    path: Option<String>,
) -> AppResult<RemotePathListing> {
    let requested_path = path.unwrap_or_default();
    let trimmed_path = requested_path.trim();
    let command_text = if trimmed_path.is_empty() {
        "pwd\nls -ln\nbye\n".to_string()
    } else {
        format!("cd \"{}\"\npwd\nls -ln\nbye\n", escape_path(trimmed_path))
    };

    let (success, transcript) = run_short_sftp_command(
        connection,
        saved_password,
        &command_text,
        "This remote browser needs SSH key access or a saved password on the connection.",
    )?;

    let error_re =
        regex::Regex::new(r"(?i)(permission denied|no such file|failure|couldn't|error)").unwrap();
    if !success || error_re.is_match(&transcript) {
        return Err(AppError::internal(
            "Failed to list the remote path.",
            tail_transcript(&transcript),
        ));
    }

    let current_path = parse_remote_working_directory(&transcript).ok_or_else(|| {
        AppError::internal(
            "Failed to determine the current remote path.",
            tail_transcript(&transcript),
        )
    })?;

    Ok(RemotePathListing {
        entries: parse_directory_entries(&transcript, &current_path),
        current_path,
    })
}

fn build_upload_command(
    connection: &ConnectionRecord,
    saved_password: Option<String>,
    local_path: &str,
    remote_path: &str,
) -> AppResult<String> {
    let metadata = fs::metadata(local_path)
        .map_err(|_| AppError::validation("The local path does not exist."))?;

    if metadata.is_dir() {
        let remote_kind = inspect_remote_path(connection, saved_password, remote_path)?;
        if remote_kind != RemotePathKind::Directory {
            return Err(AppError::validation(
                "Remote path must be an existing directory when uploading a local directory.",
            ));
        }

        return Ok(format!(
            "put -r \"{}\" \"{}\"\nbye\n",
            escape_path(local_path),
            escape_path(remote_path)
        ));
    }

    Ok(format!(
        "put \"{}\" \"{}\"\nbye\n",
        escape_path(local_path),
        escape_path(remote_path)
    ))
}

fn build_download_command(
    connection: &ConnectionRecord,
    saved_password: Option<String>,
    remote_path: &str,
    local_path: &str,
) -> AppResult<String> {
    let remote_kind = inspect_remote_path(connection, saved_password, remote_path)?;
    if remote_kind == RemotePathKind::Missing {
        return Err(AppError::validation("The remote path does not exist."));
    }

    if remote_kind == RemotePathKind::Directory {
        let local_target = Path::new(local_path);
        if !local_target.is_dir() {
            return Err(AppError::validation(
                "Choose an existing local directory when downloading a remote directory.",
            ));
        }

        return Ok(format!(
            "get -r \"{}\" \"{}\"\nbye\n",
            escape_path(remote_path),
            escape_path(local_path)
        ));
    }

    Ok(format!(
        "get \"{}\" \"{}\"\nbye\n",
        escape_path(remote_path),
        escape_path(local_path)
    ))
}

fn inspect_remote_path(
    connection: &ConnectionRecord,
    saved_password: Option<String>,
    remote_path: &str,
) -> AppResult<RemotePathKind> {
    let command_text = if saved_password.is_some() {
        format!(
            "cd \"{}\"\npwd\nls -ln \"{}\"\nbye\n",
            escape_path(remote_path),
            escape_path(remote_path)
        )
    } else {
        format!(
            "-cd \"{}\"\npwd\n-ls -ln \"{}\"\nbye\n",
            escape_path(remote_path),
            escape_path(remote_path)
        )
    };
    let (success, transcript) = run_short_sftp_command(
        connection,
        saved_password,
        &command_text,
        "File transfer needs SSH key access or a saved password on the connection.",
    )?;

    determine_remote_path_kind(success, &transcript)
}

fn run_transfer_command(
    connection: &ConnectionRecord,
    saved_password: Option<String>,
    command_text: &str,
) -> AppResult<(bool, String)> {
    if let Some(password) = saved_password {
        let (status, transcript) = run_interactive_sftp_command(
            connection,
            Some(password),
            command_text,
            "This transfer needs a saved password. Add one to the connection first.",
            TRANSFER_TIMEOUT,
        )?;

        return Ok((status.success(), transcript));
    }

    let (status, transcript) = run_batch_sftp_command(connection, command_text, TRANSFER_TIMEOUT)?;
    Ok((status.success(), transcript))
}

fn run_short_sftp_command(
    connection: &ConnectionRecord,
    saved_password: Option<String>,
    command_text: &str,
    missing_auth_message: &str,
) -> AppResult<(bool, String)> {
    if let Some(password) = saved_password {
        let (status, transcript) = run_interactive_sftp_command(
            connection,
            Some(password),
            command_text,
            missing_auth_message,
            REMOTE_LIST_TIMEOUT,
        )?;

        return Ok((status.success(), transcript));
    }

    let (status, transcript) =
        run_batch_sftp_command(connection, command_text, REMOTE_LIST_TIMEOUT)?;
    if !status.success() {
        let auth_re =
            regex::Regex::new(r"(?i)(permission denied|authentication failed|batchmode)").unwrap();
        if auth_re.is_match(&transcript) {
            return Err(AppError::validation(missing_auth_message));
        }
    }

    Ok((status.success(), transcript))
}

fn escape_path(path: &str) -> String {
    path.replace('"', "\\\"")
}

fn run_batch_sftp_command(
    connection: &ConnectionRecord,
    command_text: &str,
    timeout: Duration,
) -> AppResult<(ProcessExitStatus, String)> {
    let mut command = ProcessCommand::new("sftp");
    command
        .arg("-b")
        .arg("-")
        .arg("-P")
        .arg(connection.port.to_string())
        .arg("-o")
        .arg("BatchMode=yes")
        .arg(format!("{}@{}", connection.username, connection.host))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|error| {
        AppError::ssh_launch("Failed to start the SFTP process.", error.to_string())
    })?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(command_text.as_bytes()).map_err(|error| {
            AppError::internal("Failed to send the SFTP command.", error.to_string())
        })?;
        stdin.flush().map_err(|error| {
            AppError::internal("Failed to flush the SFTP command.", error.to_string())
        })?;
    }

    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || {
        let result = child.wait_with_output().map_err(|error| error.to_string());
        let _ = sender.send(result);
    });

    let output = receiver
        .recv_timeout(timeout)
        .map_err(|_| {
            AppError::internal(
                "The SFTP session timed out while waiting for the remote host.",
                format!(
                    "The remote host did not complete the SFTP command within {} seconds.",
                    timeout.as_secs()
                ),
            )
        })?
        .map_err(|error| AppError::internal("Failed to wait for the SFTP process.", error))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let transcript = if stderr.trim().is_empty() {
        stdout.clone()
    } else if stdout.trim().is_empty() {
        stderr.clone()
    } else {
        format!("{stdout}\n{stderr}")
    };

    Ok((output.status, transcript))
}

fn run_interactive_sftp_command(
    connection: &ConnectionRecord,
    saved_password: Option<String>,
    command_text: &str,
    missing_password_message: &str,
    timeout: Duration,
) -> AppResult<(PtyExitStatus, String)> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 100,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| {
            AppError::ssh_launch(
                "Failed to initialize the file transfer terminal.",
                error.to_string(),
            )
        })?;

    let mut command = CommandBuilder::new("sftp");
    command.arg("-P");
    command.arg(connection.port.to_string());
    command.arg(format!("{}@{}", connection.username, connection.host));
    command.env("TERM", "xterm-256color");

    let mut child = pair.slave.spawn_command(command).map_err(|error| {
        AppError::ssh_launch("Failed to start the SFTP process.", error.to_string())
    })?;

    let reader = pair.master.try_clone_reader().map_err(|error| {
        AppError::ssh_launch("Failed to open the SFTP reader.", error.to_string())
    })?;

    let mut writer = pair.master.take_writer().map_err(|error| {
        AppError::ssh_launch("Failed to open the SFTP writer.", error.to_string())
    })?;

    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || {
        let mut reader = reader;
        let mut buffer = [0_u8; 4096];

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    let _ = sender.send(Ok(None));
                    break;
                }
                Ok(bytes_read) => {
                    let chunk = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();
                    if sender.send(Ok(Some(chunk))).is_err() {
                        break;
                    }
                }
                Err(error) => {
                    let _ = sender.send(Err(error.to_string()));
                    break;
                }
            }
        }
    });

    let mut queued_password = saved_password;
    let mut recent_output = String::new();
    let mut transcript = String::new();
    let mut command_started = false;

    loop {
        match receiver.recv_timeout(timeout) {
            Ok(Ok(Some(chunk))) => {
                transcript.push_str(&chunk);
                append_recent_output(&mut recent_output, &chunk);

                if contains_password_prompt(&recent_output) {
                    if let Some(password) = queued_password.take() {
                        writer
                            .write_all(format!("{password}\r").as_bytes())
                            .map_err(|error| {
                                AppError::internal(
                                    "Failed to send the saved password to SFTP.",
                                    error.to_string(),
                                )
                            })?;
                        writer.flush().map_err(|error| {
                            AppError::internal(
                                "Failed to flush the SFTP password.",
                                error.to_string(),
                            )
                        })?;
                        recent_output.clear();
                    } else {
                        let _ = child.kill();
                        return Err(AppError::validation(missing_password_message));
                    }
                }

                if !command_started && contains_sftp_prompt(&recent_output) {
                    writer.write_all(command_text.as_bytes()).map_err(|error| {
                        AppError::internal("Failed to send the SFTP command.", error.to_string())
                    })?;
                    writer.flush().map_err(|error| {
                        AppError::internal("Failed to flush the SFTP command.", error.to_string())
                    })?;
                    recent_output.clear();
                    command_started = true;
                }
            }
            Ok(Ok(None)) => break,
            Ok(Err(error)) => {
                let _ = child.kill();
                return Err(AppError::internal(
                    "The SFTP session failed while reading output.",
                    error,
                ));
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                let _ = child.kill();
                return Err(AppError::internal(
                    "The SFTP session timed out while waiting for the remote host.",
                    tail_transcript(&transcript),
                ));
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }

    let exit_status = child.wait().map_err(|error| {
        AppError::internal("Failed to wait for the SFTP process.", error.to_string())
    })?;

    Ok((exit_status, transcript))
}

fn parse_remote_working_directory(transcript: &str) -> Option<String> {
    transcript.lines().find_map(|line| {
        line.trim()
            .strip_prefix("Remote working directory: ")
            .map(ToString::to_string)
    })
}

fn determine_remote_path_kind(success: bool, transcript: &str) -> AppResult<RemotePathKind> {
    let lower = transcript.to_ascii_lowercase();
    let missing_re =
        regex::Regex::new(r"(?i)(no such file|couldn't stat remote file|not found)").unwrap();
    if missing_re.is_match(&lower) {
        return Ok(RemotePathKind::Missing);
    }

    let cd_failed = regex::Regex::new(r"(?i)(can't change directory to|couldn't canonicalize)")
        .unwrap()
        .is_match(&lower);
    if !cd_failed && parse_remote_working_directory(transcript).is_some() {
        return Ok(RemotePathKind::Directory);
    }

    if has_ls_entries(transcript) {
        return Ok(RemotePathKind::File);
    }

    if !success {
        return Err(AppError::internal(
            "Failed to inspect the remote path.",
            tail_transcript(transcript),
        ));
    }

    Err(AppError::internal(
        "Failed to determine the remote path type.",
        tail_transcript(transcript),
    ))
}

fn has_ls_entries(transcript: &str) -> bool {
    transcript.lines().any(|line| {
        let trimmed = line.trim();
        if trimmed.is_empty()
            || trimmed.starts_with("sftp>")
            || trimmed.starts_with("Connected to ")
            || trimmed.starts_with("Remote working directory: ")
            || trimmed.starts_with("total ")
            || trimmed.ends_with("password:")
        {
            return false;
        }

        trimmed.split_whitespace().count() >= 9
    })
}

fn parse_directory_entries(transcript: &str, current_path: &str) -> Vec<RemotePathEntry> {
    transcript
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty()
                || trimmed.starts_with("sftp>")
                || trimmed.starts_with("Connected to ")
                || trimmed.starts_with("Remote working directory: ")
                || trimmed.starts_with("total ")
                || trimmed.ends_with("password:")
            {
                return None;
            }

            let columns = trimmed.split_whitespace().collect::<Vec<_>>();
            if columns.len() < 9 {
                return None;
            }

            let is_directory = columns[0].starts_with('d');
            let name = columns[8..].join(" ");
            if name == "." || name == ".." {
                return None;
            }

            Some(RemotePathEntry {
                is_directory,
                name: name.to_string(),
                path: join_remote_path(current_path, &name),
            })
        })
        .collect()
}

fn join_remote_path(base: &str, name: &str) -> String {
    if base == "/" {
        format!("/{name}")
    } else {
        format!("{}/{}", base.trim_end_matches('/'), name)
    }
}

fn tail_transcript(transcript: &str) -> String {
    let lines = transcript.lines().rev().take(8).collect::<Vec<_>>();

    if lines.is_empty() {
        "No transfer output was captured.".into()
    } else {
        lines.into_iter().rev().collect::<Vec<_>>().join("\n")
    }
}

#[cfg(test)]
mod tests {
    use super::{determine_remote_path_kind, RemotePathKind};

    #[test]
    fn detects_remote_file_when_cd_fails_but_ls_succeeds() {
        let transcript = r#"Connected to example.
sftp> cd "/home/demo/file.txt"
Can't change directory to /home/demo/file.txt: Not a directory
sftp> pwd
Remote working directory: /home/demo
sftp> ls -ln "/home/demo/file.txt"
-rw-r--r--    1 1000     1000           42 May  5 21:00 /home/demo/file.txt
sftp> bye"#;

        let kind = determine_remote_path_kind(false, transcript).unwrap();

        assert_eq!(kind, RemotePathKind::File);
    }

    #[test]
    fn detects_remote_directory_when_cd_succeeds() {
        let transcript = r#"Connected to example.
sftp> cd "/home/demo/folder"
sftp> pwd
Remote working directory: /home/demo/folder
sftp> ls -ln "/home/demo/folder"
total 0
sftp> bye"#;

        let kind = determine_remote_path_kind(true, transcript).unwrap();

        assert_eq!(kind, RemotePathKind::Directory);
    }

    #[test]
    fn detects_missing_remote_path() {
        let transcript = r#"Connected to example.
sftp> cd "/home/demo/missing"
Couldn't canonicalize: No such file or directory
sftp> pwd
Remote working directory: /home/demo
sftp> ls -ln "/home/demo/missing"
Can't ls: "/home/demo/missing" not found
sftp> bye"#;

        let kind = determine_remote_path_kind(false, transcript).unwrap();

        assert_eq!(kind, RemotePathKind::Missing);
    }
}

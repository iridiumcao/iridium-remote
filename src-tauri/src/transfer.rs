use std::{
    io::{Read, Write},
    path::Path,
};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};

use crate::{
    errors::{AppError, AppResult},
    models::{ConnectionRecord, FileTransferDirection, FileTransferInput, FileTransferResult},
};

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

    if matches!(input.direction, FileTransferDirection::Upload) && !Path::new(local_path).exists() {
        return Err(AppError::validation("The local file does not exist."));
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 100,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| AppError::ssh_launch("Failed to initialize the file transfer terminal.", error.to_string()))?;

    let mut command = CommandBuilder::new("sftp");
    command.arg("-P");
    command.arg(connection.port.to_string());
    command.arg(format!("{}@{}", connection.username, connection.host));
    command.env("TERM", "xterm-256color");

    let mut child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| AppError::ssh_launch("Failed to start the SFTP process.", error.to_string()))?;

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| AppError::ssh_launch("Failed to open the SFTP reader.", error.to_string()))?;

    let mut writer = pair
        .master
        .take_writer()
        .map_err(|error| AppError::ssh_launch("Failed to open the SFTP writer.", error.to_string()))?;

    let mut queued_password = saved_password;
    let mut transcript = String::new();
    let mut transfer_started = false;
    let command_text = match input.direction {
        FileTransferDirection::Upload => {
            format!(
                "put \"{}\" \"{}\"\nbye\n",
                escape_path(local_path),
                escape_path(remote_path)
            )
        }
        FileTransferDirection::Download => {
            format!(
                "get \"{}\" \"{}\"\nbye\n",
                escape_path(remote_path),
                escape_path(local_path)
            )
        }
    };

    let mut buffer = [0_u8; 4096];
    loop {
        match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(bytes_read) => {
                let chunk = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();
                transcript.push_str(&chunk);

                let lower = chunk.to_ascii_lowercase();
                if lower.contains("password:") {
                    if let Some(password) = queued_password.take() {
                        writer
                            .write_all(format!("{password}\n").as_bytes())
                            .map_err(|error| {
                                AppError::internal(
                                    "Failed to send the saved password to SFTP.",
                                    error.to_string(),
                                )
                            })?;
                        writer.flush().map_err(|error| {
                            AppError::internal("Failed to flush the SFTP password.", error.to_string())
                        })?;
                    } else {
                        let _ = child.kill();
                        return Err(AppError::validation(
                            "This transfer needs a saved password. Add one to the connection first.",
                        ));
                    }
                }

                if !transfer_started && chunk.contains("sftp>") {
                    writer
                        .write_all(command_text.as_bytes())
                        .map_err(|error| {
                            AppError::internal("Failed to send the file transfer command.", error.to_string())
                        })?;
                    writer.flush().map_err(|error| {
                        AppError::internal("Failed to flush the file transfer command.", error.to_string())
                    })?;
                    transfer_started = true;
                }
            }
            Err(error) => {
                let _ = child.kill();
                return Err(AppError::internal("The SFTP session failed while reading output.", error.to_string()));
            }
        }
    }

    let exit_status = child
        .wait()
        .map_err(|error| AppError::internal("Failed to wait for the SFTP process.", error.to_string()))?;

    let lower = transcript.to_ascii_lowercase();
    if !exit_status.success()
        || lower.contains("permission denied")
        || lower.contains("no such file")
        || lower.contains("failure")
        || lower.contains("couldn't")
    {
        return Err(AppError::internal(
            "The file transfer did not complete successfully.",
            tail_transcript(&transcript),
        ));
    }

    let message = match input.direction {
        FileTransferDirection::Upload => {
            format!("Uploaded {} to {}.", local_path, remote_path)
        }
        FileTransferDirection::Download => {
            format!("Downloaded {} to {}.", remote_path, local_path)
        }
    };

    Ok(FileTransferResult { message })
}

fn escape_path(path: &str) -> String {
    path.replace('"', "\\\"")
}

fn tail_transcript(transcript: &str) -> String {
    let lines = transcript
        .lines()
        .rev()
        .take(8)
        .collect::<Vec<_>>();

    if lines.is_empty() {
        "No transfer output was captured.".into()
    } else {
        lines.into_iter().rev().collect::<Vec<_>>().join("\n")
    }
}

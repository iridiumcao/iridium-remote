use std::{
    io::{Read, Write},
    sync::{Arc, Mutex},
    thread,
};

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter};

use crate::{
    errors::{AppError, AppResult},
    models::{ConnectionRecord, SessionStatePayload, SessionStatus, TerminalOutputEvent},
};

struct SessionResources {
    connection_id: String,
    child: Box<dyn Child + Send>,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    queued_password: Option<String>,
    connected: bool,
}

struct SessionInner {
    generation: u64,
    snapshot: SessionStatePayload,
    resources: Option<SessionResources>,
}

#[derive(Clone)]
pub struct SessionManager {
    inner: Arc<Mutex<SessionInner>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(SessionInner {
                generation: 0,
                snapshot: SessionStatePayload::default(),
                resources: None,
            })),
        }
    }

    pub fn current_state(&self) -> SessionStatePayload {
        self.inner.lock().expect("session mutex poisoned").snapshot.clone()
    }

    pub fn connect(
        &self,
        app: AppHandle,
        connection: &ConnectionRecord,
        saved_password: Option<String>,
    ) -> AppResult<SessionStatePayload> {
        {
            let inner = self.inner.lock().expect("session mutex poisoned");
            if inner.resources.is_some()
                && matches!(
                    inner.snapshot.status,
                    SessionStatus::Connecting | SessionStatus::Connected
                )
            {
                return Err(AppError::session_conflict(
                    "A session is already active. Disconnect it before starting another one.",
                ));
            }
        }

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 32,
                cols: 120,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| AppError::ssh_launch("Failed to initialize the terminal session.", error.to_string()))?;

        let mut command = CommandBuilder::new("ssh");
        command.arg("-p");
        command.arg(connection.port.to_string());
        command.arg(format!("{}@{}", connection.username, connection.host));
        command.env("TERM", "xterm-256color");

        let child = pair
            .slave
            .spawn_command(command)
            .map_err(|error| AppError::ssh_launch("Failed to start the SSH process.", error.to_string()))?;

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|error| AppError::ssh_launch("Failed to open the SSH session reader.", error.to_string()))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|error| AppError::ssh_launch("Failed to open the SSH session writer.", error.to_string()))?;

        let generation;
        let snapshot;

        {
            let mut inner = self.inner.lock().expect("session mutex poisoned");
            inner.generation += 1;
            generation = inner.generation;
            inner.snapshot = SessionStatePayload {
                connection_id: Some(connection.id.clone()),
                status: SessionStatus::Connecting,
                message: Some(format!("Connecting to {}...", connection.host)),
            };
            inner.resources = Some(SessionResources {
                connection_id: connection.id.clone(),
                child,
                master: pair.master,
                writer,
                queued_password: saved_password,
                connected: false,
            });
            snapshot = inner.snapshot.clone();
        }

        self.emit_status(&app, &snapshot)?;

        let manager = self.clone();
        thread::spawn(move || manager.read_loop(app, generation, reader));

        Ok(snapshot)
    }

    pub fn write_input(&self, data: &str) -> AppResult<()> {
        let mut inner = self.inner.lock().expect("session mutex poisoned");
        let resources = inner
            .resources
            .as_mut()
            .ok_or_else(|| AppError::no_active_session("No active session is available."))?;

        resources
            .writer
            .write_all(data.as_bytes())
            .map_err(|error| AppError::internal("Failed to send terminal input.", error.to_string()))?;
        resources
            .writer
            .flush()
            .map_err(|error| AppError::internal("Failed to flush terminal input.", error.to_string()))
    }

    pub fn resize(&self, cols: u16, rows: u16) -> AppResult<()> {
        let mut inner = self.inner.lock().expect("session mutex poisoned");
        let Some(resources) = inner.resources.as_mut() else {
            return Ok(());
        };

        resources
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| AppError::internal("Failed to resize the terminal.", error.to_string()))
    }

    pub fn disconnect(&self, app: AppHandle) -> AppResult<SessionStatePayload> {
        let snapshot = {
            let mut inner = self.inner.lock().expect("session mutex poisoned");
            let mut resources = inner
                .resources
                .take()
                .ok_or_else(|| AppError::no_active_session("No active session is running."))?;

            let connection_id = resources.connection_id.clone();
            let _ = resources.child.kill();

            inner.generation += 1;
            inner.snapshot = SessionStatePayload {
                connection_id: Some(connection_id),
                status: SessionStatus::Disconnected,
                message: Some("Session closed.".into()),
            };
            inner.snapshot.clone()
        };

        self.emit_status(&app, &snapshot)?;
        Ok(snapshot)
    }

    fn read_loop(&self, app: AppHandle, generation: u64, mut reader: Box<dyn Read + Send>) {
        let mut buffer = [0_u8; 4096];

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    self.finish_session(&app, generation, SessionStatus::Disconnected, "Session closed.");
                    break;
                }
                Ok(bytes_read) => {
                    let text = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();
                    self.handle_output(&app, generation, text);
                }
                Err(error) => {
                    self.finish_session(
                        &app,
                        generation,
                        SessionStatus::Error,
                        &format!("SSH session error: {error}"),
                    );
                    break;
                }
            }
        }
    }

    fn handle_output(&self, app: &AppHandle, generation: u64, data: String) {
        let _ = app.emit(
            "terminal-output",
            TerminalOutputEvent {
                stream: "stdout".into(),
                data: data.clone(),
            },
        );

        let lower = data.to_ascii_lowercase();
        let mut status_to_emit = None;
        let mut auto_password = None;

        {
            let mut inner = self.inner.lock().expect("session mutex poisoned");
            if inner.generation != generation {
                return;
            }

            let Some(resources) = inner.resources.as_mut() else {
                return;
            };

            if lower.contains("password:") {
                if let Some(password) = resources.queued_password.take() {
                    auto_password = Some(password);
                }
            } else if !resources.connected && !data.trim().is_empty() {
                resources.connected = true;
                inner.snapshot.status = SessionStatus::Connected;
                inner.snapshot.message = Some("Connected.".into());
                status_to_emit = Some(inner.snapshot.clone());
            }
        }

        if let Some(password) = auto_password {
            if let Err(error) = self.write_input(&format!("{password}\n")) {
                self.finish_session(app, generation, SessionStatus::Error, &error.message);
                return;
            }
        }

        if let Some(snapshot) = status_to_emit {
            let _ = self.emit_status(app, &snapshot);
        }
    }

    fn finish_session(
        &self,
        app: &AppHandle,
        generation: u64,
        status: SessionStatus,
        message: &str,
    ) {
        let snapshot = {
            let mut inner = self.inner.lock().expect("session mutex poisoned");
            if inner.generation != generation {
                return;
            }

            let connection_id = inner
                .snapshot
                .connection_id
                .clone();
            inner.resources = None;
            inner.snapshot = SessionStatePayload {
                connection_id,
                status,
                message: Some(message.to_string()),
            };
            inner.snapshot.clone()
        };

        let _ = self.emit_status(app, &snapshot);
    }

    fn emit_status(&self, app: &AppHandle, payload: &SessionStatePayload) -> AppResult<()> {
        app.emit("session-status", payload.clone())
            .map_err(|error| AppError::internal("Failed to emit the session event.", error.to_string()))
    }
}

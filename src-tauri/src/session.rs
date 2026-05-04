use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::{Arc, Mutex},
    thread,
};

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::{
    errors::{AppError, AppResult},
    models::{
        ConnectionRecord, SessionRemovedEvent, SessionStatePayload, SessionStatus, TerminalOutputEvent,
    },
};

struct SessionResources {
    child: Box<dyn Child + Send>,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    queued_password: Option<String>,
    connected: bool,
}

struct ManagedSession {
    snapshot: SessionStatePayload,
    resources: Option<SessionResources>,
}

struct SessionInner {
    sessions: HashMap<String, ManagedSession>,
    order: Vec<String>,
}

#[derive(Clone)]
pub struct SessionManager {
    inner: Arc<Mutex<SessionInner>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(SessionInner {
                sessions: HashMap::new(),
                order: Vec::new(),
            })),
        }
    }

    pub fn current_states(&self) -> Vec<SessionStatePayload> {
        let inner = self.inner.lock().expect("session mutex poisoned");
        inner
            .order
            .iter()
            .filter_map(|session_id| inner.sessions.get(session_id).map(|session| session.snapshot.clone()))
            .collect()
    }

    pub fn connect(
        &self,
        app: AppHandle,
        connection: &ConnectionRecord,
        saved_password: Option<String>,
    ) -> AppResult<SessionStatePayload> {
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

        let session_id = Uuid::new_v4().to_string();
        let snapshot = SessionStatePayload {
            session_id: session_id.clone(),
            connection_id: connection.id.clone(),
            connection_name: connection.name.clone(),
            status: SessionStatus::Connecting,
            message: Some(format!("Connecting to {}...", connection.host)),
        };

        {
            let mut inner = self.inner.lock().expect("session mutex poisoned");
            inner.order.push(session_id.clone());
            inner.sessions.insert(
                session_id.clone(),
                ManagedSession {
                    snapshot: snapshot.clone(),
                    resources: Some(SessionResources {
                        child,
                        master: pair.master,
                        writer,
                        queued_password: saved_password,
                        connected: false,
                    }),
                },
            );
        }

        self.emit_status(&app, &snapshot)?;

        let manager = self.clone();
        thread::spawn(move || manager.read_loop(app, session_id, reader));

        Ok(snapshot)
    }

    pub fn write_input(&self, session_id: &str, data: &str) -> AppResult<()> {
        let mut inner = self.inner.lock().expect("session mutex poisoned");
        let session = inner
            .sessions
            .get_mut(session_id)
            .ok_or_else(|| AppError::no_active_session("The selected session is no longer available."))?;
        let resources = session
            .resources
            .as_mut()
            .ok_or_else(|| AppError::no_active_session("The selected session is not active."))?;

        resources
            .writer
            .write_all(data.as_bytes())
            .map_err(|error| AppError::internal("Failed to send terminal input.", error.to_string()))?;
        resources
            .writer
            .flush()
            .map_err(|error| AppError::internal("Failed to flush terminal input.", error.to_string()))
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> AppResult<()> {
        let mut inner = self.inner.lock().expect("session mutex poisoned");
        let Some(session) = inner.sessions.get_mut(session_id) else {
            return Ok(());
        };
        let Some(resources) = session.resources.as_mut() else {
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

    pub fn disconnect(&self, app: AppHandle, session_id: &str) -> AppResult<SessionStatePayload> {
        let snapshot = {
            let mut inner = self.inner.lock().expect("session mutex poisoned");
            let session = inner
                .sessions
                .get_mut(session_id)
                .ok_or_else(|| AppError::no_active_session("The selected session is no longer available."))?;
            let mut resources = session
                .resources
                .take()
                .ok_or_else(|| AppError::no_active_session("The selected session is already closed."))?;

            let _ = resources.child.kill();
            session.snapshot.status = SessionStatus::Disconnected;
            session.snapshot.message = Some("Session closed.".into());
            session.snapshot.clone()
        };

        self.emit_status(&app, &snapshot)?;
        Ok(snapshot)
    }

    pub fn close(&self, app: AppHandle, session_id: &str) -> AppResult<()> {
        let removed = {
            let mut inner = self.inner.lock().expect("session mutex poisoned");
            let removed = inner.sessions.remove(session_id);
            inner.order.retain(|id| id != session_id);
            removed
        };

        let Some(mut session) = removed else {
            return Ok(());
        };

        if let Some(resources) = session.resources.as_mut() {
            let _ = resources.child.kill();
        }

        self.emit_removed(&app, session_id)
    }

    pub fn close_by_connection(&self, app: AppHandle, connection_id: &str) -> AppResult<()> {
        let session_ids = {
            let inner = self.inner.lock().expect("session mutex poisoned");
            inner
                .sessions
                .iter()
                .filter_map(|(session_id, session)| {
                    (session.snapshot.connection_id == connection_id).then(|| session_id.clone())
                })
                .collect::<Vec<_>>()
        };

        for session_id in session_ids {
            self.close(app.clone(), &session_id)?;
        }

        Ok(())
    }

    fn read_loop(&self, app: AppHandle, session_id: String, mut reader: Box<dyn Read + Send>) {
        let mut buffer = [0_u8; 4096];

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    self.finish_session(&app, &session_id, SessionStatus::Disconnected, "Session closed.");
                    break;
                }
                Ok(bytes_read) => {
                    let text = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();
                    self.handle_output(&app, &session_id, text);
                }
                Err(error) => {
                    self.finish_session(
                        &app,
                        &session_id,
                        SessionStatus::Error,
                        &format!("SSH session error: {error}"),
                    );
                    break;
                }
            }
        }
    }

    fn handle_output(&self, app: &AppHandle, session_id: &str, data: String) {
        let _ = app.emit(
            "terminal-output",
            TerminalOutputEvent {
                session_id: session_id.to_string(),
                stream: "stdout".into(),
                data: data.clone(),
            },
        );

        let mut status_to_emit = None;
        let mut auto_password = None;

        {
            let mut inner = self.inner.lock().expect("session mutex poisoned");
            let Some(session) = inner.sessions.get_mut(session_id) else {
                return;
            };
            let Some(resources) = session.resources.as_mut() else {
                return;
            };

            let password_re = regex::Regex::new(r"(?i)password:\s*").unwrap();
            let shell_re = regex::Regex::new(r"[\$#>%]\s*").unwrap();

            if password_re.is_match(&data) {
                if let Some(password) = resources.queued_password.take() {
                    auto_password = Some(password);
                }
            } else if !resources.connected && shell_re.is_match(&data) {
                resources.connected = true;
                session.snapshot.status = SessionStatus::Connected;
                session.snapshot.message = Some("Connected.".into());
                status_to_emit = Some(session.snapshot.clone());
            }
        }

        if let Some(password) = auto_password {
            if let Err(error) = self.write_input(session_id, &format!("{password}\n")) {
                self.finish_session(app, session_id, SessionStatus::Error, &error.message);
                return;
            }
        }

        if let Some(snapshot) = status_to_emit {
            let _ = self.emit_status(app, &snapshot);
        }
    }

    fn finish_session(&self, app: &AppHandle, session_id: &str, status: SessionStatus, message: &str) {
        let snapshot = {
            let mut inner = self.inner.lock().expect("session mutex poisoned");
            let Some(session) = inner.sessions.get_mut(session_id) else {
                return;
            };

            session.resources = None;
            session.snapshot.status = status;
            session.snapshot.message = Some(message.to_string());
            session.snapshot.clone()
        };

        let _ = self.emit_status(app, &snapshot);
    }

    fn emit_status(&self, app: &AppHandle, payload: &SessionStatePayload) -> AppResult<()> {
        app.emit("session-status", payload.clone())
            .map_err(|error| AppError::internal("Failed to emit the session event.", error.to_string()))
    }

    fn emit_removed(&self, app: &AppHandle, session_id: &str) -> AppResult<()> {
        app.emit(
            "session-removed",
            SessionRemovedEvent {
                session_id: session_id.to_string(),
            },
        )
        .map_err(|error| AppError::internal("Failed to emit the session removal event.", error.to_string()))
    }
}

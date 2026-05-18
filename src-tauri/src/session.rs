use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::{
    database::Database,
    errors::{AppError, AppResult},
    models::{
        ConnectionHistoryCloseStatus, ConnectionRecord, SessionRemovedEvent,
        SessionStatePayload, SessionStatus, TerminalOutputEvent,
    },
    recording::{RecordingManager, SessionRecorder},
    terminal_detection::{
        append_output_with_limit, append_recent_output, contains_password_prompt,
        contains_shell_prompt,
        detect_connection_error_message,
    },
};

const TERMINAL_BUFFER_LIMIT: usize = 32 * 1024;

struct SessionResources {
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    history_session_id: String,
    last_history_activity_flush: Instant,
    queued_password: Option<String>,
    recent_output: String,
    connected: bool,
    recorder: Option<SessionRecorder>,
}

struct ManagedSession {
    snapshot: SessionStatePayload,
    terminal_output: String,
    resources: Option<SessionResources>,
}

struct SessionInner {
    sessions: HashMap<String, ManagedSession>,
    order: Vec<String>,
}

#[derive(Clone)]
pub struct SessionManager {
    inner: Arc<Mutex<SessionInner>>,
    database: Database,
    recording: RecordingManager,
}

impl SessionManager {
    pub fn new(database: Database, recording: RecordingManager) -> Self {
        Self {
            inner: Arc::new(Mutex::new(SessionInner {
                sessions: HashMap::new(),
                order: Vec::new(),
            })),
            database,
            recording,
        }
    }

    pub fn current_states(&self) -> Vec<SessionStatePayload> {
        let inner = self.inner.lock().expect("session mutex poisoned");
        inner
            .order
            .iter()
            .filter_map(|session_id| {
                inner
                    .sessions
                    .get(session_id)
                    .map(|session| session.snapshot.clone())
            })
            .collect()
    }

    pub fn connect(
        &self,
        app: AppHandle,
        connection: &ConnectionRecord,
        saved_password: Option<String>,
    ) -> AppResult<SessionStatePayload> {
        let recorder = self.recording.start_session(connection)?;
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 32,
                cols: 120,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| {
                AppError::ssh_launch(
                    "Failed to initialize the terminal session.",
                    error.to_string(),
                )
            })?;

        let mut command = CommandBuilder::new("ssh");
        command.arg("-p");
        command.arg(connection.port.to_string());
        command.arg(format!("{}@{}", connection.username, connection.host));
        command.env("TERM", "xterm-256color");

        let child = pair.slave.spawn_command(command).map_err(|error| {
            AppError::ssh_launch("Failed to start the SSH process.", error.to_string())
        })?;

        let reader = pair.master.try_clone_reader().map_err(|error| {
            AppError::ssh_launch("Failed to open the SSH session reader.", error.to_string())
        })?;

        let writer = pair.master.take_writer().map_err(|error| {
            AppError::ssh_launch("Failed to open the SSH session writer.", error.to_string())
        })?;

        let child = Arc::new(Mutex::new(child));
        let history_session_id = match self.database.start_connection_history_session(connection) {
            Ok(history_session_id) => history_session_id,
            Err(error) => {
                let _ = child.lock().expect("session child mutex poisoned").kill();
                return Err(error);
            }
        };
        let session_id = Uuid::new_v4().to_string();
        let snapshot = SessionStatePayload {
            session_id: session_id.clone(),
            connection_id: connection.id.clone(),
            connection_name: connection.name.clone(),
            status: SessionStatus::Connecting,
            message: Some(format!("Connecting to {}...", connection.host)),
            recording_active: recorder.is_some(),
            recording_mode: recorder.as_ref().map(SessionRecorder::mode),
        };

        {
            let mut inner = self.inner.lock().expect("session mutex poisoned");
            inner.order.push(session_id.clone());
            inner.sessions.insert(
                session_id.clone(),
                ManagedSession {
                    snapshot: snapshot.clone(),
                    terminal_output: String::new(),
                    resources: Some(SessionResources {
                        child: Arc::clone(&child),
                        master: pair.master,
                        writer,
                        history_session_id,
                        last_history_activity_flush: Instant::now(),
                        queued_password: saved_password,
                        recent_output: String::new(),
                        connected: false,
                        recorder,
                    }),
                },
            );
        }

        self.emit_status(&app, &snapshot)?;

        let manager = self.clone();
        let read_app = app.clone();
        let read_session_id = session_id.clone();
        thread::spawn(move || manager.read_loop(read_app, read_session_id, reader));

        let manager = self.clone();
        thread::spawn(move || manager.wait_for_exit(app, session_id, child));

        Ok(snapshot)
    }

    pub fn write_input(&self, session_id: &str, data: &str) -> AppResult<()> {
        let mut inner = self.inner.lock().expect("session mutex poisoned");
        let session = inner.sessions.get_mut(session_id).ok_or_else(|| {
            AppError::no_active_session("The selected session is no longer available.")
        })?;
        let resources = session
            .resources
            .as_mut()
            .ok_or_else(|| AppError::no_active_session("The selected session is not active."))?;

        if let Some(recorder) = resources.recorder.as_mut() {
            recorder.record_input(data)?;
        }

        resources
            .writer
            .write_all(data.as_bytes())
            .map_err(|error| {
                AppError::internal("Failed to send terminal input.", error.to_string())
            })?;
        resources.writer.flush().map_err(|error| {
            AppError::internal("Failed to flush terminal input.", error.to_string())
        })?;

        self.touch_history_if_due(resources, false);
        Ok(())
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
            .map_err(|error| {
                AppError::internal("Failed to resize the terminal.", error.to_string())
            })
    }

    pub fn disconnect(&self, app: AppHandle, session_id: &str) -> AppResult<SessionStatePayload> {
        let snapshot = {
            let mut inner = self.inner.lock().expect("session mutex poisoned");
            let session = inner.sessions.get_mut(session_id).ok_or_else(|| {
                AppError::no_active_session("The selected session is no longer available.")
            })?;
            let mut resources = session.resources.take().ok_or_else(|| {
                AppError::no_active_session("The selected session is already closed.")
            })?;

            self.finish_history(&resources, ConnectionHistoryCloseStatus::Normal, false);
            Self::finish_recorder(resources.recorder.as_mut())?;
            let _ = resources
                .child
                .lock()
                .expect("session child mutex poisoned")
                .kill();
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
            let close_status = if resources.connected {
                ConnectionHistoryCloseStatus::Normal
            } else {
                ConnectionHistoryCloseStatus::Abnormal
            };
            self.finish_history(resources, close_status, false);
            Self::finish_recorder(resources.recorder.as_mut())?;
            let _ = resources
                .child
                .lock()
                .expect("session child mutex poisoned")
                .kill();
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

    pub fn terminal_buffer(&self, session_id: &str) -> AppResult<String> {
        let inner = self.inner.lock().expect("session mutex poisoned");
        let session = inner.sessions.get(session_id).ok_or_else(|| {
            AppError::no_active_session("The selected session is no longer available.")
        })?;

        Ok(session.terminal_output.clone())
    }

    fn read_loop(&self, app: AppHandle, session_id: String, mut reader: Box<dyn Read + Send>) {
        let mut buffer = [0_u8; 4096];

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    self.finish_session_after_exit(&app, &session_id);
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

    fn wait_for_exit(
        &self,
        app: AppHandle,
        session_id: String,
        child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    ) {
        loop {
            let exit_status = {
                let mut child = child.lock().expect("session child mutex poisoned");
                child.try_wait()
            };

            match exit_status {
                Ok(Some(_)) => {
                    self.finish_session_after_exit(&app, &session_id);
                    break;
                }
                Ok(None) => thread::sleep(Duration::from_millis(500)),
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
        let mut failure_message = None;
        let mut recorder_error = None;

        {
            let mut inner = self.inner.lock().expect("session mutex poisoned");
            let Some(session) = inner.sessions.get_mut(session_id) else {
                return;
            };
            append_output_with_limit(&mut session.terminal_output, &data, TERMINAL_BUFFER_LIMIT);
            let Some(resources) = session.resources.as_mut() else {
                return;
            };
            append_recent_output(&mut resources.recent_output, &data);
            if let Some(recorder) = resources.recorder.as_mut() {
                if let Err(error) = recorder.record_output(&data) {
                    recorder_error = Some(error.message);
                }
            }
            self.touch_history_if_due(resources, false);

            if contains_password_prompt(&resources.recent_output) {
                if let Some(recorder) = resources.recorder.as_mut() {
                    recorder.suppress_input_until_submit();
                }
                if let Some(password) = resources.queued_password.take() {
                    resources.recent_output.clear();
                    auto_password = Some(password);
                }
            } else if !resources.connected && contains_shell_prompt(&resources.recent_output) {
                resources.connected = true;
                if let Some(recorder) = resources.recorder.as_mut() {
                    recorder.clear_input_suppression();
                }
                session.snapshot.status = SessionStatus::Connected;
                session.snapshot.message = Some("Connected.".into());
                status_to_emit = Some(session.snapshot.clone());
            } else if !resources.connected {
                failure_message = detect_connection_error_message(&resources.recent_output);
            }
        }

        if let Some(error) = recorder_error {
            self.finish_session(app, session_id, SessionStatus::Error, &error);
            return;
        }

        if let Some(message) = failure_message {
            self.finish_session(app, session_id, SessionStatus::Error, &message);
            return;
        }

        if let Some(password) = auto_password {
            if let Err(error) = self.write_input(session_id, &format!("{password}\r")) {
                self.finish_session(app, session_id, SessionStatus::Error, &error.message);
                return;
            }
        }

        if let Some(snapshot) = status_to_emit {
            let _ = self.emit_status(app, &snapshot);
        }
    }

    fn finish_session_after_exit(&self, app: &AppHandle, session_id: &str) {
        let (status, message) = {
            let inner = self.inner.lock().expect("session mutex poisoned");
            let Some(session) = inner.sessions.get(session_id) else {
                return;
            };
            let Some(resources) = session.resources.as_ref() else {
                return;
            };

            classify_exit_status(resources.connected, &resources.recent_output)
        };

        self.finish_session(app, session_id, status, &message);
    }

    fn finish_session(
        &self,
        app: &AppHandle,
        session_id: &str,
        status: SessionStatus,
        message: &str,
    ) {
        let snapshot = {
            let mut inner = self.inner.lock().expect("session mutex poisoned");
            let Some(session) = inner.sessions.get_mut(session_id) else {
                return;
            };

            let mut final_status = status;
            let mut final_message = message.to_string();
            if let Some(mut resources) = session.resources.take() {
                let close_status = if matches!(final_status, SessionStatus::Disconnected) {
                    ConnectionHistoryCloseStatus::Normal
                } else {
                    ConnectionHistoryCloseStatus::Abnormal
                };
                self.finish_history(&resources, close_status, false);
                if let Err(error) = Self::finish_recorder(resources.recorder.as_mut()) {
                    final_status = SessionStatus::Error;
                    final_message = error.message;
                }
            }
            session.snapshot.status = final_status;
            session.snapshot.message = Some(final_message);
            session.snapshot.clone()
        };

        let _ = self.emit_status(app, &snapshot);
    }

    fn finish_recorder(recorder: Option<&mut SessionRecorder>) -> AppResult<()> {
        if let Some(recorder) = recorder {
            recorder.finish()?;
        }
        Ok(())
    }

    fn touch_history_if_due(&self, resources: &mut SessionResources, force: bool) {
        if !force
            && resources.last_history_activity_flush.elapsed() < Duration::from_secs(10)
        {
            return;
        }

        match self
            .database
            .touch_connection_history_session(&resources.history_session_id)
        {
            Ok(()) => {
                resources.last_history_activity_flush = Instant::now();
            }
            Err(error) => {
                log::warn!(
                    "Failed to update connection history activity for session {}: {}",
                    resources.history_session_id,
                    error.message
                );
            }
        }
    }

    fn finish_history(
        &self,
        resources: &SessionResources,
        close_status: ConnectionHistoryCloseStatus,
        is_estimated: bool,
    ) {
        if let Err(error) = self.database.finish_connection_history_session(
            &resources.history_session_id,
            close_status,
            is_estimated,
        ) {
            log::warn!(
                "Failed to finalize connection history session {}: {}",
                resources.history_session_id,
                error.message
            );
        }

        if let Err(error) = self.database.cleanup_connection_history() {
            log::warn!(
                "Failed to clean up connection history after finishing session {}: {}",
                resources.history_session_id,
                error.message
            );
        }
    }

    fn emit_status(&self, app: &AppHandle, payload: &SessionStatePayload) -> AppResult<()> {
        app.emit("session-status", payload.clone())
            .map_err(|error| {
                AppError::internal("Failed to emit the session event.", error.to_string())
            })
    }

    fn emit_removed(&self, app: &AppHandle, session_id: &str) -> AppResult<()> {
        app.emit(
            "session-removed",
            SessionRemovedEvent {
                session_id: session_id.to_string(),
            },
        )
        .map_err(|error| {
            AppError::internal(
                "Failed to emit the session removal event.",
                error.to_string(),
            )
        })
    }
}

fn classify_exit_status(connected: bool, recent_output: &str) -> (SessionStatus, String) {
    if connected {
        (SessionStatus::Disconnected, String::from("Session closed."))
    } else if let Some(error_message) = detect_connection_error_message(recent_output) {
        (SessionStatus::Error, error_message)
    } else {
        (
            SessionStatus::Error,
            String::from("SSH connection failed before the remote shell became available."),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::classify_exit_status;
    use crate::models::SessionStatus;

    #[test]
    fn classifies_connected_session_exit_as_disconnect() {
        let (status, message) = classify_exit_status(true, "Connection to host example.com closed.");

        assert_eq!(status, SessionStatus::Disconnected);
        assert_eq!(message, "Session closed.");
    }

    #[test]
    fn classifies_pre_shell_exit_with_ssh_error_as_error() {
        let (status, message) = classify_exit_status(
            false,
            "ssh: connect to host example.com port 22: Connection refused\r\n",
        );

        assert_eq!(status, SessionStatus::Error);
        assert_eq!(message, "ssh: connect to host example.com port 22: Connection refused");
    }
}

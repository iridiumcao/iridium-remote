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
        ConnectionHistoryCloseStatus, ConnectionRecord, SessionRemovedEvent, SessionStatePayload,
        SessionStatus, TerminalOutputEvent,
    },
    recording::{RecordingManager, SessionRecorder},
    terminal_detection::{
        append_output_with_limit, append_recent_output, contains_password_prompt,
        contains_shell_prompt, detect_connection_error_message, normalize_visible_text,
    },
};

const TERMINAL_BUFFER_LIMIT: usize = 32 * 1024;
const MIN_SYNCHRONIZED_TERMINAL_COLS: u16 = 2;
const MIN_SYNCHRONIZED_TERMINAL_ROWS: u16 = 2;
const OUTPUT_LOG_PREVIEW_LIMIT: usize = 160;
const OUTPUT_LOGGED_CHUNKS_PER_SESSION: usize = 5;

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
    output_chunk_count: usize,
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
    spawn_lock: Arc<Mutex<()>>,
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
            spawn_lock: Arc::new(Mutex::new(())),
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
        let _spawn_guard = self.spawn_lock.lock().expect("spawn mutex poisoned");
        let session_id = Uuid::new_v4().to_string();

        log::debug!(
            "Session {}: starting SSH connect for '{}' (target={}@{}:{}, saved_password={}).",
            session_id,
            connection.name,
            connection.username,
            connection.host,
            connection.port,
            saved_password.is_some()
        );

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

        log::debug!(
            "Session {}: PTY allocated with default size 120x32.",
            session_id
        );

        let mut command = CommandBuilder::new("ssh");
        command.arg("-p");
        command.arg(connection.port.to_string());
        command.arg(format!("{}@{}", connection.username, connection.host));
        command.env("TERM", "xterm-256color");

        log::debug!(
            "Session {}: spawning system ssh client for '{}' using TERM=xterm-256color.",
            session_id,
            connection.name
        );

        let child = pair.slave.spawn_command(command).map_err(|error| {
            AppError::ssh_launch("Failed to start the SSH process.", error.to_string())
        })?;

        log::debug!("Session {}: ssh process spawned successfully.", session_id);

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
                        output_chunk_count: 0,
                    }),
                },
            );
        }

        log::debug!(
            "Session {}: registered and emitting initial connecting state.",
            session_id
        );
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

        log::debug!(
            "Session {}: forwarding {} byte(s) of terminal input.",
            session_id,
            data.len()
        );

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
        if cols < MIN_SYNCHRONIZED_TERMINAL_COLS || rows < MIN_SYNCHRONIZED_TERMINAL_ROWS {
            log::debug!(
                "Session {}: ignoring terminal resize to {}x{} because it is smaller than the supported PTY minimum.",
                session_id,
                cols,
                rows
            );
            return Ok(());
        }

        let mut inner = self.inner.lock().expect("session mutex poisoned");
        let Some(session) = inner.sessions.get_mut(session_id) else {
            log::debug!(
                "Session {}: ignoring terminal resize to {}x{} because the session no longer exists.",
                session_id,
                cols,
                rows
            );
            return Ok(());
        };
        let Some(resources) = session.resources.as_mut() else {
            log::debug!(
                "Session {}: ignoring terminal resize to {}x{} because the session is no longer active.",
                session_id,
                cols,
                rows
            );
            return Ok(());
        };

        log::debug!("Session {}: resizing PTY to {}x{}.", session_id, cols, rows);

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
            session.snapshot.recording_active = false;
            session.snapshot.recording_mode = None;
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

    pub fn stop_recording_for_active_sessions(&self, app: &AppHandle) -> AppResult<()> {
        let sessions_to_update = {
            let mut inner = self.inner.lock().expect("session mutex poisoned");
            let mut sessions_to_update = Vec::new();
            let session_order = inner.order.clone();

            for session_id in session_order {
                let Some(session) = inner.sessions.get_mut(&session_id) else {
                    continue;
                };

                let recorder = session
                    .resources
                    .as_mut()
                    .and_then(|resources| resources.recorder.take());
                let snapshot_was_recording =
                    session.snapshot.recording_active || session.snapshot.recording_mode.is_some();

                if !snapshot_was_recording && recorder.is_none() {
                    continue;
                }

                session.snapshot.recording_active = false;
                session.snapshot.recording_mode = None;
                sessions_to_update.push((recorder, session.snapshot.clone()));
            }

            sessions_to_update
        };

        for (mut recorder, snapshot) in sessions_to_update {
            Self::finish_recorder(recorder.as_mut())?;
            self.emit_status(app, &snapshot)?;
        }

        Ok(())
    }

    fn read_loop(&self, app: AppHandle, session_id: String, mut reader: Box<dyn Read + Send>) {
        let mut buffer = [0_u8; 4096];

        log::debug!("Session {}: terminal reader loop started.", session_id);

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    log::debug!("Session {}: terminal reader reached EOF.", session_id);
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
                Ok(Some(status)) => {
                    log::debug!(
                        "Session {}: ssh process exited with status {:?}.",
                        session_id,
                        status
                    );
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
            resources.output_chunk_count += 1;
            let output_chunk_count = resources.output_chunk_count;
            if output_chunk_count <= OUTPUT_LOGGED_CHUNKS_PER_SESSION {
                log::debug!(
                    "Session {}: received output chunk #{} ({} byte(s)): '{}'.",
                    session_id,
                    output_chunk_count,
                    data.len(),
                    preview_terminal_output(&data)
                );
            }
            if let Some(recorder) = resources.recorder.as_mut() {
                if let Err(error) = recorder.record_output(&data) {
                    recorder_error = Some(error.message);
                }
            }
            self.touch_history_if_due(resources, false);

            if contains_password_prompt(&resources.recent_output) {
                log::debug!(
                    "Session {}: detected password prompt in recent terminal output.",
                    session_id
                );
                if let Some(recorder) = resources.recorder.as_mut() {
                    recorder.suppress_input_until_submit();
                }
                if let Some(password) = resources.queued_password.take() {
                    resources.recent_output.clear();
                    log::debug!(
                        "Session {}: submitting queued password automatically.",
                        session_id
                    );
                    auto_password = Some(password);
                }
            } else if !resources.connected && contains_shell_prompt(&resources.recent_output) {
                resources.connected = true;
                if let Some(recorder) = resources.recorder.as_mut() {
                    recorder.clear_input_suppression();
                }
                session.snapshot.status = SessionStatus::Connected;
                session.snapshot.message = Some("Connected.".into());
                log::debug!(
                    "Session {}: detected shell prompt and marking session as connected.",
                    session_id
                );
                status_to_emit = Some(session.snapshot.clone());
            } else if !resources.connected {
                failure_message = detect_connection_error_message(&resources.recent_output);
                if let Some(message) = failure_message.as_ref() {
                    log::debug!(
                        "Session {}: detected SSH failure output before shell prompt: '{}'.",
                        session_id,
                        message
                    );
                }
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

        log::debug!(
            "Session {}: finishing after process exit with status {:?} and message '{}'.",
            session_id,
            status,
            message
        );
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
            session.snapshot.recording_active = false;
            session.snapshot.recording_mode = None;
            session.snapshot.clone()
        };

        log::info!(
            "Session {}: transitioned to {:?} ({:?}).",
            session_id,
            snapshot.status,
            snapshot.message
        );
        let _ = self.emit_status(app, &snapshot);
    }

    fn finish_recorder(recorder: Option<&mut SessionRecorder>) -> AppResult<()> {
        if let Some(recorder) = recorder {
            recorder.finish()?;
        }
        Ok(())
    }

    fn touch_history_if_due(&self, resources: &mut SessionResources, force: bool) {
        if !force && resources.last_history_activity_flush.elapsed() < Duration::from_secs(10) {
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
        log::debug!(
            "Session {}: emitting session-status {:?} ({:?}).",
            payload.session_id,
            payload.status,
            payload.message
        );
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

fn preview_terminal_output(data: &str) -> String {
    let normalized = normalize_visible_text(data);
    let flattened = normalized.replace('\n', "\\n");
    let mut preview = flattened
        .chars()
        .take(OUTPUT_LOG_PREVIEW_LIMIT)
        .collect::<String>();
    if flattened.chars().count() > OUTPUT_LOG_PREVIEW_LIMIT {
        preview.push_str("...");
    }
    preview
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
        let (status, message) =
            classify_exit_status(true, "Connection to host example.com closed.");

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
        assert_eq!(
            message,
            "ssh: connect to host example.com port 22: Connection refused"
        );
    }
}

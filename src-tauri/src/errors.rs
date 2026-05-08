use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    pub message: String,
    pub details: Option<String>,
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn validation(message: impl Into<String>) -> Self {
        Self {
            code: "VALIDATION_ERROR".into(),
            message: message.into(),
            details: None,
        }
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self {
            code: "NOT_FOUND".into(),
            message: message.into(),
            details: None,
        }
    }

    pub fn database(message: impl Into<String>, details: impl Into<String>) -> Self {
        Self {
            code: "DATABASE_ERROR".into(),
            message: message.into(),
            details: Some(details.into()),
        }
    }

    pub fn keyring(message: impl Into<String>, details: impl Into<String>) -> Self {
        Self {
            code: "KEYRING_ERROR".into(),
            message: message.into(),
            details: Some(details.into()),
        }
    }

    pub fn ssh_launch(message: impl Into<String>, details: impl Into<String>) -> Self {
        Self {
            code: "SSH_LAUNCH_ERROR".into(),
            message: message.into(),
            details: Some(details.into()),
        }
    }

    pub fn no_active_session(message: impl Into<String>) -> Self {
        Self {
            code: "NO_ACTIVE_SESSION".into(),
            message: message.into(),
            details: None,
        }
    }

    pub fn update_check(message: impl Into<String>, details: impl Into<String>) -> Self {
        Self {
            code: "UPDATE_CHECK_ERROR".into(),
            message: message.into(),
            details: Some(details.into()),
        }
    }

    pub fn internal(message: impl Into<String>, details: impl Into<String>) -> Self {
        Self {
            code: "INTERNAL_ERROR".into(),
            message: message.into(),
            details: Some(details.into()),
        }
    }
}

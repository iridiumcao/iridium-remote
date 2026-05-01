use keyring::Entry;

use crate::{
    errors::{AppError, AppResult},
    models::ConnectionRecord,
};

const SERVICE_NAME: &str = "iridium-remote";

#[derive(Clone, Default)]
pub struct CredentialStore;

impl CredentialStore {
    pub fn new() -> Self {
        Self
    }

    pub fn get_for_connection(&self, connection: &ConnectionRecord) -> AppResult<Option<String>> {
        self.get_by_account(&self.account_for_connection(connection))
    }

    pub fn set_by_account(&self, account: &str, password: &str) -> AppResult<()> {
        let entry = Entry::new(SERVICE_NAME, account)
            .map_err(|error| AppError::keyring("Failed to create the keyring entry.", error.to_string()))?;

        entry
            .set_password(password)
            .map_err(|error| AppError::keyring("Failed to store the password in the keyring.", error.to_string()))
    }

    pub fn delete_for_connection(&self, connection: &ConnectionRecord) -> AppResult<()> {
        self.delete_by_account(&self.account_for_connection(connection))
    }

    pub fn account_for_connection(&self, connection: &ConnectionRecord) -> String {
        format!("{}@{}", connection.username, connection.host)
    }

    fn get_by_account(&self, account: &str) -> AppResult<Option<String>> {
        let entry = Entry::new(SERVICE_NAME, account)
            .map_err(|error| AppError::keyring("Failed to create the keyring entry.", error.to_string()))?;

        match entry.get_password() {
            Ok(password) => Ok(Some(password)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(AppError::keyring(
                "Failed to load the password from the keyring.",
                error.to_string(),
            )),
        }
    }

    fn delete_by_account(&self, account: &str) -> AppResult<()> {
        let entry = Entry::new(SERVICE_NAME, account)
            .map_err(|error| AppError::keyring("Failed to create the keyring entry.", error.to_string()))?;

        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(AppError::keyring(
                "Failed to delete the password from the keyring.",
                error.to_string(),
            )),
        }
    }
}

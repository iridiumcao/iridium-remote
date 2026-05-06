use crate::{errors::AppResult, models::ConnectionRecord};

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

    pub fn set_for_connection(
        &self,
        connection: &ConnectionRecord,
        password: &str,
    ) -> AppResult<()> {
        self.set_by_account(&self.account_for_connection(connection), password)
    }

    pub fn delete_for_connection(&self, connection: &ConnectionRecord) -> AppResult<()> {
        self.delete_by_account(&self.account_for_connection(connection))
    }

    pub fn account_for_connection(&self, connection: &ConnectionRecord) -> String {
        format!("{}@{}", connection.username, connection.host)
    }

    pub fn set_by_account(&self, account: &str, password: &str) -> AppResult<()> {
        platform::set_by_account(account, password)
    }

    fn get_by_account(&self, account: &str) -> AppResult<Option<String>> {
        platform::get_by_account(account)
    }

    fn delete_by_account(&self, account: &str) -> AppResult<()> {
        platform::delete_by_account(account)
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use std::{ffi::c_void, io, ptr};

    use windows_sys::Win32::{
        Foundation::{ERROR_NOT_FOUND, FILETIME},
        Security::Credentials::{
            CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE,
            CRED_TYPE_GENERIC,
        },
    };

    use crate::errors::{AppError, AppResult};

    use super::SERVICE_NAME;

    pub fn set_by_account(account: &str, password: &str) -> AppResult<()> {
        let mut target_name = utf16_null_terminated(&target_name(account));
        let mut username = utf16_null_terminated(account);
        let mut blob = password.as_bytes().to_vec();

        let credential = CREDENTIALW {
            Flags: 0,
            Type: CRED_TYPE_GENERIC,
            TargetName: target_name.as_mut_ptr(),
            Comment: ptr::null_mut(),
            LastWritten: FILETIME {
                dwLowDateTime: 0,
                dwHighDateTime: 0,
            },
            CredentialBlobSize: blob.len().try_into().map_err(|_| {
                AppError::keyring(
                    "Failed to store the password in the keyring.",
                    "The password is too large for Windows Credential Manager.",
                )
            })?,
            CredentialBlob: blob.as_mut_ptr(),
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            AttributeCount: 0,
            Attributes: ptr::null_mut(),
            TargetAlias: ptr::null_mut(),
            UserName: username.as_mut_ptr(),
        };

        let stored = unsafe { CredWriteW(&credential, 0) };
        if stored == 0 {
            return Err(AppError::keyring(
                "Failed to store the password in the keyring.",
                io::Error::last_os_error().to_string(),
            ));
        }

        Ok(())
    }

    pub fn get_by_account(account: &str) -> AppResult<Option<String>> {
        let target_name = utf16_null_terminated(&target_name(account));
        let mut credential_ptr: *mut CREDENTIALW = ptr::null_mut();

        let loaded = unsafe {
            CredReadW(
                target_name.as_ptr(),
                CRED_TYPE_GENERIC,
                0,
                &mut credential_ptr,
            )
        };
        if loaded == 0 {
            let error = io::Error::last_os_error();
            return if error.raw_os_error() == Some(ERROR_NOT_FOUND as i32) {
                Ok(None)
            } else {
                Err(AppError::keyring(
                    "Failed to load the password from the keyring.",
                    error.to_string(),
                ))
            };
        }

        let result = unsafe {
            let credential = &*credential_ptr;
            let blob = std::slice::from_raw_parts(
                credential.CredentialBlob.cast_const(),
                credential.CredentialBlobSize as usize,
            );

            String::from_utf8(blob.to_vec()).map(Some).map_err(|error| {
                AppError::keyring(
                    "Failed to decode the password from Windows Credential Manager.",
                    error.to_string(),
                )
            })
        };

        unsafe {
            CredFree(credential_ptr.cast::<c_void>());
        }

        result
    }

    pub fn delete_by_account(account: &str) -> AppResult<()> {
        let target_name = utf16_null_terminated(&target_name(account));
        let deleted = unsafe { CredDeleteW(target_name.as_ptr(), CRED_TYPE_GENERIC, 0) };

        if deleted == 0 {
            let error = io::Error::last_os_error();
            if error.raw_os_error() == Some(ERROR_NOT_FOUND as i32) {
                return Ok(());
            }

            return Err(AppError::keyring(
                "Failed to delete the password from the keyring.",
                error.to_string(),
            ));
        }

        Ok(())
    }

    fn target_name(account: &str) -> String {
        format!("{SERVICE_NAME}:{account}")
    }

    fn utf16_null_terminated(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(Some(0)).collect()
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    use keyring::Entry;

    use crate::errors::{AppError, AppResult};

    use super::SERVICE_NAME;

    pub fn set_by_account(account: &str, password: &str) -> AppResult<()> {
        let entry = Entry::new(SERVICE_NAME, account).map_err(|error| {
            AppError::keyring("Failed to create the keyring entry.", error.to_string())
        })?;

        entry.set_password(password).map_err(|error| {
            AppError::keyring(
                "Failed to store the password in the keyring.",
                error.to_string(),
            )
        })
    }

    pub fn get_by_account(account: &str) -> AppResult<Option<String>> {
        let entry = Entry::new(SERVICE_NAME, account).map_err(|error| {
            AppError::keyring("Failed to create the keyring entry.", error.to_string())
        })?;

        match entry.get_password() {
            Ok(password) => Ok(Some(password)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(AppError::keyring(
                "Failed to load the password from the keyring.",
                error.to_string(),
            )),
        }
    }

    pub fn delete_by_account(account: &str) -> AppResult<()> {
        let entry = Entry::new(SERVICE_NAME, account).map_err(|error| {
            AppError::keyring("Failed to create the keyring entry.", error.to_string())
        })?;

        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(AppError::keyring(
                "Failed to delete the password from the keyring.",
                error.to_string(),
            )),
        }
    }
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use uuid::Uuid;

    use super::CredentialStore;

    #[test]
    fn windows_credentials_round_trip() {
        let store = CredentialStore::new();
        let account = format!("test-user-{}@example.com", Uuid::new_v4());
        let password = "round-trip-secret";

        store.delete_by_account(&account).unwrap();
        store.set_by_account(&account, password).unwrap();
        assert_eq!(
            store.get_by_account(&account).unwrap().as_deref(),
            Some(password)
        );
        store.delete_by_account(&account).unwrap();
        assert_eq!(store.get_by_account(&account).unwrap(), None);
    }
}

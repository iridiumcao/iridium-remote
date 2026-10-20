use std::{collections::HashMap, fs};

use russh::{
    client::Handler as _,
    keys::{ssh_key::certificate, Algorithm, PrivateKey, PublicKey},
    server::{self, Auth, Msg, Session},
    Channel, ChannelId,
};
use russh_sftp::protocol::{Attrs, File, Handle, Name, Status, StatusCode};

use super::*;

struct TestFiles(PathBuf);

impl TestFiles {
    fn new() -> Self {
        let path =
            env::temp_dir().join(format!("iridium-remote-ssh-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&path).unwrap();
        Self(path)
    }

    fn known_hosts(&self, key: &PublicKey) -> PathBuf {
        let path = self.0.join("known_hosts");
        fs::write(
            &path,
            format!("[localhost]:2222 {}\n", key.to_openssh().unwrap()),
        )
        .unwrap();
        path
    }
}

impl Drop for TestFiles {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn key() -> PrivateKey {
    PrivateKey::random(&mut rand::rng(), Algorithm::Ed25519).unwrap()
}

fn handler(known_hosts_path: PathBuf) -> TransferClientHandler {
    TransferClientHandler {
        host: "localhost".into(),
        port: 2222,
        known_hosts_path: Some(known_hosts_path),
        strict_host_key_checking: true,
        rejection_reason: Arc::new(Mutex::new(None)),
    }
}

#[tokio::test]
async fn verifies_pinned_host_keys_and_rejects_unknown_or_changed_keys() {
    let files = TestFiles::new();
    let host_key = key();
    let mut client_handler = handler(files.known_hosts(host_key.public_key()));
    assert!(client_handler
        .check_server_key(&host_key.public_key().clone().into())
        .await
        .unwrap());

    assert!(!client_handler
        .check_server_key(&key().public_key().clone().into())
        .await
        .unwrap());
    assert!(client_handler
        .rejection_reason
        .lock()
        .unwrap()
        .as_ref()
        .unwrap()
        .contains("Failed to verify"));

    client_handler.known_hosts_path = Some(files.0.join("missing_known_hosts"));
    assert!(!client_handler
        .check_server_key(&host_key.public_key().clone().into())
        .await
        .unwrap());
    assert!(client_handler
        .rejection_reason
        .lock()
        .unwrap()
        .as_ref()
        .unwrap()
        .contains("not trusted"));
}

#[tokio::test]
async fn strict_mode_rejects_host_certificates_even_when_the_underlying_key_is_pinned() {
    let files = TestFiles::new();
    let host_key = key();
    let ca_key = key();
    let mut builder = certificate::Builder::new(
        vec![0_u8; 16],
        host_key.public_key().key_data().clone(),
        0,
        u64::MAX,
    )
    .unwrap();
    builder.cert_type(certificate::CertType::Host).unwrap();
    builder.valid_principal("localhost").unwrap();
    let certificate = PublicKeyOrCertificate::Certificate(builder.sign(&ca_key).unwrap());
    let mut client_handler = handler(files.known_hosts(host_key.public_key()));
    assert!(!client_handler.check_server_key(&certificate).await.unwrap());
    assert!(client_handler
        .rejection_reason
        .lock()
        .unwrap()
        .as_ref()
        .unwrap()
        .contains("certificate verification is not supported"));

    client_handler.strict_host_key_checking = false;
    assert!(client_handler.check_server_key(&certificate).await.unwrap());
}

struct TestSshServer {
    accepted_key: PublicKey,
    channels: HashMap<ChannelId, Channel<Msg>>,
}

impl server::Handler for TestSshServer {
    type Error = russh::Error;

    async fn auth_password(&mut self, user: &str, password: &str) -> Result<Auth, Self::Error> {
        Ok(if user == "test-user" && password == "test-password" {
            Auth::Accept
        } else {
            Auth::reject()
        })
    }

    async fn auth_publickey(
        &mut self,
        user: &str,
        public_key: &PublicKey,
    ) -> Result<Auth, Self::Error> {
        Ok(if user == "test-user" && public_key == &self.accepted_key {
            Auth::Accept
        } else {
            Auth::reject()
        })
    }

    async fn channel_open_session(
        &mut self,
        channel: Channel<Msg>,
        reply: server::ChannelOpenHandle,
        _: &mut Session,
    ) -> Result<(), Self::Error> {
        self.channels.insert(channel.id(), channel);
        reply.accept().await;
        Ok(())
    }

    async fn subsystem_request(
        &mut self,
        channel: ChannelId,
        name: &str,
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        assert_eq!(name, "sftp");
        session.channel_success(channel)?;
        russh_sftp::server::run(
            self.channels.remove(&channel).unwrap().into_stream(),
            TestSftpServer { listed: false },
        )
        .await;
        Ok(())
    }
}

struct TestSftpServer {
    listed: bool,
}

impl russh_sftp::server::Handler for TestSftpServer {
    type Error = StatusCode;

    fn unimplemented(&self) -> Self::Error {
        StatusCode::OpUnsupported
    }

    async fn realpath(&mut self, id: u32, path: String) -> Result<Name, Self::Error> {
        let path = match path.as_str() {
            "." => "/test",
            "/alias" => "/test/a.txt",
            "/missing" => return Err(StatusCode::NoSuchFile),
            other => other,
        };
        Ok(Name {
            id,
            files: vec![File::dummy(path)],
        })
    }

    async fn stat(&mut self, id: u32, path: String) -> Result<Attrs, Self::Error> {
        let mode = match path.as_str() {
            "/test" | "/denied" => 0o040755,
            "/test/a.txt" | "/test/.secret" | "/denied/a.txt" => 0o100644,
            "/test/socket" => 0o140755,
            _ => return Err(StatusCode::NoSuchFile),
        };
        let mut file = File::dummy(path);
        file.attrs.permissions = Some(mode);
        Ok(Attrs {
            id,
            attrs: file.attrs,
        })
    }

    async fn opendir(&mut self, id: u32, path: String) -> Result<Handle, Self::Error> {
        if path == "/denied" {
            return Err(StatusCode::PermissionDenied);
        }
        if path != "/test" {
            return Err(StatusCode::NoSuchFile);
        }
        self.listed = false;
        Ok(Handle {
            id,
            handle: "test-dir".into(),
        })
    }

    async fn readdir(&mut self, id: u32, _: String) -> Result<Name, Self::Error> {
        if self.listed {
            return Err(StatusCode::Eof);
        }
        self.listed = true;
        let mut file = File::dummy("a.txt");
        file.attrs.permissions = Some(0o100644);
        let mut hidden = File::dummy(".secret");
        hidden.attrs.permissions = Some(0o100600);
        Ok(Name {
            id,
            files: vec![
                file,
                hidden,
                File::dummy("z-folder"),
                File::dummy(".hidden"),
                File::dummy("."),
                File::dummy(".."),
            ],
        })
    }

    async fn close(&mut self, id: u32, _: String) -> Result<Status, Self::Error> {
        Ok(Status {
            id,
            status_code: StatusCode::Ok,
            error_message: String::new(),
            language_tag: String::new(),
        })
    }
}

async fn check_authentication_and_sftp(saved_password: &str, use_identity_file: bool) {
    timeout(Duration::from_secs(10), async {
        let files = TestFiles::new();
        let host_key = key();
        let identity = key();
        let client_handler = handler(files.known_hosts(host_key.public_key()));
        let identity_path = files.0.join("id_ed25519");
        identity
            .write_openssh_file(&identity_path, russh::keys::ssh_key::LineEnding::LF)
            .unwrap();
        let server_config = Arc::new(server::Config {
            keys: vec![host_key],
            auth_rejection_time: Duration::ZERO,
            auth_rejection_time_initial: Some(Duration::ZERO),
            ..Default::default()
        });
        let server_handler = TestSshServer {
            accepted_key: identity.public_key().clone(),
            channels: HashMap::new(),
        };
        let (client_stream, server_stream) = tokio::io::duplex(65536);
        let server_task = tokio::spawn(async move {
            server::run_stream(server_config, server_stream, server_handler)
                .await
                .unwrap()
                .await
        });
        let mut ssh = client::connect_stream(
            Arc::new(client::Config::default()),
            client_stream,
            client_handler,
        )
        .await
        .unwrap();
        authenticate_connection(
            &mut ssh,
            "test-user",
            Some(saved_password.into()),
            if use_identity_file {
                vec![identity_path]
            } else {
                vec![]
            },
        )
        .await
        .unwrap();

        let channel = ssh.channel_open_session().await.unwrap();
        channel.request_subsystem(true, "sftp").await.unwrap();
        let mut config = SftpConfig::default();
        config.request_timeout_secs = 2;
        let sftp = SftpSession::new_with_config(channel.into_stream(), config)
            .await
            .unwrap();
        assert_eq!(sftp.canonicalize(".").await.unwrap(), "/test");
        // These use the actual SFTP protocol, including canonicalization, stat
        // and parent listing; no inference from directory-listing errors.
        let directory = open_remote_path(&sftp, "/test".into(), false)
            .await
            .unwrap();
        assert_eq!(directory.listing.current_path, "/test");
        assert!(directory.selected_entry.is_directory);
        let file = open_remote_path(&sftp, "/alias".into(), false)
            .await
            .unwrap();
        assert_eq!(file.listing.current_path, "/test");
        assert_eq!(file.selected_entry.path, "/test/a.txt");
        assert!(!file.selected_entry.is_directory);
        let hidden = open_remote_path(&sftp, "/test/.secret".into(), false)
            .await
            .unwrap();
        assert_eq!(hidden.selected_entry.path, "/test/.secret");
        assert!(hidden
            .listing
            .entries
            .iter()
            .any(|entry| entry.name == ".secret"));
        assert!(!hidden
            .listing
            .entries
            .iter()
            .any(|entry| entry.name == ".hidden"));
        for path in ["/missing", "/denied", "/denied/a.txt", "/test/socket"] {
            assert!(
                open_remote_path(&sftp, path.into(), false).await.is_err(),
                "{path}"
            );
        }
        let record = ConnectionRecord {
            id: "test-host".into(),
            name: "Test".into(),
            group_name: None,
            host: "unused.invalid".into(),
            port: 22,
            username: "test-user".into(),
            has_password: true,
            created_at: "now".into(),
            updated_at: "now".into(),
        };
        let manager = RemoteBrowserManager::default();
        // Seed the established in-memory transport. A reconnect would fail at unused.invalid.
        manager.browsers.lock().unwrap().insert(
            "panel".into(),
            BrowserSlot {
                connection_id: record.id.clone(),
                updated_at: record.updated_at.clone(),
                last_used: Instant::now(),
                client: Arc::new(AsyncMutex::new(Some(TransferConnection { ssh, sftp }))),
            },
        );
        let listing = manager
            .list("panel".into(), &record, None, None, false)
            .await
            .unwrap();
        assert_eq!(listing.current_path, "/test");
        assert_eq!(
            listing
                .entries
                .iter()
                .map(|entry| entry.name.as_str())
                .collect::<Vec<_>>(),
            ["z-folder", "a.txt"]
        );
        assert!(listing.entries[0].is_directory);
        assert!(!listing.entries[1].is_directory);
        let listing = manager
            .list("panel".into(), &record, None, Some("/test".into()), true)
            .await
            .unwrap();
        assert_eq!(
            listing
                .entries
                .iter()
                .map(|entry| entry.name.as_str())
                .collect::<Vec<_>>(),
            [".hidden", "z-folder", ".secret", "a.txt"]
        );
        let opened = manager
            .open("panel".into(), &record, None, "/test/a.txt".into(), false)
            .await
            .unwrap();
        assert_eq!(opened.selected_entry.path, "/test/a.txt");
        manager.close("panel").await;
        manager.close("panel").await;
        assert!(manager.browsers.lock().unwrap().is_empty());
        server_task.abort();
    })
    .await
    .expect("SSH/SFTP protocol test timed out");
}

#[tokio::test]
async fn saved_password_authentication_opens_a_compatible_sftp_channel() {
    check_authentication_and_sftp("test-password", false).await;
}

#[tokio::test]
async fn rejected_password_falls_back_to_identity_file_and_opens_sftp() {
    check_authentication_and_sftp("wrong-password", true).await;
}

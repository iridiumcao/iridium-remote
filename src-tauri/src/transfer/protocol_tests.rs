use std::{collections::HashMap, fs};

use russh::{
    client::Handler as _,
    keys::{ssh_key::certificate, Algorithm, PrivateKey, PublicKey},
    server::{self, Auth, Msg, Session},
    Channel, ChannelId,
};
use russh_sftp::protocol::{File, Name, StatusCode};

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
            TestSftpServer,
        )
        .await;
        Ok(())
    }
}

struct TestSftpServer;

impl russh_sftp::server::Handler for TestSftpServer {
    type Error = StatusCode;

    fn unimplemented(&self) -> Self::Error {
        StatusCode::OpUnsupported
    }

    async fn realpath(&mut self, id: u32, _: String) -> Result<Name, Self::Error> {
        Ok(Name {
            id,
            files: vec![File::dummy("/test")],
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
        TransferConnection { ssh, sftp }.close().await.unwrap();
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

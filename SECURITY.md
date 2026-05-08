# Security Policy

## Supported Versions

Iridium Remote is still in the early `0.x` stage. Security fixes are applied to the current development branch and the latest released `0.1.x` line.

| Version | Supported |
| ------- | --------- |
| `main` | :white_check_mark: |
| `0.1.x` | :white_check_mark: |
| `< 0.1` | :x: |

## Reporting a Vulnerability

Please report security vulnerabilities privately. Do **not** open a public GitHub issue for credential handling, authentication, SSH session management, SFTP transfer, dependency, or packaging vulnerabilities.

Use GitHub's **Private Vulnerability Reporting** for this repository when available:

1. Go to the repository's **Security** tab.
2. Open a **Report a vulnerability** draft advisory.
3. Include the affected version, platform, reproduction steps, impact, and any suggested mitigation.

If private vulnerability reporting is not available in your GitHub view, contact the maintainer privately through GitHub instead of filing a public issue.

You can expect an initial acknowledgment within **5 business days**. After triage, the maintainer will confirm whether the report is accepted, request more detail if needed, and coordinate a fix and release when appropriate.

When reporting a vulnerability, please include as much of the following as possible:

- affected app version and OS
- whether the issue affects the React frontend, Tauri backend, bundled release artifacts, or runtime integrations such as `ssh`, `sftp`, SQLite, or keyring access
- step-by-step reproduction details or a proof of concept
- impact assessment, especially if credentials, local files, or remote session data may be exposed

Iridium Remote is designed so that saved passwords are kept in the OS keyring and are never stored in SQLite or exported in backup files. Reports involving credential storage, backup/export behavior, SSH process handling, and dependency supply-chain issues are especially helpful.

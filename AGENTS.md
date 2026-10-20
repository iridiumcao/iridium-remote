# Agent Guide for Iridium Remote

## Project and architecture

Iridium Remote is a Tauri desktop SSH client. Windows, Ubuntu (Linux), and macOS
are equal first-class supported platforms.

- `src/`: React, TypeScript, Tailwind CSS, and xterm.js frontend.
- `src/api/client.ts`: real Tauri bridge and browser fallback/mock client.
- `src/lib/types.ts` and `src/lib/i18n.ts`: frontend contracts and translations.
- `src-tauri/src/lib.rs`: Tauri command handlers, registration, and app setup.
- `src-tauri/src/session.rs` and `terminal_detection.rs`: system OpenSSH `ssh`
  inside a PTY, terminal I/O, and session lifecycle detection.
- `src-tauri/src/transfer.rs` and `transfer/`: SFTP transfers, browsing, and search
  using `russh` and `russh-sftp`, rather than the system `sftp` executable.
- `src-tauri/src/database.rs`, `credentials.rs`, and `recording.rs`: SQLite,
  OS credential storage, and encrypted session recording respectively.

## Setup and commands

Use npm with the committed lockfile and Cargo for Rust. Desktop development
requires the platform's Tauri prerequisites; see [development setup](doc/development-setup.md).
The forward-slash manifest paths below work in PowerShell and Unix shells.

| Task | Command |
| --- | --- |
| Install frontend dependencies | `npm ci` |
| Run frontend with browser mock | `npm run dev` |
| Run desktop app | `npm run tauri -- dev` |
| Lint frontend | `npm run lint` |
| Run frontend tests | `npm run test` |
| Run one frontend test file | `npm run test -- src/App.test.tsx` |
| Type-check and build frontend | `npm run build` |
| Check Rust backend | `cargo check --manifest-path src-tauri/Cargo.toml` |
| Run Rust tests | `cargo test --manifest-path src-tauri/Cargo.toml` |
| Build desktop bundles | `npm run tauri -- build` |

## Implementation agreements

- Keep changes focused on the requested behavior and follow nearby code patterns.
- For Tauri command/event changes, update the Rust handlers and models,
  registration where needed, frontend types, real bridge, browser mock, relevant
  tests, and [contract documentation](doc/frontend-backend-contracts.md) together.
- Preserve browser-only development through the mock client. Browser/mock success
  alone does not verify SSH, SFTP, keyring, or native desktop behavior.
- Keep terminal transport on system OpenSSH with PTY I/O. Password and host-key
  prompts must remain visible and usable inside the terminal.
- Preserve per-session input/output isolation and cleanup on close or disconnect.
  Replaying a tab's terminal buffer must not inject input into a remote session;
  background session events must not steal the user's selected tab.
- Keep UI text in the English, Simplified Chinese, and Traditional Chinese
  dictionaries. Check light/dark themes and relevant keyboard interactions for UI changes.
- Keep platform-specific behavior behind appropriate platform boundaries. Report
  which platforms were actually verified.

## Data and security boundaries

- Store connection metadata, settings, and history in SQLite; store saved SSH
  passwords only in the OS credential store. Never include passwords in backups
  or diagnostic logs. Avoid startup keyring reads merely to render connection lists.
- The session-recording encryption password stays in runtime memory. Its persisted
  verifier is distinct from the password and must stay out of exported backups.
- Preserve encrypted `.irlog` storage without plaintext intermediate files.
  Input-only recording must exclude hidden/password input.
- Skipping recording applies to the current app run and keeps the persisted
  enabled setting. Changing the recording password applies to new recordings;
  existing logs still require their original passwords.
- Preserve existing databases and backup compatibility when changing persistence;
  update migrations and the [data model](doc/data-model.md) as appropriate.

## Verification and completion

- Frontend code changes: run lint, relevant Vitest tests, and the frontend build.
  Run the full frontend suite for shared types, bridge, or app-wide behavior changes.
- Rust code changes: run Cargo check and relevant Rust tests. A check/build alone
  does not execute tests. Broaden testing for shared persistence or session changes.
- The Windows `windows_credentials_round_trip` test writes a uniquely named test
  credential to the real Credential Manager and deletes it on success. Some Rust
  tests need localhost sockets; the live GitHub update test is ignored by default
  and needs external network access when explicitly enabled.
- For affected native flows, verify desktop behavior where available: connection
  prompts, disconnect cleanup, tab switching, SFTP operations, or recording lifecycle.
  Describe any native/platform checks that could not be performed.
- Documentation-only changes need link/path and diff checks; app builds and tests
  are unnecessary unless the documented behavior also changes.
- Before handoff, inspect the diff and report the change, checks and outcomes,
  and remaining limitations. Do not describe unrun checks as passing.

## Documentation map

- [Requirements](doc/requirement.md): product scope; recording and connection-history
  details also live in `doc/requirement_session_recording.md` and `doc/requirement_connection_history.md`.
- [Technical design](doc/technical-design.md), [UI design](doc/ui-design.md), and
  [code walkthrough](doc/tutorial.md): architecture and interaction details.
- [Frontend/backend contracts](doc/frontend-backend-contracts.md) and
  [data model](doc/data-model.md): commands, events, persistence, backups, and storage locations.
- [Icon maintenance](doc/icon-maintenance.md): source artwork and derived desktop assets.
- [.github/workflows/release.yml](.github/workflows/release.yml): release verification
  and packaging. Release versions must agree across `package.json`,
  `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, and the version tag;
  keep affected lockfiles consistent when bumping versions.

Read the relevant documents for the task and keep them aligned with behavior
changes. Check implementation when documentation appears stale and correct the
discrepancy. Keep shared agent guidance here; tool-specific entry files should
point here instead of duplicating these rules.

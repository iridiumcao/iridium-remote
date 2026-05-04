# Copilot Instructions for `iridium-remote`

This repository now contains a working Windows-first Tauri desktop app. `doc/requirement.md` remains the product source of truth for current scope, while the implementation lives in `src/` and `src-tauri/`.

## Build, test, and lint commands

- Install frontend dependencies: `npm install`
- Lint: `npm run lint`
- Test: `npm run test`
- Run a single test file: `npm run test -- src/App.test.tsx`
- Build frontend assets: `npm run build`
- Run Rust backend checks directly: `cargo check --manifest-path src-tauri\\Cargo.toml`
- Run the desktop app in development: `npm run tauri -- dev`
- Build the desktop app: `npm run tauri -- build`

## High-level architecture

The app is a desktop SSH client with a split frontend/backend architecture:

- **Frontend:** React UI with Tailwind CSS for layout/styling and xterm.js for terminal rendering
- **Backend:** Tauri (Rust) application shell with a PTY-backed multi-session SSH manager plus SFTP execution
- **Persistence:** SQLite via `rusqlite` for connection metadata and app settings
- **System integrations:** system `ssh` (OpenSSH) for remote sessions and OS keyring for credential storage

Expected responsibilities by layer:

- **React frontend** owns connection management screens, dialog state, terminal container UI, and user interaction flow
- **Tauri backend** owns spawning the `ssh` subprocess inside a PTY, streaming terminal output to the frontend, receiving terminal input from the frontend, and coordinating storage/integration work
- **SQLite** stores connection records and app settings
- **Keyring** stores credentials only

The intended primary flow is:

1. User creates or selects a saved connection
2. Frontend invokes Tauri commands for CRUD or session lifecycle work
3. Backend loads connection metadata from SQLite and credentials from keyring
4. Backend launches system `ssh` inside a PTY and emits session/output events
5. Frontend renders the terminal in xterm.js and forwards user keystrokes and resize events back to the backend
6. Password prompts remain in the terminal; explicit password saving happens from the connection form

## Key conventions and constraints

### Scope and prioritization

- Build for a usable, stable desktop client first; prefer simpler implementations over feature-rich designs
- The current target is **Windows-first**, with future cross-platform support
- Keep the main UI simple: grouped connection list on the left, tabbed terminal workspace on the right, and lightweight top-bar controls
- The current implementation supports multiple active sessions through terminal tabs
- The left sidebar supports real-time search, collapsible groups, and compact/normal display modes

### SSH and terminal behavior

- Use the **system `ssh` client**, not an embedded SSH library, unless requirements are explicitly changed
- The terminal experience is based on **xterm.js** with support for basic interaction first
- The Tauri backend uses a **PTY-backed session** so password prompts and terminal I/O flow through the app instead of a separate console window
- The SSH process output is the source of truth for terminal rendering and session lifecycle

### Storage boundaries

- **Never store passwords in SQLite**
- Store connection data in SQLite using the simplified `connections` table from `doc/requirement.md`
- Store credentials in the system keyring with:
  - `service`: `iridium-remote`
  - `account`: `username@host`
- Passwords may be saved explicitly from the connection form, but never in SQLite
- Exported backup files contain app settings plus connection metadata, but never passwords

### Deferred boundaries

Unless requirements are updated, keep the following out of scope:

- Connection tags
- Split panes, advanced terminal preferences, or custom shortcut editors
- Command libraries, batch execution, multi-user switching, cloud sync, plugins, or collaboration features

### Reliability expectations

- Favor implementations that avoid crashes on SSH disconnects and surface errors clearly
- Preserve the intended fast-startup, fast-connect bias when selecting dependencies or adding background work
- Browser-only `npm run dev` should still render the app through the mock frontend client; Tauri runtime provides the real backend behavior

## Important repository context

- `doc/requirement.md` contains the current product requirements and should drive implementation decisions
- `doc/ui-design.md`, `doc/technical-design.md`, `doc/data-model.md`, and `doc/frontend-backend-contracts.md` describe the intended implementation and should stay aligned with code changes
- `src/api/client.ts` contains both the real Tauri bridge and the browser fallback/mock behavior used outside the Tauri runtime
- `src-tauri/src/session.rs` is the key integration point for PTY lifecycle, SSH I/O, password prompt detection, and session-status events

# Copilot Instructions for `iridium-remote`

This repository currently contains product requirements rather than implementation code. Treat `doc/requirement.md` as the source of truth for MVP scope, stack choices, and product constraints until the app is scaffolded.

## High-level architecture

The planned MVP is a desktop SSH client with a split frontend/backend architecture:

- **Frontend:** React UI with Tailwind CSS for layout/styling and xterm.js for terminal rendering
- **Backend:** Tauri (Rust) application shell
- **Persistence:** SQLite via `rusqlite` for connection metadata
- **System integrations:** system `ssh` (OpenSSH) for remote sessions and OS keyring for credential storage

Expected responsibilities by layer:

- **React frontend** owns connection management screens, terminal container UI, and user interaction flow
- **Tauri backend** owns spawning the `ssh` subprocess, streaming stdout/stderr to the frontend, receiving terminal input from the frontend, and coordinating storage/integration work
- **SQLite** stores connection records only
- **Keyring** stores credentials only

The intended primary flow is:

1. User creates or selects a saved connection
2. Frontend asks backend to open an SSH session
3. Backend launches system `ssh`
4. Backend streams process output to the frontend
5. Frontend renders the session in xterm.js and forwards user keystrokes back to the backend
6. On first successful login, credentials are stored in the system keyring and reused on later connections

## Key conventions and constraints

### Scope and prioritization

- Build for a **usable, stable MVP** first; prefer simpler implementations over feature-rich designs
- The current target is **Windows-first**, with future cross-platform support
- Keep the initial UI simple: connection list on the left, terminal on the right, optional top-bar action for creating a connection

### SSH and terminal behavior

- Use the **system `ssh` client**, not an embedded SSH library, unless requirements are explicitly changed
- The terminal experience is based on **xterm.js** with support for basic interaction first
- The Tauri backend should treat the SSH process as the source of truth for terminal output and connection lifecycle

### Storage boundaries

- **Never store passwords in SQLite**
- Store connection data in SQLite using the simplified `connections` table from `doc/requirement.md`
- Store credentials in the system keyring with:
  - `service`: `iridium-remote`
  - `account`: `username@host`

### MVP boundaries

Unless requirements are updated, keep the following out of scope for V1:

- Connection grouping, tags, or search
- Multi-tab terminals, split panes, theming, or advanced shortcuts
- Command libraries, batch execution, multi-user switching, SFTP, cloud sync, plugins, or collaboration features

### Reliability expectations

- Favor implementations that avoid crashes on SSH disconnects and surface errors clearly
- Preserve the intended fast-startup, fast-connect bias when selecting dependencies or adding background work

## Important repository context

- `doc/requirement.md` contains the finalized MVP requirements and should drive implementation decisions
- `README.md` currently only names the project; do not assume it contains additional setup guidance
- No build, test, or lint commands are defined in the repository yet; when scaffolding the project, update this file with the actual commands, including how to run a single test

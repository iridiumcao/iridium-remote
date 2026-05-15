# Iridium Remote Project Context

## Project Overview

Iridium Remote is a cross-platform desktop SSH client with equal first-class support for Windows, Ubuntu, and macOS, built using the Tauri framework. It provides a comprehensive GUI for managing SSH connections, tabbed terminal sessions, optional keyring-backed passwords, and basic SFTP file transfers.

**Architecture & Technologies:**
*   **Desktop Shell:** Tauri
*   **Frontend:** React, TypeScript, Tailwind CSS (v4), Vite, xterm.js
*   **Backend:** Rust
*   **Storage:** SQLite (connections), OS Keyring (credentials/passwords)
*   **Transport:** Relies on system OpenSSH tools (`ssh`, `sftp`)

## Building and Running

The project uses `npm` for managing frontend dependencies and Tauri CLI commands, while Cargo manages the Rust backend.

**Key Commands:**
*   **Install dependencies:** `npm install`
*   **Run frontend only (browser):** `npm run dev`
*   **Run desktop app (development):** `npm run tauri -- dev`
*   **Lint code:** `npm run lint`
*   **Run tests:** `npm run test` (uses Vitest)
*   **Build frontend assets:** `npm run build`
*   **Check Rust backend:** `cargo check --manifest-path src-tauri\Cargo.toml`
*   **Build final desktop app (release installer):** `npm run tauri -- build`

## Development Conventions & Resources

*   **Documentation:** Comprehensive documentation is maintained in the `doc/` directory, including:
    *   `requirement.md` (Product backlog)
    *   `ui-design.md` (UI/UX)
    *   `technical-design.md` (Architecture)
    *   `data-model.md` (Database schemas & backups)
    *   `frontend-backend-contracts.md` (Tauri commands/events)
    *   `tutorial.md` (Codebase walkthrough)
*   **Testing:** Frontend testing is configured with Vitest (`npm run test`), using `jsdom` and React Testing Library.
*   **Security Note:** Passwords are never stored in SQLite or exported in backup files; they are strictly managed via the system keyring.
*   **Debugging:** Debug builds on Windows may display a console window, which is hidden in release builds.

## Logging

*   **Backend Logging:** Managed via `tauri-plugin-log`. Logs are output to the application's standard logging directory (e.g., `%APPDATA%\com.iridiumcao.iridiumremote\logs` on Windows).
    *   Debug builds output to `Stdout` as well as the log file with `Debug` level.
    *   Release builds output only to the log file with `Info` level.
*   **Frontend Logging:** The frontend currently operates silently (no `console.log` statements are used) to maintain a clean console and relies entirely on backend logging for operations via Tauri commands.
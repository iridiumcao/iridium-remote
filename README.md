# Iridium Remote

Iridium Remote is a Windows-first desktop SSH client built with Tauri, React, and Rust. It combines a saved-connection sidebar, tabbed terminal sessions, optional keyring-backed passwords, and basic SFTP file transfer in a single desktop app.

## Current capabilities

- Save SSH connections in SQLite
- Store optional passwords in the system keyring
- Browse connections by collapsible groups
- Search saved connections quickly
- Switch the connection list between normal and compact display modes
- Open multiple active SSH sessions in terminal tabs
- Upload and download files with SFTP
- Switch between light and dark themes
- Switch between English and Simplified Chinese
- Export and import JSON backups containing app settings and connections
- Persist user settings in the local application database
- Write application logs to the app log directory

## Architecture

- **Frontend:** React + TypeScript + Tailwind CSS + xterm.js
- **Desktop shell:** Tauri
- **Backend:** Rust
- **Connection storage:** SQLite
- **Credential storage:** OS keyring
- **SSH/SFTP transport:** system OpenSSH tools (`ssh`, `sftp`)

## Repository guide

- `doc\requirement.md` - product requirements and backlog
- `doc\ui-design.md` - UI structure and interaction design
- `doc\technical-design.md` - implementation architecture and runtime behavior
- `doc\data-model.md` - persistent models and backup format
- `doc\frontend-backend-contracts.md` - Tauri command and event contracts
- `doc\tutorial.md` - beginner-friendly walkthrough for the codebase

## Development commands

- Install dependencies: `npm install`
- Run the frontend in browser mode: `npm run dev`
- Run the desktop app in development: `npm run tauri -- dev`
- Lint: `npm run lint`
- Test: `npm run test`
- Build frontend assets: `npm run build`
- Check the Rust backend: `cargo check --manifest-path src-tauri\Cargo.toml`
- Build the desktop app: `npm run tauri -- build`

## Notes

- Passwords are never stored in SQLite or exported in backup files.
- Debug builds may show a console window on Windows. Release builds hide it.
- Release installers are produced by `npm run tauri -- build`.

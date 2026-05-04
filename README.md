# Iridium Remote

Iridium Remote is a Windows-first desktop SSH client built with **Tauri**, **React**, **Tailwind CSS**, and **xterm.js**.

## Current feature set

- grouped connection management
- duplicate-from-existing connection creation
- optional password save to the system keyring from the connection form
- multiple active SSH sessions with terminal tabs
- basic file transfer through the system `sftp` client
- light and dark themes
- English and Simplified Chinese UI
- About menu entry in the desktop app

## Architecture

- **Frontend (`src\`)**: React UI for grouped connections, dialogs, preferences, terminal tabs, and transfer flows
- **Backend (`src-tauri\src\`)**: Tauri commands plus Rust services for SQLite, keyring access, multi-session PTY-backed SSH, and SFTP execution
- **Docs (`doc\`)**: requirements, UI design, technical design, data model, contracts, and the beginner tutorial

## Prerequisites

- Node.js 24+
- Rust toolchain
- Windows OpenSSH client available on the system path

## Development commands

- Install dependencies: `npm install`
- Start the desktop app in dev mode: `npm run tauri -- dev`
- Run the frontend only: `npm run dev`
- Lint: `npm run lint`
- Test: `npm run test`
- Run a single test file: `npm run test -- src/App.test.tsx`
- Build frontend assets: `npm run build`
- Build the desktop application in release mode: `npm run tauri -- build`
- Build debug installers: `npm run tauri -- build --debug`
- Check the Rust backend directly: `cargo check --manifest-path src-tauri\Cargo.toml`

## Build output

- Debug bundles: `src-tauri\target\debug\bundle\`
- Release bundles: `src-tauri\target\release\bundle\`

Use the release build for end users; it hides the extra Windows console window.

## Learning the codebase

If you are new to JavaScript, TypeScript, React, Rust, or Tauri, start with:

- `doc\tutorial.md`

# Iridium Remote

Iridium Remote is a Windows-first desktop SSH client built with **Tauri**, **React**, **Tailwind CSS**, and **xterm.js**.

The MVP focuses on:

- saved connection management
- a single active SSH terminal session
- credential storage in the system keyring
- connection metadata stored in local SQLite

## Architecture

- **Frontend (`src/`)**: React UI for the app shell, connection list, dialogs, and xterm.js terminal workspace
- **Backend (`src-tauri/src/`)**: Tauri commands plus Rust services for SQLite, keyring access, and PTY-backed SSH session management
- **Docs (`doc/`)**: requirements plus UI, technical, data, and integration design documents

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
- Build the desktop application: `npm run tauri -- build --debug`

## Build output

Recent debug build artifacts are produced under:

- `src-tauri\target\debug\iridium-remote.exe`
- `src-tauri\target\debug\bundle\msi\Iridium Remote_0.1.0_x64_en-US.msi`
- `src-tauri\target\debug\bundle\nsis\Iridium Remote_0.1.0_x64-setup.exe`

## Learning the codebase

If you are new to JavaScript, TypeScript, React, Rust, or Tauri, start with:

- `doc\tutorial.md`

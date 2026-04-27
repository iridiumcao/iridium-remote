# Iridium Remote - MVP Requirements (V1)

## 1. Project Goal

Develop a lightweight SSH client for Windows (with future cross-platform support) that satisfies the following core needs:

* Quickly connect to remote Linux servers
* Manage multiple connection configurations
* Provide a stable and usable terminal experience
* Securely store credentials (no need to re-enter passwords)

**Guiding Principles:**

* Prioritize “usable” over “feature-rich”
* Prioritize “stability” over “complex design”

---

## 2. Technology Stack (Finalized)

### Frontend

* React
* Tailwind CSS
* xterm.js (terminal rendering)

### Backend

* Tauri (Rust)
* SQLite (rusqlite)

### System Capabilities

* SSH: use system ssh (OpenSSH)
* Credential management: keyring (system secure storage)

---

## 3. Scope (MVP)

## 3.1 Connection Management

### Features

* Create connection
* Edit connection
* Delete connection
* Display connection list

### Data Fields

* Name
* Host
* Port (default: 22)
* Username

### Out of Scope (for now)

* Grouping
* Tags
* Search

---

## 3.2 SSH Connection

### Features

* Click a connection → open terminal
* Execute ssh command to connect to remote host
* Support password-based login (V1)

### Implementation

* Tauri backend spawns ssh subprocess
* stdout / stderr streamed to frontend
* Frontend renders via xterm.js

---

## 3.3 Terminal

### Features

* Display SSH output
* Accept user input
* Basic interaction (Enter, Backspace, etc.)

### Out of Scope

* Multi-tab
* Split panes
* Theme customization
* Advanced shortcuts

---

## 3.4 Credential Management (Critical)

### Features

* Prompt for password on first connection
* Save credentials after successful login
* Auto-login on subsequent connections

### Implementation

* Use keyring to store credentials
* Do NOT store passwords in SQLite

### Storage Rule

* service: iridium-remote
* account: username@host

---

## 3.5 Local Storage

### SQLite Schema (Simplified)

#### connections table

* id (primary key)
* name
* host
* port
* username
* created_at
* updated_at

---

## 4. Core User Flows

### Scenario 1: First-time Use

1. User opens the app
2. Creates a connection
3. Clicks the connection
4. Enters password
5. Login succeeds

---

### Scenario 2: Reconnect

1. User clicks an existing connection
2. Credentials are retrieved automatically
3. Login succeeds without prompting

---

## 5. UI Layout (Simplified)

### Left Panel

* Connection list

### Right Panel

* Terminal area (xterm.js)

### Top Bar (optional)

* “New Connection” button

---

## 6. Non-functional Requirements

### Performance

* Startup time < 2 seconds
* Fast SSH connection response

### Security

* No plaintext password storage
* Use system credential manager

### Stability

* No crashes on SSH disconnect
* Proper error handling and feedback

---

## 7. Explicitly Out of Scope (to avoid scope creep)

The following features are **NOT included in MVP**:

* ❌ Command library
* ❌ Batch execution
* ❌ Multi-user switching
* ❌ File transfer (SFTP)
* ❌ Cloud sync
* ❌ Plugin system
* ❌ Team collaboration

---

## 8. Definition of Done

MVP is complete when:

* Connections can be created
* SSH connection can be established successfully
* Terminal input/output works correctly
* Credentials are saved and reused automatically
* App runs stably without major crashes

---

## 9. Development Priority

1. Initialize Tauri + React project
2. Integrate xterm.js (static terminal)
3. Implement ssh subprocess execution
4. Wire terminal input/output
5. Implement connection list (SQLite)
6. Integrate keyring (credential storage)

---

## 10. Version Goal

### V1 (Current Target)

👉 A tool that you personally want to use every day

---

## 11. Success Criteria (Realistic)

* You stop using other SSH tools
* You use this tool daily
* No major usability-blocking bugs

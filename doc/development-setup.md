# Development Environment Setup Guide

This guide walks through a full local development setup for **Iridium Remote** on:

- **Windows 11**
- **macOS 26 and above**
- **Ubuntu 24.04 and above**

The project is a Tauri desktop app with:

- a **React + TypeScript + Vite** frontend
- a **Rust + Tauri** desktop backend
- **system OpenSSH** for terminal sessions
- **SQLite** for app data
- the **OS keyring** for saved passwords

## What you need on every platform

Before you run the app, make sure your machine has:

| Tool | Why it is needed |
| --- | --- |
| Git | clone and update the repository |
| Node.js + npm | install frontend dependencies and run Vite / Tauri scripts |
| Rust toolchain | build the Tauri backend |
| Tauri system prerequisites | provide the native webview and desktop build dependencies |
| OpenSSH client | required by the app at runtime for SSH sessions |

This repository currently uses:

- local npm scripts from `package.json`
- **Rust stable** with a minimum version of **1.77.2** (`src-tauri\Cargo.toml`)
- local Tauri CLI from the project dependencies (`npm run tauri -- ...`)

## After the toolchain is installed

Once your platform-specific prerequisites are ready, the repository workflow is the same everywhere:

```sh
git clone https://github.com/iridiumcao/iridium-remote.git
cd iridium-remote
npm install
```

Recommended validation commands:

```sh
npm run lint
npm run test
npm run build
```

Desktop-backend check:

```sh
# Windows PowerShell
cargo check --manifest-path src-tauri\Cargo.toml

# macOS / Ubuntu
cargo check --manifest-path src-tauri/Cargo.toml
```

Development entry points:

```sh
# Browser-only frontend development
npm run dev

# Full desktop app development
npm run tauri -- dev
```

Release build:

```sh
npm run tauri -- build
```

---

## Windows 11 setup

These steps assume a standard Windows 11 desktop environment.

### 1. Install Git

Install **Git for Windows** from <https://git-scm.com/download/win> or use `winget`:

```powershell
winget install --id Git.Git
```

Verify:

```powershell
git --version
```

### 2. Install Node.js LTS

Install the latest **Node.js LTS** release from <https://nodejs.org/> or with `winget`:

```powershell
winget install --id OpenJS.NodeJS.LTS
```

Verify:

```powershell
node -v
npm -v
```

### 3. Install Rust

Install Rust with `rustup` from <https://www.rust-lang.org/tools/install> or with `winget`:

```powershell
winget install --id Rustlang.Rustup
```

If `rustup` prompts for a toolchain target, keep the default **MSVC** toolchain.

Verify:

```powershell
rustc -V
cargo -V
```

### 4. Install Microsoft C++ Build Tools

Tauri on Windows needs the Microsoft C++ toolchain.

1. Download **Build Tools for Visual Studio** from:
   <https://visualstudio.microsoft.com/visual-cpp-build-tools/>
2. Run the installer.
3. Enable **Desktop development with C++**.
4. Keep the default Windows SDK and MSVC components selected.

After installation, restart your terminal.

### 5. Install Microsoft Edge WebView2 Runtime

Tauri uses **WebView2** for the desktop webview on Windows.

1. Open <https://developer.microsoft.com/en-us/microsoft-edge/webview2/#download-section>
2. Download the **Evergreen Bootstrapper**
3. Install it

### 6. Confirm OpenSSH Client is available

Windows 11 often includes OpenSSH already, but confirm it:

```powershell
ssh -V
```

If `ssh` is missing:

1. Open **Settings -> System -> Optional features**
2. Add **OpenSSH Client**

Or install it from an elevated PowerShell prompt:

```powershell
Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0
```

### 7. Optional: enable VBSCRIPT for MSI packaging

This is only needed if you plan to build MSI installers and your system has the optional feature disabled.

1. Open **Settings -> Apps -> Optional features -> More Windows features**
2. Ensure **VBSCRIPT** is enabled

### 8. Clone and install the repository

Use PowerShell:

```powershell
git clone https://github.com/iridiumcao/iridium-remote.git
cd iridium-remote
npm install
```

### 9. Verify the repository builds

```powershell
npm run lint
npm run test
npm run build
cargo check --manifest-path src-tauri\Cargo.toml
```

### 10. Start development

Frontend-only mode:

```powershell
npm run dev
```

Full desktop mode:

```powershell
npm run tauri -- dev
```

### Windows notes

- Saved passwords use **Windows Credential Manager**.
- Debug desktop builds may show a console window; release builds hide it.
- PowerShell 7 is recommended, but Windows PowerShell also works for most setup steps.

---

## macOS 26 and above setup

These steps assume a normal macOS desktop session on Apple Silicon or Intel hardware.

### 1. Install Xcode Command Line Tools

For desktop-only Tauri development, **Xcode Command Line Tools** are enough:

```sh
xcode-select --install
```

If you already use full Xcode, launch it once after installation so macOS can finish setup.

Verify:

```sh
xcode-select -p
clang --version
```

### 2. Install Homebrew

Homebrew is recommended for developer tooling on macOS:

```sh
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

After Homebrew finishes, follow the shell setup commands it prints.

Verify:

```sh
brew --version
```

### 3. Install Git

If Git is not already available:

```sh
brew install git
```

Verify:

```sh
git --version
```

### 4. Install Node.js LTS

Install the latest LTS release:

```sh
brew install node
```

Verify:

```sh
node -v
npm -v
```

### 5. Install Rust

Install Rust with `rustup`:

```sh
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
source "$HOME/.cargo/env"
```

Verify:

```sh
rustc -V
cargo -V
```

### 6. Confirm OpenSSH is available

macOS includes OpenSSH by default:

```sh
ssh -V
```

### 7. Clone and install the repository

```sh
git clone https://github.com/iridiumcao/iridium-remote.git
cd iridium-remote
npm install
```

### 8. Verify the repository builds

```sh
npm run lint
npm run test
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

### 9. Start development

Frontend-only mode:

```sh
npm run dev
```

Full desktop mode:

```sh
npm run tauri -- dev
```

### macOS notes

- Saved passwords use the **macOS Keychain**.
- Full Xcode is only required if you also plan to build for iOS; desktop-only work can use Command Line Tools.
- If a fresh macOS setup reports license or toolchain issues, open Xcode once and finish any first-run prompts.

---

## Ubuntu 24.04 and above setup

These steps assume **Ubuntu Desktop** rather than a headless-only server install.

### 1. Update the system

```sh
sudo apt update
sudo apt upgrade -y
```

### 2. Install system packages required by Tauri and this repository

Install the Tauri desktop dependencies plus common build tools and repo requirements:

```sh
sudo apt install -y \
  build-essential \
  curl \
  wget \
  file \
  git \
  pkg-config \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libwebkit2gtk-4.1-dev \
  openssh-client \
  gnome-keyring \
  seahorse
```

What these are for:

- `libwebkit2gtk-4.1-dev`: Linux webview dependency for Tauri
- `build-essential`: compiler and linker toolchain
- `openssh-client`: required by the app runtime
- `gnome-keyring` / `seahorse`: useful for testing the app's saved-password flow on Ubuntu

### 3. Install Node.js LTS

You can use the official Node.js installer or a version manager. A common Linux choice is `nvm`:

```sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install --lts
nvm use --lts
```

Verify:

```sh
node -v
npm -v
```

### 4. Install Rust

Install Rust with `rustup`:

```sh
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
source "$HOME/.cargo/env"
```

Verify:

```sh
rustc -V
cargo -V
```

### 5. Confirm the desktop keyring is available

Iridium Remote stores saved passwords in the **Linux Secret Service** keyring path.

On Ubuntu Desktop, this normally works automatically after login. To confirm the environment is ready:

```sh
ssh -V
seahorse --version
```

If you plan to test saved passwords:

1. Log in to a normal Ubuntu desktop session
2. Open **Passwords and Keys** (`seahorse`)
3. Confirm your login keyring exists and is unlocked

If you run the app in a minimal or headless environment without a user keyring session, saved-password tests may fail even though the code is correct.

### 6. Clone and install the repository

```sh
git clone https://github.com/iridiumcao/iridium-remote.git
cd iridium-remote
npm install
```

### 7. Verify the repository builds

```sh
npm run lint
npm run test
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

### 8. Start development

Frontend-only mode:

```sh
npm run dev
```

Full desktop mode:

```sh
npm run tauri -- dev
```

### Ubuntu notes

- Saved passwords use the **desktop Secret Service keyring**.
- A normal Ubuntu desktop session is recommended for testing keyring integration.
- Browser-only mode (`npm run dev`) is still useful for UI work, but it does not replace a real Tauri desktop test pass.

---

## Recommended first-run workflow

After setup on any platform, this is a good first pass:

```sh
npm install
npm run lint
npm run test
npm run build
```

Then verify the backend:

```sh
# Windows
cargo check --manifest-path src-tauri\Cargo.toml

# macOS / Ubuntu
cargo check --manifest-path src-tauri/Cargo.toml
```

Finally, launch the desktop app:

```sh
npm run tauri -- dev
```

## Troubleshooting checklist

If the project does not start cleanly, check these first:

1. **`node -v` and `npm -v` work in the same terminal where you run the project**
2. **`rustc -V` and `cargo -V` work in that terminal too**
3. **`ssh -V` is available on PATH**
4. **Tauri system dependencies were installed for your platform**
5. **You restarted the terminal after installing Node.js, Rust, or build tools**
6. **You ran `npm install` in the repository root**

Platform-specific checks:

- **Windows:** verify Visual C++ Build Tools and WebView2 Runtime are installed
- **macOS:** verify `xcode-select -p` succeeds
- **Ubuntu:** verify `libwebkit2gtk-4.1-dev` is installed and your desktop keyring session is available

## Related project docs

- `README.md`
- `doc\requirement.md`
- `doc\technical-design.md`
- `doc\frontend-backend-contracts.md`
- `doc\tutorial.md`

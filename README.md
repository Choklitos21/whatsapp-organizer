# WhatsApp Organizer

> Automatically downloads and organizes files received via WhatsApp.

Desktop application (Electron) that connects to WhatsApp, downloads media files you receive, and organizes them into folders by client and date.

![License](https://img.shields.io/badge/license-ISC-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![Electron](https://img.shields.io/badge/electron-42-blue)

---

## Features

- **QR Authentication** — Scan with your phone; the session is saved for future use.
- **Automatic Sweep** — On connect, scans recent messages from the last N days.
- **Real-time Processing** — Detects and downloads new files instantly.
- **Automatic Organization** — Saves files into `~/Documents/Clientes3D/{Client}/{Date}/{Filename}`.
- **Client Management** — Assign phone numbers to company names.
- **Download Filters** — Choose which file types to download (documents, images, videos, audio, stickers).
- **Dark/Light Theme** — Toggle between modes with `localStorage` persistence.
- **Configurable Save Path** — Change the destination folder from the interface.
- **Open File / Folder** — Buttons to open each file or reveal its location.
- **Cancel Sweep** — Stop the old-message search at any time.
- **Database Cleanup** — Remove records older than 90 days.
- **Deduplication** — Already processed files are never downloaded again.
- **Log Out** — Clear the saved session and re-scan the QR code.

---

## Prerequisites

- Node.js 18+
- pnpm (`npm i -g pnpm`)
- An active WhatsApp account

---

## Installation

```bash
# Clone the repository
git clone <url>
cd Laura

# Install dependencies
pnpm install

# (Optional) Configure clients
cp clientes.example.json clientes.json
# Edit clientes.json with your phone numbers and companies
```

### `clientes.json` format

```json
{
  "573001234567@c.us": "My Company",
  "573009876543@c.us": "Another Company"
}
```

Numbers must include the country code without the `+` sign. Unconfigured contacts are classified as **"Sin clasificar"**.

---

## Usage

Before building, the `prebuild` script automatically downloads **Chrome for Testing** (~150MB) and bundles it with the installer. This is required for the app to launch WhatsApp Web on the client's machine without needing Chrome installed.

```bash
# Development mode
pnpm dev

# Build Windows installer (signs if certificate is configured)
pnpm build
```

> **Note**: The first build will download Chrome for Testing automatically. Subsequent builds reuse the cached download unless the version changes.

---

## Code Signing

The installer can be digitally signed to reduce Windows SmartScreen warnings.

### Generate a self-signed certificate (free)

```powershell
# Run from the project root (requires PowerShell as admin)
.\scripts\generate-cert.ps1
```

This creates `cert/cert.pfx` and `cert/cert.cer` plus a password file.

### Build with signing

Set environment variables before building:

```powershell
$env:WIN_CSC_LINK = (Resolve-Path "cert/cert.pfx").Path
$env:WIN_CSC_KEY_PASSWORD = "WhatsAppOrg2026!"
pnpm build
```

### Trust the certificate on a client machine

Share `cert/cert.cer` with your client. They run (as admin):

```powershell
.\scripts\trust-cert.ps1 -CerPath ".\cert.cer"
```

After that, SmartScreen will no longer block the installer.

> **Note**: A self-signed certificate works for distribution to known clients. For public distribution, buy an EV code signing certificate from a Certificate Authority.

---

## How It Works

1. The app starts an Electron window and initializes the WhatsApp client.
2. If there is no saved session, it displays a QR code to scan from WhatsApp (Linked Devices).
3. Once authenticated, it builds a contact name → company map and sweeps old messages.
4. For each chat, it fetches the most recent messages within the configured range.
5. It downloads files matching the selected types.
6. Each file is saved to `~/Documents/Clientes3D/{Client}/{Date}/{Filename}`.
7. The message ID is recorded in SQLite to prevent duplicates.
8. New incoming messages are listened for and processed the same way as old ones.

---

## Architecture

```
Laura/
├── src/
│   ├── main.js          # Main process: WhatsApp, SQLite, IPC, file I/O
│   ├── preload.js       # Secure bridge (contextBridge) between main and renderer
│   └── ui/
│       ├── index.html   # HTML structure (4 screens + modal)
│       ├── renderer.js  # UI logic
│       └── style.css    # Styles with dark mode and animations
├── clientes.json        # Phone number → company name mapping
├── electron-builder.yml # Packaging configuration
├── package.json         # Dependencies and scripts
└── assets/
    └── icon.ico         # Application icon
```

---

## IPC Channels

### Events (Main → Renderer)

| Channel      | Description                        |
|-------------|------------------------------------|
| `qr`        | QR code data URL (base64)          |
| `status`    | Connection status                  |
| `new-file`  | New file saved notification        |

### Invocations (Renderer → Main)

| Method          | Description                            |
|----------------|----------------------------------------|
| `openFolder`   | Open base folder in file explorer      |
| `getBasePath`  | Get current save path                  |
| `selectFolder` | Native folder picker dialog            |
| `setBasePath`  | Change save path                       |
| `openFile`     | Open a file                            |
| `showInFolder` | Show file in file explorer             |
| `getClients`   | Get client mapping                     |
| `getContacts`  | Get WhatsApp contacts                  |
| `saveClients`  | Save client mapping                    |
| `getConfig`    | Get configuration                      |
| `setConfig`    | Save configuration                     |
| `sweepMessages`| Start message sweep                    |
| `cancelSweep`  | Cancel ongoing sweep                   |
| `cleanDB`      | Clean old records (>90 days)           |
| `logout`       | Log out and restart                    |

---

## Connection Statuses

| Status          | Meaning                                   |
|----------------|-------------------------------------------|
| `starting`     | Client is initializing                     |
| `authenticated`| Session authenticated                      |
| `ready`        | Client ready                               |
| `sweeping`     | Scanning old messages                      |
| `connected`    | Connected and listening                    |
| `disconnected` | Disconnected (QR shown again)              |
| `error-auth`   | Authentication error                       |
| `error-init`   | Initialization error                       |

---

## Storage

| Item              | Location                                             |
|------------------|------------------------------------------------------|
| Downloaded files | `~/Documents/Clientes3D/{Client}/{Date}/`            |
| Database         | `%APPDATA%/whatsapp-organizer/procesados.db`         |
| Configuration    | `%APPDATA%/whatsapp-organizer/config.json`           |
| WhatsApp session | `%APPDATA%/whatsapp-organizer/wwebjs_auth/`          |
| Cache            | `.wwebjs_cache/` (in project root)                   |

---

## Tech Stack

| Technology      | Version  | Purpose                          |
|----------------|----------|----------------------------------|
| Electron       | 42.4.1   | Desktop window                   |
| whatsapp-web.js| 1.34.7   | WhatsApp client                  |
| better-sqlite3 | 12.11.1  | Dedup database                   |
| qrcode         | 1.5.4    | QR generation in the client      |
| date-fns       | 4.4.0    | Date utilities                   |
| electron-builder| 26.15.3 | Windows packaging                |
| pnpm           | 10.29.3  | Package manager                  |

---

## Author

Created by **Choklitos**.

```
Copyright © 2026 Cho
```

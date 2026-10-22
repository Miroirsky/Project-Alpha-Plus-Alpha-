# Project Alpha Plus - Standalone Windows Executable Guide

This guide documents how to build, run, package, and manage save files and mod downloads for the standalone **Project Alpha Plus** Windows desktop application powered by **Electron**.

---

## 🚀 Quick Start (Running & Testing in Development)

To run the game immediately as a desktop application without packaging:

```bash
npm start
```

This launches the game in a native Windows desktop window using Electron with full local disk access, sound playback, custom media loading, and file dialogs.

---

## 📦 Building the Windows Executable (`.exe`)

### 1. Build Direct Executable (Unpacked .exe)
To generate the direct standalone executable in a folder (no installation required, runs immediately):

```bash
npm run build:dir
```
* **Executable path:** `dist/win-unpacked/Project Alpha Plus.exe`
* Double-click `Project Alpha Plus.exe` to play. You can zip or share this entire `win-unpacked` folder.

### 2. Build Windows Installer Executable (.exe)
To build a standalone Windows installation executable:

```bash
npm run build:exe
```
* **Executable path:** `dist/Project Alpha Plus Setup 1.0.0.exe`
* One-click installer that sets up the game and creates Windows desktop & Start Menu shortcuts.

---

## 🎵 Direct Song Folder Saving (Editor Auto-Save)

Instead of relying on monolithic JSON files that omit audio and video media, Project Alpha Plus saves tracks directly as self-contained song folders inside `%APPDATA%/project-alpha-plus/custom_songs/`:

```text
%APPDATA%/project-alpha-plus/custom_songs/
└── pack_01/                    # Folder name (or sanitized song title)
    ├── notes.json              # Track metadata, BPM, difficulty charts, and mapped notes
    ├── track.ogg               # Audio track (supports .ogg, .mp3, .wav)
    ├── background.mp4          # Arena video or image background (supports .mp4, .webm, .png, .jpg)
    └── cover.png               # Custom cover artwork
```

### How Saving & Exporting Works:
1. **Editor Auto-Save & Manual Save:**
   * Click the **💾 Save** button in the editor top bar or press **Ctrl + S**.
   * The editor automatically writes `notes.json`, extracts and saves the real audio file (`track.ogg` / `track.mp3`), and writes the background video (`background.mp4`) directly into `custom_songs/<folder_name>/`.
2. **Instant Exporting via File Explorer:**
   * In the Map Editor top bar, click the **📁 Folder** button (or click **"📁 Open Song Folder"** in the Export dialog).
   * In the Song Select (Play) menu, select any song and click **📁 Folder**.
   * Windows File Explorer immediately opens that song's folder on disk, allowing you to easily copy, zip, or share the entire package with others.
3. **Automatic Discovery & Loading:**
   * On game launch or folder refresh, all song folders inside `custom_songs/` are automatically scanned.
   * Audio and video files are loaded directly from disk via custom file protocols with zero CORS restrictions and zero performance lag.

---

## 💾 Local Save System & Folder Architecture

When running as an Electron desktop application, the game stores all user progress, settings, save profiles, high scores, and downloaded content in the Windows standard AppData directory:

```text
%APPDATA%/project-alpha-plus/
├── saves/
│   ├── profiles.json           # Profiles registry & active slot tracker
│   ├── slot_1.json             # Save Slot 1 data (scores, stats, custom maps)
│   ├── slot_2.json             # Additional custom player slots
│   └── settings.json           # Sound volume, theme, and fullscreen settings
├── custom_songs/               # Song package folders (e.g. pack_01/)
└── downloads/                  # Download cache and temporary mod assets
```

### In-Game File Management & Explorer Access
Players can open their local folders directly from the game:
* **Settings Modal:** Click **"📁 Open Saves Folder"** or **"📂 Open Custom Songs"** or **"💿 Open Default Tracks"** to instantly reveal the directories in Windows File Explorer.
* **Song Select Header:** Click **"📂 Custom Songs"** or **"📁 Default Tracks"** to inspect or add custom track packages directly to disk.

---

## 🎮 Save Slots & Profile Management

The game includes a multi-slot save system accessible via the in-game **Settings (⚙)** modal:
1. **Multiple Player Slots:** Create, rename, switch between, and delete player profiles (Slot 1, Slot 2, etc.).
2. **Tracked Statistics:**
   * Total High Score across all played songs
   * Total Notes Hit (Perfect + Normal hits)
   * Total Tracks Completed
   * High Scores per track & difficulty
3. **Export Save Slot:** Click **"Export"** to save your profile to an external `.json` file anywhere on your computer using native Windows Save dialogs.
4. **Import Save Slot:** Click **"Import"** to restore or load another player's save slot into the game.

---

## 🌐 Mod & Track Downloader

Players can download songs, audio files, background videos, or mod packages directly from external URLs without CORS restrictions:
1. In the **Song Select (Play)** screen, click **"🌐 Download Track"**.
2. Enter the direct download URL (e.g., `https://example.com/custom_track.json`).
3. Click **"Start Download"**.
4. The file streams directly to `%APPDATA%/project-alpha-plus/custom_songs/` with live percentage and byte progress.
5. If the downloaded file is a track JSON, it is automatically parsed, validated, and added to the in-game song selection list.

---

## 🖥️ Keyboard Shortcuts
* **F11:** Toggle Fullscreen Mode
* **Space:** Skip 3-second countdown / Pause and Resume in Map Editor
* **Left Click:** Hit Red Notes / Color switch
* **Right Click:** Hit Blue Notes / Color switch
* **Escape:** Return to menu / Close modals

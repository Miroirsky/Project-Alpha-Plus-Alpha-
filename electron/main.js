const { app, BrowserWindow, ipcMain, dialog, shell, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

let mainWindow = null;

// Paths setup
const USER_DATA_PATH = app.getPath('userData');
const SAVES_DIR = path.join(USER_DATA_PATH, 'saves');
const SONGS_DIR = path.join(USER_DATA_PATH, 'custom_songs');
const DOWNLOADS_DIR = path.join(USER_DATA_PATH, 'downloads');
const SETTINGS_FILE = path.join(SAVES_DIR, 'settings.json');
const PROFILES_FILE = path.join(SAVES_DIR, 'profiles.json');

// Ensure necessary directories exist
[SAVES_DIR, SONGS_DIR, DOWNLOADS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      console.error(`Failed to create directory ${dir}:`, e);
    }
  }
});

// Default Settings
const DEFAULT_SETTINGS = {
  soundEnabled: true,
  soundVolume: 70,
  theme: 'terracotta',
  fullscreen: false,
  offsetMs: 0
};

// Default Profiles
const DEFAULT_PROFILES = {
  activeSlotId: 'slot_1',
  slots: [
    {
      id: 'slot_1',
      name: 'Player 1',
      createdAt: Date.now(),
      lastPlayed: Date.now(),
      totalPlayTime: 0,
      totalNotesHit: 0,
      totalScore: 0
    }
  ]
};

// Helper: Read JSON safely
function readJsonFileSync(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn(`Error reading JSON from ${filePath}:`, err);
  }
  return fallback;
}

// Helper: Write JSON safely
function writeJsonFileSync(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(`Error writing JSON to ${filePath}:`, err);
    return false;
  }
}

// Window creation
function createWindow() {
  const settings = readJsonFileSync(SETTINGS_FILE, DEFAULT_SETTINGS);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#322214',
    fullscreen: Boolean(settings.fullscreen),
    autoHideMenuBar: true,
    title: 'Project Alpha Plus',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // Enables direct loading of local media assets (audio, videos, images)
    }
  });

  mainWindow.setMenuBarVisibility(false);

  // Load index.html
  const indexPath = path.join(__dirname, '..', 'index.html');
  mainWindow.loadFile(indexPath);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Register custom protocol for local files if needed
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ==========================================
// IPC HANDLERS
// ==========================================

// --- App & Window Controls ---
ipcMain.handle('app:exit', () => {
  if (mainWindow) {
    mainWindow.close();
  } else {
    app.quit();
  }
  return true;
});

ipcMain.handle('app:toggle-fullscreen', () => {
  if (!mainWindow) return false;
  const isFull = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(isFull);
  // Persist fullscreen setting
  const settings = readJsonFileSync(SETTINGS_FILE, DEFAULT_SETTINGS);
  settings.fullscreen = isFull;
  writeJsonFileSync(SETTINGS_FILE, settings);
  return isFull;
});

ipcMain.handle('app:is-fullscreen', () => {
  return mainWindow ? mainWindow.isFullScreen() : false;
});

ipcMain.handle('app:get-paths', () => {
  return {
    userData: USER_DATA_PATH,
    appPath: app.getAppPath(),
    savesPath: SAVES_DIR,
    songsPath: SONGS_DIR,
    downloadsPath: DOWNLOADS_DIR,
    defaultTracksPath: path.join(app.getAppPath(), 'Default Tracks')
  };
});

ipcMain.handle('app:open-folder', async (event, folderType) => {
  let targetDir = USER_DATA_PATH;
  if (folderType === 'saves') targetDir = SAVES_DIR;
  else if (folderType === 'songs') targetDir = SONGS_DIR;
  else if (folderType === 'downloads') targetDir = DOWNLOADS_DIR;
  else if (folderType === 'default-tracks') targetDir = path.join(app.getAppPath(), 'Default Tracks');
  else if (typeof folderType === 'string' && fs.existsSync(folderType)) targetDir = folderType;

  return shell.openPath(targetDir);
});

// --- Settings Management ---
ipcMain.handle('settings:load', () => {
  return readJsonFileSync(SETTINGS_FILE, DEFAULT_SETTINGS);
});

ipcMain.handle('settings:save', (event, newSettings) => {
  const current = readJsonFileSync(SETTINGS_FILE, DEFAULT_SETTINGS);
  const updated = Object.assign({}, current, newSettings);
  return writeJsonFileSync(SETTINGS_FILE, updated);
});

// --- Save Slots & Profiles Management ---
ipcMain.handle('saves:get-profiles', () => {
  const profiles = readJsonFileSync(PROFILES_FILE, DEFAULT_PROFILES);
  // Ensure default slot file exists
  const activeSlotFile = path.join(SAVES_DIR, `${profiles.activeSlotId || 'slot_1'}.json`);
  if (!fs.existsSync(activeSlotFile)) {
    writeJsonFileSync(activeSlotFile, {
      id: profiles.activeSlotId || 'slot_1',
      name: 'Player 1',
      createdAt: Date.now(),
      lastPlayed: Date.now(),
      highscores: {},
      customMaps: [],
      stats: { totalPlayTime: 0, totalNotesHit: 0, totalScore: 0, tracksCompleted: 0 }
    });
  }
  return profiles;
});

ipcMain.handle('saves:load-slot', (event, slotId) => {
  const id = slotId || 'slot_1';
  const slotFile = path.join(SAVES_DIR, `${id}.json`);
  const defaultSlotData = {
    id,
    name: id === 'slot_1' ? 'Player 1' : `Slot ${id.replace('slot_', '')}`,
    createdAt: Date.now(),
    lastPlayed: Date.now(),
    highscores: {},
    customMaps: [],
    stats: { totalPlayTime: 0, totalNotesHit: 0, totalScore: 0, tracksCompleted: 0 }
  };
  return readJsonFileSync(slotFile, defaultSlotData);
});

ipcMain.handle('saves:save-slot', (event, slotId, slotData) => {
  if (!slotId || !slotData) return false;
  const slotFile = path.join(SAVES_DIR, `${slotId}.json`);
  slotData.lastPlayed = Date.now();
  const ok = writeJsonFileSync(slotFile, slotData);

  // Update profile summary
  const profiles = readJsonFileSync(PROFILES_FILE, DEFAULT_PROFILES);
  const slotSummary = profiles.slots.find(s => s.id === slotId);
  if (slotSummary) {
    slotSummary.name = slotData.name || slotSummary.name;
    slotSummary.lastPlayed = slotData.lastPlayed;
    if (slotData.stats) {
      slotSummary.totalPlayTime = slotData.stats.totalPlayTime || slotSummary.totalPlayTime || 0;
      slotSummary.totalNotesHit = slotData.stats.totalNotesHit || slotSummary.totalNotesHit || 0;
      slotSummary.totalScore = slotData.stats.totalScore || slotSummary.totalScore || 0;
    }
  } else {
    profiles.slots.push({
      id: slotId,
      name: slotData.name || `Slot ${slotId}`,
      createdAt: slotData.createdAt || Date.now(),
      lastPlayed: Date.now(),
      totalPlayTime: slotData.stats ? slotData.stats.totalPlayTime || 0 : 0,
      totalNotesHit: slotData.stats ? slotData.stats.totalNotesHit || 0 : 0,
      totalScore: slotData.stats ? slotData.stats.totalScore || 0 : 0
    });
  }
  writeJsonFileSync(PROFILES_FILE, profiles);
  return ok;
});

ipcMain.handle('saves:create-slot', (event, slotName) => {
  const profiles = readJsonFileSync(PROFILES_FILE, DEFAULT_PROFILES);
  const slotId = `slot_${Date.now()}`;
  const newSlot = {
    id: slotId,
    name: slotName || `Player ${profiles.slots.length + 1}`,
    createdAt: Date.now(),
    lastPlayed: Date.now(),
    highscores: {},
    customMaps: [],
    stats: { totalPlayTime: 0, totalNotesHit: 0, totalScore: 0, tracksCompleted: 0 }
  };

  const slotFile = path.join(SAVES_DIR, `${slotId}.json`);
  writeJsonFileSync(slotFile, newSlot);

  profiles.slots.push({
    id: slotId,
    name: newSlot.name,
    createdAt: newSlot.createdAt,
    lastPlayed: newSlot.lastPlayed,
    totalPlayTime: 0,
    totalNotesHit: 0,
    totalScore: 0
  });
  profiles.activeSlotId = slotId;
  writeJsonFileSync(PROFILES_FILE, profiles);

  return { slotId, slotData: newSlot };
});

ipcMain.handle('saves:delete-slot', (event, slotId) => {
  if (slotId === 'slot_1') return false; // Prevent deleting slot_1
  const slotFile = path.join(SAVES_DIR, `${slotId}.json`);
  if (fs.existsSync(slotFile)) {
    try {
      fs.unlinkSync(slotFile);
    } catch (e) {
      console.warn(`Failed to delete ${slotFile}:`, e);
    }
  }
  const profiles = readJsonFileSync(PROFILES_FILE, DEFAULT_PROFILES);
  profiles.slots = profiles.slots.filter(s => s.id !== slotId);
  if (profiles.activeSlotId === slotId) {
    profiles.activeSlotId = profiles.slots[0] ? profiles.slots[0].id : 'slot_1';
  }
  writeJsonFileSync(PROFILES_FILE, profiles);
  return true;
});

ipcMain.handle('saves:set-active-slot', (event, slotId) => {
  const profiles = readJsonFileSync(PROFILES_FILE, DEFAULT_PROFILES);
  profiles.activeSlotId = slotId;
  writeJsonFileSync(PROFILES_FILE, profiles);
  return true;
});

// --- Native File Dialogs (Save / Open) ---
ipcMain.handle('dialog:show-save', async (event, options) => {
  if (!mainWindow) return null;
  return dialog.showSaveDialog(mainWindow, options || {});
});

ipcMain.handle('dialog:show-open', async (event, options) => {
  if (!mainWindow) return null;
  return dialog.showOpenDialog(mainWindow, options || {});
});

// --- File Read / Write Helpers ---
ipcMain.handle('fs:read-text-file', async (event, filePath) => {
  try {
    return { success: true, content: fs.readFileSync(filePath, 'utf-8') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('fs:write-text-file', async (event, filePath, content) => {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true, path: filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('fs:export-song-file', async (event, defaultName, content) => {
  if (!mainWindow) return { canceled: true };
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Song Package',
    defaultPath: defaultName || 'song.json',
    filters: [
      { name: 'JSON Song Package', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (res.canceled || !res.filePath) {
    return { canceled: true };
  }

  try {
    fs.writeFileSync(res.filePath, content, 'utf-8');
    return { success: true, filePath: res.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('fs:import-song-file', async () => {
  if (!mainWindow) return { canceled: true };
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Song Package',
    filters: [
      { name: 'Song Files (*.json, *.track, *.alpha)', extensions: ['json', 'track', 'alpha', 'txt'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
    return { canceled: true };
  }

  const selectedPath = res.filePaths[0];
  try {
    const content = fs.readFileSync(selectedPath, 'utf-8');
    return { success: true, content, filePath: selectedPath, fileName: path.basename(selectedPath) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// --- Direct Mod & Song Downloader ---
ipcMain.handle('net:download-file', async (event, downloadUrl, subfolder, preferredName) => {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(downloadUrl);
      const client = urlObj.protocol === 'https:' ? https : http;

      const destFolder = subfolder === 'songs' ? SONGS_DIR : DOWNLOADS_DIR;
      const fileName = preferredName || path.basename(urlObj.pathname) || `download_${Date.now()}`;
      const destPath = path.join(destFolder, fileName);

      const request = client.get(downloadUrl, (response) => {
        // Handle HTTP redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          const redirectUrl = new URL(response.headers.location, downloadUrl).href;
          resolve(ipcMain.emit('net:download-file', event, redirectUrl, subfolder, preferredName));
          return;
        }

        if (response.statusCode !== 200) {
          resolve({ success: false, error: `HTTP ${response.statusCode}: ${response.statusMessage}` });
          return;
        }

        const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
        let receivedBytes = 0;

        const fileStream = fs.createWriteStream(destPath);

        response.on('data', (chunk) => {
          receivedBytes += chunk.length;
          const percent = totalBytes > 0 ? Math.round((receivedBytes / totalBytes) * 100) : 0;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download:progress', {
              url: downloadUrl,
              fileName,
              receivedBytes,
              totalBytes,
              percent
            });
          }
        });

        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(() => {
            resolve({ success: true, filePath: destPath, fileName, totalBytes: receivedBytes });
          });
        });

        fileStream.on('error', (err) => {
          fs.unlink(destPath, () => {});
          resolve({ success: false, error: err.message });
        });
      });

      request.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });

      request.setTimeout(30000, () => {
        request.destroy();
        resolve({ success: false, error: 'Download request timed out after 30 seconds' });
      });
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
});

// --- Custom Songs & Default Tracks Disk Scanner ---
ipcMain.handle('tracks:scan-folders', async () => {
  const songs = [];
  const errors = [];

  // 1. Scan app Default Tracks
  const defaultTracksPath = path.join(app.getAppPath(), 'Default Tracks');
  if (fs.existsSync(defaultTracksPath)) {
    try {
      const files = fs.readdirSync(defaultTracksPath);
      for (const file of files) {
        if (file.toLowerCase().endsWith('.json') && file.toLowerCase() !== 'manifest.json') {
          const fullPath = path.join(defaultTracksPath, file);
          try {
            const raw = fs.readFileSync(fullPath, 'utf-8');
            const parsed = JSON.parse(raw);
            parsed._filePath = fullPath;
            parsed._source = 'default';
            songs.push(parsed);
          } catch (e) {
            errors.push({ file, error: e.message });
          }
        }
      }
    } catch (err) {
      console.warn('Error reading Default Tracks dir:', err);
    }
  }

  // 2. Scan custom_songs dir in userData
  if (fs.existsSync(SONGS_DIR)) {
    try {
      const files = fs.readdirSync(SONGS_DIR);
      for (const file of files) {
        if (file.toLowerCase().endsWith('.json')) {
          const fullPath = path.join(SONGS_DIR, file);
          try {
            const raw = fs.readFileSync(fullPath, 'utf-8');
            const parsed = JSON.parse(raw);
            parsed._filePath = fullPath;
            parsed._source = 'custom_disk';
            songs.push(parsed);
          } catch (e) {
            errors.push({ file, error: e.message });
          }
        }
      }
    } catch (err) {
      console.warn('Error reading custom_songs dir:', err);
    }
  }

  return { songs, errors };
});

ipcMain.handle('tracks:save-to-disk', async (event, fileName, songData) => {
  try {
    const safeName = (fileName || `${songData.name || 'custom_song'}.json`).replace(/[/\\?%*:|"<>]/g, '_');
    const targetPath = path.join(SONGS_DIR, safeName.endsWith('.json') ? safeName : `${safeName}.json`);
    fs.writeFileSync(targetPath, JSON.stringify(songData, null, 2), 'utf-8');
    return { success: true, filePath: targetPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

const { app, BrowserWindow, ipcMain, dialog, shell, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
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

function getDefaultTracksDir() {
  const candidates = [
    path.join(app.getAppPath(), 'Default Tracks'),
    path.join(process.cwd(), 'Default Tracks'),
    path.join(__dirname, '..', 'Default Tracks'),
    path.join(process.resourcesPath || '', 'Default Tracks')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.join(app.getAppPath(), 'Default Tracks');
}

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

// Helper: Convert local file path to file:/// URL for safe Chromium loading
function toFileUrl(filePath) {
  if (!filePath || typeof filePath !== 'string') return filePath;
  if (filePath.startsWith('http:') || filePath.startsWith('https:') || filePath.startsWith('data:') || filePath.startsWith('blob:')) {
    return filePath;
  }
  const clean = filePath.replace(/\\/g, '/');
  return clean.startsWith('file://') ? clean : 'file:///' + clean.replace(/^\/+/, '');
}

// --- Folder Validation & Ingest Helpers ---
function parseSongFolderSync(folderPath) {
  try {
    if (!fs.existsSync(folderPath)) {
      return { valid: false, error: 'Folder does not exist' };
    }
    const stat = fs.statSync(folderPath);
    if (!stat.isDirectory()) {
      return { valid: false, error: 'Path is not a folder' };
    }

    const innerFiles = fs.readdirSync(folderPath);

    // 1. Must contain notes.json
    let notesFile = null;
    if (fs.existsSync(path.join(folderPath, 'notes.json'))) {
      notesFile = path.join(folderPath, 'notes.json');
    } else {
      const match = innerFiles.find(f => f.toLowerCase().endsWith('.json'));
      if (match) notesFile = path.join(folderPath, match);
    }

    if (!notesFile) {
      return { valid: false, error: 'Missing notes.json' };
    }

    const raw = fs.readFileSync(notesFile, 'utf-8');
    const parsed = JSON.parse(raw);
    const folderName = path.basename(folderPath);

    parsed._folderPath = folderPath;
    parsed._folderName = folderName;
    parsed._filePath = notesFile;
    parsed._source = 'custom_disk';

    // 2. Must contain Audio (track.ogg, track.mp3, track.wav, etc.)
    let audioFound = false;
    let localAudioPath = null;
    if (parsed.file && typeof parsed.file === 'string' && !parsed.file.startsWith('data:') && !parsed.file.startsWith('http') && !parsed.file.startsWith('blob:')) {
      const candidate = path.isAbsolute(parsed.file) ? parsed.file : path.join(folderPath, parsed.file);
      if (fs.existsSync(candidate)) {
        localAudioPath = candidate;
        parsed.file = toFileUrl(candidate);
        parsed._localAudioPath = candidate;
        audioFound = true;
      }
    }
    if (!audioFound) {
      const autoAudio = innerFiles.find(f => /^(track|audio|song)\.(ogg|mp3|wav|m4a|flac)$/i.test(f))
        || innerFiles.find(f => /\.(ogg|mp3|wav|m4a|flac)$/i.test(f));
      if (autoAudio) {
        localAudioPath = path.join(folderPath, autoAudio);
        parsed.file = toFileUrl(localAudioPath);
        parsed._localAudioPath = localAudioPath;
        audioFound = true;
      }
    }

    if (!audioFound) {
      return { valid: false, error: 'Missing audio file (track.ogg, track.mp3, or track.wav)' };
    }

    // 3. Resolve Background Media (background.mp4, background.webm, image, etc.) - Optional
    const bgObj = parsed.background || {};
    let bgFound = false;
    let localBgPath = null;
    if (bgObj.url && typeof bgObj.url === 'string' && !bgObj.url.startsWith('data:') && !bgObj.url.startsWith('http') && !bgObj.url.startsWith('blob:')) {
      const candidate = path.isAbsolute(bgObj.url) ? bgObj.url : path.join(folderPath, bgObj.url);
      if (fs.existsSync(candidate)) {
        localBgPath = candidate;
        parsed.background = {
          ...bgObj,
          url: toFileUrl(candidate),
          mediaType: /\.(mp4|webm|mkv|mov)$/i.test(candidate) ? 'video' : 'image'
        };
        parsed._localBgPath = candidate;
        bgFound = true;
      }
    }
    if (!bgFound) {
      const autoBg = innerFiles.find(f => /^background\.(mp4|webm|mkv|mov|png|jpg|jpeg|gif)$/i.test(f))
        || innerFiles.find(f => /\.(mp4|webm|mkv|mov)$/i.test(f));
      if (autoBg) {
        localBgPath = path.join(folderPath, autoBg);
        const isVid = /\.(mp4|webm|mkv|mov)$/i.test(autoBg);
        parsed.background = {
          ...bgObj,
          url: toFileUrl(localBgPath),
          mediaType: isVid ? 'video' : 'image',
          fit: bgObj.fit || 'cover',
          opacity: typeof bgObj.opacity === 'number' ? bgObj.opacity : 0.7
        };
        parsed._localBgPath = localBgPath;
        bgFound = true;
      }
    }

    if (!bgFound && (!parsed.background || !parsed.background.url)) {
      parsed.background = null;
    }

    // 4. Resolve Cover Artwork (cover.png / cover.jpg) if present
    if (parsed.cover && typeof parsed.cover === 'string' && !parsed.cover.startsWith('data:') && !parsed.cover.startsWith('http') && !parsed.cover.startsWith('Assets/')) {
      const candidate = path.isAbsolute(parsed.cover) ? parsed.cover : path.join(folderPath, parsed.cover);
      if (fs.existsSync(candidate)) {
        parsed.cover = toFileUrl(candidate);
      }
    } else if (!parsed.cover || parsed.cover.startsWith('Assets/')) {
      const autoCover = innerFiles.find(f => /^cover\.(png|jpg|jpeg|webp)$/i.test(f));
      if (autoCover) {
        parsed.cover = toFileUrl(path.join(folderPath, autoCover));
      }
    }

    return {
      valid: true,
      folderName,
      folderPath,
      song: parsed
    };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// Copy source song folder into custom_songs/ and return parsed song
function copyAndLoadSongFolder(sourceDir) {
  try {
    if (!sourceDir || !fs.existsSync(sourceDir)) {
      return { success: false, error: 'Selected folder does not exist.' };
    }
    const stat = fs.statSync(sourceDir);
    if (!stat.isDirectory()) {
      return {
        success: false,
        error: 'You must select an entire song folder (e.g. pack_01/ containing notes.json and audio track).'
      };
    }

    // Validate the folder before copying
    const validation = parseSongFolderSync(sourceDir);
    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid song folder: ${validation.error}. Entire folder with notes.json and track audio (track.ogg/mp3/wav) is required.`
      };
    }

    const folderName = path.basename(sourceDir).replace(/[/\\?%*:|"<>]/g, '_').trim() || `song_${Date.now()}`;
    const destPath = path.join(SONGS_DIR, folderName);

    // If not already in custom_songs, copy recursively
    if (path.resolve(sourceDir) !== path.resolve(destPath)) {
      fs.cpSync(sourceDir, destPath, { recursive: true, force: true });
    }

    const loaded = parseSongFolderSync(destPath);
    if (!loaded.valid) {
      return { success: false, error: `Failed to load copied song folder: ${loaded.error}` };
    }

    return {
      success: true,
      folderName,
      folderPath: destPath,
      song: loaded.song
    };
  } catch (err) {
    console.error('Error importing song folder:', err);
    return { success: false, error: err.message };
  }
}
function dataUrlToBuffer(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (match) {
    return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
  }
  return null;
}

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

// --- Erase All Data (Custom Tracks, Saves, Profiles, High Scores, Stats; Keeps Default Songs) ---
ipcMain.handle('app:erase-all-data', async () => {
  try {
    // 1. Delete all custom song folders in SONGS_DIR (never touches Default Tracks)
    if (fs.existsSync(SONGS_DIR)) {
      const items = fs.readdirSync(SONGS_DIR);
      for (const item of items) {
        const target = path.join(SONGS_DIR, item);
        try {
          fs.rmSync(target, { recursive: true, force: true });
        } catch (e) {
          console.warn(`Failed to remove custom song ${target}:`, e);
        }
      }
    } else {
      fs.mkdirSync(SONGS_DIR, { recursive: true });
    }

    // 2. Delete all downloaded files in DOWNLOADS_DIR
    if (fs.existsSync(DOWNLOADS_DIR)) {
      const items = fs.readdirSync(DOWNLOADS_DIR);
      for (const item of items) {
        const target = path.join(DOWNLOADS_DIR, item);
        try {
          fs.rmSync(target, { recursive: true, force: true });
        } catch (e) {}
      }
    } else {
      fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
    }

    // 3. Delete all save slots & profile JSONs in SAVES_DIR (preserve settings.json)
    if (fs.existsSync(SAVES_DIR)) {
      const items = fs.readdirSync(SAVES_DIR);
      for (const item of items) {
        if (item.toLowerCase() === 'settings.json') continue;
        const target = path.join(SAVES_DIR, item);
        try {
          fs.rmSync(target, { recursive: true, force: true });
        } catch (e) {}
      }
    } else {
      fs.mkdirSync(SAVES_DIR, { recursive: true });
    }

    // 4. Re-initialize clean default profile & slot_1
    const now = Date.now();
    const freshProfiles = {
      activeSlotId: 'slot_1',
      slots: [
        {
          id: 'slot_1',
          name: 'Player 1',
          createdAt: now,
          lastPlayed: now,
          totalPlayTime: 0,
          totalNotesHit: 0,
          totalScore: 0,
          tracksCompleted: 0
        }
      ]
    };
    const freshSlot1 = {
      id: 'slot_1',
      name: 'Player 1',
      createdAt: now,
      lastPlayed: now,
      highscores: {},
      customMaps: [],
      stats: {
        totalPlayTime: 0,
        totalNotesHit: 0,
        totalScore: 0,
        tracksCompleted: 0
      }
    };

    writeJsonFileSync(PROFILES_FILE, freshProfiles);
    writeJsonFileSync(path.join(SAVES_DIR, 'slot_1.json'), freshSlot1);

    const defaults = loadDefaultTracksFromDisk();
    return {
      success: true,
      profiles: freshProfiles,
      slotData: freshSlot1,
      defaultTracks: defaults.songs
    };
  } catch (err) {
    console.error('Error erasing all data:', err);
    return { success: false, error: err.message };
  }
});

// --- Uninstall Game (Removes User Data, Shortcuts, Installation Folder & Exits) ---
ipcMain.handle('app:uninstall-game', async () => {
  try {
    // 1. Remove Desktop and Start Menu shortcuts
    const shortcutLocations = [
      path.join(os.homedir(), 'Desktop', 'Project Alpha Plus.lnk'),
      path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Project Alpha Plus.lnk')
    ];
    for (const lnk of shortcutLocations) {
      if (lnk && fs.existsSync(lnk)) {
        try {
          fs.unlinkSync(lnk);
        } catch (e) {}
      }
    }

    // 2. Wipe saves, custom_songs, downloads directories
    for (const dir of [SONGS_DIR, DOWNLOADS_DIR, SAVES_DIR]) {
      if (fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch (e) {}
      }
    }

    // 3. Determine installation directory to remove after process exits
    const dirsToRemove = [];
    const execDir = path.dirname(process.execPath);
    const isSourceRepo = fs.existsSync(path.join(execDir, '.git')) || fs.existsSync(path.join(process.cwd(), '.git'));

    // If running from packaged standalone .exe (not inside git source workspace or node_modules/electron)
    if (
      app.isPackaged &&
      !execDir.toLowerCase().includes('node_modules') &&
      !fs.existsSync(path.join(execDir, '.git'))
    ) {
      dirsToRemove.push(execDir);
    }

    // Also check default installer destination (%LOCALAPPDATA%\Programs\Project Alpha Plus)
    const defaultInstallDir = path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
      'Programs',
      'Project Alpha Plus'
    );
    if (
      fs.existsSync(defaultInstallDir) &&
      !fs.existsSync(path.join(defaultInstallDir, '.git')) &&
      !dirsToRemove.includes(defaultInstallDir)
    ) {
      dirsToRemove.push(defaultInstallDir);
    }

    // Spawn detached Windows cleanup command to remove locked installation directory & userData after exit
    if (process.platform === 'win32') {
      const cleanupCmds = ['ping 127.0.0.1 -n 3 > nul'];
      for (const d of dirsToRemove) {
        cleanupCmds.push(`rmdir /s /q "${d}"`);
      }
      if (fs.existsSync(USER_DATA_PATH) && !isSourceRepo) {
        cleanupCmds.push(`rmdir /s /q "${USER_DATA_PATH}"`);
      }

      const child = spawn('cmd.exe', ['/c', cleanupCmds.join(' & ')], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      child.unref();
    }

    // Quit the application after a short delay so renderer receives response
    setTimeout(() => {
      app.quit();
    }, 250);

    return {
      success: true,
      removedShortcuts: true,
      scheduledDirs: dirsToRemove
    };
  } catch (err) {
    console.error('Error uninstalling game:', err);
    return { success: false, error: err.message };
  }
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
    defaultTracksPath: getDefaultTracksDir()
  };
});

ipcMain.handle('app:open-folder', async (event, folderType, customPath) => {
  let targetDir = USER_DATA_PATH;
  if (customPath && typeof customPath === 'string' && fs.existsSync(customPath)) {
    try {
      const stat = fs.statSync(customPath);
      if (stat.isDirectory()) {
        return shell.openPath(customPath);
      } else {
        shell.showItemInFolder(customPath);
        return true;
      }
    } catch (e) {
      return shell.openPath(path.dirname(customPath));
    }
  }

  if (folderType === 'saves') targetDir = SAVES_DIR;
  else if (folderType === 'songs') targetDir = SONGS_DIR;
  else if (folderType === 'downloads') targetDir = DOWNLOADS_DIR;
  else if (folderType === 'default-tracks') targetDir = getDefaultTracksDir();
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

// --- Song Folder Import Handlers ---
ipcMain.handle('tracks:import-song-folder', async () => {
  if (!mainWindow) return { canceled: true };
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Song Folder to Import (Must contain notes.json and audio track)',
    properties: ['openDirectory']
  });

  if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
    return { canceled: true };
  }

  const selectedDir = res.filePaths[0];
  return copyAndLoadSongFolder(selectedDir);
});

ipcMain.handle('tracks:import-folder-from-path', async (event, folderPath) => {
  return copyAndLoadSongFolder(folderPath);
});

// --- Direct Mod & Song Downloader Helper & Handler ---
async function downloadFileWithRedirects(downloadUrl, destFolder, preferredName, redirectCount = 0) {
  if (redirectCount > 5) {
    return { success: false, error: 'Too many HTTP redirects (limit exceeded)' };
  }

  return new Promise((resolve) => {
    try {
      const urlObj = new URL(downloadUrl);
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        return resolve({ success: false, error: `Unsupported protocol: ${urlObj.protocol}. Only http: and https: are supported.` });
      }

      if (!fs.existsSync(destFolder)) {
        fs.mkdirSync(destFolder, { recursive: true });
      }

      let ext = path.extname(urlObj.pathname);
      let rawBase = preferredName && preferredName.trim()
        ? preferredName.trim()
        : (path.basename(urlObj.pathname) || `download_${Date.now()}`);

      // If preferredName was given without an extension, preserve extension from URL if available
      if (preferredName && ext && !path.extname(preferredName)) {
        rawBase += ext;
      }

      // Sanitize against path traversal attacks and illegal characters
      const safeFileName = path.basename(rawBase).replace(/[/\\?%*:|"<>]/g, '_').trim() || `download_${Date.now()}`;
      const destPath = path.join(destFolder, safeFileName);

      const client = urlObj.protocol === 'https:' ? https : http;
      const requestOptions = {
        headers: {
          'User-Agent': 'ProjectAlphaPlus-Downloader/1.0',
          'Accept': '*/*'
        }
      };

      const request = client.get(downloadUrl, requestOptions, async (response) => {
        // Handle HTTP redirects (301, 302, 303, 307, 308)
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume(); // Discard body
          try {
            const redirectUrl = new URL(response.headers.location, downloadUrl).href;
            const redirectRes = await downloadFileWithRedirects(redirectUrl, destFolder, preferredName, redirectCount + 1);
            return resolve(redirectRes);
          } catch (redErr) {
            return resolve({ success: false, error: `Failed to follow redirect: ${redErr.message}` });
          }
        }

        if (response.statusCode !== 200) {
          response.resume(); // Discard error response body
          return resolve({ success: false, error: `HTTP ${response.statusCode}: ${response.statusMessage || 'Error'}` });
        }

        const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
        let receivedBytes = 0;
        let isAborted = false;

        const fileStream = fs.createWriteStream(destPath);

        const cleanupPartialFile = () => {
          try {
            if (fs.existsSync(destPath)) {
              fs.unlinkSync(destPath);
            }
          } catch (e) {}
        };

        response.on('data', (chunk) => {
          if (isAborted) return;
          receivedBytes += chunk.length;
          const percent = totalBytes > 0 ? Math.round((receivedBytes / totalBytes) * 100) : 0;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download:progress', {
              url: downloadUrl,
              fileName: safeFileName,
              receivedBytes,
              totalBytes,
              percent
            });
          }
        });

        response.on('error', (err) => {
          isAborted = true;
          fileStream.destroy();
          cleanupPartialFile();
          resolve({ success: false, error: `Network stream error: ${err.message}` });
        });

        fileStream.on('finish', () => {
          fileStream.close(() => {
            resolve({
              success: true,
              filePath: destPath,
              fileName: safeFileName,
              totalBytes: receivedBytes
            });
          });
        });

        fileStream.on('error', (err) => {
          isAborted = true;
          cleanupPartialFile();
          resolve({ success: false, error: `Disk write error: ${err.message}` });
        });

        response.pipe(fileStream);
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
}

ipcMain.handle('net:download-file', async (event, downloadUrl, subfolder, preferredName) => {
  const destFolder = subfolder === 'songs' ? SONGS_DIR : DOWNLOADS_DIR;
  return downloadFileWithRedirects(downloadUrl, destFolder, preferredName, 0);
});

// --- Custom Songs & Default Tracks Disk Scanners ---
function scanCustomSongsFromDisk() {
  const songs = [];
  const errors = [];
  if (fs.existsSync(SONGS_DIR)) {
    try {
      const items = fs.readdirSync(SONGS_DIR);
      for (const item of items) {
        const itemPath = path.join(SONGS_DIR, item);
        let stat;
        try {
          stat = fs.statSync(itemPath);
        } catch (e) {
          continue;
        }
        if (stat.isDirectory()) {
          const parsedRes = parseSongFolderSync(itemPath);
          if (parsedRes.valid) {
            parsedRes.song.isCustom = true;
            parsedRes.song.isDefault = false;
            parsedRes.song._source = 'custom_disk';
            songs.push(parsedRes.song);
          } else {
            errors.push({ folder: item, error: parsedRes.error });
          }
        }
      }
    } catch (err) {
      console.warn('Error reading custom_songs dir:', err);
    }
  }
  return { songs, errors };
}

function loadDefaultTracksFromDisk() {
  const defaultTracksDir = getDefaultTracksDir();
  const songs = [];
  const errors = [];

  if (!fs.existsSync(defaultTracksDir)) {
    return { songs, errors };
  }

  const manifestPath = path.join(defaultTracksDir, 'manifest.json');
  let trackFolders = [];

  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (Array.isArray(manifest.tracks)) {
        trackFolders = [...manifest.tracks];
      }
    } catch (e) {
      console.warn('Error reading Default Tracks manifest.json:', e);
    }
  }

  // Also discover any directories in Default Tracks not yet in manifest
  try {
    const items = fs.readdirSync(defaultTracksDir);
    for (const item of items) {
      if (trackFolders.includes(item)) continue;
      const itemPath = path.join(defaultTracksDir, item);
      try {
        if (fs.statSync(itemPath).isDirectory()) {
          trackFolders.push(item);
        }
      } catch (e) {}
    }
  } catch (e) {
    console.warn('Error reading Default Tracks dir:', e);
  }

  const validFolders = [];
  for (const folderName of trackFolders) {
    const folderPath = path.join(defaultTracksDir, folderName);
    if (!fs.existsSync(folderPath)) continue;
    try {
      if (!fs.statSync(folderPath).isDirectory()) continue;
    } catch (e) {
      continue;
    }

    const parsedRes = parseSongFolderSync(folderPath);
    if (parsedRes.valid) {
      const song = parsedRes.song;
      song.isDefault = true;
      song.isCustom = false;
      song._source = 'default_disk';
      songs.push(song);
      validFolders.push(folderName);
    } else {
      errors.push({ folder: folderName, error: parsedRes.error });
    }
  }

  // Keep manifest.json up-to-date with current valid track folders
  try {
    const manifestData = {
      updatedAt: new Date().toISOString(),
      tracks: validFolders
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2), 'utf8');
  } catch (err) {
    console.warn('Could not write updated Default Tracks manifest.json:', err);
  }

  return { songs, errors };
}

ipcMain.handle('tracks:scan-folders', async () => {
  const custom = scanCustomSongsFromDisk();
  const defaults = loadDefaultTracksFromDisk();

  // Deduplicate: remove any errant uncopied duplicates of default tracks from custom_songs
  const defaultIds = new Set(defaults.songs.map((s) => s.id));
  const defaultFolders = new Set(defaults.songs.map((s) => (s._folderName || '').toLowerCase().trim()));
  const defaultNames = new Set(defaults.songs.map((s) => (s.name || '').toLowerCase().trim()));

  const filteredCustom = [];
  const seenCustomIds = new Set();
  for (const song of custom.songs) {
    if (!song || !song.id) continue;
    if (seenCustomIds.has(song.id)) continue;

    const isCopy = (song.name || '').includes('(Copy)') || (song.id || '').includes('copy');
    const folderLower = (song._folderName || '').toLowerCase().trim();
    const nameLower = (song.name || '').toLowerCase().trim();

    // If an uncopied custom_songs folder has the same ID or name as a default track, it is an accidental duplicate of a default track!
    if (!isCopy && (defaultIds.has(song.id) || defaultFolders.has(folderLower) || defaultNames.has(nameLower))) {
      if (song._folderPath && fs.existsSync(song._folderPath)) {
        try {
          fs.rmSync(song._folderPath, { recursive: true, force: true });
          console.log(`Cleaned up errant default song duplicate from custom_songs: ${song._folderPath}`);
        } catch (e) {
          console.warn(`Could not delete duplicate folder ${song._folderPath}:`, e);
        }
      }
      continue;
    }

    seenCustomIds.add(song.id);
    filteredCustom.push(song);
  }

  return {
    songs: filteredCustom,
    defaultTracks: defaults.songs,
    errors: [...custom.errors, ...defaults.errors]
  };
});

ipcMain.handle('tracks:load-default-tracks', async () => {
  return loadDefaultTracksFromDisk();
});

// --- Auto-Save Song as Direct Folder: custom_songs/<folder>/notes.json, track.ogg, background.mp4 ---
ipcMain.handle('tracks:save-song-folder', async (event, folderName, songPackage) => {
  try {
    if (!songPackage) return { success: false, error: 'No song data provided' };

    const isDefaultTrack = Boolean(songPackage.isDefault || songPackage._source === 'default_disk');
    if (isDefaultTrack) {
      console.warn('Direct modification of Default Tracks folder is prohibited; changes must be saved as a custom copy.');
      return { success: false, error: 'Default tracks cannot be overwritten. Save as a copy instead.' };
    }
    const targetBaseDir = SONGS_DIR;

    // Choose clean, filesystem-safe folder name
    const rawName = folderName || songPackage._folderName || songPackage.id || songPackage.name || 'pack_01';
    const safeFolderName = rawName.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'pack_01';
    const folderPath = path.join(targetBaseDir, safeFolderName);

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // Structure metadata for notes.json
    const notesJsonData = {
      id: songPackage.id || `custom_${Date.now()}`,
      name: songPackage.name || 'Untitled Song',
      mapper: songPackage.mapper || 'Unknown',
      creator: songPackage.creator || 'Unknown',
      duration: songPackage.duration || '03:00',
      bpm: songPackage.bpm || 120,
      color: songPackage.color || '#954132',
      difficulty: songPackage.difficulty || 'Normal',
      difficulties: songPackage.difficulties || {},
      notes: songPackage.notes || [],
      metadata: songPackage.metadata || {},
      _folderName: safeFolderName
    };

    // 1. Process and save Audio (e.g. track.ogg or track.mp3)
    let audioFileName = 'track.ogg';
    if (songPackage.audioExt) {
      audioFileName = `track.${songPackage.audioExt.replace('.', '')}`;
    }

    if (songPackage.audioData) {
      const decoded = dataUrlToBuffer(songPackage.audioData);
      if (decoded) {
        if (!songPackage.audioExt) {
          if (decoded.mime.includes('mpeg') || decoded.mime.includes('mp3')) audioFileName = 'track.mp3';
          else if (decoded.mime.includes('wav')) audioFileName = 'track.wav';
          else if (decoded.mime.includes('ogg')) audioFileName = 'track.ogg';
        }
        const audioPath = path.join(folderPath, audioFileName);
        fs.writeFileSync(audioPath, decoded.buffer);
        notesJsonData.file = audioFileName;
      } else if (typeof songPackage.audioData === 'string' && fs.existsSync(songPackage.audioData)) {
        const ext = path.extname(songPackage.audioData) || '.mp3';
        audioFileName = `track${ext}`;
        const audioPath = path.join(folderPath, audioFileName);
        if (path.resolve(songPackage.audioData) !== path.resolve(audioPath)) {
          fs.copyFileSync(songPackage.audioData, audioPath);
        }
        notesJsonData.file = audioFileName;
      }
    } else {
      // Check if audio file already exists in this folder
      const existingAudio = fs.readdirSync(folderPath).find(f => /^(track|audio|song)\.(ogg|mp3|wav|m4a|flac)$/i.test(f));
      if (existingAudio) {
        notesJsonData.file = existingAudio;
      } else if (songPackage.file && !songPackage.file.startsWith('data:') && !songPackage.file.startsWith('blob:')) {
        notesJsonData.file = songPackage.file;
      }
    }

    // 2. Process and save Background Media (e.g. background.mp4 or background.png)
    let bgFileName = 'background.mp4';
    const bgConfig = songPackage.background || songPackage.bgConfig || {};

    if (songPackage.bgData) {
      const decodedBg = dataUrlToBuffer(songPackage.bgData);
      if (decodedBg) {
        let isVideo = decodedBg.mime.startsWith('video');
        if (decodedBg.mime.includes('mp4')) bgFileName = 'background.mp4';
        else if (decodedBg.mime.includes('webm')) bgFileName = 'background.webm';
        else if (decodedBg.mime.includes('png')) { bgFileName = 'background.png'; isVideo = false; }
        else if (decodedBg.mime.includes('jpeg') || decodedBg.mime.includes('jpg')) { bgFileName = 'background.jpg'; isVideo = false; }

        const bgPath = path.join(folderPath, bgFileName);
        fs.writeFileSync(bgPath, decodedBg.buffer);
        notesJsonData.background = {
          ...bgConfig,
          url: bgFileName,
          mediaType: isVideo ? 'video' : 'image',
          fit: bgConfig.fit || 'cover',
          opacity: typeof bgConfig.opacity === 'number' ? bgConfig.opacity : 0.7
        };
      } else if (typeof songPackage.bgData === 'string' && fs.existsSync(songPackage.bgData)) {
        const ext = path.extname(songPackage.bgData) || '.mp4';
        bgFileName = `background${ext}`;
        const bgPath = path.join(folderPath, bgFileName);
        if (path.resolve(songPackage.bgData) !== path.resolve(bgPath)) {
          fs.copyFileSync(songPackage.bgData, bgPath);
        }
        const isVideo = /\.(mp4|webm|mkv|mov)$/i.test(bgFileName);
        notesJsonData.background = {
          ...bgConfig,
          url: bgFileName,
          mediaType: isVideo ? 'video' : 'image',
          fit: bgConfig.fit || 'cover',
          opacity: typeof bgConfig.opacity === 'number' ? bgConfig.opacity : 0.7
        };
      }
    } else {
      const existingBg = fs.readdirSync(folderPath).find(f => /^background\.(mp4|webm|mkv|mov|png|jpg|jpeg|gif)$/i.test(f));
      if (existingBg) {
        const isVideo = /\.(mp4|webm|mkv|mov)$/i.test(existingBg);
        notesJsonData.background = {
          ...bgConfig,
          url: existingBg,
          mediaType: isVideo ? 'video' : 'image',
          fit: bgConfig.fit || 'cover',
          opacity: typeof bgConfig.opacity === 'number' ? bgConfig.opacity : 0.7
        };
      } else if (bgConfig.url && !bgConfig.url.startsWith('data:') && !bgConfig.url.startsWith('blob:')) {
        notesJsonData.background = { ...bgConfig };
      }
    }

    // 3. Process and save Cover Artwork (e.g. cover.png)
    if (songPackage.coverData) {
      const decodedCover = dataUrlToBuffer(songPackage.coverData);
      if (decodedCover) {
        const coverExt = decodedCover.mime.includes('jpeg') || decodedCover.mime.includes('jpg') ? 'jpg' : 'png';
        const coverFileName = `cover.${coverExt}`;
        fs.writeFileSync(path.join(folderPath, coverFileName), decodedCover.buffer);
        notesJsonData.cover = coverFileName;
      } else if (typeof songPackage.coverData === 'string' && fs.existsSync(songPackage.coverData)) {
        const coverExt = path.extname(songPackage.coverData) || '.png';
        const coverFileName = `cover${coverExt}`;
        fs.copyFileSync(songPackage.coverData, path.join(folderPath, coverFileName));
        notesJsonData.cover = coverFileName;
      }
    } else if (songPackage.cover && !songPackage.cover.startsWith('data:') && !songPackage.cover.startsWith('blob:')) {
      notesJsonData.cover = songPackage.cover;
    }

    // 4. Save notes.json inside the folder
    const notesFilePath = path.join(folderPath, 'notes.json');
    fs.writeFileSync(notesFilePath, JSON.stringify(notesJsonData, null, 2), 'utf-8');

    // If saving in Default Tracks, ensure it is recorded in manifest.json
    if (isDefaultTrack) {
      try {
        const manifestPath = path.join(targetBaseDir, 'manifest.json');
        let currentTracks = [];
        if (fs.existsSync(manifestPath)) {
          const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          if (Array.isArray(m.tracks)) currentTracks = m.tracks;
        }
        if (!currentTracks.includes(safeFolderName)) {
          currentTracks.push(safeFolderName);
        }
        fs.writeFileSync(manifestPath, JSON.stringify({
          updatedAt: new Date().toISOString(),
          tracks: currentTracks
        }, null, 2), 'utf8');
      } catch (err) {
        console.warn('Could not update manifest.json for default track:', err);
      }
    }

    return {
      success: true,
      folderPath,
      folderName: safeFolderName,
      notesFile: notesFilePath,
      songData: notesJsonData,
      source: isDefaultTrack ? 'default_disk' : 'custom_disk'
    };
  } catch (err) {
    console.error('Error saving song folder:', err);
    return { success: false, error: err.message };
  }
});



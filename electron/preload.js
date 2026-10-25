const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // App & Window Controls
  exitApp: () => ipcRenderer.invoke('app:exit'),
  eraseAllData: () => ipcRenderer.invoke('app:erase-all-data'),
  uninstallGame: () => ipcRenderer.invoke('app:uninstall-game'),
  toggleFullscreen: () => ipcRenderer.invoke('app:toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('app:is-fullscreen'),
  getAppPaths: () => ipcRenderer.invoke('app:get-paths'),
  openFolder: (folderType) => ipcRenderer.invoke('app:open-folder', folderType),

  // Settings
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),

  // Save Slots & Profiles
  getProfiles: () => ipcRenderer.invoke('saves:get-profiles'),
  loadSaveSlot: (slotId) => ipcRenderer.invoke('saves:load-slot', slotId),
  saveSaveSlot: (slotId, slotData) => ipcRenderer.invoke('saves:save-slot', slotId, slotData),
  createSaveSlot: (slotName) => ipcRenderer.invoke('saves:create-slot', slotName),
  deleteSaveSlot: (slotId) => ipcRenderer.invoke('saves:delete-slot', slotId),
  setActiveSlot: (slotId) => ipcRenderer.invoke('saves:set-active-slot', slotId),

  // Native File Dialogs & Disk IO
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:show-save', options),
  showOpenDialog: (options) => ipcRenderer.invoke('dialog:show-open', options),
  readTextFile: (filePath) => ipcRenderer.invoke('fs:read-text-file', filePath),
  writeTextFile: (filePath, content) => ipcRenderer.invoke('fs:write-text-file', filePath, content),

  // Downloader
  downloadFile: (url, subfolder, preferredName) =>
    ipcRenderer.invoke('net:download-file', url, subfolder, preferredName),
  onDownloadProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('download:progress', listener);
    return () => ipcRenderer.removeListener('download:progress', listener);
  },

  // Songs & Tracks on Disk (Folders & Packages)
  scanFolders: () => ipcRenderer.invoke('tracks:scan-folders'),
  loadDefaultTracks: () => ipcRenderer.invoke('tracks:load-default-tracks'),
  saveSongFolder: (folderName, songPackage) => ipcRenderer.invoke('tracks:save-song-folder', folderName, songPackage),
  importSongFolder: () => ipcRenderer.invoke('tracks:import-song-folder'),
  importFolderFromPath: (folderPath) => ipcRenderer.invoke('tracks:import-folder-from-path', folderPath),
  openSongFolder: (folderPath) => ipcRenderer.invoke('app:open-folder', 'song-folder', folderPath)
});

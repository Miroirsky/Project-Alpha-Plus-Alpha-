/**
 * @file modDownloader.js
 * @description Mod and External Track Downloader for Project Alpha Plus.
 * Fetches rhythm tracks, songs, audio, and videos from external websites / URLs
 * directly into local storage folders with live progress tracking.
 */

(function () {
  class ModDownloader {
    /**
     * @param {Object} options
     * @param {MapStorage} options.mapStorage
     * @param {SoundManager} options.soundManager
     */
    constructor({ mapStorage, soundManager } = {}) {
      this.mapStorage = mapStorage || (typeof window !== "undefined" ? window.mapStorage : null);
      this.soundManager = soundManager || (typeof window !== "undefined" ? window.soundManager : null);
      this.isElectron = typeof window !== "undefined" && Boolean(window.electronAPI && window.electronAPI.isElectron);

      this.modal = typeof document !== "undefined" ? document.getElementById("downloader-modal") : null;
      this.urlInput = typeof document !== "undefined" ? document.getElementById("downloader-url-input") : null;
      this.nameInput = typeof document !== "undefined" ? document.getElementById("downloader-name-input") : null;
      this.downloadBtn = typeof document !== "undefined" ? document.getElementById("btn-start-download") : null;
      this.cancelBtn = typeof document !== "undefined" ? document.getElementById("btn-close-downloader") : null;
      this.openFolderBtn = typeof document !== "undefined" ? document.getElementById("btn-downloader-open-folder") : null;
      this.progressBar = typeof document !== "undefined" ? document.getElementById("downloader-progress-bar") : null;
      this.progressText = typeof document !== "undefined" ? document.getElementById("downloader-progress-text") : null;
      this.statusAlert = typeof document !== "undefined" ? document.getElementById("downloader-status-alert") : null;

      this.isDownloading = false;
      this._progressUnsubscribe = null;
      this.bindEvents();
    }

    init() {
      // Clean up previous listener to prevent leaks or duplicate events
      if (this._progressUnsubscribe) {
        try {
          this._progressUnsubscribe();
        } catch (e) {}
        this._progressUnsubscribe = null;
      }

      // Setup progress listener from Electron main process
      if (this.isElectron && window.electronAPI && typeof window.electronAPI.onDownloadProgress === "function") {
        this._progressUnsubscribe = window.electronAPI.onDownloadProgress((progress) => {
          if (progress) {
            this.updateProgress(progress.percent, progress.receivedBytes, progress.totalBytes);
          }
        });
      }
    }

    bindEvents() {
      if (this.cancelBtn) {
        this.cancelBtn.addEventListener("click", () => this.close());
      }

      if (this.modal) {
        this.modal.addEventListener("click", (e) => {
          if (e.target === this.modal && !this.isDownloading) {
            this.close();
          }
        });
      }

      if (this.downloadBtn) {
        this.downloadBtn.addEventListener("click", () => this.handleDownload());
      }

      if (this.openFolderBtn) {
        this.openFolderBtn.addEventListener("click", () => {
          if (this.isElectron && window.electronAPI && typeof window.electronAPI.openFolder === "function") {
            window.electronAPI.openFolder("songs");
          }
        });
      }

      // Enter key in URL input starts download
      if (this.urlInput) {
        this.urlInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !this.isDownloading) {
            this.handleDownload();
          }
        });
      }
    }

    open(defaultUrl = "") {
      if (!this.modal) return;
      if (this.urlInput) {
        this.urlInput.value = defaultUrl;
      }
      this.resetUI();
      this.modal.classList.add("is-active");
      this.modal.setAttribute("aria-hidden", "false");
      if (this.urlInput) this.urlInput.focus();
      if (this.soundManager && typeof this.soundManager.playClick === "function") {
        this.soundManager.playClick();
      }
    }

    close() {
      if (this.isDownloading) {
        if (typeof confirm === "function" && !confirm("A download is currently in progress. Cancel and close?")) {
          return;
        }
      }
      if (this.modal) {
        this.modal.classList.remove("is-active");
        this.modal.setAttribute("aria-hidden", "true");
      }
      this.isDownloading = false;
    }

    resetUI() {
      if (this.progressBar) {
        this.progressBar.style.width = "0%";
      }
      if (this.progressText) {
        this.progressText.textContent = "Ready to download";
      }
      if (this.statusAlert) {
        this.statusAlert.style.display = "none";
        this.statusAlert.className = "downloader-alert";
      }
      if (this.downloadBtn) {
        this.downloadBtn.disabled = false;
        this.downloadBtn.innerHTML = "<span>Start Download</span>";
      }
      if (this.nameInput && !this.isDownloading) {
        this.nameInput.value = "";
      }
    }

    updateProgress(percent, received, total) {
      const pct = typeof percent === "number" && !isNaN(percent) ? Math.min(100, Math.max(0, percent)) : 0;
      if (this.progressBar) {
        this.progressBar.style.width = `${pct}%`;
      }
      if (this.progressText) {
        const rec = typeof received === "number" && !isNaN(received) ? received : 0;
        const tot = typeof total === "number" && !isNaN(total) ? total : 0;
        const receivedMb = (rec / (1024 * 1024)).toFixed(2);
        const totalMb = tot > 0 ? (tot / (1024 * 1024)).toFixed(2) : "?";
        this.progressText.textContent = `${pct}% (${receivedMb} MB / ${totalMb} MB)`;
      }
    }

    async handleDownload() {
      const url = this.urlInput ? this.urlInput.value.trim() : "";
      if (!url) {
        this.showError("Please enter a valid URL.");
        return;
      }

      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch (e) {
        this.showError("Invalid URL format. Make sure it starts with http:// or https://");
        return;
      }

      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        this.showError("Invalid URL protocol. Only http:// and https:// URLs are supported.");
        return;
      }

      this.isDownloading = true;
      if (this.downloadBtn) {
        this.downloadBtn.disabled = true;
        this.downloadBtn.innerHTML = "<span>Downloading...</span>";
      }
      if (this.statusAlert) {
        this.statusAlert.style.display = "none";
      }
      this.updateProgress(0, 0, 0);

      try {
        if (this.isElectron && window.electronAPI) {
          const preferredName = this.nameInput && this.nameInput.value.trim() ? this.nameInput.value.trim() : "";
          const result = await window.electronAPI.downloadFile(url, "songs", preferredName);

          if (!result || !result.success) {
            throw new Error(result ? result.error : "Download failed on disk.");
          }

          let imported = null;
          // If downloaded file is JSON, validate and import into map storage
          if (result.filePath && result.filePath.toLowerCase().endsWith(".json")) {
            const fileData = await window.electronAPI.readTextFile(result.filePath);
            if (fileData && fileData.success && fileData.content) {
              if (this.mapStorage) {
                const parsed = JSON.parse(fileData.content);
                const importFn = this.mapStorage.importTrackAsync || this.mapStorage.importSongAsync || this.mapStorage.importTrack;
                if (typeof importFn === "function") {
                  imported = await importFn.call(this.mapStorage, parsed);
                }
              }
            }
          }

          const songName = imported && imported.name ? imported.name : (result.fileName || "Song");
          this.showSuccess(`Download complete! Saved to ${result.fileName || songName}`);
          if (this.soundManager && typeof this.soundManager.playTestTone === "function") {
            this.soundManager.playTestTone();
          }

          // Refresh Play Menu if open
          if (window.playMenu && typeof window.playMenu.updateSongs === "function") {
            const allMaps = this.mapStorage && typeof this.mapStorage.getAllMaps === "function" ? this.mapStorage.getAllMaps() : [];
            window.playMenu.updateSongs(allMaps);
            if (imported && imported.id && typeof window.playMenu.selectSongById === "function") {
              window.playMenu.selectSongById(imported.id, true, true);
            }
          }
        } else {
          // Web fallback: fetch via browser
          if (this.progressText) {
            this.progressText.textContent = "Fetching via web...";
          }
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

          const text = await response.text();
          let imported = null;
          if (this.mapStorage) {
            const parsed = JSON.parse(text);
            const importFn = this.mapStorage.importTrackAsync || this.mapStorage.importSongAsync || this.mapStorage.importTrack;
            if (typeof importFn === "function") {
              imported = await importFn.call(this.mapStorage, parsed);
            }
          }

          const songName = imported && imported.name ? imported.name : "Song";
          this.showSuccess(`Track successfully downloaded and imported: ${songName}`);
          if (this.soundManager && typeof this.soundManager.playTestTone === "function") {
            this.soundManager.playTestTone();
          }

          if (window.playMenu && typeof window.playMenu.updateSongs === "function") {
            const allMaps = this.mapStorage && typeof this.mapStorage.getAllMaps === "function" ? this.mapStorage.getAllMaps() : [];
            window.playMenu.updateSongs(allMaps);
            if (imported && imported.id && typeof window.playMenu.selectSongById === "function") {
              window.playMenu.selectSongById(imported.id, true, true);
            }
          }
        }
      } catch (err) {
        this.showError(`Download failed: ${err.message}`);
      } finally {
        this.isDownloading = false;
        if (this.downloadBtn) {
          this.downloadBtn.disabled = false;
          this.downloadBtn.innerHTML = "<span>Start Download</span>";
        }
      }
    }

    showError(msg) {
      if (!this.statusAlert) return;
      this.statusAlert.textContent = `⚠ ${msg}`;
      this.statusAlert.className = "downloader-alert downloader-alert-error";
      this.statusAlert.style.display = "block";
    }

    showSuccess(msg) {
      if (!this.statusAlert) return;
      this.statusAlert.textContent = `✓ ${msg}`;
      this.statusAlert.className = "downloader-alert downloader-alert-success";
      this.statusAlert.style.display = "block";
    }
  }

  if (typeof window !== "undefined") {
    window.ModDownloader = ModDownloader;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = ModDownloader;
  }
})();

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
      this.mapStorage = mapStorage || window.mapStorage;
      this.soundManager = soundManager || window.soundManager;
      this.isElectron = typeof window !== "undefined" && Boolean(window.electronAPI && window.electronAPI.isElectron);

      this.modal = document.getElementById("downloader-modal");
      this.urlInput = document.getElementById("downloader-url-input");
      this.nameInput = document.getElementById("downloader-name-input");
      this.downloadBtn = document.getElementById("btn-start-download");
      this.cancelBtn = document.getElementById("btn-close-downloader");
      this.openFolderBtn = document.getElementById("btn-downloader-open-folder");
      this.progressBar = document.getElementById("downloader-progress-bar");
      this.progressText = document.getElementById("downloader-progress-text");
      this.statusAlert = document.getElementById("downloader-status-alert");

      this.isDownloading = false;
      this.bindEvents();
    }

    init() {
      // Setup progress listener from Electron main process
      if (this.isElectron && window.electronAPI && typeof window.electronAPI.onDownloadProgress === "function") {
        window.electronAPI.onDownloadProgress((progress) => {
          this.updateProgress(progress.percent, progress.receivedBytes, progress.totalBytes);
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
          if (this.isElectron && window.electronAPI) {
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
      if (this.soundManager) this.soundManager.playClick();
    }

    close() {
      if (this.isDownloading) {
        if (!confirm("A download is currently in progress. Cancel and close?")) return;
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
    }

    updateProgress(percent, received, total) {
      if (this.progressBar) {
        this.progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
      }
      if (this.progressText) {
        const receivedMb = (received / (1024 * 1024)).toFixed(2);
        const totalMb = total > 0 ? (total / (1024 * 1024)).toFixed(2) : "?";
        this.progressText.textContent = `${percent}% (${receivedMb} MB / ${totalMb} MB)`;
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

          // If downloaded file is JSON, validate and add to game tracks!
          if (result.filePath && result.filePath.toLowerCase().endsWith(".json")) {
            const fileData = await window.electronAPI.readTextFile(result.filePath);
            if (fileData && fileData.success && fileData.content) {
              if (this.mapStorage && typeof this.mapStorage.importSongAsync === "function") {
                const parsed = JSON.parse(fileData.content);
                await this.mapStorage.importSongAsync(parsed);
              }
            }
          }

          this.showSuccess(`Download complete! Saved to ${result.fileName}`);
          if (this.soundManager) this.soundManager.playTestTone();

          // Refresh Play Menu if open
          if (window.playMenu && typeof window.playMenu.updateSongs === "function") {
            window.playMenu.updateSongs(this.mapStorage ? this.mapStorage.getAllMaps() : []);
          }
        } else {
          // Web fallback: fetch via browser
          this.progressText.textContent = "Fetching via web...";
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

          const text = await response.text();
          let imported = null;
          if (this.mapStorage && typeof this.mapStorage.importSongAsync === "function") {
            const parsed = JSON.parse(text);
            imported = await this.mapStorage.importSongAsync(parsed);
          }

          this.showSuccess(`Track successfully downloaded and imported: ${imported ? imported.name : "Song"}`);
          if (this.soundManager) this.soundManager.playTestTone();

          if (window.playMenu && typeof window.playMenu.updateSongs === "function") {
            window.playMenu.updateSongs(this.mapStorage.getAllMaps());
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

  window.ModDownloader = ModDownloader;
})();

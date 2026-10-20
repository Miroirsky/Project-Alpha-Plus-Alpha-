/**
 * @file createMenu.js
 * @description Manages the Create Menu view with a hierarchical song management system.
 * Songs are displayed as parent entries with song-level metadata & parameters,
 * expandable to reveal difficulty tracks with [Edit] and [Parameters] actions,
 * and a "+ Add New Difficulty Track" action allowing any custom string as a difficulty name.
 */

class CreateMenu {
  /**
   * @param {Object} dependencies
   * @param {MapStorage} dependencies.mapStorage
   * @param {SoundManager} dependencies.soundManager
   * @param {Function} dependencies.onEditMap
   */
  constructor({ mapStorage, soundManager, onEditMap = null }) {
    this.mapStorage = mapStorage;
    this.soundManager = soundManager;
    this.onEditMap = onEditMap;

    // View Elements
    this.view = document.getElementById("create-menu-view");
    this.mainMenuCard = document.getElementById("main-menu-card");
    this.backBtn = document.getElementById("btn-back-create");
    this.mapsListContainer = document.getElementById("create-maps-list");

    // Track which song IDs are currently expanded in the tree view
    this.expandedSongIds = new Set();
    this.hasInitializedExpanded = false;

    // New Map Creation Form Elements
    this.form = document.getElementById("new-map-form");
    this.nameInput = document.getElementById("new-map-name");
    this.mapperInput = document.getElementById("new-map-mapper");
    this.creatorInput = document.getElementById("new-map-creator");
    this.difficultyInput = document.getElementById("new-map-difficulty");
    this.fileInput = document.getElementById("new-map-file");
    this.presetSelect = document.getElementById("new-map-preset-audio");
    this.fileStatusEl = document.getElementById("new-map-file-status");

    // Creation Artwork Picker Elements
    this.artworkGallery = document.getElementById("create-artwork-gallery");
    this.artworkFileInput = document.getElementById("new-map-artwork-file");
    this.artworkStatusEl = document.getElementById("new-map-artwork-status");
    this.artworkPreviewImg = document.getElementById("new-map-artwork-preview");
    this.artworkPreviewTitle = document.getElementById("new-map-artwork-title");
    this.selectedArtwork = "Assets/Tracks Placeholders/Default-0.png";

    // Import Modal Elements
    this.importBtn = document.getElementById("btn-create-import");
    this.importModal = document.getElementById("import-modal");
    this.closeImportBtn = document.getElementById("btn-close-import");
    this.cancelImportBtn = document.getElementById("btn-cancel-import");
    this.confirmImportBtn = document.getElementById("btn-confirm-import");
    this.importCodeArea = document.getElementById("import-code-area");
    this.importErrorBanner = document.getElementById("import-error-banner");
    this.importFileInput = document.getElementById("import-file-input");
    this.importFileStatusEl = document.getElementById("import-file-status");

    // Export Modal Elements
    this.exportModal = document.getElementById("export-modal");
    this.closeExportBtn = document.getElementById("btn-close-export");
    this.copyExportBtn = document.getElementById("btn-copy-export-code");
    this.downloadExportBtn = document.getElementById("btn-download-export-json");
    this.exportCodeArea = document.getElementById("export-code-area");
    this.exportTrackName = document.getElementById("export-track-name");
    this.exportTrackNotes = document.getElementById("export-track-notes");
    this.exportTrackDuration = document.getElementById("export-track-duration");
    this.exportTrackNps = document.getElementById("export-track-nps");
    this.exportFeedback = document.getElementById("export-copy-feedback");
    this.lastExportData = null;

    // Add Difficulty Modal Elements
    this.addDiffModal = document.getElementById("create-add-diff-modal");
    this.addDiffForm = document.getElementById("create-add-diff-form");
    this.addDiffSongTitle = document.getElementById("create-add-diff-song-title");
    this.addDiffPresetChips = document.getElementById("create-diff-preset-chips");
    this.addDiffNameInput = document.getElementById("create-new-diff-name");
    this.addDiffCopySelect = document.getElementById("create-diff-copy-source-select");
    this.closeAddDiffBtn = document.getElementById("btn-close-create-add-diff");
    this.cancelAddDiffBtn = document.getElementById("btn-cancel-create-add-diff");
    this.activeAddDiffSong = null;

    // Difficulty Parameters Modal Elements
    this.diffParamsModal = document.getElementById("create-diff-params-modal");
    this.diffParamsForm = document.getElementById("create-diff-params-form");
    this.diffParamsSubtitle = document.getElementById("create-diff-params-subtitle");
    this.diffParamNameInput = document.getElementById("create-diff-param-name");
    this.diffParamColorInput = document.getElementById("create-diff-param-color");
    this.diffSwatchGroup = document.getElementById("create-diff-swatch-group");
    this.diffStatsNotes = document.getElementById("create-diff-stats-notes");
    this.diffStatsNps = document.getElementById("create-diff-stats-nps");
    this.diffStatsScore = document.getElementById("create-diff-stats-score");
    this.closeDiffParamsBtn = document.getElementById("btn-close-create-diff-params");
    this.cancelDiffParamsBtn = document.getElementById("btn-cancel-create-diff-params");
    this.activeParamSong = null;
    this.activeParamDiffName = null;

    // Song Parameters Modal Elements
    this.songParamsModal = document.getElementById("create-song-params-modal");
    this.songParamsForm = document.getElementById("create-song-params-form");
    this.songParamBadge = document.getElementById("create-song-params-badge");
    this.songParamNameInput = document.getElementById("create-song-param-name");
    this.songParamMapperInput = document.getElementById("create-song-param-mapper");
    this.songParamCreatorInput = document.getElementById("create-song-param-creator");
    this.songArtworkGallery = document.getElementById("create-song-artwork-gallery");
    this.songArtworkFileInput = document.getElementById("create-song-artwork-file");
    this.songArtworkStatusEl = document.getElementById("create-song-artwork-status");
    this.songArtworkPreviewImg = document.getElementById("create-song-artwork-preview");
    this.songArtworkPreviewTitle = document.getElementById("create-song-artwork-title");
    this.songBgFileInput = document.getElementById("create-song-bg-file");
    this.songBgFitSelect = document.getElementById("create-song-bg-fit");
    this.songBgOpacityInput = document.getElementById("create-song-bg-opacity");
    this.songBgOpacityVal = document.getElementById("create-song-bg-opacity-val");
    this.songBgRemoveBtn = document.getElementById("btn-create-song-bg-remove");
    this.songBgStatusEl = document.getElementById("create-song-bg-status");
    this.songBgPreviewImg = document.getElementById("create-song-bg-preview-img");
    this.songBgPreviewVideo = document.getElementById("create-song-bg-preview-video");
    this.songBgPreviewEmpty = document.getElementById("create-song-bg-preview-empty");
    this.songBgPreviewTitle = document.getElementById("create-song-bg-preview-title");
    this.songBgPreviewBadge = document.getElementById("create-song-bg-preview-badge");
    this.closeSongParamsBtn = document.getElementById("btn-close-create-song-params");
    this.cancelSongParamsBtn = document.getElementById("btn-cancel-create-song-params");
    this.activeSongParam = null;
    this.selectedSongArtwork = "Assets/Tracks Placeholders/Default-0.png";
    this.songParamBgConfig = null;

    this.importedFileUrl = null;
    this.importedDuration = 180;
  }

  /**
   * Initializes the Create Menu view and binds events.
   */
  init() {
    this.bindEvents();
    this.bindAddDiffModalEvents();
    this.bindDiffParamsModalEvents();
    this.bindSongParamsModalEvents();
    this.renderMapsList();

    if (this.mapStorage) {
      this.mapStorage.onChange(() => {
        this.renderMapsList();
      });
    }
  }

  /**
   * Binds general view events.
   */
  bindEvents() {
    // Back to main menu
    if (this.backBtn) {
      this.backBtn.addEventListener("click", () => {
        if (this.soundManager) this.soundManager.playClick();
        this.close();
      });
    }

    // Audio file input listener
    if (this.fileInput) {
      this.fileInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          if (this.importedFileUrl) {
            URL.revokeObjectURL(this.importedFileUrl);
          }
          this.importedFileUrl = URL.createObjectURL(file);
          if (this.fileStatusEl) {
            this.fileStatusEl.textContent = `Selected: ${file.name}`;
          }

          // Measure audio length
          const tempAudio = new Audio(this.importedFileUrl);
          tempAudio.addEventListener("loadedmetadata", () => {
            if (tempAudio.duration) {
              this.importedDuration = Math.round(tempAudio.duration);
            }
          });
        }
      });
    }

    // Preset audio dropdown
    if (this.presetSelect) {
      this.presetSelect.addEventListener("change", (e) => {
        if (e.target.value) {
          if (this.fileInput) this.fileInput.value = "";
          this.importedFileUrl = null;
          if (this.fileStatusEl) {
            this.fileStatusEl.textContent = `Using preset: ${e.target.selectedOptions[0].text}`;
          }
        }
      });
    }

    // Preset artwork gallery buttons for creation form
    if (this.artworkGallery) {
      const thumbs = this.artworkGallery.querySelectorAll(".artwork-gallery-thumb");
      thumbs.forEach((btn) => {
        btn.addEventListener("click", () => {
          const artworkPath = btn.getAttribute("data-artwork");
          if (artworkPath) {
            this.setArtwork(artworkPath, btn.getAttribute("title") || "Preset Artwork");
            thumbs.forEach((b) => b.classList.remove("is-active"));
            btn.classList.add("is-active");
            if (this.artworkStatusEl) {
              this.artworkStatusEl.textContent = "Using preset artwork";
            }
            if (this.soundManager) this.soundManager.playClick();
          }
        });
      });
    }

    // Custom artwork file upload listener for creation form
    if (this.artworkFileInput) {
      this.artworkFileInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            const dataUrl = evt.target.result;
            this.setArtwork(dataUrl, `Custom: ${file.name}`);
            if (this.artworkStatusEl) {
              this.artworkStatusEl.textContent = `Custom: ${file.name}`;
            }
            if (this.artworkGallery) {
              const thumbs = this.artworkGallery.querySelectorAll(".artwork-gallery-thumb");
              thumbs.forEach((b) => b.classList.remove("is-active"));
            }
            if (this.soundManager) this.soundManager.playClick();
          };
          reader.readAsDataURL(file);
        }
      });
    }

    // Form submission
    if (this.form) {
      this.form.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleCreateMap();
      });
    }

    // Import Modal listeners
    if (this.importBtn) {
      this.importBtn.addEventListener("click", () => {
        this.openImportModal();
      });
    }

    if (this.closeImportBtn) {
      this.closeImportBtn.addEventListener("click", () => {
        this.closeImportModal();
      });
    }

    if (this.cancelImportBtn) {
      this.cancelImportBtn.addEventListener("click", () => {
        this.closeImportModal();
      });
    }

    if (this.confirmImportBtn) {
      this.confirmImportBtn.addEventListener("click", () => {
        this.confirmImport();
      });
    }

    // File upload in import modal
    if (this.importFileInput) {
      this.importFileInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            if (this.importCodeArea) {
              this.importCodeArea.value = evt.target.result;
            }
            if (this.importFileStatusEl) {
              this.importFileStatusEl.textContent = `Loaded file: ${file.name}`;
            }
          };
          reader.readAsText(file);
        }
      });
    }

    // Export Modal listeners
    if (this.closeExportBtn) {
      this.closeExportBtn.addEventListener("click", () => {
        this.closeExportModal();
      });
    }

    if (this.copyExportBtn) {
      this.copyExportBtn.addEventListener("click", () => {
        this.copyExportCode();
      });
    }

    if (this.downloadExportBtn) {
      this.downloadExportBtn.addEventListener("click", () => {
        this.downloadExportFile();
      });
    }

    if (this.exportModal) {
      this.exportModal.addEventListener("click", (e) => {
        if (e.target === this.exportModal) {
          this.closeExportModal();
        }
      });
    }
  }

  /**
   * Binds Add Difficulty modal events.
   */
  bindAddDiffModalEvents() {
    if (this.closeAddDiffBtn) {
      this.closeAddDiffBtn.addEventListener("click", () => this.closeAddDiffModal());
    }
    if (this.cancelAddDiffBtn) {
      this.cancelAddDiffBtn.addEventListener("click", () => this.closeAddDiffModal());
    }
    if (this.addDiffModal) {
      this.addDiffModal.addEventListener("click", (e) => {
        if (e.target === this.addDiffModal) this.closeAddDiffModal();
      });
    }

    // Preset chip buttons
    if (this.addDiffPresetChips) {
      this.addDiffPresetChips.addEventListener("click", (e) => {
        const chip = e.target.closest(".chip-btn");
        if (chip && this.addDiffNameInput) {
          const diff = chip.getAttribute("data-diff");
          if (diff) {
            this.addDiffNameInput.value = diff;
            this.addDiffPresetChips.querySelectorAll(".chip-btn").forEach((c) => c.classList.remove("is-selected"));
            chip.classList.add("is-selected");
            this.addDiffNameInput.focus();
            if (this.soundManager) this.soundManager.playClick();
          }
        }
      });
    }

    if (this.addDiffNameInput) {
      this.addDiffNameInput.addEventListener("input", () => {
        if (this.addDiffPresetChips) {
          const val = this.addDiffNameInput.value.trim().toLowerCase();
          this.addDiffPresetChips.querySelectorAll(".chip-btn").forEach((c) => {
            const chipDiff = (c.getAttribute("data-diff") || "").toLowerCase();
            c.classList.toggle("is-selected", chipDiff === val);
          });
        }
      });
    }

    // Radio change toggles copy source dropdown
    if (this.addDiffForm) {
      const radios = this.addDiffForm.querySelectorAll('input[name="create-diff-source"]');
      radios.forEach((radio) => {
        radio.addEventListener("change", () => {
          if (this.addDiffCopySelect) {
            this.addDiffCopySelect.style.display = radio.value === "copy" && radio.checked ? "block" : "none";
          }
        });
      });

      this.addDiffForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleConfirmAddDiff();
      });
    }
  }

  /**
   * Binds Difficulty Parameters modal events.
   */
  bindDiffParamsModalEvents() {
    if (this.closeDiffParamsBtn) {
      this.closeDiffParamsBtn.addEventListener("click", () => this.closeDiffParamsModal());
    }
    if (this.cancelDiffParamsBtn) {
      this.cancelDiffParamsBtn.addEventListener("click", () => this.closeDiffParamsModal());
    }
    if (this.diffParamsModal) {
      this.diffParamsModal.addEventListener("click", (e) => {
        if (e.target === this.diffParamsModal) this.closeDiffParamsModal();
      });
    }

    // Color swatch click listener
    if (this.diffSwatchGroup) {
      this.diffSwatchGroup.addEventListener("click", (e) => {
        const swatch = e.target.closest(".swatch-btn");
        if (swatch && this.diffParamColorInput) {
          const color = swatch.getAttribute("data-color");
          if (color) {
            this.diffParamColorInput.value = color;
            this.diffSwatchGroup.querySelectorAll(".swatch-btn").forEach((s) => s.classList.remove("is-active"));
            swatch.classList.add("is-active");
            if (this.soundManager) this.soundManager.playClick();
          }
        }
      });
    }

    if (this.diffParamsForm) {
      this.diffParamsForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleSaveDiffParams();
      });
    }
  }

  /**
   * Binds Song Parameters modal events.
   */
  bindSongParamsModalEvents() {
    if (this.closeSongParamsBtn) {
      this.closeSongParamsBtn.addEventListener("click", () => this.closeSongParamsModal());
    }
    if (this.cancelSongParamsBtn) {
      this.cancelSongParamsBtn.addEventListener("click", () => this.closeSongParamsModal());
    }
    if (this.songParamsModal) {
      this.songParamsModal.addEventListener("click", (e) => {
        if (e.target === this.songParamsModal) this.closeSongParamsModal();
      });
    }

    // Artwork gallery buttons in song parameters modal
    if (this.songArtworkGallery) {
      this.songArtworkGallery.addEventListener("click", (e) => {
        const thumb = e.target.closest(".artwork-gallery-thumb");
        if (thumb) {
          const artworkPath = thumb.getAttribute("data-artwork");
          if (artworkPath) {
            this.setSongArtwork(artworkPath, thumb.getAttribute("title") || "Preset Artwork");
            this.songArtworkGallery.querySelectorAll(".artwork-gallery-thumb").forEach((b) => b.classList.remove("is-active"));
            thumb.classList.add("is-active");
            if (this.songArtworkStatusEl) {
              this.songArtworkStatusEl.textContent = "Using preset artwork";
            }
            if (this.soundManager) this.soundManager.playClick();
          }
        }
      });
    }

    // Custom artwork upload in song parameters modal
    if (this.songArtworkFileInput) {
      this.songArtworkFileInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            const dataUrl = evt.target.result;
            this.setSongArtwork(dataUrl, `Custom: ${file.name}`);
            if (this.songArtworkStatusEl) {
              this.songArtworkStatusEl.textContent = `Custom: ${file.name}`;
            }
            if (this.songArtworkGallery) {
              this.songArtworkGallery.querySelectorAll(".artwork-gallery-thumb").forEach((b) => b.classList.remove("is-active"));
            }
            if (this.soundManager) this.soundManager.playClick();
          };
          reader.readAsDataURL(file);
        }
      });
    }

    // Arena Background media upload listener
    if (this.songBgFileInput) {
      this.songBgFileInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          this.handleSongBgUpload(file);
        }
      });
    }

    // Arena Background fit mode
    if (this.songBgFitSelect) {
      this.songBgFitSelect.addEventListener("change", (e) => {
        if (this.songParamBgConfig) {
          this.songParamBgConfig.fit = e.target.value;
        }
      });
    }

    // Arena Background opacity slider
    if (this.songBgOpacityInput) {
      this.songBgOpacityInput.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        if (this.songBgOpacityVal) {
          this.songBgOpacityVal.textContent = `${Math.round(val * 100)}%`;
        }
        if (this.songParamBgConfig) {
          this.songParamBgConfig.opacity = val;
        }
      });
    }

    // Remove background button
    if (this.songBgRemoveBtn) {
      this.songBgRemoveBtn.addEventListener("click", () => {
        if (confirm("Remove custom arena background and restore default grid?")) {
          if (this.songParamBgConfig && this.songParamBgConfig.mediaId && window.MediaStorage) {
            window.MediaStorage.deleteBackgroundMedia(this.songParamBgConfig.mediaId);
          }
          this.songParamBgConfig = null;
          this.updateSongBgPreview(null);
          if (this.soundManager) this.soundManager.playClick();
        }
      });
    }

    // Song Parameters submission
    if (this.songParamsForm) {
      this.songParamsForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleSaveSongParams();
      });
    }
  }

  /**
   * Opens the Import Track modal dialog.
   */
  openImportModal() {
    if (this.importCodeArea) this.importCodeArea.value = "";
    if (this.importFileInput) this.importFileInput.value = "";
    if (this.importFileStatusEl) this.importFileStatusEl.textContent = "No file chosen";
    if (this.importErrorBanner) {
      this.importErrorBanner.textContent = "";
      this.importErrorBanner.style.display = "none";
    }
    if (this.importModal) {
      this.importModal.classList.add("is-active");
      this.importModal.setAttribute("aria-hidden", "false");
    }
    if (this.soundManager) this.soundManager.playClick();
  }

  /**
   * Closes the Import Track modal dialog.
   */
  closeImportModal() {
    if (this.importModal) {
      this.importModal.classList.remove("is-active");
      this.importModal.setAttribute("aria-hidden", "true");
    }
    if (this.soundManager) this.soundManager.playClick();
  }

  /**
   * Validates and imports the track code or song JSON into storage.
   * Merges with existing songs to avoid duplicates and preserves high scores.
   */
  confirmImport() {
    if (!this.importCodeArea || !this.mapStorage) return;

    const rawCode = this.importCodeArea.value.trim();
    const result = this.mapStorage.validateAndParseTrackCode(rawCode);

    if (!result.valid) {
      if (this.importErrorBanner) {
        this.importErrorBanner.textContent = `⚠ ${result.error || "Invalid song file or code."}`;
        this.importErrorBanner.style.display = "block";
      }
      return;
    }

    try {
      const importedMap = this.mapStorage.importTrack(result.song || result.track);
      this.closeImportModal();
      this.expandedSongIds.add(importedMap.id);
      this.renderMapsList();

      if (this.soundManager) this.soundManager.playTestTone();

      // Launch editor with imported track immediately!
      if (typeof this.onEditMap === "function") {
        this.hide();
        this.onEditMap(importedMap);
      }
    } catch (err) {
      if (this.importErrorBanner) {
        this.importErrorBanner.textContent = `⚠ Import failed: ${err.message}`;
        this.importErrorBanner.style.display = "block";
      }
    }
  }

  /**
   * Opens the Export Song modal for the entire song package.
   * @param {Object} song
   */
  openExportSong(song) {
    if (!song || !this.mapStorage) return;

    try {
      const exportResult = this.mapStorage.exportTrack(song);
      this.lastExportData = exportResult;

      const diffKeys = Object.keys(song.difficulties || {});
      if (this.exportTrackName) this.exportTrackName.textContent = song.name || "Untitled Song";
      if (this.exportTrackNps) this.exportTrackNps.textContent = `${diffKeys.length} Track${diffKeys.length === 1 ? "" : "s"}`;
      if (this.exportTrackNotes) this.exportTrackNotes.textContent = `${exportResult.totalNotes} note${exportResult.totalNotes === 1 ? "" : "s"} (${diffKeys.join(", ")})`;
      if (this.exportTrackDuration) this.exportTrackDuration.textContent = song.duration || "03:00";
      if (this.exportCodeArea) this.exportCodeArea.value = exportResult.code;
      if (this.exportFeedback) this.exportFeedback.style.display = "none";

      if (this.exportModal) {
        this.exportModal.classList.add("is-active");
        this.exportModal.setAttribute("aria-hidden", "false");
      }
      if (this.soundManager) this.soundManager.playClick();
    } catch (err) {
      alert("Failed to export song: " + err.message);
    }
  }

  /**
   * Closes the Export Song modal.
   */
  closeExportModal() {
    if (this.exportModal) {
      this.exportModal.classList.remove("is-active");
      this.exportModal.setAttribute("aria-hidden", "true");
    }
    if (this.soundManager) this.soundManager.playClick();
  }

  /**
   * Copies the exported song code to clipboard.
   */
  copyExportCode() {
    if (!this.exportCodeArea || !this.exportCodeArea.value) return;
    const code = this.exportCodeArea.value;
    const notifySuccess = () => {
      if (this.exportFeedback) {
        this.exportFeedback.textContent = "Copied to clipboard! ✓";
        this.exportFeedback.style.display = "inline-block";
        clearTimeout(this._copyTimeout);
        this._copyTimeout = setTimeout(() => {
          if (this.exportFeedback) this.exportFeedback.style.display = "none";
        }, 2800);
      }
      if (this.soundManager) this.soundManager.playClick();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(notifySuccess).catch(() => {
        this.exportCodeArea.select();
        document.execCommand("copy");
        notifySuccess();
      });
    } else {
      this.exportCodeArea.select();
      document.execCommand("copy");
      notifySuccess();
    }
  }

  /**
   * Downloads the exported song package as a .json file for the Default Tracks folder.
   */
  downloadExportFile() {
    if (!this.lastExportData || !this.lastExportData.json) return;
    try {
      const blob = new Blob([this.lastExportData.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const filename = this.lastExportData.filename || "song.json";
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (this.soundManager) this.soundManager.playClick();
    } catch (e) {
      console.warn("Download failed:", e);
    }
  }

  /**
   * Updates the selected artwork source and preview element for new map form.
   * @param {string} src
   * @param {string} title
   */
  setArtwork(src, title = "") {
    this.selectedArtwork = src;
    if (this.artworkPreviewImg) {
      this.artworkPreviewImg.src = src;
    }
    if (this.artworkPreviewTitle) {
      this.artworkPreviewTitle.textContent = title || "Selected Artwork";
    }
  }

  /**
   * Handles creation of a new map with custom initial difficulty string.
   */
  handleCreateMap() {
    const name = this.nameInput ? this.nameInput.value.trim() : "";
    const mapper = this.mapperInput ? this.mapperInput.value.trim() : "";
    const creator = this.creatorInput ? this.creatorInput.value.trim() : "";
    const difficulty = (this.difficultyInput ? this.difficultyInput.value.trim() : "") || "Normal";

    if (!name) {
      alert("Please provide a name for your map.");
      return;
    }

    let audioSource = this.importedFileUrl;
    let durationSeconds = this.importedDuration || 180;

    // If no custom file was uploaded, check preset dropdown
    if (!audioSource && this.presetSelect && this.presetSelect.value) {
      audioSource = this.presetSelect.value;
      const option = this.presetSelect.selectedOptions[0];
      const dur = option.getAttribute("data-duration");
      if (dur) durationSeconds = parseInt(dur, 10);
    }

    // Fallback to default project track if nothing selected
    if (!audioSource) {
      audioSource = "Assets/Songs/IMG_2449.mp3";
      durationSeconds = 229;
    }

    const m = Math.floor(durationSeconds / 60);
    const s = Math.floor(durationSeconds % 60);
    const durationFormatted = `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;

    if (this.mapStorage) {
      const newMap = this.mapStorage.createMap({
        name,
        mapper: mapper || "Anonymous",
        creator: creator || "Unknown Artist",
        file: audioSource,
        duration: durationFormatted,
        durationSeconds,
        cover: this.selectedArtwork || "Assets/Tracks Placeholders/Default-0.png",
        difficulty
      });

      if (this.soundManager) this.soundManager.playClick();

      // Ensure new song is expanded in tree
      this.expandedSongIds.add(newMap.id);

      // Reset form fields
      if (this.nameInput) this.nameInput.value = "";
      if (this.mapperInput) this.mapperInput.value = "";
      if (this.creatorInput) this.creatorInput.value = "";
      if (this.difficultyInput) this.difficultyInput.value = "Normal";
      if (this.fileInput) this.fileInput.value = "";
      if (this.fileStatusEl) this.fileStatusEl.textContent = "";

      // Open new map in MapEditor
      if (typeof this.onEditMap === "function") {
        this.hide();
        this.onEditMap(newMap, difficulty);
      }
    }
  }

  /**
   * Renders the hierarchical song management tree in #create-maps-list.
   * Format:
   * SongName — Mapper — Notes — Parameters
   * ├── Easy       [Edit] [Parameters]
   * ├── Skibidi    [Edit] [Parameters]
   * ├── Difficult  [Edit] [Parameters]
   * └── + Add New Difficulty Track
   */
  renderMapsList() {
    if (!this.mapsListContainer || !this.mapStorage) return;

    this.mapsListContainer.innerHTML = "";

    const allMaps = this.mapStorage.getAllMaps();

    if (allMaps.length === 0) {
      this.mapsListContainer.innerHTML = `
        <div class="empty-maps-notice">
          No maps found. Create a new map to start mapping notes!
        </div>
      `;
      return;
    }

    // On initial load, expand all songs by default so user immediately sees all difficulty tracks
    if (!this.hasInitializedExpanded) {
      allMaps.forEach((m) => this.expandedSongIds.add(m.id));
      this.hasInitializedExpanded = true;
    }

    allMaps.forEach((map) => {
      const card = document.createElement("article");
      card.className = "song-tree-card";
      card.setAttribute("data-song-id", map.id);

      const songDiffs = this.mapStorage.getSongDifficulties(map) || map.difficulties || {};
      const diffKeys = Object.keys(songDiffs);
      const isExpanded = this.expandedSongIds.has(map.id);
      const coverUrl = map.cover || map.image || map.artwork || "Assets/Tracks Placeholders/Default-0.png";

      // Compute total notes across all difficulties
      let totalNotes = 0;
      diffKeys.forEach((key) => {
        const d = songDiffs[key];
        if (d && Array.isArray(d.notes)) {
          totalNotes += d.notes.length;
        }
      });
      if (totalNotes === 0 && Array.isArray(map.notes)) {
        totalNotes = map.notes.length;
      }

      // Build parent header row:
      // SongName — Mapper — Notes — Parameters
      const parentRow = document.createElement("div");
      parentRow.className = "song-tree-parent";
      parentRow.innerHTML = `
        <button class="song-toggle-btn" type="button" aria-label="Toggle difficulty tracks" title="${isExpanded ? "Collapse Tracks" : "Expand Tracks"}">
          <span class="toggle-icon">${isExpanded ? "▼" : "▶"}</span>
        </button>
        <div class="map-card-thumb" style="background-image: url('${coverUrl}');"></div>
        <div class="song-parent-info">
          <div class="song-parent-header">
            <span class="song-name">${map.name}</span>
            ${map.isCustom ? '<span class="map-tag-custom">Custom</span>' : '<span class="map-tag-default">Default</span>'}
          </div>
          <div class="song-parent-meta">
            <span>Mapper: <strong>${map.mapper || "Anonymous"}</strong></span>
            <span>&bull;</span>
            <span>Artist: <strong>${map.creator || "Unknown Artist"}</strong></span>
            <span>&bull;</span>
            <span>Total Notes: <strong>${totalNotes}</strong></span>
            <span>&bull;</span>
            <span>Tracks: <strong>${diffKeys.length}</strong></span>
          </div>
        </div>
        <div class="song-parent-actions">
          <button class="btn-song-export" type="button" aria-label="Export ${map.name}" title="Export entire song and all difficulty tracks">
            <span class="export-icon">📤</span>
            <span>Export</span>
          </button>
          <button class="btn-song-params" type="button" aria-label="Song Parameters" title="Song metadata and global arena background">
            <span class="param-icon">⚙</span>
            <span>Parameters</span>
          </button>
          ${
            map.isCustom
              ? `<button class="btn-map-delete btn-song-delete" type="button" aria-label="Delete song ${map.name}" title="Delete song">&times;</button>`
              : ""
          }
        </div>
      `;

      // Toggle expand / collapse listener
      const toggleBtn = parentRow.querySelector(".song-toggle-btn");
      const toggleAction = () => {
        if (this.expandedSongIds.has(map.id)) {
          this.expandedSongIds.delete(map.id);
        } else {
          this.expandedSongIds.add(map.id);
        }
        if (this.soundManager) this.soundManager.playClick();
        this.renderMapsList();
      };
      if (toggleBtn) {
        toggleBtn.addEventListener("click", toggleAction);
      }

      // Song Export button listener
      const exportSongBtn = parentRow.querySelector(".btn-song-export");
      if (exportSongBtn) {
        exportSongBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.openExportSong(map);
        });
      }

      // Song Parameters button listener
      const songParamsBtn = parentRow.querySelector(".btn-song-params");
      if (songParamsBtn) {
        songParamsBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.openSongParams(map);
        });
      }

      // Delete Song button listener
      const songDelBtn = parentRow.querySelector(".btn-song-delete");
      if (songDelBtn) {
        songDelBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (confirm(`Delete custom song "${map.name}" and all its difficulty tracks?`)) {
            if (this.soundManager) this.soundManager.playClick();
            this.mapStorage.deleteMap(map.id);
          }
        });
      }

      card.appendChild(parentRow);

      // Children Container (Difficulty tracks)
      const childrenContainer = document.createElement("div");
      childrenContainer.className = `song-tree-children ${isExpanded ? "is-expanded" : "is-collapsed"}`;

      if (isExpanded) {
        diffKeys.forEach((diffName) => {
          const diffData = songDiffs[diffName] || {};
          const noteCount = (diffData.notes && diffData.notes.length) || 0;
          const nps = typeof diffData.nps === "number" ? diffData.nps : 0;
          const diffColor = diffData.color || map.color || "#00d4ff";
          const canDelete = diffKeys.length > 1;

          const diffRow = document.createElement("div");
          diffRow.className = "difficulty-tree-row";
          diffRow.setAttribute("data-diff-name", diffName);

          diffRow.innerHTML = `
            <span class="tree-branch-symbol" aria-hidden="true">├──</span>
            <span class="diff-color-dot" style="background-color: ${diffColor};" title="Theme: ${diffColor}"></span>
            <div class="diff-row-info">
              <span class="diff-row-name">${diffName}</span>
              <span class="diff-row-stats">${noteCount} Notes &bull; ${nps.toFixed(1)} NPS</span>
            </div>
            <div class="diff-row-actions">
              <button class="btn-diff-action btn-diff-edit" type="button" aria-label="Edit ${diffName} in Map Editor" title="Edit ${diffName} map">
                <span class="play-icon">&#9654;</span>
                <span>Edit</span>
              </button>
              <button class="btn-diff-action btn-diff-params" type="button" aria-label="Parameters for ${diffName}" title="Difficulty settings & rename">
                <span class="param-icon">⚙</span>
                <span>Parameters</span>
              </button>
              ${
                canDelete
                  ? `<button class="btn-diff-action btn-diff-delete" type="button" aria-label="Delete difficulty track ${diffName}" title="Delete difficulty track">&times;</button>`
                  : ""
              }
            </div>
          `;

          // Edit difficulty button
          const editBtn = diffRow.querySelector(".btn-diff-edit");
          if (editBtn) {
            editBtn.addEventListener("click", () => {
              if (this.soundManager) this.soundManager.playClick();
              this.hide();
              if (typeof this.onEditMap === "function") {
                this.onEditMap(map, diffName);
              }
            });
          }

          // Difficulty Parameters button
          const diffParamsBtn = diffRow.querySelector(".btn-diff-params");
          if (diffParamsBtn) {
            diffParamsBtn.addEventListener("click", () => {
              this.openDiffParams(map, diffName);
            });
          }

          // Delete difficulty button
          const delDiffBtn = diffRow.querySelector(".btn-diff-delete");
          if (delDiffBtn) {
            delDiffBtn.addEventListener("click", () => {
              if (confirm(`Delete difficulty track "${diffName}" from "${map.name}"?`)) {
                if (this.soundManager) this.soundManager.playClick();
                this.mapStorage.deleteDifficulty(map.id, diffName);
              }
            });
          }

          childrenContainer.appendChild(diffRow);
        });

        // + Add New Difficulty Track Row
        const addRow = document.createElement("div");
        addRow.className = "difficulty-tree-add-row";
        addRow.innerHTML = `
          <span class="tree-branch-symbol" aria-hidden="true">└──</span>
          <button class="btn-add-diff-track" type="button" aria-label="Add New Difficulty Track to ${map.name}">
            <span class="add-plus-icon">+</span>
            <span>Add New Difficulty Track</span>
          </button>
        `;

        const addDiffBtn = addRow.querySelector(".btn-add-diff-track");
        if (addDiffBtn) {
          addDiffBtn.addEventListener("click", () => {
            this.openAddDiffModal(map);
          });
        }

        childrenContainer.appendChild(addRow);
      }

      card.appendChild(childrenContainer);
      this.mapsListContainer.appendChild(card);
    });
  }

  // =========================================================================
  // Add Difficulty Modal Handlers
  // =========================================================================

  /**
   * Opens the Add Difficulty modal for a song.
   * @param {Object} song
   */
  openAddDiffModal(song) {
    if (!song) return;
    this.activeAddDiffSong = song;

    if (this.addDiffSongTitle) {
      this.addDiffSongTitle.textContent = `Adding track to: "${song.name}"`;
    }
    if (this.addDiffNameInput) {
      this.addDiffNameInput.value = "";
    }
    if (this.addDiffPresetChips) {
      this.addDiffPresetChips.querySelectorAll(".chip-btn").forEach((c) => c.classList.remove("is-selected"));
    }

    // Populate copy source dropdown with song's existing difficulties
    if (this.addDiffCopySelect) {
      this.addDiffCopySelect.innerHTML = "";
      const diffs = this.mapStorage.getSongDifficulties(song) || song.difficulties || {};
      Object.keys(diffs).forEach((key) => {
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = `${key} (${(diffs[key].notes && diffs[key].notes.length) || 0} notes)`;
        this.addDiffCopySelect.appendChild(opt);
      });
      this.addDiffCopySelect.style.display = "none";
    }

    // Reset radio selection to 'empty'
    if (this.addDiffForm) {
      const emptyRadio = this.addDiffForm.querySelector('input[name="create-diff-source"][value="empty"]');
      if (emptyRadio) emptyRadio.checked = true;
    }

    if (this.addDiffModal) {
      this.addDiffModal.classList.add("is-active");
      this.addDiffModal.setAttribute("aria-hidden", "false");
    }
    if (this.soundManager) this.soundManager.playClick();
  }

  /**
   * Closes the Add Difficulty modal.
   */
  closeAddDiffModal() {
    if (this.addDiffModal) {
      this.addDiffModal.classList.remove("is-active");
      this.addDiffModal.setAttribute("aria-hidden", "true");
    }
    this.activeAddDiffSong = null;
    if (this.soundManager) this.soundManager.playClick();
  }

  /**
   * Confirms adding a new difficulty track under the active song.
   */
  handleConfirmAddDiff() {
    if (!this.activeAddDiffSong || !this.mapStorage) return;

    const rawName = this.addDiffNameInput ? this.addDiffNameInput.value.trim() : "";
    if (!rawName) {
      alert("Please enter a difficulty name.");
      return;
    }

    const song = this.activeAddDiffSong;
    const diffs = this.mapStorage.getSongDifficulties(song) || song.difficulties || {};

    // Check for duplicate difficulty name (case-insensitive check)
    const exists = Object.keys(diffs).some((k) => k.toLowerCase() === rawName.toLowerCase());
    if (exists) {
      alert(`Difficulty "${rawName}" already exists for this song. Please choose a different name.`);
      return;
    }

    let initialNotes = [];
    const copyRadio = this.addDiffForm ? this.addDiffForm.querySelector('input[name="create-diff-source"][value="copy"]') : null;
    if (copyRadio && copyRadio.checked && this.addDiffCopySelect && this.addDiffCopySelect.value) {
      const srcDiff = diffs[this.addDiffCopySelect.value];
      if (srcDiff && Array.isArray(srcDiff.notes)) {
        initialNotes = this.mapStorage.cloneNotes(srcDiff.notes);
      }
    }

    const durationSec = Number(song.durationSeconds || song.duration) || 180;
    const nps = this.mapStorage.computeNps(initialNotes, durationSec);

    // Save difficulty track under the same song ID
    if (!song.difficulties) song.difficulties = {};
    song.difficulties[rawName] = {
      difficulty: rawName,
      notes: initialNotes,
      nps,
      color: song.color || "#00d4ff"
    };

    const savedSong = this.mapStorage.saveMap(song);
    this.expandedSongIds.add(savedSong.id);
    this.closeAddDiffModal();
    this.renderMapsList();

    if (this.soundManager) this.soundManager.playClick();

    // Directly open MapEditor on the newly created difficulty track
    if (typeof this.onEditMap === "function") {
      this.hide();
      this.onEditMap(savedSong, rawName);
    }
  }

  // =========================================================================
  // Difficulty Parameters Modal Handlers
  // =========================================================================

  /**
   * Opens Difficulty Parameters modal for a given song and difficulty track.
   * @param {Object} song
   * @param {string} diffName
   */
  openDiffParams(song, diffName) {
    if (!song || !diffName) return;
    this.activeParamSong = song;
    this.activeParamDiffName = diffName;

    const diffs = this.mapStorage.getSongDifficulties(song) || song.difficulties || {};
    const diffData = diffs[diffName] || {};

    if (this.diffParamsSubtitle) {
      this.diffParamsSubtitle.textContent = `Song: "${song.name}"`;
    }
    if (this.diffParamNameInput) {
      this.diffParamNameInput.value = diffName;
    }
    const color = diffData.color || song.color || "#00d4ff";
    if (this.diffParamColorInput) {
      this.diffParamColorInput.value = color;
    }

    // Highlight matching swatch
    if (this.diffSwatchGroup) {
      const swatches = this.diffSwatchGroup.querySelectorAll(".swatch-btn");
      swatches.forEach((s) => {
        if (s.getAttribute("data-color") === color) {
          s.classList.add("is-active");
        } else {
          s.classList.remove("is-active");
        }
      });
    }

    // Display statistics
    const noteCount = (diffData.notes && diffData.notes.length) || 0;
    const nps = typeof diffData.nps === "number" ? diffData.nps : 0;
    const highscore = this.mapStorage.getBestScore(song.id, diffName);

    if (this.diffStatsNotes) this.diffStatsNotes.textContent = noteCount;
    if (this.diffStatsNps) this.diffStatsNps.textContent = nps.toFixed(1);
    if (this.diffStatsScore) this.diffStatsScore.textContent = highscore.toLocaleString();

    if (this.diffParamsModal) {
      this.diffParamsModal.classList.add("is-active");
      this.diffParamsModal.setAttribute("aria-hidden", "false");
    }
    if (this.soundManager) this.soundManager.playClick();
  }

  /**
   * Closes Difficulty Parameters modal.
   */
  closeDiffParamsModal() {
    if (this.diffParamsModal) {
      this.diffParamsModal.classList.remove("is-active");
      this.diffParamsModal.setAttribute("aria-hidden", "true");
    }
    this.activeParamSong = null;
    this.activeParamDiffName = null;
    if (this.soundManager) this.soundManager.playClick();
  }

  /**
   * Saves updated difficulty parameters (name, color).
   */
  handleSaveDiffParams() {
    if (!this.activeParamSong || !this.activeParamDiffName || !this.mapStorage) return;

    const song = this.activeParamSong;
    const oldDiff = this.activeParamDiffName;
    const newDiff = (this.diffParamNameInput ? this.diffParamNameInput.value.trim() : "") || oldDiff;
    const newColor = this.diffParamColorInput ? this.diffParamColorInput.value : "#00d4ff";

    const diffs = this.mapStorage.getSongDifficulties(song) || song.difficulties || {};

    // If renaming difficulty, check collision with other difficulties in the same song
    if (newDiff !== oldDiff) {
      const collision = Object.keys(diffs).some((k) => k !== oldDiff && k.toLowerCase() === newDiff.toLowerCase());
      if (collision) {
        alert(`A difficulty named "${newDiff}" already exists for this song. Please choose a different name.`);
        return;
      }

      // Rename key in difficulties dictionary
      const existingData = diffs[oldDiff] || { notes: [], nps: 0 };
      existingData.difficulty = newDiff;
      existingData.color = newColor;
      diffs[newDiff] = existingData;
      delete diffs[oldDiff];

      // Update active difficulty pointer if matching
      if (song.difficulty === oldDiff) song.difficulty = newDiff;
      if (song.selectedDifficulty === oldDiff) song.selectedDifficulty = newDiff;

      // Transfer high score key if present
      const oldScoreKey = `${song.id}#${oldDiff.toLowerCase()}`;
      const newScoreKey = `${song.id}#${newDiff.toLowerCase()}`;
      if (this.mapStorage.highscores && typeof this.mapStorage.highscores[oldScoreKey] === "number") {
        this.mapStorage.highscores[newScoreKey] = this.mapStorage.highscores[oldScoreKey];
        delete this.mapStorage.highscores[oldScoreKey];
        this.mapStorage.saveHighScoresToStorage();
      }
    } else {
      if (diffs[oldDiff]) {
        diffs[oldDiff].color = newColor;
      }
    }

    song.difficulties = diffs;
    this.mapStorage.saveMap(song);
    this.closeDiffParamsModal();
    this.renderMapsList();

    if (this.soundManager) this.soundManager.playClick();
  }

  // =========================================================================
  // Song Parameters Modal Handlers (Song-level metadata & Arena Background)
  // =========================================================================

  /**
   * Opens Song Parameters modal for a given song.
   * @param {Object} song
   */
  openSongParams(song) {
    if (!song) return;
    this.activeSongParam = song;

    if (this.songParamBadge) {
      this.songParamBadge.textContent = song.isCustom ? "Custom Song" : "Default Track";
      this.songParamBadge.className = `track-type-badge ${song.isCustom ? "" : "is-default"}`;
    }
    if (this.songParamNameInput) {
      this.songParamNameInput.value = song.name || "";
    }
    if (this.songParamMapperInput) {
      this.songParamMapperInput.value = song.mapper || "";
    }
    if (this.songParamCreatorInput) {
      this.songParamCreatorInput.value = song.creator || "";
    }

    // Cover Artwork Setup
    const currentArtwork = song.cover || song.image || song.artwork || "Assets/Tracks Placeholders/Default-0.png";
    this.setSongArtwork(currentArtwork, "Current Artwork");

    if (this.songArtworkGallery) {
      const thumbs = this.songArtworkGallery.querySelectorAll(".artwork-gallery-thumb");
      thumbs.forEach((t) => {
        if (t.getAttribute("data-artwork") === currentArtwork) {
          t.classList.add("is-active");
        } else {
          t.classList.remove("is-active");
        }
      });
    }

    // Background Setup
    this.songParamBgConfig = song.background ? { ...song.background } : null;
    this.updateSongBgPreview(this.songParamBgConfig);

    if (this.songParamsModal) {
      this.songParamsModal.classList.add("is-active");
      this.songParamsModal.setAttribute("aria-hidden", "false");
    }
    if (this.soundManager) this.soundManager.playClick();
  }

  /**
   * Closes Song Parameters modal.
   */
  closeSongParamsModal() {
    if (this.songParamsModal) {
      this.songParamsModal.classList.remove("is-active");
      this.songParamsModal.setAttribute("aria-hidden", "true");
    }
    this.activeSongParam = null;
    this.songParamBgConfig = null;
    if (this.soundManager) this.soundManager.playClick();
  }

  /**
   * Sets cover artwork in song parameters modal.
   * @param {string} src
   * @param {string} title
   */
  setSongArtwork(src, title = "") {
    this.selectedSongArtwork = src;
    if (this.songArtworkPreviewImg) {
      this.songArtworkPreviewImg.src = src;
    }
    if (this.songArtworkPreviewTitle) {
      this.songArtworkPreviewTitle.textContent = title || "Selected Artwork";
    }
  }

  /**
   * Handles Arena Background upload in song parameters modal.
   * @param {File} file
   */
  handleSongBgUpload(file) {
    if (!file) return;

    const isVideo = file.type.startsWith("video/");
    const mediaKey = `bg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    if (window.MediaStorage) {
      window.MediaStorage.saveBackgroundMedia(mediaKey, file, {
        name: file.name,
        type: isVideo ? "video" : "image"
      });
    }

    const url = URL.createObjectURL(file);
    const fit = this.songBgFitSelect ? this.songBgFitSelect.value : "cover";
    const opacity = this.songBgOpacityInput ? parseFloat(this.songBgOpacityInput.value) : 0.7;

    this.songParamBgConfig = {
      mediaId: mediaKey,
      url,
      type: isVideo ? "video" : "image",
      name: file.name,
      fit,
      opacity
    };

    this.updateSongBgPreview(this.songParamBgConfig);
    if (this.soundManager) this.soundManager.playClick();
  }

  /**
   * Updates arena background preview in song parameters modal.
   * @param {Object|null} bg
   */
  updateSongBgPreview(bg) {
    if (!bg) {
      if (this.songBgStatusEl) this.songBgStatusEl.textContent = "Default Arena Grid (No custom background)";
      if (this.songBgPreviewImg) this.songBgPreviewImg.style.display = "none";
      if (this.songBgPreviewVideo) this.songBgPreviewVideo.style.display = "none";
      if (this.songBgPreviewEmpty) this.songBgPreviewEmpty.style.display = "flex";
      if (this.songBgPreviewTitle) this.songBgPreviewTitle.textContent = "Default Arena Grid";
      if (this.songBgPreviewBadge) this.songBgPreviewBadge.textContent = "No Custom Media";
      if (this.songBgRemoveBtn) this.songBgRemoveBtn.style.display = "none";
      return;
    }

    if (this.songBgRemoveBtn) this.songBgRemoveBtn.style.display = "inline-flex";
    if (this.songBgStatusEl) {
      this.songBgStatusEl.textContent = `Active: ${bg.name || "Background Media"}`;
    }
    if (this.songBgPreviewTitle) {
      this.songBgPreviewTitle.textContent = bg.name || (bg.type === "video" ? "Custom Video" : "Custom Image");
    }
    if (this.songBgPreviewBadge) {
      this.songBgPreviewBadge.textContent = bg.type === "video" ? "Video Background" : "Image Background";
    }

    if (this.songBgFitSelect && bg.fit) {
      this.songBgFitSelect.value = bg.fit;
    }
    if (this.songBgOpacityInput && typeof bg.opacity === "number") {
      this.songBgOpacityInput.value = bg.opacity;
      if (this.songBgOpacityVal) {
        this.songBgOpacityVal.textContent = `${Math.round(bg.opacity * 100)}%`;
      }
    }

    if (bg.type === "video") {
      if (this.songBgPreviewImg) this.songBgPreviewImg.style.display = "none";
      if (this.songBgPreviewVideo) {
        this.songBgPreviewVideo.src = bg.url || "";
        this.songBgPreviewVideo.style.display = "block";
      }
      if (this.songBgPreviewEmpty) this.songBgPreviewEmpty.style.display = "none";
    } else {
      if (this.songBgPreviewVideo) this.songBgPreviewVideo.style.display = "none";
      if (this.songBgPreviewImg) {
        this.songBgPreviewImg.src = bg.url || "";
        this.songBgPreviewImg.style.display = "block";
      }
      if (this.songBgPreviewEmpty) this.songBgPreviewEmpty.style.display = "none";
    }
  }

  /**
   * Saves updated song-level parameters and arena background.
   */
  handleSaveSongParams() {
    if (!this.activeSongParam || !this.mapStorage) return;

    const song = this.activeSongParam;
    const name = this.songParamNameInput ? this.songParamNameInput.value.trim() : "";
    const mapper = this.songParamMapperInput ? this.songParamMapperInput.value.trim() : "";
    const creator = this.songParamCreatorInput ? this.songParamCreatorInput.value.trim() : "";

    if (!name) {
      alert("Please provide a song name.");
      return;
    }

    song.name = name;
    song.mapper = mapper || "Anonymous";
    song.creator = creator || "Unknown Artist";
    if (this.selectedSongArtwork) {
      song.cover = this.selectedSongArtwork;
    }
    if (this.songParamBgConfig) {
      song.background = { ...this.songParamBgConfig };
    } else {
      song.background = null;
    }

    const savedSong = this.mapStorage.saveMap(song);
    this.closeSongParamsModal();
    this.expandedSongIds.add(savedSong.id);
    this.renderMapsList();

    if (this.soundManager) this.soundManager.playClick();
  }

  // =========================================================================
  // Visibility & State
  // =========================================================================

  /**
   * Opens the Create Menu and hides the main menu.
   */
  open() {
    if (this.mainMenuCard) {
      this.mainMenuCard.style.display = "none";
    }
    this.renderMapsList();
    if (this.view) {
      this.view.classList.add("is-active");
      this.view.setAttribute("aria-hidden", "false");
    }
  }

  /**
   * Closes the Create Menu and returns to main menu.
   */
  close() {
    if (this.view) {
      this.view.classList.remove("is-active");
      this.view.setAttribute("aria-hidden", "true");
    }
    if (this.mainMenuCard) {
      this.mainMenuCard.style.display = "";
    }
  }

  /**
   * Hides the view (e.g. when opening the MapEditor).
   */
  hide() {
    if (this.view) {
      this.view.classList.remove("is-active");
      this.view.setAttribute("aria-hidden", "true");
    }
  }

  /**
   * Checks if Create Menu is currently open.
   * @returns {boolean}
   */
  isOpen() {
    return this.view ? this.view.classList.contains("is-active") : false;
  }
}

// Expose to window and module
if (typeof window !== "undefined") {
  window.CreateMenu = CreateMenu;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = CreateMenu;
}

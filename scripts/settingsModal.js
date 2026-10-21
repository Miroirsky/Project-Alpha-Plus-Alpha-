/**
 * @file settingsModal.js
 * @description Manages the Settings dialog, binding sound controls, theme selections,
 * window fullscreen controls, local save slot management, and file explorer folder actions.
 */

class SettingsModal {
  /**
   * @param {Object} dependencies
   * @param {SoundManager} dependencies.soundManager
   * @param {ThemeManager} dependencies.themeManager
   */
  constructor({ soundManager, themeManager }) {
    this.soundManager = soundManager;
    this.themeManager = themeManager;
    this.isElectron = typeof window !== "undefined" && Boolean(window.electronAPI && window.electronAPI.isElectron);

    // DOM Elements
    this.backdrop = document.getElementById("settings-modal");
    this.closeBtn = document.getElementById("btn-close-settings");
    this.soundToggle = document.getElementById("sound-toggle");
    this.volumeSlider = document.getElementById("sound-volume");
    this.volumeLabel = document.getElementById("sound-volume-val");
    this.themeButtons = document.querySelectorAll(".theme-btn");

    // Display & Save Slots DOM Elements
    this.fullscreenToggle = document.getElementById("fullscreen-toggle");
    this.saveSlotSelect = document.getElementById("save-slot-select");
    this.statScore = document.getElementById("slot-stat-score");
    this.statNotes = document.getElementById("slot-stat-notes");
    this.statCleared = document.getElementById("slot-stat-cleared");
    this.btnSlotNew = document.getElementById("btn-slot-new");
    this.btnSlotRename = document.getElementById("btn-slot-rename");
    this.btnSlotExport = document.getElementById("btn-slot-export");
    this.btnSlotImport = document.getElementById("btn-slot-import");
    this.btnSlotDelete = document.getElementById("btn-slot-delete");

    // Local Folder Buttons
    this.btnOpenSaves = document.getElementById("btn-open-saves-dir");
    this.btnOpenSongs = document.getElementById("btn-open-songs-dir");
    this.btnOpenDefault = document.getElementById("btn-open-default-dir");
  }

  /**
   * Initializes modal listeners and sets initial control states.
   */
  init() {
    this.syncControls();
    this.syncSaveSlots();
    this.bindEvents();

    // Listen to SaveSystem changes
    if (window.saveSystem && typeof window.saveSystem.addListener === "function") {
      window.saveSystem.addListener(() => {
        this.syncSaveSlots();
      });
    }

    // Global F11 key shortcut for Fullscreen
    document.addEventListener("keydown", async (e) => {
      if (e.key === "F11") {
        e.preventDefault();
        await this.toggleFullscreen();
      }
    });
  }

  /**
   * Toggles fullscreen mode via Electron or browser API.
   */
  async toggleFullscreen() {
    if (this.isElectron && window.electronAPI) {
      const isFull = await window.electronAPI.toggleFullscreen();
      if (this.fullscreenToggle) {
        this.fullscreenToggle.checked = isFull;
      }
    } else {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        if (this.fullscreenToggle) this.fullscreenToggle.checked = true;
      } else {
        document.exitFullscreen().catch(() => {});
        if (this.fullscreenToggle) this.fullscreenToggle.checked = false;
      }
    }
  }

  /**
   * Syncs UI input controls with existing SoundManager and ThemeManager states.
   */
  async syncControls() {
    if (!this.soundManager || !this.themeManager) return;

    const isSoundEnabled = this.soundManager.isEnabled();
    const volume = this.soundManager.getVolume();
    const currentTheme = this.themeManager.getTheme();

    // Sound toggle
    if (this.soundToggle) {
      this.soundToggle.checked = isSoundEnabled;
    }

    // Volume slider & label
    if (this.volumeSlider) {
      this.volumeSlider.value = volume;
      this.volumeSlider.disabled = !isSoundEnabled;
    }
    if (this.volumeLabel) {
      this.volumeLabel.textContent = `${volume}%`;
    }

    // Theme selector buttons
    this.updateThemeButtons(currentTheme);

    // Fullscreen state
    if (this.fullscreenToggle) {
      if (this.isElectron && window.electronAPI) {
        const isFull = await window.electronAPI.isFullscreen();
        this.fullscreenToggle.checked = Boolean(isFull);
      } else {
        this.fullscreenToggle.checked = Boolean(document.fullscreenElement);
      }
    }

    this.syncSaveSlots();
  }

  /**
   * Syncs Save Slots selector dropdown and active statistics.
   */
  syncSaveSlots() {
    if (!window.saveSystem) return;

    const profiles = window.saveSystem.profiles || { slots: [], activeSlotId: "slot_1" };
    const currentSlot = window.saveSystem.currentSlotData || {};
    const stats = currentSlot.stats || {};

    // Update select options
    if (this.saveSlotSelect) {
      this.saveSlotSelect.innerHTML = "";
      profiles.slots.forEach((slot) => {
        const opt = document.createElement("option");
        opt.value = slot.id;
        opt.textContent = `${slot.name || slot.id} (Score: ${(slot.totalScore || 0).toLocaleString()})`;
        if (slot.id === window.saveSystem.activeSlotId) {
          opt.selected = true;
        }
        this.saveSlotSelect.appendChild(opt);
      });
    }

    // Update Stats Display
    if (this.statScore) {
      this.statScore.textContent = (stats.totalScore || 0).toLocaleString();
    }
    if (this.statNotes) {
      this.statNotes.textContent = (stats.totalNotesHit || 0).toLocaleString();
    }
    if (this.statCleared) {
      this.statCleared.textContent = (stats.tracksCompleted || 0).toLocaleString();
    }

    // Delete button disabled for slot_1
    if (this.btnSlotDelete) {
      this.btnSlotDelete.disabled = window.saveSystem.activeSlotId === "slot_1" || profiles.slots.length <= 1;
      this.btnSlotDelete.style.opacity = this.btnSlotDelete.disabled ? "0.4" : "1";
    }
  }

  /**
   * Updates active state classes on theme selector buttons.
   * @param {string} activeTheme
   */
  updateThemeButtons(activeTheme) {
    if (!this.themeButtons) return;
    const normalize = (t) => {
      if (!t) return "";
      const lower = t.toLowerCase();
      if (lower === "dark") return "terracotta";
      if (lower === "light") return "sage";
      return lower;
    };
    const currentNorm = normalize(activeTheme);
    this.themeButtons.forEach((btn) => {
      const theme = btn.getAttribute("data-theme");
      const btnNorm = normalize(theme);
      if (btnNorm === currentNorm) {
        btn.classList.add("is-active");
        btn.setAttribute("aria-pressed", "true");
      } else {
        btn.classList.remove("is-active");
        btn.setAttribute("aria-pressed", "false");
      }
    });
  }

  /**
   * Attaches event listeners for all controls in the modal.
   */
  bindEvents() {
    // Close button
    if (this.closeBtn) {
      this.closeBtn.addEventListener("click", () => {
        if (this.soundManager) this.soundManager.playClick();
        this.close();
      });
    }

    // Click outside backdrop to close
    if (this.backdrop) {
      this.backdrop.addEventListener("click", (e) => {
        if (e.target === this.backdrop) {
          this.close();
        }
      });
    }

    // Escape key listener
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isOpen()) {
        this.close();
      }
    });

    // Sound toggle change
    if (this.soundToggle) {
      this.soundToggle.addEventListener("change", (e) => {
        const enabled = e.target.checked;
        if (this.soundManager) {
          this.soundManager.setEnabled(enabled);
          if (enabled) {
            this.soundManager.playClick();
          }
        }
        if (this.volumeSlider) {
          this.volumeSlider.disabled = !enabled;
        }
        if (this.isElectron && window.electronAPI) {
          window.electronAPI.saveSettings({ soundEnabled: enabled });
        }
      });
    }

    // Volume slider input
    if (this.volumeSlider) {
      this.volumeSlider.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        if (this.soundManager) {
          this.soundManager.setVolume(val);
        }
        if (this.volumeLabel) {
          this.volumeLabel.textContent = `${val}%`;
        }
      });

      this.volumeSlider.addEventListener("change", () => {
        if (this.soundManager) {
          this.soundManager.playTestTone();
        }
        if (this.isElectron && window.electronAPI) {
          window.electronAPI.saveSettings({ soundVolume: parseInt(this.volumeSlider.value, 10) });
        }
      });
    }

    // Fullscreen toggle
    if (this.fullscreenToggle) {
      this.fullscreenToggle.addEventListener("change", async () => {
        if (this.soundManager) this.soundManager.playClick();
        await this.toggleFullscreen();
      });
    }

    // Theme buttons
    if (this.themeButtons) {
      this.themeButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const theme = btn.getAttribute("data-theme");
          if (theme && this.themeManager) {
            if (this.soundManager) this.soundManager.playClick();
            this.themeManager.setTheme(theme);
            this.updateThemeButtons(theme);
            if (this.isElectron && window.electronAPI) {
              window.electronAPI.saveSettings({ theme });
            }
          }
        });
      });
    }

    // Save Slot dropdown switch
    if (this.saveSlotSelect) {
      this.saveSlotSelect.addEventListener("change", async (e) => {
        const targetId = e.target.value;
        if (window.saveSystem && targetId) {
          if (this.soundManager) this.soundManager.playClick();
          await window.saveSystem.switchSlot(targetId);
          this.syncSaveSlots();
          if (window.playMenu && window.mapStorage) {
            window.playMenu.updateSongs(window.mapStorage.getAllMaps());
          }
        }
      });
    }

    // New Slot button
    if (this.btnSlotNew) {
      this.btnSlotNew.addEventListener("click", async () => {
        const name = prompt("Enter new Player / Profile name:", `Player ${(window.saveSystem ? window.saveSystem.profiles.slots.length : 1) + 1}`);
        if (name && name.trim()) {
          if (this.soundManager) this.soundManager.playClick();
          await window.saveSystem.createSlot(name.trim());
          this.syncSaveSlots();
          if (window.playMenu && window.mapStorage) {
            window.playMenu.updateSongs(window.mapStorage.getAllMaps());
          }
        }
      });
    }

    // Rename Slot button
    if (this.btnSlotRename) {
      this.btnSlotRename.addEventListener("click", async () => {
        if (!window.saveSystem) return;
        const currentName = window.saveSystem.currentSlotData ? window.saveSystem.currentSlotData.name : "Player";
        const newName = prompt("Rename active save profile:", currentName);
        if (newName && newName.trim() && newName.trim() !== currentName) {
          if (this.soundManager) this.soundManager.playClick();
          await window.saveSystem.renameSlot(window.saveSystem.activeSlotId, newName.trim());
          this.syncSaveSlots();
        }
      });
    }

    // Delete Slot button
    if (this.btnSlotDelete) {
      this.btnSlotDelete.addEventListener("click", async () => {
        if (!window.saveSystem) return;
        const slotName = window.saveSystem.currentSlotData ? window.saveSystem.currentSlotData.name : "this profile";
        if (confirm(`Are you sure you want to delete "${slotName}"? This cannot be undone.`)) {
          if (this.soundManager) this.soundManager.playClick();
          await window.saveSystem.deleteSlot(window.saveSystem.activeSlotId);
          this.syncSaveSlots();
          if (window.playMenu && window.mapStorage) {
            window.playMenu.updateSongs(window.mapStorage.getAllMaps());
          }
        }
      });
    }

    // Export Slot button
    if (this.btnSlotExport) {
      this.btnSlotExport.addEventListener("click", async () => {
        if (!window.saveSystem) return;
        if (this.soundManager) this.soundManager.playClick();
        const res = await window.saveSystem.exportSlot();
        if (res && res.success) {
          alert("Save slot successfully exported!");
        }
      });
    }

    // Import Slot button
    if (this.btnSlotImport) {
      this.btnSlotImport.addEventListener("click", async () => {
        if (!window.saveSystem) return;
        if (this.soundManager) this.soundManager.playClick();
        const res = await window.saveSystem.importSlot();
        if (res && res.success) {
          this.syncSaveSlots();
          if (window.playMenu && window.mapStorage) {
            window.playMenu.updateSongs(window.mapStorage.getAllMaps());
          }
          alert(`Successfully imported save slot: ${res.slotData.name}`);
        }
      });
    }

    // Folder Buttons (Explorer Native Actions)
    if (this.btnOpenSaves) {
      this.btnOpenSaves.addEventListener("click", () => {
        if (this.soundManager) this.soundManager.playClick();
        if (this.isElectron && window.electronAPI) {
          window.electronAPI.openFolder("saves");
        }
      });
    }

    if (this.btnOpenSongs) {
      this.btnOpenSongs.addEventListener("click", () => {
        if (this.soundManager) this.soundManager.playClick();
        if (this.isElectron && window.electronAPI) {
          window.electronAPI.openFolder("songs");
        }
      });
    }

    if (this.btnOpenDefault) {
      this.btnOpenDefault.addEventListener("click", () => {
        if (this.soundManager) this.soundManager.playClick();
        if (this.isElectron && window.electronAPI) {
          window.electronAPI.openFolder("default-tracks");
        }
      });
    }

    // Listen to external theme changes
    if (this.themeManager) {
      this.themeManager.onThemeChange((theme) => {
        this.updateThemeButtons(theme);
      });
    }
  }

  /**
   * Opens the settings modal.
   */
  open() {
    this.syncControls();
    if (this.backdrop) {
      this.backdrop.classList.add("is-active");
      this.backdrop.setAttribute("aria-hidden", "false");
    }
  }

  /**
   * Closes the settings modal.
   */
  close() {
    if (this.backdrop) {
      this.backdrop.classList.remove("is-active");
      this.backdrop.setAttribute("aria-hidden", "true");
    }
  }

  /**
   * Checks if modal is currently open.
   * @returns {boolean}
   */
  isOpen() {
    return this.backdrop ? this.backdrop.classList.contains("is-active") : false;
  }
}

// Expose to window
window.SettingsModal = SettingsModal;

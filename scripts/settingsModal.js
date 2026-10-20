/**
 * @file settingsModal.js
 * @description Manages the Settings dialog, binding sound controls and theme selections.
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

    // DOM Elements
    this.backdrop = document.getElementById("settings-modal");
    this.closeBtn = document.getElementById("btn-close-settings");
    this.soundToggle = document.getElementById("sound-toggle");
    this.volumeSlider = document.getElementById("sound-volume");
    this.volumeLabel = document.getElementById("sound-volume-val");
    this.themeButtons = document.querySelectorAll(".theme-btn");
  }

  /**
   * Initializes modal listeners and sets initial control states.
   */
  init() {
    this.syncControls();
    this.bindEvents();
  }

  /**
   * Syncs UI input controls with existing SoundManager and ThemeManager states.
   */
  syncControls() {
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

      // Play test tone on change completion
      this.volumeSlider.addEventListener("change", () => {
        if (this.soundManager) {
          this.soundManager.playTestTone();
        }
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
          }
        });
      });
    }

    // Listen to external theme changes if any
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

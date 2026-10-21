/**
 * @file exitHandler.js
 * @description Handles the Exit action: attempts to close the window via window.close()
 * and gracefully displays a fallback confirmation dialog if the browser prevents it.
 */

class ExitHandler {
  /**
   * @param {Object} dependencies
   * @param {SoundManager} dependencies.soundManager
   */
  constructor({ soundManager }) {
    this.soundManager = soundManager;
    this.exitModal = document.getElementById("exit-modal");
    this.returnBtn = document.getElementById("btn-return-menu");
    this.closeBtn = document.getElementById("btn-close-exit");
  }

  /**
   * Initializes event listeners for the exit fallback modal.
   */
  init() {
    if (this.returnBtn) {
      this.returnBtn.addEventListener("click", () => {
        if (this.soundManager) this.soundManager.playClick();
        this.hideFallback();
      });
    }

    if (this.closeBtn) {
      this.closeBtn.addEventListener("click", () => {
        if (this.soundManager) this.soundManager.playClick();
        this.hideFallback();
      });
    }

    if (this.exitModal) {
      this.exitModal.addEventListener("click", (e) => {
        if (e.target === this.exitModal) {
          this.hideFallback();
        }
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isFallbackVisible()) {
        this.hideFallback();
      }
    });
  }

  /**
   * Attempts to close the browser tab/window, falling back to an informative UI dialog.
   */
  handleExit() {
    if (this.soundManager) this.soundManager.playClick();

    if (window.electronAPI && typeof window.electronAPI.exitApp === "function") {
      window.electronAPI.exitApp();
      return;
    }

    // Attempt to close the window
    try {
      window.close();
    } catch (err) {
      console.warn("window.close() caught error:", err);
    }

    // Check if window is still open (browsers almost always block window.close()
    // unless the script itself opened the window via window.open)
    setTimeout(() => {
      if (!window.closed) {
        this.showFallback();
      }
    }, 100);
  }

  /**
   * Displays graceful fallback dialog when browser security restricts automatic tab closure.
   */
  showFallback() {
    if (this.exitModal) {
      this.exitModal.classList.add("is-active");
      this.exitModal.setAttribute("aria-hidden", "false");
    }
  }

  /**
   * Hides the exit fallback dialog.
   */
  hideFallback() {
    if (this.exitModal) {
      this.exitModal.classList.remove("is-active");
      this.exitModal.setAttribute("aria-hidden", "true");
    }
  }

  /**
   * Returns whether the fallback dialog is currently visible.
   * @returns {boolean}
   */
  isFallbackVisible() {
    return this.exitModal ? this.exitModal.classList.contains("is-active") : false;
  }
}

// Expose to window
window.ExitHandler = ExitHandler;

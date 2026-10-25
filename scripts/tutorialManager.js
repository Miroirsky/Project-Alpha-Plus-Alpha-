/**
 * @file tutorialManager.js
 * @description Manages the first-time player 30-second Quick Tutorial prompt and built-in 30s interactive tutorial track.
 */

const TUTORIAL_SEEN_STORAGE_KEY = "project_alpha_tutorial_prompt_seen";

class TutorialManager {
  /**
   * @param {Object} options
   * @param {SoundManager} [options.soundManager]
   * @param {Function} [options.onStartTutorial]
   */
  constructor({ soundManager = null, onStartTutorial = null } = {}) {
    this.soundManager = soundManager;
    this.onStartTutorial = onStartTutorial;

    this.modal = typeof document !== "undefined" ? document.getElementById("first-time-tutorial-modal") : null;
    this.btnStart = typeof document !== "undefined" ? document.getElementById("btn-start-first-tutorial") : null;
    this.btnSkip = typeof document !== "undefined" ? document.getElementById("btn-skip-first-tutorial") : null;
    this.btnClose = typeof document !== "undefined" ? document.getElementById("btn-close-first-tutorial") : null;
    this.btnReplaySettings = typeof document !== "undefined" ? document.getElementById("btn-replay-tutorial") : null;
    this._eventsBound = false;
  }

  /**
   * Returns a fresh copy of the 30-second built-in interactive Tutorial song.
   * @returns {Object}
   */
  static getTutorialSong() {
    const notes = [
      { time: 4.07, color: "blue", type: "normal", x: 0.494, y: 0.586 },
      { time: 7.57, color: "blue", type: "normal", x: 0.276, y: 0.579 },
      { time: 12.97, color: "red", type: "normal", x: 0.502, y: 0.587 },
      { time: 16.23, color: "red", type: "normal", x: 0.33, y: 0.601 },
      { time: 16.73, color: "red", type: "normal", x: 0.452, y: 0.612 },
      { time: 17.23, color: "blue", type: "normal", x: 0.422, y: 0.322 },
      { time: 22.67, color: "yellow", type: "triangle", x: 0.5, y: 0.585 },
      { time: 26.33, color: "red", type: "normal", x: 0.648, y: 0.543 },
      { time: 26.33, color: "yellow", type: "triangle", x: 0.486, y: 0.549 },
      { time: 26.91, color: "blue", type: "normal", x: 0.324, y: 0.55 },
      { time: 27.27, color: "blue", type: "normal", x: 0.347, y: 0.696 },
      { time: 27.57, color: "blue", type: "normal", x: 0.453, y: 0.793 },
      { time: 28.27, color: "red", type: "normal", x: 0.67, y: 0.635 }
    ];

    return {
      id: "builtin_tutorial_30s",
      name: "Quick Tutorial (30s)",
      mapper: "Miroirsky",
      creator: "Miroirsky",
      duration: "00:30",
      durationSeconds: 30,
      file: "Assets/Tutorial/track.mp3",
      cover: "Assets/Tutorial/cover.png",
      color: "#00d4ff",
      difficulty: "Easy",
      selectedDifficulty: "Easy",
      nps: 0.4,
      isTutorial: true,
      background: {
        type: "video",
        mediaType: "video",
        fit: "cover",
        opacity: 0.85,
        name: "Tutorial.mp4",
        url: "Tutorial.mp4"
      },
      notes: notes.map((n) => ({ ...n })),
      difficulties: {
        Easy: {
          difficulty: "Easy",
          nps: 0.4,
          color: "#00d4ff",
          notes: notes.map((n) => ({ ...n }))
        }
      }
    };
  }

  /**
   * Returns coaching hint text for the current timestamp during the 30-second tutorial.
   * @param {number} currentTime
   * @returns {{ step: string, text: string, accent: string } | null}
   */
  static getCoachingHint(currentTime) {
    if (currentTime < 0) return null;
    if (currentTime < 10.5) {
      return {
        step: "STEP 1 / 4 • BLUE NOTES",
        text: "Ensure your orb is BLUE [Right Click] and move your cursor over the Blue circles!",
        accent: "#00d4ff"
      };
    }
    if (currentTime < 19.5) {
      return {
        step: "STEP 2 / 4 • RED NOTES",
        text: "Switch to RED [Left Click] to hit Red circles, and back to BLUE [Right Click] for Blue!",
        accent: "#ff4757"
      };
    }
    if (currentTime < 25.0) {
      return {
        step: "STEP 3 / 4 • YELLOW BOMBS",
        text: "AVOID Yellow Triangle Bombs! Touching them costs points and breaks your combo!",
        accent: "#ffd32a"
      };
    }
    if (currentTime <= 30.0) {
      return {
        step: "STEP 4 / 4 • FINAL SEQUENCE",
        text: "Combine RED [Left Click] and BLUE [Right Click] while dodging the Yellow Bomb!",
        accent: "#2ed573"
      };
    }
    return null;
  }

  /**
   * Initializes button listeners.
   */
  init() {
    if (this._eventsBound) return;
    this._eventsBound = true;

    if (this.btnStart) {
      this.btnStart.addEventListener("click", async () => {
        if (this.soundManager && typeof this.soundManager.playClick === "function") {
          try { this.soundManager.playClick(); } catch (e) {}
        }
        await this.markPromptSeen();
        this.closePrompt();
        this.launchTutorial();
      });
    }

    const handleSkip = async () => {
      if (this.soundManager && typeof this.soundManager.playClick === "function") {
        try { this.soundManager.playClick(); } catch (e) {}
      }
      await this.markPromptSeen();
      this.closePrompt();
    };

    if (this.btnSkip) {
      this.btnSkip.addEventListener("click", handleSkip);
    }
    if (this.btnClose) {
      this.btnClose.addEventListener("click", handleSkip);
    }

    if (this.btnReplaySettings) {
      this.btnReplaySettings.addEventListener("click", () => {
        if (this.soundManager && typeof this.soundManager.playClick === "function") {
          try { this.soundManager.playClick(); } catch (e) {}
        }
        const settingsModal = document.getElementById("settings-modal");
        if (settingsModal) {
          settingsModal.classList.remove("is-active");
          settingsModal.setAttribute("aria-hidden", "true");
        }
        this.launchTutorial();
      });
    }
  }

  /**
   * Checks whether the current player is joining for the first time and hasn't been asked yet.
   * @returns {boolean}
   */
  shouldPromptFirstTime() {
    try {
      if (typeof localStorage !== "undefined") {
        if (localStorage.getItem(TUTORIAL_SEEN_STORAGE_KEY) === "true") {
          return false;
        }
      }
    } catch (e) {}

    if (typeof window !== "undefined" && window.saveSystem && window.saveSystem.currentSlotData) {
      const slot = window.saveSystem.currentSlotData;
      if (slot.tutorialPromptSeen === true) {
        return false;
      }
      const stats = slot.stats || {};
      const highscores = slot.highscores || {};
      const hasPlayedBefore =
        (stats.totalScore || 0) > 0 ||
        (stats.totalNotesHit || 0) > 0 ||
        (stats.tracksCompleted || 0) > 0 ||
        Object.keys(highscores).length > 0;

      if (hasPlayedBefore) {
        return false;
      }
    }

    return true;
  }

  /**
   * Checks and opens the first-time tutorial prompt modal if eligible.
   * @returns {boolean} true if modal was opened
   */
  checkAndPromptFirstTime() {
    if (!this.shouldPromptFirstTime()) {
      return false;
    }
    this.openPrompt();
    return true;
  }

  /**
   * Opens the first-time tutorial prompt modal.
   */
  openPrompt() {
    if (this.modal) {
      this.modal.classList.add("is-active");
      this.modal.setAttribute("aria-hidden", "false");
    }
  }

  /**
   * Closes the first-time tutorial prompt modal.
   */
  closePrompt() {
    if (this.modal) {
      this.modal.classList.remove("is-active");
      this.modal.setAttribute("aria-hidden", "true");
    }
  }

  /**
   * Marks the first-time tutorial prompt as seen in both localStorage and active save slot.
   */
  async markPromptSeen() {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(TUTORIAL_SEEN_STORAGE_KEY, "true");
      }
    } catch (e) {}

    if (typeof window !== "undefined" && window.saveSystem && window.saveSystem.currentSlotData) {
      window.saveSystem.currentSlotData.tutorialPromptSeen = true;
      if (typeof window.saveSystem.saveActiveSlot === "function") {
        try {
          await window.saveSystem.saveActiveSlot();
        } catch (e) {}
      }
    }
  }

  /**
   * Launches the 30-second interactive tutorial track.
   */
  launchTutorial() {
    if (typeof this.onStartTutorial === "function") {
      this.onStartTutorial(TutorialManager.getTutorialSong());
    }
  }
}

if (typeof window !== "undefined") {
  window.TutorialManager = TutorialManager;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = TutorialManager;
}

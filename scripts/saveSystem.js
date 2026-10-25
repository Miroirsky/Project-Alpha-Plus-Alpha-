/**
 * @file saveSystem.js
 * @description Centralized Local File Saving & Profiles System for Project Alpha Plus (Electron Standalone).
 * Persists player progress, save slots, scores, settings, and stats directly as local JSON files.
 */

(function () {
  const LOCAL_STORAGE_SLOT_KEY = "project_alpha_active_slot_id";
  const LOCAL_STORAGE_PROFILES_KEY = "project_alpha_save_profiles";
  const LOCAL_STORAGE_SLOTS_DATA_KEY = "project_alpha_slots_data";

  class SaveSystem {
    constructor() {
      this.isElectron = typeof window !== "undefined" && Boolean(window.electronAPI && window.electronAPI.isElectron);
      this.activeSlotId = "slot_1";
      this.profiles = {
        activeSlotId: "slot_1",
        slots: [
          {
            id: "slot_1",
            name: "Player 1",
            createdAt: Date.now(),
            lastPlayed: Date.now(),
            totalPlayTime: 0,
            totalNotesHit: 0,
            totalScore: 0,
            tracksCompleted: 0
          }
        ]
      };
      this.currentSlotData = {
        id: "slot_1",
        name: "Player 1",
        createdAt: Date.now(),
        lastPlayed: Date.now(),
        highscores: {},
        customMaps: [],
        stats: {
          totalPlayTime: 0,
          totalNotesHit: 0,
          totalScore: 0,
          tracksCompleted: 0
        }
      };
      this.listeners = new Set();
      this.initialized = false;
    }

    /**
     * Initializes the save system from local disk or browser fallback.
     */
    async init() {
      if (this.initialized) return;

      if (this.isElectron) {
        try {
          const profiles = await window.electronAPI.getProfiles();
          if (profiles && profiles.activeSlotId) {
            this.profiles = profiles;
            this.activeSlotId = profiles.activeSlotId;
          }
          const slotData = await window.electronAPI.loadSaveSlot(this.activeSlotId);
          if (slotData) {
            this.currentSlotData = slotData;
          }
        } catch (err) {
          console.warn("[SaveSystem] Electron save load error:", err);
          this.loadFallbackStorage();
        }
      } else {
        this.loadFallbackStorage();
      }

      // Check if we need to migrate existing legacy localStorage data into this slot
      this.migrateLegacyLocalStorage();

      this.initialized = true;
      this.notifyListeners("init");
    }

    /**
     * Fallback for browser environment using localStorage.
     */
    loadFallbackStorage() {
      try {
        const savedProfiles = localStorage.getItem(LOCAL_STORAGE_PROFILES_KEY);
        if (savedProfiles) {
          this.profiles = JSON.parse(savedProfiles);
          this.activeSlotId = this.profiles.activeSlotId || "slot_1";
        }
        const allSlots = JSON.parse(localStorage.getItem(LOCAL_STORAGE_SLOTS_DATA_KEY) || "{}");
        if (allSlots[this.activeSlotId]) {
          this.currentSlotData = allSlots[this.activeSlotId];
        }
      } catch (e) {
        console.warn("[SaveSystem] Fallback storage error:", e);
      }
    }

    /**
     * Saves fallback storage to localStorage.
     */
    saveFallbackStorage() {
      try {
        localStorage.setItem(LOCAL_STORAGE_PROFILES_KEY, JSON.stringify(this.profiles));
        const allSlots = JSON.parse(localStorage.getItem(LOCAL_STORAGE_SLOTS_DATA_KEY) || "{}");
        allSlots[this.activeSlotId] = this.currentSlotData;
        localStorage.setItem(LOCAL_STORAGE_SLOTS_DATA_KEY, JSON.stringify(allSlots));
      } catch (e) {
        console.warn("[SaveSystem] Fallback save error:", e);
      }
    }

    /**
     * Migrates legacy highscores and maps from localStorage into active slot if empty.
     */
    migrateLegacyLocalStorage() {
      if (!this.currentSlotData.highscores || Object.keys(this.currentSlotData.highscores).length === 0) {
        try {
          const oldScores = localStorage.getItem("project_alpha_highscores");
          if (oldScores) {
            const parsed = JSON.parse(oldScores);
            if (parsed && typeof parsed === "object") {
              this.currentSlotData.highscores = Object.assign({}, parsed);
              this.saveActiveSlot();
            }
          }
        } catch (e) {}
      }
    }

    /**
     * Persists active slot to disk and updates slot summary in profiles.
     */
    async saveActiveSlot() {
      if (!this.currentSlotData) return false;
      this.currentSlotData.lastPlayed = Date.now();

      // Ensure stats object exists
      if (!this.currentSlotData.stats) {
        this.currentSlotData.stats = {
          totalPlayTime: 0,
          totalNotesHit: 0,
          totalScore: 0,
          tracksCompleted: 0
        };
      }

      // Sync summary in profiles list
      const summary = this.profiles.slots.find((s) => s.id === this.activeSlotId);
      if (summary) {
        summary.name = this.currentSlotData.name;
        summary.lastPlayed = this.currentSlotData.lastPlayed;
        summary.totalPlayTime = this.currentSlotData.stats.totalPlayTime || 0;
        summary.totalNotesHit = this.currentSlotData.stats.totalNotesHit || 0;
        summary.totalScore = this.currentSlotData.stats.totalScore || 0;
        summary.tracksCompleted = this.currentSlotData.stats.tracksCompleted || 0;
      }

      if (this.isElectron) {
        try {
          await window.electronAPI.saveSaveSlot(this.activeSlotId, this.currentSlotData);
          return true;
        } catch (err) {
          console.error("[SaveSystem] Failed to save slot to disk:", err);
        }
      }

      this.saveFallbackStorage();
      return true;
    }

    /**
     * Switches active slot by ID and updates MapStorage state.
     * @param {string} slotId
     */
    async switchSlot(slotId) {
      if (!slotId || slotId === this.activeSlotId) return this.currentSlotData;

      if (this.isElectron) {
        try {
          await window.electronAPI.setActiveSlot(slotId);
          const slotData = await window.electronAPI.loadSaveSlot(slotId);
          this.activeSlotId = slotId;
          this.profiles.activeSlotId = slotId;
          this.currentSlotData = slotData || {
            id: slotId,
            name: `Slot ${slotId.replace("slot_", "")}`,
            createdAt: Date.now(),
            lastPlayed: Date.now(),
            highscores: {},
            customMaps: [],
            stats: { totalPlayTime: 0, totalNotesHit: 0, totalScore: 0, tracksCompleted: 0 }
          };
        } catch (err) {
          console.error("[SaveSystem] Failed to switch slot in Electron:", err);
        }
      } else {
        this.activeSlotId = slotId;
        this.profiles.activeSlotId = slotId;
        const allSlots = JSON.parse(localStorage.getItem(LOCAL_STORAGE_SLOTS_DATA_KEY) || "{}");
        this.currentSlotData = allSlots[slotId] || {
          id: slotId,
          name: `Slot ${slotId.replace("slot_", "")}`,
          createdAt: Date.now(),
          lastPlayed: Date.now(),
          highscores: {},
          customMaps: [],
          stats: { totalPlayTime: 0, totalNotesHit: 0, totalScore: 0, tracksCompleted: 0 }
        };
        this.saveFallbackStorage();
      }

      this.notifyListeners("slotSwitched");
      return this.currentSlotData;
    }

    /**
     * Creates a new save slot with a given name.
     * @param {string} name
     */
    async createSlot(name) {
      const slotName = (name || "").trim() || `Player ${this.profiles.slots.length + 1}`;
      if (this.isElectron) {
        try {
          const res = await window.electronAPI.createSaveSlot(slotName);
          if (res && res.slotId) {
            await this.switchSlot(res.slotId);
            return res.slotData;
          }
        } catch (err) {
          console.error("[SaveSystem] Failed to create slot in Electron:", err);
        }
      }

      // Fallback
      const slotId = `slot_${Date.now()}`;
      const newSlot = {
        id: slotId,
        name: slotName,
        createdAt: Date.now(),
        lastPlayed: Date.now(),
        highscores: {},
        customMaps: [],
        stats: { totalPlayTime: 0, totalNotesHit: 0, totalScore: 0, tracksCompleted: 0 }
      };
      this.profiles.slots.push({
        id: slotId,
        name: slotName,
        createdAt: newSlot.createdAt,
        lastPlayed: newSlot.lastPlayed,
        totalPlayTime: 0,
        totalNotesHit: 0,
        totalScore: 0,
        tracksCompleted: 0
      });
      this.currentSlotData = newSlot;
      this.activeSlotId = slotId;
      this.profiles.activeSlotId = slotId;
      this.saveFallbackStorage();
      this.notifyListeners("slotCreated");
      return newSlot;
    }

    /**
     * Renames a save slot.
     * @param {string} slotId
     * @param {string} newName
     */
    async renameSlot(slotId, newName) {
      const cleanName = (newName || "").trim();
      if (!cleanName) return;

      const summary = this.profiles.slots.find((s) => s.id === slotId);
      if (summary) summary.name = cleanName;

      if (slotId === this.activeSlotId) {
        this.currentSlotData.name = cleanName;
        await this.saveActiveSlot();
      } else if (this.isElectron) {
        try {
          const otherData = await window.electronAPI.loadSaveSlot(slotId);
          if (otherData) {
            otherData.name = cleanName;
            await window.electronAPI.saveSaveSlot(slotId, otherData);
          }
        } catch (e) {}
      }
      this.notifyListeners("slotRenamed");
    }

    /**
     * Deletes a save slot (cannot delete slot_1).
     * @param {string} slotId
     */
    async deleteSlot(slotId) {
      if (slotId === "slot_1" || this.profiles.slots.length <= 1) {
        return false;
      }

      if (this.isElectron) {
        try {
          await window.electronAPI.deleteSaveSlot(slotId);
          const profiles = await window.electronAPI.getProfiles();
          this.profiles = profiles;
          await this.switchSlot(profiles.activeSlotId || "slot_1");
          this.notifyListeners("slotDeleted");
          return true;
        } catch (err) {
          console.error("[SaveSystem] Delete slot failed:", err);
          return false;
        }
      }

      this.profiles.slots = this.profiles.slots.filter((s) => s.id !== slotId);
      if (this.activeSlotId === slotId) {
        this.activeSlotId = this.profiles.slots[0].id;
        this.profiles.activeSlotId = this.activeSlotId;
      }
      const allSlots = JSON.parse(localStorage.getItem(LOCAL_STORAGE_SLOTS_DATA_KEY) || "{}");
      delete allSlots[slotId];
      localStorage.setItem(LOCAL_STORAGE_SLOTS_DATA_KEY, JSON.stringify(allSlots));
      this.currentSlotData = allSlots[this.activeSlotId] || {
        id: this.activeSlotId,
        name: "Player 1",
        highscores: {},
        customMaps: [],
        stats: { totalPlayTime: 0, totalNotesHit: 0, totalScore: 0, tracksCompleted: 0 }
      };
      this.saveFallbackStorage();
      this.notifyListeners("slotDeleted");
      return true;
    }

    /**
     * Exports a save slot via native Windows Save dialog or download.
     * @param {string} slotId
     */
    async exportSlot(slotId) {
      const id = slotId || this.activeSlotId;
      let slotData = id === this.activeSlotId ? this.currentSlotData : null;

      if (!slotData && this.isElectron) {
        slotData = await window.electronAPI.loadSaveSlot(id);
      }
      if (!slotData) slotData = this.currentSlotData;

      const fileName = `alpha_save_${(slotData.name || id).replace(/[^a-zA-Z0-9_\-]/g, "_")}.json`;
      const jsonStr = JSON.stringify(slotData, null, 2);

      if (this.isElectron) {
        return await window.electronAPI.exportSongFile(fileName, jsonStr);
      } else {
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        return { success: true };
      }
    }

    /**
     * Imports a save slot from a local file via native Windows Open dialog.
     */
    async importSlot() {
      let content = null;
      let fileName = "imported_save";

      if (this.isElectron) {
        const res = await window.electronAPI.importSongFile();
        if (res.canceled || !res.content) return { canceled: true };
        content = res.content;
        fileName = res.fileName || fileName;
      } else {
        // Browser prompt fallback
        content = prompt("Paste Save Slot JSON content:");
        if (!content) return { canceled: true };
      }

      try {
        const parsed = JSON.parse(content);
        if (!parsed || typeof parsed !== "object") throw new Error("Invalid save file structure.");

        const slotId = `slot_${Date.now()}`;
        parsed.id = slotId;
        parsed.name = parsed.name ? `${parsed.name} (Imported)` : `Imported ${fileName.replace(/\.json$/i, "")}`;
        parsed.createdAt = parsed.createdAt || Date.now();
        parsed.lastPlayed = Date.now();
        if (!parsed.highscores) parsed.highscores = {};
        if (!parsed.stats) parsed.stats = { totalPlayTime: 0, totalNotesHit: 0, totalScore: 0, tracksCompleted: 0 };

        if (this.isElectron) {
          await window.electronAPI.saveSaveSlot(slotId, parsed);
          const profiles = await window.electronAPI.getProfiles();
          this.profiles = profiles;
        } else {
          this.profiles.slots.push({
            id: slotId,
            name: parsed.name,
            createdAt: parsed.createdAt,
            lastPlayed: parsed.lastPlayed,
            totalPlayTime: parsed.stats.totalPlayTime || 0,
            totalNotesHit: parsed.stats.totalNotesHit || 0,
            totalScore: parsed.stats.totalScore || 0,
            tracksCompleted: parsed.stats.tracksCompleted || 0
          });
        }

        await this.switchSlot(slotId);
        return { success: true, slotData: parsed };
      } catch (err) {
        alert("Failed to import save slot: " + err.message);
        return { success: false, error: err.message };
      }
    }

    /**
     * Records gameplay results to high scores and accumulated statistics.
     * @param {Object} results
     * @param {string} chosenDiff
     */
    recordRunResult(results, chosenDiff) {
      if (!results) return;

      if (!this.currentSlotData.stats) {
        this.currentSlotData.stats = {
          totalPlayTime: 0,
          totalNotesHit: 0,
          totalScore: 0,
          tracksCompleted: 0
        };
      }

      const stats = this.currentSlotData.stats;
      const score = Math.max(0, parseInt(results.score, 10) || 0);
      const perfects = results.perfectHits !== undefined ? results.perfectHits : (results.perfectCount || 0);
      const goods = results.goodHits !== undefined ? results.goodHits : (results.normalCount || 0);
      const notesHit = results.hits !== undefined ? results.hits : (perfects + goods);
      const playSeconds = Math.max(0, parseInt(results.playedSeconds, 10) || parseInt(results.durationSeconds, 10) || 0);

      stats.totalScore = (stats.totalScore || 0) + score;
      stats.totalNotesHit = (stats.totalNotesHit || 0) + notesHit;
      stats.totalPlayTime = (stats.totalPlayTime || 0) + playSeconds;

      if (results.isCompleted) {
        stats.tracksCompleted = (stats.tracksCompleted || 0) + 1;
      }

      // Record high score if completed
      if (results.isCompleted && results.songId) {
        const songKey = results.songId;
        const diffKey = chosenDiff ? `${songKey}#${String(chosenDiff).trim().toLowerCase()}` : songKey;
        if (!this.currentSlotData.highscores) this.currentSlotData.highscores = {};

        const existingScore = this.currentSlotData.highscores[diffKey] || 0;
        if (score > existingScore) {
          this.currentSlotData.highscores[diffKey] = score;
        }
        const existingOverall = this.currentSlotData.highscores[songKey] || 0;
        if (score > existingOverall) {
          this.currentSlotData.highscores[songKey] = score;
        }
      }

      this.saveActiveSlot();
      this.notifyListeners("runRecorded");
    }

    /**
     * Returns high scores from active slot.
     * @returns {Object}
     */
    getHighscores() {
      return this.currentSlotData.highscores || {};
    }

    /**
     * Returns high score for a specific song and difficulty.
     * @param {string} songId
     * @param {string|null} difficulty
     * @returns {number}
     */
    getBestScore(songId, difficulty = null) {
      if (!songId || !this.currentSlotData.highscores) return 0;
      if (difficulty) {
        const diffKey = `${songId}#${String(difficulty).trim().toLowerCase()}`;
        if (typeof this.currentSlotData.highscores[diffKey] === "number") {
          return this.currentSlotData.highscores[diffKey];
        }
      }
      return this.currentSlotData.highscores[songId] || 0;
    }

    /**
     * Adds an event listener for slot changes.
     * @param {Function} cb
     */
    addListener(cb) {
      if (typeof cb === "function") this.listeners.add(cb);
    }

    /**
     * Removes an event listener.
     * @param {Function} cb
     */
    removeListener(cb) {
      this.listeners.delete(cb);
    }

    /**
     * Notifies all listeners of changes.
     * @param {string} event
     */
    notifyListeners(event) {
      this.listeners.forEach((cb) => {
        try {
          cb(event, this.currentSlotData);
        } catch (e) {
          console.error("[SaveSystem] Listener error:", e);
        }
      });
    }
  }

  // Expose to window and Node.js
  if (typeof window !== "undefined") {
    window.SaveSystem = SaveSystem;
    window.saveSystem = new SaveSystem();
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = SaveSystem;
  }
})();

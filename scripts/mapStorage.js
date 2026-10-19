/**
 * @file mapStorage.js
 * @description Manages persistence, retrieval, and creation of rhythm maps,
 * preserving existing map identities when saving edits, without duplicate saves.
 * Also persists player high scores only for completed runs.
 */

const CUSTOM_MAPS_STORAGE_KEY = "project_alpha_custom_maps";
const MAP_OVERRIDES_STORAGE_KEY = "project_alpha_map_overrides";
const HIGHSCORES_STORAGE_KEY = "project_alpha_highscores";

class MapStorage {
  constructor() {
    this.customMaps = this.loadCustomMaps();
    this.mapOverrides = this.loadMapOverrides();
    this.highscores = this.loadHighscores();
    this.listeners = new Set();
  }

  /**
   * Loads custom maps from localStorage.
   * @returns {Array}
   */
  loadCustomMaps() {
    try {
      const saved = localStorage.getItem(CUSTOM_MAPS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn("Unable to load custom maps from localStorage:", err);
    }
    return [];
  }

  /**
   * Loads default map overrides from localStorage.
   * @returns {Object}
   */
  loadMapOverrides() {
    try {
      const saved = localStorage.getItem(MAP_OVERRIDES_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed === "object" && parsed !== null) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn("Unable to load map overrides from localStorage:", err);
    }
    return {};
  }

  /**
   * Loads high scores from localStorage.
   * @returns {Object}
   */
  loadHighscores() {
    try {
      const saved = localStorage.getItem(HIGHSCORES_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed === "object" && parsed !== null) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn("Unable to load highscores from localStorage:", err);
    }
    return {};
  }

  /**
   * Persists custom maps to localStorage.
   */
  saveCustomMapsToStorage() {
    try {
      localStorage.setItem(CUSTOM_MAPS_STORAGE_KEY, JSON.stringify(this.customMaps));
    } catch (err) {
      console.warn("Unable to save custom maps to localStorage:", err);
    }
    this.notify();
  }

  /**
   * Persists map overrides to localStorage.
   */
  saveOverridesToStorage() {
    try {
      localStorage.setItem(MAP_OVERRIDES_STORAGE_KEY, JSON.stringify(this.mapOverrides));
    } catch (err) {
      console.warn("Unable to save map overrides to localStorage:", err);
    }
    this.notify();
  }

  /**
   * Returns default maps bundled with the game, merging any saved edits.
   * @returns {Array}
   */
  getDefaultMaps() {
    const songs = window.SONGS_DATA || [];
    const sampleMaps = window.SAMPLE_MAPS || {};

    return songs.map((s) => {
      const overriddenNotes = this.mapOverrides[s.id];
      const initialNotes = sampleMaps[s.id] || [];

      return {
        id: s.id,
        name: s.name,
        mapper: s.mapper,
        creator: s.creator,
        date: s.date,
        duration: s.duration,
        durationSeconds: s.durationSeconds,
        file: s.file,
        color: s.color,
        isCustom: false,
        notes: overriddenNotes ? [...overriddenNotes] : [...initialNotes]
      };
    });
  }

  /**
   * Returns all maps (both default and custom).
   * @returns {Array}
   */
  getAllMaps() {
    const defaults = this.getDefaultMaps();
    return [...this.customMaps, ...defaults];
  }

  /**
   * Retrieves a specific map by ID.
   * @param {string} id
   * @returns {Object|null}
   */
  getMap(id) {
    const custom = this.customMaps.find((m) => m.id === id);
    if (custom) return custom;
    const defaults = this.getDefaultMaps();
    return defaults.find((m) => m.id === id) || null;
  }

  /**
   * Creates a new custom map and persists it.
   * @param {Object} mapData
   * @returns {Object}
   */
  createMap({ name, mapper, creator, file, duration = "03:00", durationSeconds = 180 }) {
    const id = `custom_${Date.now()}`;
    const newMap = {
      id,
      name: name || "Untitled Map",
      mapper: mapper || "Anonymous",
      creator: creator || "Unknown Artist",
      date: new Date().toISOString().split("T")[0],
      duration,
      durationSeconds: Number(durationSeconds) || 180,
      file,
      color: "#00d4ff",
      isCustom: true,
      notes: []
    };

    this.customMaps.unshift(newMap);
    this.saveCustomMapsToStorage();
    return newMap;
  }

  /**
   * Saves updates to an existing map.
   * Updates the existing map directly instead of creating new duplicates.
   * @param {Object} updatedMap
   */
  saveMap(updatedMap) {
    if (!updatedMap || !updatedMap.id) return updatedMap;

    const customIndex = this.customMaps.findIndex((m) => m.id === updatedMap.id);
    if (customIndex !== -1) {
      this.customMaps[customIndex] = {
        ...this.customMaps[customIndex],
        ...updatedMap,
        notes: [...(updatedMap.notes || [])]
      };
      this.saveCustomMapsToStorage();
      return this.customMaps[customIndex];
    }

    this.mapOverrides[updatedMap.id] = [...(updatedMap.notes || [])];
    this.saveOverridesToStorage();

    if (window.SAMPLE_MAPS) {
      window.SAMPLE_MAPS[updatedMap.id] = [...(updatedMap.notes || [])];
    }

    return updatedMap;
  }

  /**
   * Deletes a custom map.
   * @param {string} id
   */
  deleteMap(id) {
    this.customMaps = this.customMaps.filter((m) => m.id !== id);
    this.saveCustomMapsToStorage();
  }

  /**
   * Gets the saved best score for a song.
   * @param {string} songId
   * @returns {number}
   */
  getBestScore(songId) {
    return this.highscores[songId] || 0;
  }

  /**
   * Saves a score for a song.
   * Only completed runs can set a new best score.
   * Runs abandoned early never overwrite existing records.
   * @param {string} songId
   * @param {number} score
   * @param {boolean} isCompleted
   * @returns {{ isNewRecord: boolean, bestScore: number }}
   */
  recordScore(songId, score, isCompleted = true) {
    const currentBest = this.getBestScore(songId);

    // If abandoned early, NEVER count as a new best score
    if (!isCompleted) {
      return { isNewRecord: false, bestScore: currentBest };
    }

    let isNewRecord = false;
    let bestScore = currentBest;

    if (score > currentBest) {
      this.highscores[songId] = score;
      bestScore = score;
      isNewRecord = true;
      try {
        localStorage.setItem(HIGHSCORES_STORAGE_KEY, JSON.stringify(this.highscores));
      } catch (err) {
        console.warn("Unable to save high score:", err);
      }
    }

    return { isNewRecord, bestScore };
  }

  /**
   * Registers a change listener.
   * @param {Function} cb
   */
  onChange(cb) {
    this.listeners.add(cb);
  }

  /**
   * Notifies subscribers of changes.
   */
  notify() {
    this.listeners.forEach((cb) => {
      try {
        cb(this.getAllMaps());
      } catch (e) {
        console.error(e);
      }
    });
  }
}

// Expose to window
window.MapStorage = MapStorage;

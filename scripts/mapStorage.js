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
          const uniqueMaps = [];
          const seenIds = new Set();
          for (const m of parsed) {
            if (m && m.id && !seenIds.has(m.id)) {
              seenIds.add(m.id);
              uniqueMaps.push({
                ...m,
                isCustom: true,
                isDefault: false
              });
            }
          }
          return uniqueMaps;
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
   * Generates a stable alphanumeric hash from a string.
   * @param {string} str
   * @returns {string}
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Automatically detects, validates, and loads track codes from `importedTracks.js`.
   * Reuses the existing export format, prevents duplicate imports, and handles invalid codes safely.
   * @returns {Array} defaultTracks
   */
  loadImportedDefaultTracks() {
    const rawItems = [];

    // 1. Detect array, string, or object from window.TRACK_CODES
    if (typeof window !== "undefined" && window.TRACK_CODES) {
      if (Array.isArray(window.TRACK_CODES)) {
        rawItems.push(...window.TRACK_CODES);
      } else if (typeof window.TRACK_CODES === "string" && window.TRACK_CODES.trim()) {
        rawItems.push(window.TRACK_CODES);
      } else if (typeof window.TRACK_CODES === "object") {
        rawItems.push(window.TRACK_CODES);
      }
    }

    // 2. Detect multiline raw text from window.TRACK_CODES_TEXT
    if (typeof window !== "undefined" && typeof window.TRACK_CODES_TEXT === "string" && window.TRACK_CODES_TEXT.trim()) {
      const text = window.TRACK_CODES_TEXT.trim();
      const alphaMatches = text.match(/ALPHA_TRACK_V1:[A-Za-z0-9+/=_\-]+/g);
      if (alphaMatches && alphaMatches.length > 0) {
        rawItems.push(...alphaMatches);
      } else {
        // Fallback: split by non-comment lines or parse single JSON block
        if (text.startsWith("{") && text.endsWith("}")) {
          rawItems.push(text);
        } else {
          const lines = text.split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith("#") && !l.startsWith("//") && !l.startsWith("/*"));
          rawItems.push(...lines);
        }
      }
    }

    const defaultTracks = [];
    const seenSignatures = new Set();

    rawItems.forEach((item) => {
      if (!item) return;
      const rawString = typeof item === "string" ? item.trim() : JSON.stringify(item);
      if (!rawString) return;

      const result = this.validateAndParseTrackCode(rawString);
      if (!result.valid || !result.track) {
        console.warn("Skipping invalid track code in importedTracks.js:", result.error || "Unknown validation error");
        return;
      }

      const t = result.track;

      // Prevent duplicate imports using a deterministic content signature
      const sig = `${t.name.toLowerCase()}::${(t.creator || "").toLowerCase()}::${t.notes.length}::${t.durationSeconds}`;
      if (seenSignatures.has(sig)) {
        return; // Already imported in this batch, avoid duplicate
      }
      seenSignatures.add(sig);

      const trackId = `default_${this.hashString(sig)}`;
      defaultTracks.push({
        ...t,
        id: trackId,
        isDefault: true,
        isCustom: false,
        date: t.date || new Date().toISOString().split("T")[0]
      });
    });

    return defaultTracks;
  }

  /**
   * Returns default maps automatically detected from `importedTracks.js`.
   * @returns {Array}
   */
  getDefaultMaps() {
    return this.loadImportedDefaultTracks();
  }

  /**
   * Returns all maps (both custom maps and default tracks from importedTracks.js).
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
  createMap({ name, mapper, creator, file, duration = "03:00", durationSeconds = 180, cover = null }) {
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
      cover: cover || "Assets/Tracks Placeholders/Default-0.png",
      isCustom: true,
      isDefault: false,
      notes: []
    };

    this.customMaps.unshift(newMap);
    this.saveCustomMapsToStorage();
    return newMap;
  }

  /**
   * Checks whether a map is a default track (from importedTracks.js / presets).
   * Any map present in this.customMaps is strictly a custom track, never default.
   * @param {Object} track
   * @returns {boolean}
   */
  isDefaultTrack(track) {
    if (!track || !track.id) return false;
    // If it exists in customMaps, it is strictly a custom track!
    if (this.customMaps && this.customMaps.some((m) => m.id === track.id)) {
      return false;
    }
    const defaults = this.getDefaultMaps();
    if (defaults.some((m) => m.id === track.id)) {
      return true;
    }
    if (track.isDefault === true || String(track.id).startsWith("default_") || track.isCustom === false) {
      return true;
    }
    return false;
  }

  /**
   * Saves updates to a map:
   * - When editing a default track, saves changes as a separate copy, leaving the original unchanged.
   * - For custom tracks, saves changes directly to the existing track without creating duplicate saves or new tracks.
   * @param {Object} updatedMap
   * @returns {Object} savedMap (or new copy if default track)
   */
  saveMap(updatedMap) {
    if (!updatedMap || !updatedMap.id) return updatedMap;

    const trackCover = updatedMap.cover || updatedMap.image || updatedMap.artwork || "Assets/Tracks Placeholders/Default-0.png";

    // Helper to deeply sanitize and clone notes array
    const cloneNotes = (notesList) => {
      if (!Array.isArray(notesList)) return [];
      return notesList.map((n) => {
        const isTriangle = n.type === "triangle" || n.type === "bomb";
        const isDirectional = n.type === "directional" || n.type === "arrow";
        const item = {
          time: parseFloat(Number(n.time !== undefined ? n.time : (n.timestamp !== undefined ? n.timestamp : 0)).toFixed(3)),
          color: isTriangle ? "yellow" : (n.color === "red" ? "red" : "blue"),
          type: isTriangle ? "triangle" : (isDirectional ? "directional" : "normal"),
          x: Math.max(0.02, Math.min(0.98, parseFloat(Number(n.x !== undefined ? n.x : 0.5).toFixed(3)))),
          y: Math.max(0.02, Math.min(0.98, parseFloat(Number(n.y !== undefined ? n.y : 0.5).toFixed(3))))
        };
        if (isDirectional) {
          item.angle = typeof n.angle === "number" ? ((Math.round(n.angle) % 360) + 360) % 360 : 0;
        }
        return item;
      }).sort((a, b) => a.time - b.time);
    };

    const notesClone = cloneNotes(updatedMap.notes);

    const durationSec = Number(updatedMap.durationSeconds || updatedMap.duration) || 180;
    const computedNps = notesClone.length > 0 && durationSec > 0
      ? parseFloat((notesClone.length / durationSec).toFixed(1))
      : 0;

    // 1. If this track already exists in customMaps, update it directly in-place!
    // NEVER create a new track or save copy for an existing custom track!
    const customIndex = this.customMaps.findIndex((m) => m.id === updatedMap.id);
    if (customIndex !== -1) {
      this.customMaps[customIndex] = {
        ...this.customMaps[customIndex],
        ...updatedMap,
        id: updatedMap.id, // Strictly preserve existing ID
        isCustom: true,
        isDefault: false,
        cover: trackCover,
        nps: computedNps,
        notes: notesClone
      };
      this.saveCustomMapsToStorage();
      return this.customMaps[customIndex];
    }

    // 2. The only exception: editing a default track creates a separate custom copy!
    if (this.isDefaultTrack(updatedMap)) {
      const copyId = `custom_copy_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const originalTrack = this.getMap(updatedMap.id);
      const isRenamed = updatedMap.name && originalTrack && updatedMap.name !== originalTrack.name;
      const copyName = isRenamed
        ? updatedMap.name
        : (updatedMap.name.includes("(Copy)") ? updatedMap.name : `${updatedMap.name} (Copy)`);

      const copyMap = {
        ...updatedMap,
        id: copyId,
        name: copyName,
        cover: trackCover,
        isCustom: true,
        isDefault: false,
        nps: computedNps,
        date: new Date().toISOString().split("T")[0],
        notes: notesClone
      };

      this.customMaps.unshift(copyMap);
      this.saveCustomMapsToStorage();
      return copyMap;
    }

    // 3. Fallback: custom track not yet in customMaps (e.g. freshly created custom map)
    const newCustomMap = {
      ...updatedMap,
      id: updatedMap.id,
      cover: trackCover,
      isCustom: true,
      isDefault: false,
      nps: computedNps,
      notes: notesClone
    };
    this.customMaps.unshift(newCustomMap);
    this.saveCustomMapsToStorage();
    return newCustomMap;
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
   * Exports a map into a validated, unique, and copyable text code.
   * Does NOT create duplicate saves or modify the current track.
   * @param {Object} map
   * @returns {{ code: string, json: string, payload: Object }}
   */
  exportTrack(map) {
    if (!map) throw new Error("No map specified for export.");

    const notes = Array.isArray(map.notes) ? map.notes : [];
    const sanitizedNotes = notes.map((n) => {
      const isTriangle = n.type === "triangle" || n.type === "bomb";
      const isDirectional = n.type === "directional" || n.type === "arrow";
      const item = {
        time: parseFloat(Number(n.time || 0).toFixed(3)),
        color: isTriangle ? "yellow" : (n.color === "red" ? "red" : "blue"),
        type: isTriangle ? "triangle" : (isDirectional ? "directional" : "normal"),
        x: Math.max(0.02, Math.min(0.98, parseFloat(Number(n.x !== undefined ? n.x : 0.5).toFixed(3)))),
        y: Math.max(0.02, Math.min(0.98, parseFloat(Number(n.y !== undefined ? n.y : 0.5).toFixed(3))))
      };
      if (isDirectional) {
        item.angle = typeof n.angle === "number" ? ((Math.round(n.angle) % 360) + 360) % 360 : 0;
      }
      return item;
    });

    sanitizedNotes.sort((a, b) => a.time - b.time);

    const payload = {
      format: "ProjectAlphaPlus-Track",
      version: 2,
      exportedAt: new Date().toISOString(),
      track: {
        id: map.id || `track_${Date.now()}`,
        name: map.name || "Untitled Track",
        mapper: map.mapper || "Anonymous",
        creator: map.creator || "Unknown Artist",
        duration: map.duration || "03:00",
        durationSeconds: Math.max(10, Number(map.durationSeconds) || 180),
        file: map.file || "Assets/Songs/IMG_2449.mp3",
        color: map.color || "#00d4ff",
        cover: map.cover || map.image || map.artwork || "Assets/Tracks Placeholders/Default-0.png",
        difficulty: map.difficulty || "Normal",
        nps: sanitizedNotes.length > 0 && map.durationSeconds > 0
          ? parseFloat((sanitizedNotes.length / map.durationSeconds).toFixed(1))
          : 0,
        notes: sanitizedNotes
      }
    };

    if (map.background && typeof map.background === "object") {
      const bg = map.background;
      const isVideo = bg.type === "video";
      const hasDirectUrl = typeof bg.url === "string" && (bg.url.startsWith("data:") || bg.url.startsWith("Assets/") || bg.url.startsWith("http"));
      const bgPayload = {
        type: isVideo ? "video" : "image",
        fit: bg.fit === "contain" ? "contain" : "cover",
        opacity: typeof bg.opacity === "number" ? Math.max(0.05, Math.min(1.0, bg.opacity)) : 0.7,
        name: bg.name || (isVideo ? "background.mp4" : "background.png")
      };
      if (hasDirectUrl && bg.url.length < 3000000) {
        bgPayload.url = bg.url;
      } else {
        bgPayload.needsMedia = true;
      }
      payload.track.background = bgPayload;
    }

    const jsonStr = JSON.stringify(payload, null, 2);
    let base64Code = "";
    if (typeof btoa !== "undefined") {
      try {
        base64Code = btoa(unescape(encodeURIComponent(jsonStr)));
      } catch (e) {
        base64Code = btoa(jsonStr);
      }
    } else if (typeof Buffer !== "undefined") {
      base64Code = Buffer.from(jsonStr, "utf8").toString("base64");
    }

    const code = `ALPHA_TRACK_V1:${base64Code}`;
    return { code, json: jsonStr, payload };
  }

  /**
   * Validates and parses an exported track code or JSON string safely.
   * Handles invalid, incomplete, or corrupted data gracefully.
   * @param {string} rawCode
   * @returns {{ valid: boolean, track?: Object, error?: string }}
   */
  validateAndParseTrackCode(rawCode) {
    if (!rawCode || typeof rawCode !== "string" || !rawCode.trim()) {
      return { valid: false, error: "Please enter or paste a valid track code." };
    }

    let rawString = rawCode.trim();

    // 1. Decode Base64 prefix if present
    if (rawString.startsWith("ALPHA_TRACK_V1:")) {
      const b64 = rawString.slice("ALPHA_TRACK_V1:".length).trim();
      try {
        if (typeof atob !== "undefined") {
          try {
            rawString = decodeURIComponent(escape(atob(b64)));
          } catch (err1) {
            rawString = atob(b64);
          }
        } else if (typeof Buffer !== "undefined") {
          rawString = Buffer.from(b64, "base64").toString("utf8");
        }
      } catch (err) {
        return { valid: false, error: "The provided track code is corrupted or malformed." };
      }
    }

    // 2. Parse JSON
    let parsed;
    try {
      parsed = JSON.parse(rawString);
    } catch (jsonErr) {
      return { valid: false, error: "Invalid track data format: could not parse JSON content." };
    }

    if (!parsed || typeof parsed !== "object") {
      return { valid: false, error: "Invalid track data format: expected object." };
    }

    const trackObj = parsed.track || parsed;

    // 3. Validate metadata
    if (!trackObj.name || typeof trackObj.name !== "string" || !trackObj.name.trim()) {
      return { valid: false, error: "Track is missing a valid track name." };
    }

    let durationSeconds = Number(trackObj.durationSeconds);
    if ((isNaN(durationSeconds) || durationSeconds <= 0) && typeof trackObj.duration === "string") {
      const parts = trackObj.duration.split(":");
      if (parts.length === 2) {
        const m = parseInt(parts[0], 10);
        const s = parseInt(parts[1], 10);
        if (!isNaN(m) && !isNaN(s)) {
          durationSeconds = m * 60 + s;
        }
      }
    }
    if (isNaN(durationSeconds) || durationSeconds <= 0) {
      if (Array.isArray(trackObj.notes) && trackObj.notes.length > 0) {
        const maxTime = Math.max(...trackObj.notes.map((n) => Number(n.time) || 0));
        durationSeconds = Math.max(10, Math.ceil(maxTime + 2));
      } else {
        durationSeconds = 180;
      }
    }

    // 4. Validate notes array
    if (!Array.isArray(trackObj.notes)) {
      return { valid: false, error: "Track data is missing notes array." };
    }

    const sanitizedNotes = [];
    for (let i = 0; i < trackObj.notes.length; i++) {
      const n = trackObj.notes[i];
      if (!n || typeof n !== "object") continue;

      const time = Number(n.time);
      if (isNaN(time) || time < 0) continue;

      const isTriangle = n.type === "triangle" || n.type === "bomb";
      const isDirectional = n.type === "directional" || n.type === "arrow";
      let color = String(n.color || "").toLowerCase();
      if (isTriangle) {
        color = "yellow";
      } else if (color !== "red" && color !== "blue") {
        continue;
      }

      const x = Number(n.x);
      const y = Number(n.y);
      if (isNaN(x) || isNaN(y)) continue;

      const note = {
        time: parseFloat(time.toFixed(3)),
        color,
        type: isTriangle ? "triangle" : (isDirectional ? "directional" : "normal"),
        x: Math.max(0.02, Math.min(0.98, parseFloat(x.toFixed(3)))),
        y: Math.max(0.02, Math.min(0.98, parseFloat(y.toFixed(3))))
      };
      if (isDirectional) {
        note.angle = typeof n.angle === "number" ? ((Math.round(n.angle) % 360) + 360) % 360 : 0;
      }

      sanitizedNotes.push(note);
    }

    sanitizedNotes.sort((a, b) => a.time - b.time);

    const minutes = Math.floor(durationSeconds / 60);
    const seconds = Math.floor(durationSeconds % 60);
    const durationFormatted = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

    const sanitizedTrack = {
      name: trackObj.name.trim().slice(0, 80),
      mapper: (trackObj.mapper || "Anonymous").trim().slice(0, 60),
      creator: (trackObj.creator || "Unknown Artist").trim().slice(0, 60),
      duration: trackObj.duration || durationFormatted,
      durationSeconds,
      file: trackObj.file || "Assets/Songs/IMG_2449.mp3",
      color: trackObj.color || "#00d4ff",
      cover: trackObj.cover || trackObj.image || trackObj.artwork || "Assets/Tracks Placeholders/Default-0.png",
      difficulty: trackObj.difficulty || "Normal",
      notes: sanitizedNotes
    };

    if (trackObj.background && typeof trackObj.background === "object") {
      const bg = trackObj.background;
      const isVideo = bg.type === "video";
      const validBg = {
        type: isVideo ? "video" : "image",
        fit: bg.fit === "contain" ? "contain" : "cover",
        opacity: typeof bg.opacity === "number" ? Math.max(0.05, Math.min(1.0, bg.opacity)) : 0.7,
        name: typeof bg.name === "string" ? bg.name.slice(0, 100) : (isVideo ? "background.mp4" : "background.png")
      };
      if (typeof bg.url === "string" && bg.url.trim()) {
        validBg.url = bg.url.trim();
      }
      if (bg.needsMedia) {
        validBg.needsMedia = true;
      }
      sanitizedTrack.background = validBg;
    }

    return { valid: true, track: sanitizedTrack };
  }

  /**
   * Imports a validated track into custom maps and saves it to storage.
   * @param {Object} validatedTrack
   * @returns {Object} importedMap
   */
  importTrack(validatedTrack) {
    if (!validatedTrack || !validatedTrack.name) {
      throw new Error("Invalid track data provided to importTrack.");
    }

    const uniqueId = `custom_import_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const importedMap = {
      ...validatedTrack,
      id: uniqueId,
      date: new Date().toISOString().split("T")[0],
      isCustom: true,
      isDefault: false,
      notes: [...(validatedTrack.notes || [])]
    };

    this.customMaps.unshift(importedMap);
    this.saveCustomMapsToStorage();
    return importedMap;
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

// Expose to window / module
if (typeof window !== "undefined") {
  window.MapStorage = MapStorage;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = MapStorage;
}

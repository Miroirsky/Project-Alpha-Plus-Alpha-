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
              // Clean up expired blob URLs from previous browser sessions
              let audioFile = m.file;
              if (audioFile && typeof audioFile === "string" && audioFile.startsWith("blob:")) {
                audioFile = "Assets/Songs/IMG_2449.mp3";
              }
              const customMap = {
                ...m,
                file: audioFile || "Assets/Songs/IMG_2449.mp3",
                isCustom: true,
                isDefault: false
              };
              this.normalizeSongDifficulties(customMap);
              uniqueMaps.push(customMap);
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
   * Deeply sanitizes and clones a notes array.
   * @param {Array} notesList
   * @returns {Array}
   */
  cloneNotes(notesList) {
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
  }

  /**
   * Computes density (Notes Per Second).
   * @param {Array} notesList
   * @param {number} durationSeconds
   * @returns {number}
   */
  computeNps(notesList, durationSeconds = 180) {
    const count = Array.isArray(notesList) ? notesList.length : 0;
    const dur = Math.max(1, Number(durationSeconds) || 180);
    return count > 0 ? parseFloat((count / dur).toFixed(1)) : 0;
  }

  /**
   * Normalizes a song object to ensure difficulties dictionary is populated,
   * separating song metadata from difficulty-specific notes maps.
   * Maintains backward-compatible .notes and .difficulty properties pointing to primary difficulty.
   * @param {Object} song
   * @returns {Object}
   */
  normalizeSongDifficulties(song) {
    if (!song) return song;
    const durSec = Number(song.durationSeconds) || 180;
    const diffs = {};

    if (song.difficulties && typeof song.difficulties === "object" && Object.keys(song.difficulties).length > 0) {
      for (const [diffKey, diffVal] of Object.entries(song.difficulties)) {
        if (!diffVal) continue;
        const name = String(diffVal.difficulty || diffKey || "Normal").trim();
        const notes = this.cloneNotes(diffVal.notes || []);
        diffs[name] = {
          difficulty: name,
          notes,
          nps: typeof diffVal.nps === "number" && diffVal.nps > 0 ? diffVal.nps : this.computeNps(notes, durSec)
        };
      }
    }

    // If no difficulties object or it was empty, construct from top-level song properties
    if (Object.keys(diffs).length === 0) {
      const topDiffName = String(song.difficulty || "Normal").trim() || "Normal";
      const notes = this.cloneNotes(song.notes || []);
      diffs[topDiffName] = {
        difficulty: topDiffName,
        notes,
        nps: typeof song.nps === "number" && song.nps > 0 ? song.nps : this.computeNps(notes, durSec)
      };
    }

    song.difficulties = diffs;

    // Backward compatibility: keep song.difficulty, song.notes, song.nps pointing to primary/selected difficulty
    const primaryDiffKey = song.selectedDifficulty && diffs[song.selectedDifficulty]
      ? song.selectedDifficulty
      : (diffs[song.difficulty] ? song.difficulty : Object.keys(diffs)[0]);
    const primary = diffs[primaryDiffKey];
    if (primary) {
      song.difficulty = primary.difficulty;
      song.notes = primary.notes;
      song.nps = primary.nps;
    }

    return song;
  }

  /**
   * Retrieves difficulty tracks dictionary for a song.
   * @param {Object} song
   * @returns {Object}
   */
  getSongDifficulties(song) {
    if (!song) return {};
    this.normalizeSongDifficulties(song);
    return song.difficulties || {};
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
   * Automatically detects and loads default tracks directly from the `Default Tracks` folder.
   * Checks window.DEFAULT_TRACKS (registered by Default Tracks/defaultTracks.js),
   * filesystem in Node.js, and normalizes all difficulty tracks under a stable default song ID.
   * @returns {Array} defaultTracks
   */
  loadDefaultTracks() {
    const rawItems = [];

    // 1. Detect default tracks registered from Default Tracks/defaultTracks.js
    if (typeof window !== "undefined" && Array.isArray(window.DEFAULT_TRACKS)) {
      rawItems.push(...window.DEFAULT_TRACKS);
    }

    // 2. In Node.js / testing environment, directly read JSON files from Default Tracks / Assets/Default Tracks
    if (typeof process !== "undefined" && typeof require === "function") {
      try {
        const fs = require("fs");
        const path = require("path");
        const dirs = [
          path.resolve("Default Tracks"),
          path.resolve("Assets", "Default Tracks")
        ];
        dirs.forEach((dir) => {
          if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            files.forEach((f) => {
              if (f.endsWith(".json") && f !== "manifest.json") {
                try {
                  const content = fs.readFileSync(path.join(dir, f), "utf8");
                  const parsed = JSON.parse(content);
                  rawItems.push(parsed);
                } catch (e) {}
              }
            });
          }
        });
      } catch (e) {}
    }

    const defaultTracks = [];
    const songMap = new Map(); // key: base song signature -> song object

    rawItems.forEach((item) => {
      if (!item) return;
      const rawString = typeof item === "string" ? item.trim() : JSON.stringify(item);
      if (!rawString) return;

      const result = this.validateAndParseTrackCode(rawString);
      if (!result.valid || (!result.song && !result.track)) {
        console.warn("Skipping invalid default track:", result.error || "Unknown validation error");
        return;
      }

      const songObj = result.song || result.track;
      this.normalizeSongDifficulties(songObj);

      // Group tracks with identical song name and audio file under one single song ID
      const songBaseSig = `${songObj.name.toLowerCase().trim()}::${(songObj.creator || "").toLowerCase().trim()}::${(songObj.file || "").toLowerCase().trim()}`;

      if (songMap.has(songBaseSig)) {
        const existingSong = songMap.get(songBaseSig);
        for (const [diffName, diffObj] of Object.entries(songObj.difficulties)) {
          existingSong.difficulties[diffName] = diffObj;
        }
        this.normalizeSongDifficulties(existingSong);
        return;
      }

      const trackId = songObj.id && String(songObj.id).startsWith("default_")
        ? songObj.id
        : `default_${this.hashString(songBaseSig)}`;

      songObj.id = trackId;
      songObj.isDefault = true;
      songObj.isCustom = false;
      songObj.date = songObj.date || new Date().toISOString().split("T")[0];

      songMap.set(songBaseSig, songObj);
      defaultTracks.push(songObj);
    });

    return defaultTracks;
  }

  /**
   * Returns default maps loaded directly from the `Default Tracks` folder.
   * @returns {Array}
   */
  getDefaultMaps() {
    return this.loadDefaultTracks();
  }

  /**
   * Returns all maps (both custom maps and default tracks from the Default Tracks folder).
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
  createMap({ name, mapper, creator, file, duration = "03:00", durationSeconds = 180, cover = null, difficulty = "Normal" }) {
    const id = `custom_${Date.now()}`;
    const diffName = String(difficulty || "Normal").trim() || "Normal";
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
      difficulty: diffName,
      notes: [],
      difficulties: {
        [diffName]: {
          difficulty: diffName,
          notes: [],
          nps: 0
        }
      }
    };

    this.customMaps.unshift(newMap);
    this.saveCustomMapsToStorage();
    return newMap;
  }

  /**
   * Checks whether a map is a default track (from Default Tracks folder / presets).
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
   * - Persists each difficulty track under the same song ID.
   * @param {Object} updatedMap
   * @returns {Object} savedMap (or new copy if default track)
   */
  saveMap(updatedMap) {
    if (!updatedMap || !updatedMap.id) return updatedMap;

    const trackCover = updatedMap.cover || updatedMap.image || updatedMap.artwork || "Assets/Tracks Placeholders/Default-0.png";
    const durationSec = Number(updatedMap.durationSeconds || updatedMap.duration) || 180;

    const activeDiff = String(updatedMap.selectedDifficulty || updatedMap.difficulty || "Normal").trim() || "Normal";

    if (!updatedMap.difficulties || typeof updatedMap.difficulties !== "object") {
      updatedMap.difficulties = {};
    }

    // If difficulties dictionary exists for active difficulty, preserve its notes;
    // otherwise populate from updatedMap.notes if present
    if (updatedMap.difficulties && updatedMap.difficulties[activeDiff] && Array.isArray(updatedMap.difficulties[activeDiff].notes)) {
      if (Array.isArray(updatedMap.notes) && updatedMap.notes.length > 0 && updatedMap.selectedDifficulty === activeDiff) {
        const cloned = this.cloneNotes(updatedMap.notes);
        updatedMap.difficulties[activeDiff].notes = cloned;
        updatedMap.difficulties[activeDiff].nps = this.computeNps(cloned, durationSec);
      }
    } else if (Object.keys(updatedMap.difficulties).length === 0 && Array.isArray(updatedMap.notes)) {
      const cloned = this.cloneNotes(updatedMap.notes);
      updatedMap.difficulties[activeDiff] = {
        difficulty: activeDiff,
        notes: cloned,
        nps: this.computeNps(cloned, durationSec)
      };
    }

    // Ensure difficulties dictionary exists and is normalized
    this.normalizeSongDifficulties(updatedMap);

    // Deeply clone and sanitize all difficulty maps
    const sanitizedDifficulties = {};
    for (const [name, diffData] of Object.entries(updatedMap.difficulties)) {
      if (!diffData) continue;
      const cleanName = String(diffData.difficulty || name).trim();
      const notes = this.cloneNotes(diffData.notes || []);
      sanitizedDifficulties[cleanName] = {
        difficulty: cleanName,
        notes,
        nps: typeof diffData.nps === "number" && diffData.nps > 0 ? diffData.nps : this.computeNps(notes, durationSec)
      };
    }

    if (Object.keys(sanitizedDifficulties).length === 0) {
      sanitizedDifficulties[activeDiff] = {
        difficulty: activeDiff,
        notes: [],
        nps: 0
      };
    }

    updatedMap.difficulties = sanitizedDifficulties;

    // Determine primary difficulty for backward-compatible properties
    const primaryKey = sanitizedDifficulties[activeDiff] ? activeDiff : Object.keys(sanitizedDifficulties)[0];
    const primary = sanitizedDifficulties[primaryKey];
    const notesClone = primary ? primary.notes : [];
    const computedNps = primary ? primary.nps : 0;

    // 1. If this track already exists in customMaps, update it directly in-place!
    // NEVER create a new track or duplicate save for an existing custom track!
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
        notes: notesClone,
        difficulty: primaryKey,
        difficulties: sanitizedDifficulties
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
        notes: notesClone,
        difficulty: primaryKey,
        difficulties: sanitizedDifficulties
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
      notes: notesClone,
      difficulty: primaryKey,
      difficulties: sanitizedDifficulties
    };
    this.customMaps.unshift(newCustomMap);
    this.saveCustomMapsToStorage();
    return newCustomMap;
  }

  /**
   * Deletes a specific difficulty from a custom map.
   * @param {string} songId
   * @param {string} diffName
   * @returns {boolean}
   */
  deleteDifficulty(songId, diffName) {
    if (!songId || !diffName) return false;
    const map = this.customMaps.find((m) => m.id === songId);
    if (!map || !map.difficulties) return false;
    const keys = Object.keys(map.difficulties);
    if (keys.length <= 1) {
      console.warn("Cannot delete the only difficulty track for song:", songId);
      return false;
    }
    delete map.difficulties[diffName];
    this.normalizeSongDifficulties(map);
    this.saveCustomMapsToStorage();
    return true;
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
   * Gets the saved best score for a song (and optionally a specific difficulty).
   * @param {string} songId
   * @param {string|null} difficulty
   * @returns {number}
   */
  getBestScore(songId, difficulty = null) {
    if (!songId) return 0;
    if (difficulty) {
      const diffKey = `${songId}#${String(difficulty).trim().toLowerCase()}`;
      if (typeof this.highscores[diffKey] === "number") {
        return this.highscores[diffKey];
      }
    }
    return this.highscores[songId] || 0;
  }

  /**
   * Saves a score for a song and difficulty.
   * Only completed runs can set a new best score.
   * Runs abandoned early never overwrite existing records.
   * @param {string} songId
   * @param {number} score
   * @param {boolean} isCompleted
   * @param {string|null} difficulty
   * @returns {{ isNewRecord: boolean, bestScore: number }}
   */
  recordScore(songId, score, isCompleted = true, difficulty = null) {
    if (!songId) return { isNewRecord: false, bestScore: 0 };
    const currentBest = this.getBestScore(songId, difficulty);

    // If abandoned early, NEVER count as a new best score
    if (!isCompleted) {
      return { isNewRecord: false, bestScore: currentBest };
    }

    let isNewRecord = false;
    let bestScore = currentBest;

    if (score > currentBest) {
      isNewRecord = true;
      bestScore = score;
    }

    let changed = false;
    if (difficulty) {
      const diffKey = `${songId}#${String(difficulty).trim().toLowerCase()}`;
      const prevDiffBest = this.highscores[diffKey] || 0;
      if (score > prevDiffBest) {
        this.highscores[diffKey] = score;
        changed = true;
      }
    }

    const prevOverall = this.highscores[songId] || 0;
    if (score > prevOverall) {
      this.highscores[songId] = score;
      changed = true;
    }

    if (changed) {
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
   * @param {string|null} selectedDifficulty
   * @returns {{ code: string, json: string, payload: Object }}
   */
  /**
   * Exports an entire song, including all difficulty tracks, song metadata, and arena background parameters.
   * Does NOT modify the current track or create duplicate saves.
   * @param {Object} mapOrSong
   * @returns {{ code: string, json: string, payload: Object, filename: string, totalNotes: number, diffCount: number, difficulties: Array<string> }}
   */
  exportTrack(mapOrSong) {
    if (!mapOrSong) throw new Error("No song specified for export.");

    this.normalizeSongDifficulties(mapOrSong);
    const diffs = mapOrSong.difficulties || {};

    const exportedDifficulties = {};
    let totalNotes = 0;
    for (const [name, diffObj] of Object.entries(diffs)) {
      if (!diffObj) continue;
      const cleanName = String(diffObj.difficulty || name).trim();
      const notes = this.cloneNotes(diffObj.notes || []);
      totalNotes += notes.length;
      exportedDifficulties[cleanName] = {
        difficulty: cleanName,
        nps: typeof diffObj.nps === "number" ? diffObj.nps : this.computeNps(notes, mapOrSong.durationSeconds || 180),
        color: diffObj.color || mapOrSong.color || "#00d4ff",
        notes
      };
    }

    const diffKeys = Object.keys(exportedDifficulties);
    const primaryKey = diffKeys[0] || "Normal";
    const primaryDiff = exportedDifficulties[primaryKey] || { difficulty: "Normal", notes: [], nps: 0 };

    const songPayload = {
      id: mapOrSong.id || `song_${Date.now()}`,
      name: mapOrSong.name || "Untitled Song",
      mapper: mapOrSong.mapper || "Anonymous",
      creator: mapOrSong.creator || "Unknown Artist",
      duration: mapOrSong.duration || "03:00",
      durationSeconds: Math.max(10, Number(mapOrSong.durationSeconds) || 180),
      file: mapOrSong.file || "Assets/Songs/IMG_2449.mp3",
      color: mapOrSong.color || "#00d4ff",
      cover: mapOrSong.cover || mapOrSong.image || mapOrSong.artwork || "Assets/Tracks Placeholders/Default-0.png",
      difficulty: primaryKey,
      nps: primaryDiff.nps || 0,
      notes: primaryDiff.notes || [],
      difficulties: exportedDifficulties,
      totalNotes
    };

    if (mapOrSong.background && typeof mapOrSong.background === "object") {
      const bg = mapOrSong.background;
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
      }
      songPayload.background = bgPayload;
    }

    const payload = {
      format: "ProjectAlphaPlus-Song",
      version: 4,
      exportedAt: new Date().toISOString(),
      song: songPayload,
      track: songPayload // Backward-compatibility alias
    };

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

    const code = `ALPHA_SONG_V1:${base64Code}`;
    const filename = `${(mapOrSong.name || "Song").replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "Song"}.json`;

    return {
      code,
      json: jsonStr,
      payload,
      filename,
      totalNotes,
      diffCount: diffKeys.length,
      difficulties: diffKeys
    };
  }

  /**
   * Validates and parses an exported track code, whole-song code, or JSON string safely.
   * Supports ALPHA_SONG_V1:, ALPHA_TRACK_V1:, and raw JSON files.
   * Handles multi-difficulty tracks as well as legacy single-track formats.
   * @param {string} rawCode
   * @returns {{ valid: boolean, song?: Object, track?: Object, error?: string }}
   */
  validateAndParseTrackCode(rawCode) {
    if (!rawCode || typeof rawCode !== "string" || !rawCode.trim()) {
      return { valid: false, error: "Please enter, paste, or select a valid song code/file." };
    }

    let rawString = rawCode.trim();

    // 1. Decode Base64 prefix if present
    if (rawString.startsWith("ALPHA_SONG_V1:") || rawString.startsWith("ALPHA_TRACK_V1:")) {
      const prefix = rawString.startsWith("ALPHA_SONG_V1:") ? "ALPHA_SONG_V1:" : "ALPHA_TRACK_V1:";
      const b64 = rawString.slice(prefix.length).trim();
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
        return { valid: false, error: "The provided song code is corrupted or malformed." };
      }
    }

    // 2. Parse JSON
    let parsed;
    try {
      parsed = JSON.parse(rawString);
    } catch (jsonErr) {
      return { valid: false, error: "Invalid song data format: could not parse JSON content." };
    }

    if (!parsed || typeof parsed !== "object") {
      return { valid: false, error: "Invalid song data format: expected object." };
    }

    const songObj = parsed.song || parsed.track || parsed;

    // 3. Validate metadata
    if (!songObj.name || typeof songObj.name !== "string" || !songObj.name.trim()) {
      return { valid: false, error: "Song data is missing a valid song name." };
    }

    let durationSeconds = Number(songObj.durationSeconds);
    if ((isNaN(durationSeconds) || durationSeconds <= 0) && typeof songObj.duration === "string") {
      const parts = songObj.duration.split(":");
      if (parts.length === 2) {
        const m = parseInt(parts[0], 10);
        const s = parseInt(parts[1], 10);
        if (!isNaN(m) && !isNaN(s)) {
          durationSeconds = m * 60 + s;
        }
      }
    }
    if (isNaN(durationSeconds) || durationSeconds <= 0) {
      durationSeconds = 180;
    }

    // Helper: sanitize notes array
    const sanitizeNotesArray = (rawNotes) => {
      if (!Array.isArray(rawNotes)) return [];
      const res = [];
      for (let i = 0; i < rawNotes.length; i++) {
        const n = rawNotes[i];
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
        res.push(note);
      }
      res.sort((a, b) => a.time - b.time);
      return res;
    };

    const minutes = Math.floor(durationSeconds / 60);
    const seconds = Math.floor(durationSeconds % 60);
    const durationFormatted = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

    // 4. Sanitize difficulties dictionary
    const sanitizedDifficulties = {};
    if (songObj.difficulties && typeof songObj.difficulties === "object" && Object.keys(songObj.difficulties).length > 0) {
      for (const [diffName, diffData] of Object.entries(songObj.difficulties)) {
        if (!diffData) continue;
        const cleanName = String(diffData.difficulty || diffName).trim();
        const diffNotes = sanitizeNotesArray(diffData.notes || []);
        sanitizedDifficulties[cleanName] = {
          difficulty: cleanName,
          notes: diffNotes,
          nps: typeof diffData.nps === "number" && diffData.nps > 0 ? diffData.nps : this.computeNps(diffNotes, durationSeconds),
          color: diffData.color || songObj.color || "#00d4ff"
        };
      }
    }

    // If no difficulties dictionary, extract from top-level notes/difficulty
    const fallbackNotes = sanitizeNotesArray(songObj.notes || []);
    const defaultDiffName = String(songObj.difficulty || "Normal").trim() || "Normal";
    if (Object.keys(sanitizedDifficulties).length === 0) {
      sanitizedDifficulties[defaultDiffName] = {
        difficulty: defaultDiffName,
        notes: fallbackNotes,
        nps: this.computeNps(fallbackNotes, durationSeconds),
        color: songObj.color || "#00d4ff"
      };
    }

    const primaryKey = sanitizedDifficulties[defaultDiffName] ? defaultDiffName : Object.keys(sanitizedDifficulties)[0];
    const primary = sanitizedDifficulties[primaryKey];

    const sanitizedSong = {
      name: songObj.name.trim().slice(0, 80),
      mapper: (songObj.mapper || "Anonymous").trim().slice(0, 60),
      creator: (songObj.creator || "Unknown Artist").trim().slice(0, 60),
      duration: songObj.duration || durationFormatted,
      durationSeconds,
      file: songObj.file || "Assets/Songs/IMG_2449.mp3",
      color: songObj.color || "#00d4ff",
      cover: songObj.cover || songObj.image || songObj.artwork || "Assets/Tracks Placeholders/Default-0.png",
      difficulty: primary ? primary.difficulty : defaultDiffName,
      nps: primary ? primary.nps : 0,
      notes: primary ? primary.notes : fallbackNotes,
      difficulties: sanitizedDifficulties
    };

    if (songObj.background && typeof songObj.background === "object") {
      const bg = songObj.background;
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
      sanitizedSong.background = validBg;
    }

    return { valid: true, song: sanitizedSong, track: sanitizedSong };
  }

  /**
   * Imports a validated song into custom maps and saves it to storage.
   * Prevents duplicate songs by merging incoming difficulty tracks into an existing song if already present.
   * Ensures all difficulty tracks remain linked to the same song ID and preserves high scores.
   * @param {Object} validatedSong
   * @returns {Object} importedSong
   */
  importTrack(validatedSong) {
    if (!validatedSong || !validatedSong.name) {
      throw new Error("Invalid song data provided to importTrack.");
    }

    this.normalizeSongDifficulties(validatedSong);

    // Check if an existing custom song matches by ID or by (name + creator)
    const songSig = `${validatedSong.name.toLowerCase().trim()}::${(validatedSong.creator || "").toLowerCase().trim()}`;
    const existingIndex = this.customMaps.findIndex(
      (m) => m.id === validatedSong.id || `${m.name.toLowerCase().trim()}::${(m.creator || "").toLowerCase().trim()}` === songSig
    );

    if (existingIndex !== -1) {
      const existing = this.customMaps[existingIndex];
      // Merge all difficulty tracks from imported song into the existing song without duplicating!
      if (!existing.difficulties) existing.difficulties = {};
      for (const [diffName, diffData] of Object.entries(validatedSong.difficulties)) {
        existing.difficulties[diffName] = {
          ...diffData,
          notes: this.cloneNotes(diffData.notes || [])
        };
      }
      if (validatedSong.background) {
        existing.background = { ...validatedSong.background };
      }
      this.normalizeSongDifficulties(existing);
      this.saveCustomMapsToStorage();
      return existing;
    }

    // New song: generate unique custom ID
    const uniqueId = validatedSong.id && String(validatedSong.id).startsWith("custom_")
      ? validatedSong.id
      : `custom_import_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const importedSong = {
      ...validatedSong,
      id: uniqueId,
      date: new Date().toISOString().split("T")[0],
      isCustom: true,
      isDefault: false,
      difficulties: { ...validatedSong.difficulties }
    };
    this.normalizeSongDifficulties(importedSong);

    this.customMaps.unshift(importedSong);
    this.saveCustomMapsToStorage();
    return importedSong;
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

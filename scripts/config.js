/**
 * @file config.js
 * @description Dedicated central configuration file for Project Alpha Plus.
 * Defines the list of default track files to load on application startup.
 *
 * TO ADD OR CHANGE DEFAULT SONGS:
 * Simply add or modify paths in the `defaultTracks` list below (or in config.json).
 * On startup, the game reads this list and automatically loads every specified song.
 */

const APP_CONFIG = {
  /**
   * List of default track files to load on application startup.
   * Supports both backslashes ("\") and forward slashes ("/").
   * @type {Array<string>}
   */
  defaultTracks: [
    "Default Tracks\\MoodMode.json",
    "Default Tracks\\Beating Like Hearth.json",
    "Default Tracks\\Chance.json"
  ],

  /**
   * Path to the folder containing default track .json files.
   * Can be relative to the application root (e.g., "Default Tracks", "Tracks", or "Assets/Tracks").
   * @type {string}
   */
  defaultTracksPath: "Default Tracks",

  /**
   * Alternate directory paths to search if the primary folder is moved or not found.
   * @type {Array<string>}
   */
  alternateTracksPaths: [
    "Assets/Default Tracks"
  ],

  /**
   * Supported file extensions for track files.
   * @type {Array<string>}
   */
  supportedTrackExtensions: [
    ".json"
  ],

  /**
   * Storage keys for browser localStorage persistence.
   */
  storageKeys: {
    customMaps: "project_alpha_custom_maps",
    mapOverrides: "project_alpha_map_overrides",
    deletedTracks: "project_alpha_deleted_tracks",
    highscores: "project_alpha_highscores",
    defaultTracksCache: "project_alpha_default_tracks_cache",
    defaultTracksFilenames: "project_alpha_default_tracks_filenames",
    selectedSongId: "project_alpha_selected_song_id",
    songOrder: "project_alpha_song_order",
    difficultyOrders: "project_alpha_difficulty_orders"
  }
};

// In Node.js / CLI environment, check if a root config.json exists to allow external overrides
if (typeof process !== "undefined" && typeof require === "function") {
  try {
    const fs = require("fs");
    const path = require("path");
    const jsonConfigPath = path.resolve("config.json");
    if (fs.existsSync(jsonConfigPath)) {
      const raw = fs.readFileSync(jsonConfigPath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (parsed.defaultTracksPath) APP_CONFIG.defaultTracksPath = parsed.defaultTracksPath;
        if (Array.isArray(parsed.alternateTracksPaths)) APP_CONFIG.alternateTracksPaths = parsed.alternateTracksPaths;
        if (Array.isArray(parsed.supportedTrackExtensions)) APP_CONFIG.supportedTrackExtensions = parsed.supportedTrackExtensions;
      }
    }
  } catch (e) {
    // Non-fatal error reading config.json; proceed with built-in configuration
  }
}

// Expose configuration globally in browser environment
if (typeof window !== "undefined") {
  window.APP_CONFIG = APP_CONFIG;
  window.GAME_CONFIG = APP_CONFIG; // Convenience alias
}

// Expose in CommonJS / Node.js testing environment
if (typeof module !== "undefined" && module.exports) {
  module.exports = APP_CONFIG;
}

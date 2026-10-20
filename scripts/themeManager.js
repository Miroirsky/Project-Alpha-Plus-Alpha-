/**
 * @file themeManager.js
 * @description Manages UI theme states, user preferences, and DOM theme attributes.
 * Supports distinct color themes sharing the same 4-role design philosophy:
 *  - Terracotta (Warm Earth / Current Signature)
 *  - Midnight (Oceanic Indigo & Frost)
 *  - Sage (Botanical Evergreen & Mint Dew)
 *  - Amethyst (Imperial Plum & Heather Quartz)
 */

const THEME_STORAGE_KEY = "project_alpha_theme";
const THEME_DEFAULT = "terracotta";
const THEME_ALIASES = {
  dark: "terracotta",
  light: "sage"
};
const THEME_SUPPORTED = ["terracotta", "midnight", "sage", "amethyst", "dark", "light"];

class ThemeManager {
  /**
   * Initializes theme manager and applies saved or default theme.
   */
  constructor() {
    this.currentTheme = this.loadSavedTheme();
    this.listeners = new Set();
  }

  /**
   * Normalizes theme names and legacy aliases.
   * @param {string} themeName
   * @returns {string}
   */
  normalizeTheme(themeName) {
    if (!themeName) return THEME_DEFAULT;
    const lower = String(themeName).toLowerCase();
    return THEME_ALIASES[lower] || lower;
  }

  /**
   * Loads saved theme preference from localStorage.
   * @returns {string} The active theme identifier.
   */
  loadSavedTheme() {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved) {
        const normalized = this.normalizeTheme(saved);
        if (THEME_SUPPORTED.includes(normalized)) {
          return normalized;
        }
      }
    } catch (err) {
      console.warn("Unable to access localStorage for theme:", err);
    }
    return THEME_DEFAULT;
  }

  /**
   * Applies the theme to documentElement and saves preference.
   * @param {string} themeName
   */
  setTheme(themeName) {
    const normalized = this.normalizeTheme(themeName);
    if (!THEME_SUPPORTED.includes(normalized)) {
      console.warn(`Theme "${themeName}" is not supported.`);
      return;
    }

    this.currentTheme = normalized;
    document.documentElement.setAttribute("data-theme", normalized);

    try {
      localStorage.setItem(THEME_STORAGE_KEY, normalized);
    } catch (err) {
      console.warn("Unable to save theme to localStorage:", err);
    }

    this.notifyListeners(normalized);
  }

  /**
   * Gets the currently active theme.
   * @returns {string}
   */
  getTheme() {
    return this.currentTheme;
  }

  /**
   * Returns list of primary supported theme identifiers.
   * @returns {string[]}
   */
  getSupportedThemes() {
    return ["terracotta", "midnight", "sage", "amethyst"];
  }

  /**
   * Subscribes a callback to theme changes.
   * @param {Function} callback
   */
  onThemeChange(callback) {
    this.listeners.add(callback);
  }

  /**
   * Notifies subscribers of a theme change.
   * @private
   */
  notifyListeners(theme) {
    this.listeners.forEach((callback) => {
      try {
        callback(theme);
      } catch (err) {
        console.error("Error in theme change listener:", err);
      }
    });
  }

  /**
   * Initializes theme on page load.
   */
  init() {
    this.setTheme(this.currentTheme);
  }
}

// Expose to window and module
if (typeof window !== "undefined") {
  window.ThemeManager = ThemeManager;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = ThemeManager;
}

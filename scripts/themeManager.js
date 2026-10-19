/**
 * @file themeManager.js
 * @description Manages UI theme states, user preferences, and DOM theme attributes.
 */

const THEME_STORAGE_KEY = "project_alpha_theme";
const THEME_DEFAULT = "dark";
const THEME_SUPPORTED = ["dark", "midnight", "light"];

class ThemeManager {
  /**
   * Initializes theme manager and applies saved or default theme.
   */
  constructor() {
    this.currentTheme = this.loadSavedTheme();
    this.listeners = new Set();
  }

  /**
   * Loads saved theme preference from localStorage.
   * @returns {string} The active theme identifier.
   */
  loadSavedTheme() {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved && THEME_SUPPORTED.includes(saved)) {
        return saved;
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
    if (!THEME_SUPPORTED.includes(themeName)) {
      console.warn(`Theme "${themeName}" is not supported.`);
      return;
    }

    this.currentTheme = themeName;
    document.documentElement.setAttribute("data-theme", themeName);

    try {
      localStorage.setItem(THEME_STORAGE_KEY, themeName);
    } catch (err) {
      console.warn("Unable to save theme to localStorage:", err);
    }

    this.notifyListeners(themeName);
  }

  /**
   * Gets the currently active theme.
   * @returns {string}
   */
  getTheme() {
    return this.currentTheme;
  }

  /**
   * Returns list of supported theme identifiers.
   * @returns {string[]}
   */
  getSupportedThemes() {
    return [...THEME_SUPPORTED];
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

// Expose to window
window.ThemeManager = ThemeManager;

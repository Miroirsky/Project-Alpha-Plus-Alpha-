/**
 * @file webLanding.js
 * @description Detects whether Project Alpha Plus is running inside Electron or a Web Browser.
 * When running in a Web Browser, presents the dedicated Web Showcase & Installer Download Page
 * allowing users to download the standalone Windows installer/downloader (`PAPLUS-Downloader.exe`).
 * In Electron, remains completely hidden so the native desktop game interface operates normally.
 */

class WebLanding {
  /**
   * @param {Object} options
   * @param {ThemeManager} [options.themeManager]
   * @param {SoundManager} [options.soundManager]
   */
  constructor({ themeManager = null, soundManager = null } = {}) {
    this.themeManager = themeManager;
    this.soundManager = soundManager;

    this.view = typeof document !== "undefined" ? document.getElementById("web-landing-view") : null;
    this.mainMenuCard = typeof document !== "undefined" ? document.getElementById("main-menu-card") : null;
    this.heroDownloadBtn = typeof document !== "undefined" ? document.getElementById("btn-web-download-installer") : null;
    this.navDownloadBtn = typeof document !== "undefined" ? document.getElementById("btn-web-nav-download") : null;
    this.bottomDownloadBtn = typeof document !== "undefined" ? document.getElementById("btn-web-bottom-download") : null;
    this.statusBanner = typeof document !== "undefined" ? document.getElementById("web-download-status-banner") : null;
    this.statusText = typeof document !== "undefined" ? document.getElementById("web-download-status-text") : null;
    this.previewVideo = typeof document !== "undefined" ? document.getElementById("web-preview-video") : null;
    this.themeDots = typeof document !== "undefined" ? document.querySelectorAll(".web-theme-dot-btn") : [];
  }

  /**
   * Reliably detects whether the application is running inside the Electron desktop runtime
   * versus a standard web browser.
   * Supports `?env=web` or `?env=electron` query parameter overrides for testing.
   * @returns {boolean} true if running in Electron, false if running in a Web Browser
   */
  static isElectronEnvironment() {
    if (typeof window === "undefined") return false;

    try {
      if (window.location && typeof window.location.search === "string" && window.location.search) {
        const params = new URLSearchParams(window.location.search);
        const envOverride = (params.get("env") || params.get("mode") || "").toLowerCase();
        if (envOverride === "web" || envOverride === "browser") return false;
        if (envOverride === "electron" || envOverride === "desktop") return true;
      }
    } catch (e) {}

    if (window.electronAPI && window.electronAPI.isElectron === true) {
      return true;
    }

    const ua =
      (window.navigator && typeof window.navigator.userAgent === "string" && window.navigator.userAgent) ||
      (typeof navigator !== "undefined" && typeof navigator.userAgent === "string" ? navigator.userAgent : "");
    if (ua && /Electron\/\d+/i.test(ua)) {
      return true;
    }

    if (
      typeof window.process === "object" &&
      window.process !== null &&
      window.process.versions &&
      Boolean(window.process.versions.electron)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Initializes and displays the Web Landing page (called only in Web Browser mode).
   */
  initWebMode() {
    if (typeof document !== "undefined") {
      if (document.documentElement) {
        document.documentElement.classList.remove("is-electron-mode");
        document.documentElement.classList.add("is-web-mode");
      }
      if (document.body) {
        document.body.classList.remove("is-electron-mode");
        document.body.classList.add("is-web-mode");
      }
    }

    if (this.mainMenuCard) {
      this.mainMenuCard.style.display = "none";
      this.mainMenuCard.setAttribute("aria-hidden", "true");
    }

    if (this.view) {
      this.view.style.display = "";
      this.view.classList.add("is-active");
      this.view.setAttribute("aria-hidden", "false");
    }

    this.bindEvents();
    this.syncThemeDots();

    if (this.previewVideo && typeof this.previewVideo.play === "function") {
      this.previewVideo.play().catch(() => {});
    }
  }

  /**
   * Ensures the Web Landing page is hidden when running inside Electron.
   */
  hideForElectron() {
    if (typeof document !== "undefined") {
      if (document.documentElement) {
        document.documentElement.classList.remove("is-web-mode");
        document.documentElement.classList.add("is-electron-mode");
      }
      if (document.body) {
        document.body.classList.remove("is-web-mode");
        document.body.classList.add("is-electron-mode");
      }
    }
    if (this.view) {
      this.view.classList.remove("is-active");
      this.view.setAttribute("aria-hidden", "true");
      this.view.style.display = "none";
    }
    if (this.mainMenuCard) {
      this.mainMenuCard.style.display = "";
      this.mainMenuCard.removeAttribute("aria-hidden");
    }
  }

  /**
   * Binds download actions, theme preview buttons, and smooth section navigation.
   */
  bindEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;

    const handleDownloadClick = (e) => {
      if (e && typeof e.preventDefault === "function") {
        e.preventDefault();
      }
      this.triggerInstallerDownload();
    };

    if (this.heroDownloadBtn) {
      this.heroDownloadBtn.addEventListener("click", handleDownloadClick);
    }
    if (this.navDownloadBtn) {
      this.navDownloadBtn.addEventListener("click", handleDownloadClick);
    }
    if (this.bottomDownloadBtn) {
      this.bottomDownloadBtn.addEventListener("click", handleDownloadClick);
    }

    if (this.themeDots && this.themeDots.length > 0) {
      this.themeDots.forEach((btn) => {
        btn.addEventListener("click", () => {
          const theme = btn.getAttribute("data-theme");
          if (theme && this.themeManager && typeof this.themeManager.setTheme === "function") {
            this.themeManager.setTheme(theme);
            this.syncThemeDots();
            if (this.soundManager && typeof this.soundManager.playClick === "function") {
              try { this.soundManager.playClick(); } catch (err) {}
            }
          }
        });
      });
    }
  }

  /**
   * Updates active indicator on web navbar theme dots.
   */
  syncThemeDots() {
    if (!this.themeManager || !this.themeDots) return;
    const current = (this.themeManager.getTheme() || "terracotta").toLowerCase();
    this.themeDots.forEach((btn) => {
      const target = (btn.getAttribute("data-theme") || "").toLowerCase();
      btn.classList.toggle("is-active", target === current);
    });
  }

  /**
   * Triggers download of `PAPLUS-Downloader.exe` and displays installation guidance.
   */
  triggerInstallerDownload() {
    if (this.soundManager && typeof this.soundManager.playClick === "function") {
      try {
        this.soundManager.playClick();
      } catch (e) {}
    }

    const downloaderFileName = "PAPLUS-Downloader.exe";
    const downloadUrl = "./PAPLUS-Downloader.exe";

    if (typeof document !== "undefined") {
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.setAttribute("download", downloaderFileName);
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    if (this.statusBanner) {
      this.statusBanner.classList.add("is-visible");
    }
    if (this.statusText) {
      this.statusText.textContent =
        "✓ Downloading PAPLUS-Downloader.exe — Launch it to select your install folder, create a Desktop shortcut, and install Project Alpha Plus.";
    }
  }
}

if (typeof window !== "undefined") {
  window.WebLanding = WebLanding;

  const autoBootWebLanding = () => {
    try {
      if (!WebLanding.isElectronEnvironment()) {
        if (!window.__paplusWebLandingInstance) {
          const themeManager = window.ThemeManager ? new window.ThemeManager() : null;
          if (themeManager && typeof themeManager.init === "function") {
            themeManager.init();
          }
          const soundManager = window.soundManager || (window.SoundManager ? new window.SoundManager() : null);
          window.__paplusWebLandingInstance = new WebLanding({ themeManager, soundManager });
        }
        window.__paplusWebLandingInstance.initWebMode();
      }
    } catch (e) {}
  };

  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", autoBootWebLanding);
    } else {
      autoBootWebLanding();
    }
  }
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = WebLanding;
}

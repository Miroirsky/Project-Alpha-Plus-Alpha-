/**
 * @file mediaStorage.js
 * @description Provides persistent local storage for track media assets (audio, background videos and images)
 * using IndexedDB with in-memory caching and fallback.
 */

class MediaStorage {
  static db = null;
  static memoryCache = new Map();

  /**
   * Opens or returns the IndexedDB instance for Project Alpha Plus media.
   * @returns {Promise<IDBDatabase|null>}
   */
  static async getDB() {
    if (this.db) return this.db;
    if (typeof window === "undefined" || !window.indexedDB) return null;

    return new Promise((resolve) => {
      try {
        const req = indexedDB.open("ProjectAlphaPlus_MediaDB", 2);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains("backgrounds")) {
            db.createObjectStore("backgrounds", { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains("audio")) {
            db.createObjectStore("audio", { keyPath: "id" });
          }
        };
        req.onsuccess = (e) => {
          this.db = e.target.result;
          resolve(this.db);
        };
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  /**
   * Stores a media Blob or DataURL into IndexedDB and in-memory cache.
   * @param {string} id
   * @param {Blob|string} blobOrDataUrl
   * @param {Object} [metadata]
   * @returns {Promise<string>} id
   */
  static async saveBackgroundMedia(id, blobOrDataUrl, metadata = {}) {
    if (!id || !blobOrDataUrl) return id;
    this.memoryCache.set(`bg_${id}`, blobOrDataUrl);

    try {
      const db = await this.getDB();
      if (!db) return id;

      return new Promise((resolve) => {
        const tx = db.transaction("backgrounds", "readwrite");
        const store = tx.objectStore("backgrounds");
        store.put({ id, data: blobOrDataUrl, metadata, timestamp: Date.now() });
        tx.oncomplete = () => resolve(id);
        tx.onerror = () => resolve(id);
      });
    } catch (e) {
      return id;
    }
  }

  /**
   * Stores an audio Blob or DataURL into IndexedDB and in-memory cache.
   * @param {string} id
   * @param {Blob|string} blobOrDataUrl
   * @param {Object} [metadata]
   * @returns {Promise<string>} id
   */
  static async saveAudio(id, blobOrDataUrl, metadata = {}) {
    if (!id || !blobOrDataUrl) return id;
    this.memoryCache.set(`audio_${id}`, blobOrDataUrl);

    try {
      const db = await this.getDB();
      if (!db) return id;

      return new Promise((resolve) => {
        const tx = db.transaction("audio", "readwrite");
        const store = tx.objectStore("audio");
        store.put({ id, data: blobOrDataUrl, metadata, timestamp: Date.now() });
        tx.oncomplete = () => resolve(id);
        tx.onerror = () => resolve(id);
      });
    } catch (e) {
      return id;
    }
  }

  /**
   * Retrieves an audio Blob or DataURL from cache or IndexedDB.
   * @param {string} id
   * @returns {Promise<Blob|string|null>}
   */
  static async getAudio(id) {
    if (!id) return null;
    const cacheKey = `audio_${id}`;
    if (this.memoryCache.has(cacheKey)) {
      return this.memoryCache.get(cacheKey);
    }

    try {
      const db = await this.getDB();
      if (!db) return null;

      return new Promise((resolve) => {
        const tx = db.transaction("audio", "readonly");
        const store = tx.objectStore("audio");
        const req = store.get(id);
        req.onsuccess = () => {
          if (req.result && req.result.data) {
            this.memoryCache.set(cacheKey, req.result.data);
            resolve(req.result.data);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  }

  /**
   * Retrieves an audio asset as a playable URL (Blob URL or Data URL).
   * Generates a fresh, valid object URL for the active session.
   * @param {string} id
   * @returns {Promise<string|null>}
   */
  static async getAudioUrl(id) {
    if (!id) return null;
    const stored = await this.getAudio(id);
    if (!stored) return null;
    if (typeof stored === "string") {
      return stored;
    }
    if (typeof Blob !== "undefined" && stored instanceof Blob) {
      return URL.createObjectURL(stored);
    }
    return null;
  }

  /**
   * Deletes a stored audio asset.
   * @param {string} id
   */
  static async deleteAudio(id) {
    if (!id) return;
    this.memoryCache.delete(`audio_${id}`);
    try {
      const db = await this.getDB();
      if (!db) return;
      const tx = db.transaction("audio", "readwrite");
      tx.objectStore("audio").delete(id);
    } catch (e) {}
  }

  /**
   * Converts a Blob or live blob URL to a self-contained Base64 Data URL.
   * Ensures exported songs contain their music and never have dead blob: URLs.
   * @param {Blob|string} blobOrUrl
   * @returns {Promise<string>}
   */
  static async resolveBlobToDataUrl(blobOrUrl) {
    if (!blobOrUrl) return null;
    if (typeof blobOrUrl === "string") {
      if (blobOrUrl.startsWith("data:") || blobOrUrl.startsWith("Assets/") || blobOrUrl.startsWith("http")) {
        return blobOrUrl;
      }
      if (blobOrUrl.startsWith("blob:")) {
        try {
          const res = await fetch(blobOrUrl);
          if (res.ok) {
            const blob = await res.blob();
            return await this.blobToDataUrl(blob);
          }
        } catch (e) {}
      }
      return blobOrUrl;
    }
    if (typeof Blob !== "undefined" && blobOrUrl instanceof Blob) {
      return await this.blobToDataUrl(blobOrUrl);
    }
    return null;
  }

  /**
   * Converts a Blob to a Base64 data URL.
   * @param {Blob} blob
   * @returns {Promise<string>}
   */
  static async blobToDataUrl(blob) {
    if (!blob) return null;
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Retrieves a media Blob or DataURL from cache or IndexedDB.
   * @param {string} id
   * @returns {Promise<Blob|string|null>}
   */
  static async getBackgroundMedia(id) {
    if (!id) return null;
    if (this.memoryCache.has(id)) {
      return this.memoryCache.get(id);
    }

    try {
      const db = await this.getDB();
      if (!db) return null;

      return new Promise((resolve) => {
        const tx = db.transaction("backgrounds", "readonly");
        const store = tx.objectStore("backgrounds");
        const req = store.get(id);
        req.onsuccess = () => {
          if (req.result && req.result.data) {
            this.memoryCache.set(id, req.result.data);
            resolve(req.result.data);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  }

  /**
   * Deletes a stored background media asset.
   * @param {string} id
   */
  static async deleteBackgroundMedia(id) {
    if (!id) return;
    this.memoryCache.delete(id);
    try {
      const db = await this.getDB();
      if (!db) return;
      const tx = db.transaction("backgrounds", "readwrite");
      tx.objectStore("backgrounds").delete(id);
    } catch (e) {}
  }
}

// Expose to window / global
if (typeof window !== "undefined") {
  window.MediaStorage = MediaStorage;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = MediaStorage;
}

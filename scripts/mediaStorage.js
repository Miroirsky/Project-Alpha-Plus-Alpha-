/**
 * @file mediaStorage.js
 * @description Provides persistent local storage for track media assets (background videos and images)
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
        const req = indexedDB.open("ProjectAlphaPlus_MediaDB", 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains("backgrounds")) {
            db.createObjectStore("backgrounds", { keyPath: "id" });
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
    this.memoryCache.set(id, blobOrDataUrl);

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

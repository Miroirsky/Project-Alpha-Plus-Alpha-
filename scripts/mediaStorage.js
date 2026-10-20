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
        const req = indexedDB.open("ProjectAlphaPlus_MediaDB", 4);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains("backgrounds")) {
            db.createObjectStore("backgrounds", { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains("audio")) {
            db.createObjectStore("audio", { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains("custom_maps")) {
            db.createObjectStore("custom_maps", { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains("system_handles")) {
            db.createObjectStore("system_handles", { keyPath: "key" });
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
   * Converts a Base64 data URL to a binary Blob.
   * @param {string} dataUrl
   * @returns {Blob|null}
   */
  static dataUrlToBlob(dataUrl) {
    if (!dataUrl || typeof dataUrl !== "string") return null;
    if (!dataUrl.startsWith("data:")) return null;
    try {
      const parts = dataUrl.split(",");
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : "audio/mpeg";
      const b64 = parts[1];
      const binaryStr = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
      const len = binaryStr.length;
      const u8arr = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        u8arr[i] = binaryStr.charCodeAt(i);
      }
      return new Blob([u8arr], { type: mime });
    } catch (e) {
      return null;
    }
  }

  /**
   * Stores an audio Blob or DataURL into IndexedDB and in-memory cache.
   * Converts DataURLs to binary Blobs for compact, native audio streaming.
   * @param {string} id
   * @param {Blob|string} blobOrDataUrl
   * @param {Object} [metadata]
   * @returns {Promise<string>} id
   */
  static async saveAudio(id, blobOrDataUrl, metadata = {}) {
    if (!id || !blobOrDataUrl) return id;

    let dataToStore = blobOrDataUrl;
    if (typeof blobOrDataUrl === "string" && blobOrDataUrl.startsWith("data:")) {
      const blob = this.dataUrlToBlob(blobOrDataUrl);
      if (blob) {
        dataToStore = blob;
      }
    }

    this.memoryCache.set(`audio_${id}`, dataToStore);

    try {
      const db = await this.getDB();
      if (!db) return id;

      return new Promise((resolve) => {
        const tx = db.transaction("audio", "readwrite");
        const store = tx.objectStore("audio");
        store.put({ id, data: dataToStore, metadata, timestamp: Date.now() });
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
    let stored = await this.getAudio(id);
    if (!stored && typeof window !== "undefined" && window.DEFAULT_AUDIO_DATA) {
      const cleanName = String(id).replace("default_", "").replace(/_/g, " ");
      let bundled = window.DEFAULT_AUDIO_DATA[id] || window.DEFAULT_AUDIO_DATA[cleanName] || window.DEFAULT_AUDIO_DATA[id.replace("default_", "")];
      if (!bundled) {
        const idLower = String(id).toLowerCase().replace("default_", "").replace(/_/g, " ").trim();
        for (const [k, v] of Object.entries(window.DEFAULT_AUDIO_DATA)) {
          if (k.toLowerCase().replace("default_", "").replace(/_/g, " ").trim() === idLower) {
            bundled = v;
            break;
          }
        }
      }
      if (bundled) {
        await this.saveAudio(id, bundled);
        stored = await this.getAudio(id);
      }
    }
    if (!stored) return null;
    if (typeof Blob !== "undefined" && stored instanceof Blob) {
      return URL.createObjectURL(stored);
    }
    if (typeof stored === "string") {
      if (stored.startsWith("data:")) {
        const blob = this.dataUrlToBlob(stored);
        if (blob) {
          return URL.createObjectURL(blob);
        }
      }
      return stored;
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
   * Retrieves stored audio for a song converted into a Base64 Data URL.
   * Ensures exported tracks always contain their complete audio payload.
   * @param {string} id
   * @returns {Promise<string|null>}
   */
  static async getAudioAsDataUrl(id) {
    if (!id) return null;
    const stored = await this.getAudio(id);
    if (stored) {
      if (typeof stored === "string" && stored.startsWith("data:")) {
        return stored;
      }
      if (typeof Blob !== "undefined" && stored instanceof Blob) {
        return await this.blobToDataUrl(stored);
      }
    }
    return null;
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
   * Persists all custom maps to IndexedDB for zero-quota safety.
   * @param {Array} maps
   */
  static async saveMaps(maps) {
    if (!Array.isArray(maps)) return;
    try {
      const db = await this.getDB();
      if (!db || !db.objectStoreNames.contains("custom_maps")) return;
      const tx = db.transaction("custom_maps", "readwrite");
      const store = tx.objectStore("custom_maps");
      for (const map of maps) {
        if (map && map.id) {
          store.put(map);
        }
      }
    } catch (e) {}
  }

  /**
   * Retrieves all custom maps from IndexedDB.
   * @returns {Promise<Array>}
   */
  static async getMaps() {
    try {
      const db = await this.getDB();
      if (!db || !db.objectStoreNames.contains("custom_maps")) return [];
      return new Promise((resolve) => {
        const tx = db.transaction("custom_maps", "readonly");
        const store = tx.objectStore("custom_maps");
        const req = store.getAll();
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
        req.onerror = () => resolve([]);
      });
    } catch (e) {
      return [];
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

  /**
   * Saves a FileSystemDirectoryHandle or FileSystemFileHandle into IndexedDB.
   * @param {string} key
   * @param {FileSystemHandle} handle
   * @returns {Promise<boolean>}
   */
  static async saveFolderHandle(key, handle) {
    if (!key || !handle) return false;
    try {
      const db = await this.getDB();
      if (!db || !db.objectStoreNames.contains("system_handles")) return false;
      return new Promise((resolve) => {
        const tx = db.transaction("system_handles", "readwrite");
        tx.objectStore("system_handles").put({ key, handle, timestamp: Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (e) {
      return false;
    }
  }

  /**
   * Retrieves a previously saved FileSystemHandle by key.
   * @param {string} key
   * @returns {Promise<FileSystemHandle|null>}
   */
  static async getFolderHandle(key) {
    if (!key) return null;
    try {
      const db = await this.getDB();
      if (!db || !db.objectStoreNames.contains("system_handles")) return null;
      return new Promise((resolve) => {
        const tx = db.transaction("system_handles", "readonly");
        const req = tx.objectStore("system_handles").get(key);
        req.onsuccess = () => {
          resolve(req.result ? req.result.handle : null);
        };
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  }
}

// Expose to window / global
if (typeof window !== "undefined") {
  window.MediaStorage = MediaStorage;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = MediaStorage;
}

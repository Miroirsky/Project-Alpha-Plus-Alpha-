/**
 * @file musicPlayer.js
 * @description Manages song audio playback for both menu previews (looped)
 * and active gameplay tracking (synchronized time updates, unlooped),
 * tied to the global SoundManager volume.
 */

class MusicPlayer {
  /**
   * @param {Object} dependencies
   * @param {SoundManager} dependencies.soundManager
   */
  constructor({ soundManager = null } = {}) {
    this.soundManager = soundManager;
    this.currentAudio = null;
    this.currentSongId = null;
    this.mode = null; // 'preview' | 'game'
    this.playbackRate = 1.0;

    // Listen for volume/enabled changes from SoundManager
    if (this.soundManager) {
      this.soundManager.onChange(() => {
        this.syncVolume();
      });
    }
  }

  /**
   * Sets playback rate/speed for the current audio (editor/playtesting).
   * @param {number} rate
   */
  setPlaybackRate(rate = 1.0) {
    this.playbackRate = Math.max(0.25, Math.min(2.0, Number(rate) || 1.0));
    if (this.currentAudio) {
      this.currentAudio.playbackRate = this.playbackRate;
    }
  }

  /**
   * Returns current playback rate.
   * @returns {number}
   */
  getPlaybackRate() {
    return this.playbackRate;
  }

  /**
   * Calculates the target volume based on SoundManager settings.
   * @returns {number} 0.0 to 1.0
   */
  getTargetVolume() {
    if (!this.soundManager || !this.soundManager.isEnabled()) {
      return 0;
    }
    return Math.max(0, Math.min(1, this.soundManager.getVolume() / 100));
  }

  /**
   * Resolves a working audio URL (preferably a streaming Blob URL) for any song.
   * Ensures songs under file:/// protocol never fail from relative path restrictions.
   * @param {Object} song
   * @returns {Promise<string|null>}
   */
  async resolveSongAudioUrl(song) {
    if (!song) return null;

    // 1. Check MediaStorage first to get a guaranteed live Blob URL for the current session
    if (typeof window !== "undefined" && window.MediaStorage && song.id) {
      try {
        const fresh = await window.MediaStorage.getAudioUrl(song.id);
        if (fresh) {
          song.file = fresh;
          return fresh;
        }
      } catch (e) {}
    }

    // 2. Check bundled default audio data
    if (typeof window !== "undefined" && window.DEFAULT_AUDIO_DATA) {
      const cleanName = String(song.id || "").replace("default_", "").replace(/_/g, " ");
      let b64 = window.DEFAULT_AUDIO_DATA[song.id] ||
                window.DEFAULT_AUDIO_DATA[song.name] ||
                window.DEFAULT_AUDIO_DATA[cleanName] ||
                window.DEFAULT_AUDIO_DATA[String(song.id || "").replace("default_", "")];
      if (!b64) {
        const target = String(song.id || song.name || "").toLowerCase().replace("default_", "").replace(/_/g, " ").trim();
        for (const [k, v] of Object.entries(window.DEFAULT_AUDIO_DATA)) {
          if (k.toLowerCase().replace("default_", "").replace(/_/g, " ").trim() === target) {
            b64 = v;
            break;
          }
        }
      }
      if (b64) {
        if (window.MediaStorage && typeof window.MediaStorage.dataUrlToBlob === "function") {
          try {
            const blob = window.MediaStorage.dataUrlToBlob(b64);
            if (blob) {
              const fresh = URL.createObjectURL(blob);
              song.file = fresh;
              if (song.id) {
                window.MediaStorage.saveAudio(song.id, blob).catch(() => {});
              }
              return fresh;
            }
          } catch (e2) {}
        }
        return b64;
      }
    }

    // 3. If song.file is an embedded data: URL, convert to native Blob URL for smooth native playback
    let url = song.file;
    if (url && typeof url === "string" && url.startsWith("data:audio")) {
      if (window.MediaStorage && typeof window.MediaStorage.dataUrlToBlob === "function") {
        try {
          const blob = window.MediaStorage.dataUrlToBlob(url);
          if (blob) {
            const fresh = URL.createObjectURL(blob);
            song.file = fresh;
            if (song.id) {
              window.MediaStorage.saveAudio(song.id, blob).catch(() => {});
            }
            return fresh;
          }
        } catch (e3) {}
      }
      return url;
    }

    // 4. If already a blob: URL created in current session, use it
    if (url && typeof url === "string" && url.startsWith("blob:")) {
      return url;
    }

    return url || null;
  }

  /**
   * Starts playing a preview for the specified song in a loop.
   * @param {Object} song
   */
  async playPreview(song) {
    if (!song) return;

    // Safety guard: Never play preview music if editor or gameplay view is active
    if (typeof document !== "undefined") {
      const editorView = document.getElementById("map-editor-view");
      if (editorView && editorView.classList.contains("is-active")) {
        return;
      }
      const gameView = document.getElementById("game-view");
      if (gameView && gameView.classList.contains("is-active")) {
        return;
      }
    }

    // If already playing this exact track in preview mode, keep playing
    if (this.mode === "preview" && this.currentSongId === song.id && this.currentAudio && !this.currentAudio.paused) {
      return;
    }

    this.stop();

    this.mode = "preview";
    this.currentSongId = song.id;

    const audioUrl = await this.resolveSongAudioUrl(song);
    if (!audioUrl) return;

    // Verify still in preview mode for this song after async resolution
    if (this.mode !== "preview" || this.currentSongId !== song.id) return;

    try {
      const audio = new Audio(audioUrl);
      audio.loop = true;
      audio.volume = this.getTargetVolume();
      this.currentAudio = audio;

      audio.addEventListener("error", async (err) => {
        console.warn(`Audio preview play issue for ${song.name}:`, err);
        try {
          const freshUrl = await this.resolveSongAudioUrl(song);
          if (freshUrl && freshUrl !== audioUrl && this.currentAudio === audio) {
            audio.removeAttribute("src");
            audio.load();
            const freshAudio = new Audio(freshUrl);
            freshAudio.loop = true;
            freshAudio.volume = this.getTargetVolume();
            this.currentAudio = freshAudio;
            freshAudio.play().catch(() => {});
          }
        } catch (e) {}
      });

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn(`Audio preview play prevented for ${song.name}:`, err);
        });
      }
    } catch (err) {
      console.warn("Error creating or playing preview audio:", err);
    }
  }

  /**
   * Starts full unlooped playback of a song for gameplay.
   * @param {Object} song
   * @param {Object} callbacks
   * @param {Function} callbacks.onTimeUpdate
   * @param {Function} callbacks.onEnded
   */
  async playSong(song, { onTimeUpdate, onEnded } = {}) {
    if (!song) return;

    this.stop();

    this.mode = "game";
    this.currentSongId = song.id;

    const audioUrl = await this.resolveSongAudioUrl(song);
    if (!audioUrl) {
      console.warn(`No playable audio URL found for song "${song.name}".`);
      return;
    }

    // Verify still in game mode for this song after async resolution
    if (this.mode !== "game" || this.currentSongId !== song.id) return;

    try {
      const audio = new Audio(audioUrl);
      audio.loop = false;
      audio.currentTime = 0;
      audio.volume = this.getTargetVolume();
      audio.playbackRate = this.playbackRate;
      this.currentAudio = audio;

      if (onTimeUpdate) {
        audio.addEventListener("timeupdate", () => {
          onTimeUpdate(audio.currentTime, audio.duration || song.durationSeconds);
        });
      }

      if (onEnded) {
        audio.addEventListener("ended", onEnded);
      }

      audio.addEventListener("error", async (err) => {
        console.warn(`Gameplay audio play issue for ${song.name}:`, err);
        try {
          const freshUrl = await this.resolveSongAudioUrl(song);
          if (freshUrl && freshUrl !== audioUrl && this.currentAudio === audio) {
            audio.removeAttribute("src");
            audio.load();
            const freshAudio = new Audio(freshUrl);
            freshAudio.loop = false;
            freshAudio.currentTime = audio.currentTime || 0;
            freshAudio.volume = this.getTargetVolume();
            freshAudio.playbackRate = this.playbackRate;
            this.currentAudio = freshAudio;
            if (onTimeUpdate) {
              freshAudio.addEventListener("timeupdate", () => {
                onTimeUpdate(freshAudio.currentTime, freshAudio.duration || song.durationSeconds);
              });
            }
            if (onEnded) {
              freshAudio.addEventListener("ended", onEnded);
            }
            freshAudio.play().catch(() => {});
          }
        } catch (e) {}
      });

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn(`Gameplay audio play prevented for ${song.name}:`, err);
        });
      }
    } catch (err) {
      console.warn("Error starting gameplay audio:", err);
    }
  }

  /**
   * Pauses current audio.
   */
  pause() {
    if (this.currentAudio && !this.currentAudio.paused) {
      this.currentAudio.pause();
    }
  }

  /**
   * Resumes paused audio.
   */
  resume() {
    if (this.currentAudio && this.currentAudio.paused) {
      const playPromise = this.currentAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch((e) => console.warn(e));
      }
    }
  }

  /**
   * Stops any currently playing audio.
   */
  stop() {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio.removeAttribute("src");
        this.currentAudio.load();
      } catch (err) {
        console.warn("Error stopping audio:", err);
      }
      this.currentAudio = null;
    }
    this.currentSongId = null;
    this.mode = null;
  }

  /**
   * Alias for stopPreview for backward compatibility.
   */
  stopPreview() {
    if (this.mode === "preview") {
      this.stop();
    }
  }

  /**
   * Returns whether audio is actively playing.
   * @returns {boolean}
   */
  isPlaying() {
    return Boolean(
      this.currentAudio &&
      !this.currentAudio.paused &&
      !this.currentAudio.ended
    );
  }

  /**
   * Returns current playback time in seconds.
   * @returns {number}
   */
  getCurrentTime() {
    return this.currentAudio ? this.currentAudio.currentTime : 0;
  }

  /**
   * Updates audio volume if preview or game is actively playing.
   */
  syncVolume() {
    if (this.currentAudio) {
      this.currentAudio.volume = this.getTargetVolume();
    }
  }

  /**
   * Returns the ID of the song currently playing.
   * @returns {string|null}
   */
  getCurrentSongId() {
    return this.currentSongId;
  }
}

// Expose to window / module
if (typeof window !== "undefined") {
  window.MusicPlayer = MusicPlayer;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = MusicPlayer;
}

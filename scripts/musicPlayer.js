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
  constructor({ soundManager }) {
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
   * Starts playing a preview for the specified song in a loop.
   * @param {Object} song
   */
  playPreview(song) {
    if (!song || !song.file) return;

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

    try {
      const audio = new Audio(song.file);
      audio.loop = true;
      audio.volume = this.getTargetVolume();
      this.currentAudio = audio;

      audio.addEventListener("error", () => {
        if (song.file && song.file !== "Assets/Songs/IMG_2449.mp3") {
          song.file = "Assets/Songs/IMG_2449.mp3";
          this.playPreview(song);
        }
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
  playSong(song, { onTimeUpdate, onEnded } = {}) {
    if (!song || !song.file) return;

    this.stop();

    this.mode = "game";
    this.currentSongId = song.id;

    try {
      const audio = new Audio(song.file);
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

      audio.addEventListener("error", () => {
        if (song.file && song.file !== "Assets/Songs/IMG_2449.mp3") {
          song.file = "Assets/Songs/IMG_2449.mp3";
          this.playSong(song, { onTimeUpdate, onEnded });
        }
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
        this.currentAudio.src = "";
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

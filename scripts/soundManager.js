/**
 * @file soundManager.js
 * @description Manages sound settings (enabled/disabled, volume) and provides
 * procedural UI sound synthesis via the Web Audio API without external asset dependencies.
 */

const SOUND_STORAGE_KEY_ENABLED = "project_alpha_sound_enabled";
const SOUND_STORAGE_KEY_VOLUME = "project_alpha_sound_volume";

const SOUND_DEFAULT_ENABLED = true;
const SOUND_DEFAULT_VOLUME = 70; // 0 to 100 percentage

class SoundManager {
  constructor() {
    this.enabled = this.loadSavedEnabled();
    this.volume = this.loadSavedVolume();
    this.audioCtx = null;
    this.listeners = new Set();
    this.userInteracted = false;

    // Listen for the first user gesture to unlock AudioContext cleanly without autoplay warnings
    if (typeof window !== "undefined") {
      const unlockAudio = () => {
        this.userInteracted = true;
        if (this.audioCtx && this.audioCtx.state === "suspended") {
          this.audioCtx.resume().catch(() => {});
        }
      };
      window.addEventListener("pointerdown", unlockAudio, { once: true, capture: true });
      window.addEventListener("keydown", unlockAudio, { once: true, capture: true });
      window.addEventListener("click", unlockAudio, { once: true, capture: true });
      window.addEventListener("touchstart", unlockAudio, { once: true, capture: true, passive: true });
    }
  }

  /**
   * Loads sound enabled setting from localStorage.
   * @returns {boolean}
   */
  loadSavedEnabled() {
    try {
      const saved = localStorage.getItem(SOUND_STORAGE_KEY_ENABLED);
      if (saved !== null) {
        return saved === "true";
      }
    } catch (err) {
      console.warn("Unable to access localStorage for sound enabled:", err);
    }
    return SOUND_DEFAULT_ENABLED;
  }

  /**
   * Loads sound volume setting from localStorage.
   * @returns {number} 0 - 100
   */
  loadSavedVolume() {
    try {
      const saved = localStorage.getItem(SOUND_STORAGE_KEY_VOLUME);
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn("Unable to access localStorage for sound volume:", err);
    }
    return SOUND_DEFAULT_VOLUME;
  }

  /**
   * Ensures Web Audio context is initialized safely.
   */
  ensureAudioContext() {
    try {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          this.audioCtx = new AudioContextClass();
        }
      }
      // Only resume if user has performed an interaction gesture, avoiding browser autoplay warnings
      if (this.audioCtx && this.audioCtx.state === "suspended" && this.userInteracted) {
        this.audioCtx.resume().catch(() => {});
      }
    } catch (err) {
      // AudioContext initialization prevented safely
    }
  }

  /**
   * Sets whether sound is enabled.
   * @param {boolean} isEnabled
   */
  setEnabled(isEnabled) {
    this.enabled = Boolean(isEnabled);
    try {
      localStorage.setItem(SOUND_STORAGE_KEY_ENABLED, String(this.enabled));
    } catch (err) {
      console.warn("Unable to save sound enabled state:", err);
    }
    this.notifyListeners();
  }

  /**
   * Returns whether sound is currently enabled.
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Sets sound volume.
   * @param {number} volume 0 - 100
   */
  setVolume(volume) {
    const clamped = Math.max(0, Math.min(100, Math.round(volume)));
    this.volume = clamped;
    try {
      localStorage.setItem(SOUND_STORAGE_KEY_VOLUME, String(this.volume));
    } catch (err) {
      console.warn("Unable to save sound volume:", err);
    }
    this.notifyListeners();
  }

  /**
   * Returns the current volume (0 - 100).
   * @returns {number}
   */
  getVolume() {
    return this.volume;
  }

  /**
   * Normalizes volume to range 0.0 - 1.0.
   * @returns {number}
   */
  getNormalizedVolume() {
    if (!this.enabled) return 0;
    return (this.volume / 100) * 0.15; // capped to prevent distortion
  }

  /**
   * Plays a synthesized button click tone.
   */
  playClick() {
    try {
      if (!this.enabled || this.volume === 0) return;
      this.userInteracted = true;
      this.ensureAudioContext();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(540, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);

      const peakVolume = this.getNormalizedVolume();
      gain.gain.setValueAtTime(peakVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch (err) {
      console.warn("Audio playback error:", err);
    }
  }

  /**
   * Plays a subtle hover tick sound.
   */
  playHover() {
    try {
      if (!this.enabled || this.volume === 0) return;
      // Do not attempt hover sounds before user has interacted or if audio is suspended
      if (!this.userInteracted || !this.audioCtx || this.audioCtx.state !== "running") return;

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(700, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.04);

      const peakVolume = this.getNormalizedVolume() * 0.35;
      gain.gain.setValueAtTime(peakVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch (err) {
      // Audio playback error safely ignored
    }
  }

  /**
   * Plays a test tone when user adjusts volume.
   */
  playTestTone() {
    try {
      if (!this.enabled || this.volume === 0) return;
      this.userInteracted = true;
      this.ensureAudioContext();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(440, now);

      const peakVolume = this.getNormalizedVolume();
      gain.gain.setValueAtTime(peakVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch (err) {
      console.warn("Audio playback error:", err);
    }
  }

  /**
   * Plays a bright, melodic chime for Perfect hits.
   */
  playPerfectTone() {
    try {
      if (!this.enabled || this.volume === 0) return;
      this.userInteracted = true;
      this.ensureAudioContext();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const osc1 = this.audioCtx.createOscillator();
      const osc2 = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc1.type = "sine";
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(1320, now + 0.12);

      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(1760, now);

      const peakVolume = this.getNormalizedVolume() * 1.2;
      gain.gain.setValueAtTime(peakVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.18);
      osc2.stop(now + 0.18);
    } catch (err) {
      console.warn("Audio playback error:", err);
    }
  }

  /**
   * Plays a sharp, low-buzz tone for wrong-direction faults (-20 penalty).
   */
  playWrongTone() {
    try {
      if (!this.enabled || this.volume === 0) return;
      this.userInteracted = true;
      this.ensureAudioContext();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(75, now + 0.14);

      const peakVolume = this.getNormalizedVolume() * 1.1;
      gain.gain.setValueAtTime(peakVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.14);
    } catch (err) {
      console.warn("Audio playback error:", err);
    }
  }

  /**
   * Registers a change listener.
   * @param {Function} callback
   */
  onChange(callback) {
    this.listeners.add(callback);
  }

  /**
   * Notifies subscribers of changes to sound state.
   */
  notifyListeners() {
    this.listeners.forEach((cb) => {
      try {
        cb({ enabled: this.enabled, volume: this.volume });
      } catch (err) {
        console.error("Error in sound change listener:", err);
      }
    });
  }
}

// Expose to window
window.SoundManager = SoundManager;

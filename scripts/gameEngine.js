/**
 * @file gameEngine.js
 * @description Core gameplay engine for Project Alpha Plus.
 * Implements 0.5s grow-in phase (150pts Perfect if hovering early),
 * 1.0s full-size hittable window (100–25pts Good based on speed),
 * 0.5s fadeout on miss, distinctive Perfect hit animations,
 * and comprehensive performance tracking supporting both normal completion
 * and abandoned runs.
 */

class GameEngine {
  /**
   * @param {Object} dependencies
   * @param {Object} dependencies.song
   * @param {Array} dependencies.notes
   * @param {MusicPlayer} dependencies.musicPlayer
   * @param {SoundManager} dependencies.soundManager
   * @param {Function} dependencies.onStateChange
   * @param {Function} dependencies.onSongEnd
   */
  constructor({ song, notes = [], musicPlayer, soundManager, onStateChange = null, onSongEnd = null }) {
    this.song = song;
    this.musicPlayer = musicPlayer;
    this.soundManager = soundManager;
    this.onStateChange = onStateChange;
    this.onSongEnd = onSongEnd;

    // Deep clone notes with initial animation and lifecycle states
    this.notes = notes.map((n) => ({
      ...n,
      hit: false,
      missed: false,
      phase: "waiting", // 'waiting' | 'growing' | 'full' | 'fading'
      growProgress: 0,
      hittableProgress: 0,
      currentRadius: 6,
      fadeOpacity: 1,
      isExpired: false
    }));

    this.totalNotes = this.notes.length;

    // Player Orb State
    this.playerOrb = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      prevX: window.innerWidth / 2,
      prevY: window.innerHeight / 2,
      vx: 0,
      vy: 0,
      radius: 24,
      color: "blue", // 'red' | 'blue'
      pulse: 0
    };
    this.mouseHistory = [];

    // Performance Statistics
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.hitsCount = 0;
    this.missesCount = 0;
    this.perfectHits = 0;
    this.goodHits = 0;
    this.wrongDirectionHits = 0;
    this.totalBasePointsEarned = 0;
    this.remainingNotes = this.totalNotes;

    // Highest theoretical score calculation
    this.highestPossibleScore = this.calculateHighestPossibleScore();

    // Timing and Session State
    this.currentTime = 0;
    this.duration = song.durationSeconds || 180;
    this.isRunning = false;
    this.animFrameId = null;

    // Visual Effects Collection
    this.effects = [];

    // Bound handlers for clean disposal
    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnMouseDown = this.onMouseDown.bind(this);
    this.boundOnContextMenu = this.onContextMenu.bind(this);
    this.boundTick = this.tick.bind(this);
  }

  /**
   * Calculates highest possible score (if all notes are Perfect 200 with full combo).
   * @returns {number}
   */
  calculateHighestPossibleScore() {
    let max = 0;
    let combo = 0;
    for (let i = 0; i < this.notes.length; i++) {
      combo++;
      const basePoints = 200; // Perfect score
      const comboBonus = Math.min(combo, 10) * 5;
      max += basePoints + comboBonus;
    }
    return Math.max(200, max);
  }

  /**
   * Starts the gameplay session and begins track playback.
   */
  start() {
    this.isRunning = true;
    this.bindInputs();

    if (this.musicPlayer) {
      this.musicPlayer.playSong(this.song, {
        onTimeUpdate: (time, duration) => {
          this.currentTime = time;
          if (duration) this.duration = duration;
        },
        onEnded: () => {
          this.handleSongCompletion(true);
        }
      });
    }

    this.animFrameId = requestAnimationFrame(this.boundTick);
  }

  /**
   * Binds mouse and context menu listeners for gameplay controls.
   */
  bindInputs() {
    window.addEventListener("mousemove", this.boundOnMouseMove);
    window.addEventListener("mousedown", this.boundOnMouseDown);
    window.addEventListener("contextmenu", this.boundOnContextMenu);
  }

  /**
   * Cleans up input listeners.
   */
  unbindInputs() {
    window.removeEventListener("mousemove", this.boundOnMouseMove);
    window.removeEventListener("mousedown", this.boundOnMouseDown);
    window.removeEventListener("contextmenu", this.boundOnContextMenu);
  }

  /**
   * Updates player orb position and recent trajectory history as mouse moves.
   * @param {MouseEvent} e
   */
  onMouseMove(e) {
    const dx = e.clientX - this.playerOrb.x;
    const dy = e.clientY - this.playerOrb.y;
    this.playerOrb.prevX = this.playerOrb.x;
    this.playerOrb.prevY = this.playerOrb.y;
    this.playerOrb.vx = dx;
    this.playerOrb.vy = dy;
    this.playerOrb.x = e.clientX;
    this.playerOrb.y = e.clientY;

    const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    this.mouseHistory.push({ x: e.clientX, y: e.clientY, time: now, vx: dx, vy: dy });
    if (this.mouseHistory.length > 25) {
      this.mouseHistory.shift();
    }
  }

  /**
   * Normalizes an angle in degrees to [0, 360).
   * @param {number} deg
   * @returns {number}
   */
  normalizeAngle360(deg) {
    return ((deg % 360) + 360) % 360;
  }

  /**
   * Computes the shortest angular distance between two angles in degrees (0° to 180°).
   * Correctly handles 0°/360° boundary wraparound.
   * @param {number} deg1
   * @param {number} deg2
   * @returns {number}
   */
  getAngularDistanceDeg(deg1, deg2) {
    const a1 = this.normalizeAngle360(deg1);
    const a2 = this.normalizeAngle360(deg2);
    let diff = Math.abs(a1 - a2);
    if (diff > 180) {
      diff = 360 - diff;
    }
    return diff;
  }

  /**
   * Determines the target approach direction of an arrow note in degrees (0° to 360°).
   * 0° = Moving rightward (Approach from left ->)
   * 90° = Moving downward (Approach from top \/)
   * 180° = Moving leftward (Approach from right <-)
   * 270° = Moving upward (Approach from bottom /\)
   * @param {Object} note
   * @returns {number}
   */
  getNoteTargetAngleDeg(note) {
    if (typeof note.angle === "number") {
      return this.normalizeAngle360((note.angle * 180) / Math.PI);
    }
    const dirMap = {
      left: 0,           // Approach from left: player moves rightward -> (0°)
      right: 180,        // Approach from right: player moves leftward <- (180°)
      up: 90,            // Approach from top: player moves downward \/ (90°)
      down: 270          // Approach from bottom: player moves upward /\ (270°)
    };
    const dir = (note.direction || "").toLowerCase();
    return dirMap[dir] ?? 0;
  }

  /**
   * Checks whether the player's approach vector matches the note's required approach direction.
   * Sets hit detection to an angular tolerance of 90° (±90° from arrow direction) using 360° calculations.
   * If note is a normal note (no direction and no angle), returns true unconditionally.
   * @param {Object} note
   * @param {number} noteX
   * @param {number} noteY
   * @returns {boolean}
   */
  checkApproachDirection(note, noteX, noteY) {
    const hasDirection = Boolean(note.direction && note.direction !== "any");
    const hasAngle = typeof note.angle === "number";

    // Normal notes (no directional arrow) have no approach vector requirement
    if (!hasDirection && !hasAngle) {
      return true;
    }

    const targetAngleDeg = this.getNoteTargetAngleDeg(note);
    const TOLERANCE_DEG = 90; // Accept approaches within ±90° of arrow direction

    // Displacement across recent mouse history or current frame velocity
    let totalDx = this.playerOrb.vx;
    let totalDy = this.playerOrb.vy;
    let entryX = this.playerOrb.prevX || this.playerOrb.x;
    let entryY = this.playerOrb.prevY || this.playerOrb.y;

    if (this.mouseHistory && this.mouseHistory.length > 1) {
      const oldest = this.mouseHistory[0];
      const histDx = this.playerOrb.x - oldest.x;
      const histDy = this.playerOrb.y - oldest.y;
      if (Math.hypot(histDx, histDy) >= Math.hypot(totalDx, totalDy)) {
        totalDx = histDx;
        totalDy = histDy;
      }
      entryX = oldest.x;
      entryY = oldest.y;
    }

    // 1. Check motion vector direction
    const moveDist = Math.hypot(totalDx, totalDy);
    if (moveDist > 0.5) {
      const motionAngleDeg = this.normalizeAngle360((Math.atan2(totalDy, totalDx) * 180) / Math.PI);
      const diffMotion = this.getAngularDistanceDeg(motionAngleDeg, targetAngleDeg);
      if (diffMotion <= TOLERANCE_DEG) {
        return true;
      }
    }

    // 2. Check entry vector direction (from entry position towards note center)
    const entryDx = noteX - entryX;
    const entryDy = noteY - entryY;
    const entryDist = Math.hypot(entryDx, entryDy);
    if (entryDist > 6) {
      const entryAngleDeg = this.normalizeAngle360((Math.atan2(entryDy, entryDx) * 180) / Math.PI);
      const diffEntry = this.getAngularDistanceDeg(entryAngleDeg, targetAngleDeg);
      if (diffEntry <= TOLERANCE_DEG) {
        return true;
      }
    }

    // Outside ±90° tolerance range -> wrong direction hit
    return false;
  }

  /**
   * Handles color switching:
   * Left-click: switches to RED.
   * Right-click: switches to BLUE.
   * @param {MouseEvent} e
   */
  onMouseDown(e) {
    if (!this.isRunning) return;

    if (e.button === 0) {
      this.switchColor("red");
    } else if (e.button === 2) {
      this.switchColor("blue");
    }
  }

  /**
   * Prevents standard context menu on right click inside gameplay.
   * @param {MouseEvent} e
   */
  onContextMenu(e) {
    e.preventDefault();
    return false;
  }

  /**
   * Switches the active color of the player orb.
   * @param {'red' | 'blue'} newColor
   */
  switchColor(newColor) {
    if (this.playerOrb.color !== newColor) {
      this.playerOrb.color = newColor;
      this.playerOrb.pulse = 1.0;

      if (this.soundManager) {
        this.soundManager.playClick();
      }

      this.addEffect({
        type: "switch-pulse",
        x: this.playerOrb.x,
        y: this.playerOrb.y,
        color: newColor === "red" ? "#ff4757" : "#00d4ff",
        radius: 20,
        maxRadius: 50,
        opacity: 0.8
      });
    }
  }

  /**
   * Main game tick executed on animation frame.
   */
  tick() {
    if (!this.isRunning) return;

    if (this.musicPlayer) {
      this.currentTime = this.musicPlayer.getCurrentTime();
    }

    this.updateNotes();
    this.updateEffects();

    // Check if song duration has concluded
    if (this.currentTime >= this.duration && this.duration > 0) {
      this.handleSongCompletion(true);
      return;
    }

    // Broadcast state to GameView
    if (this.onStateChange) {
      this.onStateChange({
        currentTime: this.currentTime,
        duration: this.duration,
        progress: this.duration > 0 ? this.currentTime / this.duration : 0,
        remainingNotes: this.remainingNotes,
        score: this.score,
        combo: this.combo,
        color: this.playerOrb.color,
        playerOrb: this.playerOrb,
        notes: this.notes,
        effects: this.effects
      });
    }

    this.animFrameId = requestAnimationFrame(this.boundTick);
  }

  /**
   * Updates note timing, 1-second grow-in phase (200pts Perfect with directional approach),
   * 1-second hit window (150–50pts Normal), wrong-direction penalty (-20pts),
   * and 0.5-second fadeout on miss.
   */
  updateNotes() {
    const growDuration = 1.0; // 1.0 second to grow in to full size
    const fullSizeHittableDuration = 1.0; // 1.0 second hittable at full size
    const fadeDuration = 0.5; // 0.5 seconds fade out
    const baseNoteRadius = 26;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const orbRadius = this.playerOrb.radius;

    this.notes.forEach((note) => {
      if (note.hit || note.isExpired) {
        return;
      }

      const elapsed = this.currentTime - note.time;

      // Note has not spawned yet
      if (elapsed < 0) {
        note.phase = "waiting";
        return;
      }

      const noteX = note.x * width;
      const noteY = note.y * height;
      const dx = this.playerOrb.x - noteX;
      const dy = this.playerOrb.y - noteY;
      const distSq = dx * dx + dy * dy;

      // ----------------------------------------------------------------------
      // Phase 1: 1.0s Grow-In Phase (Note grows to full size)
      // Award 200 points (Perfect) if hovering before note finishes growing
      // AND approaching from the required direction!
      // ----------------------------------------------------------------------
      if (elapsed >= 0 && elapsed < growDuration) {
        note.phase = "growing";
        note.growProgress = elapsed / growDuration; // 0 to 1
        note.currentRadius = Math.max(6, baseNoteRadius * (0.2 + 0.8 * note.growProgress));

        const hitDistance = (orbRadius + note.currentRadius) * 1.15;
        if (distSq <= hitDistance * hitDistance) {
          if (this.playerOrb.color === note.color) {
            const isCorrectDir = this.checkApproachDirection(note, noteX, noteY);

            if (!isCorrectDir) {
              // Wrong direction: deduct 20 points
              note.hit = true;
              note.isWrongDirection = true;
              this.wrongDirectionHits++;
              this.combo = 0;
              this.score = Math.max(0, this.score - 20);
              this.totalBasePointsEarned = Math.max(0, this.totalBasePointsEarned - 20);

              if (this.soundManager && typeof this.soundManager.playWrongTone === "function") {
                this.soundManager.playWrongTone();
              } else if (this.soundManager) {
                this.soundManager.playTestTone();
              }

              this.triggerWrongDirectionAnimation(noteX, noteY, note.color);
              return;
            }

            // Already hovering before it finishes growing & correct direction -> PERFECT (200 points)!
            note.hit = true;
            this.hitsCount++;
            this.perfectHits++;
            this.combo++;
            if (this.combo > this.maxCombo) this.maxCombo = this.combo;

            const basePoints = 200;
            const comboBonus = Math.min(this.combo, 10) * 5;
            const totalPoints = basePoints + comboBonus;
            this.totalBasePointsEarned += basePoints;
            this.score += totalPoints;

            if (this.soundManager && typeof this.soundManager.playPerfectTone === "function") {
              this.soundManager.playPerfectTone();
            } else if (this.soundManager) {
              this.soundManager.playTestTone();
            }

            // Distinctive Perfect Hit Animation
            this.triggerPerfectHitAnimation(noteX, noteY, note.color, totalPoints);
            return;
          }
        }
      }

      // ----------------------------------------------------------------------
      // Phase 2: Fully visible, hittable for 1.0 second (1.0s to 2.0s)
      // Award 150–50 points depending on how soon hovered after becoming fully visible
      // ----------------------------------------------------------------------
      else if (elapsed >= growDuration && elapsed <= (growDuration + fullSizeHittableDuration)) {
        note.phase = "full";
        note.currentRadius = baseNoteRadius;
        note.hittableProgress = (elapsed - growDuration) / fullSizeHittableDuration; // 0 to 1

        const hitDistance = (orbRadius + baseNoteRadius) * 1.15;
        if (distSq <= hitDistance * hitDistance) {
          if (this.playerOrb.color === note.color) {
            const isCorrectDir = this.checkApproachDirection(note, noteX, noteY);

            if (!isCorrectDir) {
              // Wrong direction: deduct 20 points
              note.hit = true;
              note.isWrongDirection = true;
              this.wrongDirectionHits++;
              this.combo = 0;
              this.score = Math.max(0, this.score - 20);
              this.totalBasePointsEarned = Math.max(0, this.totalBasePointsEarned - 20);

              if (this.soundManager && typeof this.soundManager.playWrongTone === "function") {
                this.soundManager.playWrongTone();
              } else if (this.soundManager) {
                this.soundManager.playTestTone();
              }

              this.triggerWrongDirectionAnimation(noteX, noteY, note.color);
              return;
            }

            // Normal Hit (150 down to 50 points based on timing)
            note.hit = true;
            this.hitsCount++;
            this.goodHits++;
            this.combo++;
            if (this.combo > this.maxCombo) this.maxCombo = this.combo;

            const lateRatio = note.hittableProgress;
            const basePoints = Math.round(150 - 100 * lateRatio);
            const comboBonus = Math.min(this.combo, 10) * 5;
            const totalPoints = basePoints + comboBonus;
            this.totalBasePointsEarned += basePoints;
            this.score += totalPoints;

            if (this.soundManager) {
              this.soundManager.playTestTone();
            }

            this.triggerGoodHitAnimation(noteX, noteY, note.color, totalPoints);
            return;
          }
        }
      }

      // ----------------------------------------------------------------------
      // Phase 3: Hit window expired -> Miss (0 points), fadeout over 0.5s
      // ----------------------------------------------------------------------
      else if (elapsed > (growDuration + fullSizeHittableDuration) && !note.hit) {
        if (!note.missed) {
          note.missed = true;
          this.missesCount++;
          this.combo = 0;

          this.addEffect({
            type: "float-text",
            text: "MISS 0",
            x: noteX,
            y: noteY - 10,
            color: "#8b9bb4",
            opacity: 0.85,
            vy: -0.8
          });
        }

        const fadeElapsed = elapsed - (growDuration + fullSizeHittableDuration);
        if (fadeElapsed <= fadeDuration) {
          note.phase = "fading";
          note.fadeOpacity = Math.max(0, 1 - fadeElapsed / fadeDuration);
        } else {
          note.isExpired = true;
        }
      }
    });

    this.remainingNotes = this.notes.filter((n) => !n.hit && !n.missed).length;
  }

  /**
   * Spawns distinctive Perfect hit animation (golden double shockwave, star sparkle burst, banner).
   * @param {number} x
   * @param {number} y
   * @param {string} color
   * @param {number} points
   */
  triggerPerfectHitAnimation(x, y, color, points) {
    // 1. Expanding golden halos
    this.addEffect({
      type: "perfect-halo",
      x,
      y,
      radius: 20,
      maxRadius: 105,
      opacity: 1.0,
      color: "#ffd32a"
    });

    this.addEffect({
      type: "perfect-halo",
      x,
      y,
      radius: 10,
      maxRadius: 75,
      opacity: 0.85,
      color: "#ffffff"
    });

    // 2. Star sparkles radiating outward
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4 + (Math.random() * 0.3 - 0.15);
      const speed = 2.4 + Math.random() * 2.8;
      this.addEffect({
        type: "sparkle",
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 4 + Math.random() * 3,
        color: i % 2 === 0 ? "#ffd32a" : "#ffffff",
        opacity: 1.0,
        decay: 0.032
      });
    }

    // 3. Floating celebratory PERFECT badge
    this.addEffect({
      type: "float-text",
      text: `★ PERFECT +${points} ★`,
      x,
      y: y - 28,
      color: "#ffd32a",
      opacity: 1.0,
      vy: -1.4,
      isPerfect: true
    });
  }

  /**
   * Spawns Good / Normal hit animation.
   * @param {number} x
   * @param {number} y
   * @param {string} color
   * @param {number} points
   */
  triggerGoodHitAnimation(x, y, color, points) {
    this.addEffect({
      type: "hit-ripple",
      x,
      y,
      color: color === "red" ? "#ff4757" : "#00d4ff",
      radius: 26,
      maxRadius: 80,
      opacity: 1.0
    });

    this.addEffect({
      type: "float-text",
      text: `HIT +${points}`,
      x,
      y: y - 20,
      color: color === "red" ? "#ff4757" : "#00d4ff",
      opacity: 0.9,
      vy: -1.2
    });
  }

  /**
   * Spawns wrong-direction fault animation (-20 points penalty).
   * @param {number} x
   * @param {number} y
   * @param {string} color
   */
  triggerWrongDirectionAnimation(x, y, color) {
    this.addEffect({
      type: "wrong-ripple",
      x,
      y,
      color: "#ff4757",
      radius: 20,
      maxRadius: 85,
      opacity: 1.0
    });

    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      this.addEffect({
        type: "sparkle",
        x,
        y,
        vx: Math.cos(angle) * 3,
        vy: Math.sin(angle) * 3,
        size: 5,
        color: "#ff4757",
        opacity: 1.0,
        decay: 0.04
      });
    }

    this.addEffect({
      type: "float-text",
      text: "WRONG DIRECTION -20",
      x,
      y: y - 26,
      color: "#ff4757",
      opacity: 1.0,
      vy: -1.2,
      isWrong: true
    });
  }

  /**
   * Adds an active visual effect.
   * @param {Object} effect
   */
  addEffect(effect) {
    this.effects.push(effect);
  }

  /**
   * Updates and decays active visual effects.
   */
  updateEffects() {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];

      if (
        fx.type === "hit-ripple" ||
        fx.type === "switch-pulse" ||
        fx.type === "perfect-halo" ||
        fx.type === "wrong-ripple"
      ) {
        fx.radius += (fx.maxRadius - fx.radius) * 0.16 + 1.2;
        fx.opacity -= 0.038;
        if (fx.opacity <= 0 || fx.radius >= fx.maxRadius) {
          this.effects.splice(i, 1);
        }
      } else if (fx.type === "sparkle") {
        fx.x += fx.vx;
        fx.y += fx.vy;
        fx.opacity -= fx.decay || 0.03;
        if (fx.opacity <= 0) {
          this.effects.splice(i, 1);
        }
      } else if (fx.type === "float-text") {
        fx.y += fx.vy;
        fx.opacity -= 0.022;
        if (fx.opacity <= 0) {
          this.effects.splice(i, 1);
        }
      }
    }

    if (this.playerOrb.pulse > 0) {
      this.playerOrb.pulse -= 0.06;
      if (this.playerOrb.pulse < 0) this.playerOrb.pulse = 0;
    }
  }

  /**
   * Compiles comprehensive performance statistics for the End Screen.
   * @param {boolean} isCompleted
   * @returns {Object}
   */
  getPerformanceSummary(isCompleted = true) {
    const maxPossible = this.highestPossibleScore;
    const scorePct = maxPossible > 0 ? ((this.score / maxPossible) * 100).toFixed(1) : "0.0";

    const maxBasePossible = Math.max(1, this.totalNotes * 200);
    const accuracy = Math.max(0, Math.min(100, (this.totalBasePointsEarned / maxBasePossible) * 100)).toFixed(1);

    let completionStatus = "Track Completed";
    let statusClass = "status-complete";

    if (!isCompleted) {
      completionStatus = "RUN ABANDONED";
      statusClass = "status-abandoned";
    } else if (this.totalNotes > 0 && this.hitsCount === this.totalNotes) {
      if (this.perfectHits === this.totalNotes) {
        completionStatus = "ALL PERFECT!";
        statusClass = "status-all-perfect";
      } else {
        completionStatus = "FULL COMBO!";
        statusClass = "status-full-combo";
      }
    } else if (this.hitsCount === 0 && this.totalNotes > 0) {
      completionStatus = "FAILED";
      statusClass = "status-failed";
    }

    return {
      songName: this.song.name,
      songId: this.song.id,
      score: this.score,
      highestPossibleScore: maxPossible,
      scorePercentage: scorePct,
      accuracy: accuracy,
      totalNotes: this.totalNotes,
      hits: this.hitsCount,
      misses: this.missesCount,
      perfectHits: this.perfectHits,
      goodHits: this.goodHits,
      wrongDirectionHits: this.wrongDirectionHits,
      maxCombo: this.maxCombo,
      finalCombo: this.combo,
      completionStatus,
      statusClass,
      isCompleted
    };
  }

  /**
   * Handles track completion and triggers End Screen callback.
   * @param {boolean} isCompleted
   */
  handleSongCompletion(isCompleted = true) {
    this.stop();
    const summary = this.getPerformanceSummary(isCompleted);
    if (this.onSongEnd) {
      this.onSongEnd(summary);
    }
  }

  /**
   * Called when player leaves a song early.
   * Halts session and presents End Screen flagged as abandoned.
   */
  abandonRun() {
    this.handleSongCompletion(false);
  }

  /**
   * Halts gameplay engine, audio, and inputs.
   */
  stop() {
    this.isRunning = false;
    this.unbindInputs();

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.musicPlayer) {
      this.musicPlayer.stop();
    }
  }
}

// Expose to window
window.GameEngine = GameEngine;

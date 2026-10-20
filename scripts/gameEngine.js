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

    // Sort chronologically by hit/spawn time
    this.notes.sort((a, b) => (a.time || 0) - (b.time || 0));

    // First note preview for pre-track countdown orientation
    this.firstNote = this.notes.length > 0 ? { ...this.notes[0] } : null;

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
    this.bombHits = 0;
    this.wrongDirectionHits = 0; // Legacy compatibility
    this.totalBasePointsEarned = 0;
    this.remainingNotes = this.totalNotes;

    // Highest theoretical score calculation
    this.highestPossibleScore = this.calculateHighestPossibleScore();

    // Timing and Session State
    this.currentTime = 0;
    this.duration = (song && song.durationSeconds) || 180;
    this.isRunning = false;
    this.animFrameId = null;
    this.lastWallTime = 0;
    this.lastAudioTime = 0;

    // Track Normal Completion State (allows normal exit 5s after last note processed)
    this.lastNoteProcessedTime = null;
    this.lastNoteProcessedWallTime = null;

    // 3-second countdown timer before music starts (in play and test mode)
    this.countdownDuration = 3.0;
    this.countdownRemaining = 3.0;
    this.isCountingDown = true;
    this.countdownLastTickSec = 3;

    // Visual Effects Collection
    this.effects = [];

    // Bound handlers for clean disposal
    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnMouseDown = this.onMouseDown.bind(this);
    this.boundOnContextMenu = this.onContextMenu.bind(this);
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    this.boundTick = this.tick.bind(this);
  }

  /**
   * Calculates highest possible score (if all normal notes are Perfect 200 with full combo).
   * Triangle bomb notes are hazard notes to be avoided and do not contribute to max positive score.
   * @returns {number}
   */
  calculateHighestPossibleScore() {
    let max = 0;
    let combo = 0;
    const targetNotes = this.notes.filter((n) => n.type !== "triangle" && n.type !== "bomb");
    for (let i = 0; i < targetNotes.length; i++) {
      combo++;
      const basePoints = 200; // Perfect score
      const comboBonus = Math.min(combo, 10) * 5;
      max += basePoints + comboBonus;
    }
    return Math.max(200, max);
  }

  /**
   * Starts the gameplay session with a 3-second countdown timer before music start.
   */
  start() {
    this.isRunning = true;
    this.isCountingDown = true;
    this.countdownDuration = 3.0;
    this.countdownRemaining = this.countdownDuration;
    this.countdownLastTickSec = Math.ceil(this.countdownRemaining);
    this.currentTime = 0;
    this.lastWallTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.lastAudioTime = 0;
    this.bindInputs();

    // Start tick loop; audio will start when countdown completes
    this.animFrameId = requestAnimationFrame(this.boundTick);
  }

  /**
   * Starts audio playback and transitions from countdown into active gameplay.
   */
  startAudioAndGameplay() {
    this.isCountingDown = false;
    this.countdownRemaining = 0;
    this.currentTime = 0;
    this.lastAudioTime = 0;
    this.lastWallTime = typeof performance !== "undefined" ? performance.now() : Date.now();

    if (this.soundManager && typeof this.soundManager.playClick === "function") {
      this.soundManager.playClick();
    }

    // Expanding shockwave from center to announce track start
    this.addEffect({
      type: "switch-pulse",
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      color: "#00d4ff",
      radius: 40,
      maxRadius: 220,
      opacity: 0.95
    });

    if (this.musicPlayer) {
      this.musicPlayer.playSong(this.song, {
        onTimeUpdate: (time, duration) => {
          if (typeof time === "number" && !isNaN(time)) {
            this.currentTime = time;
            this.lastAudioTime = time;
          }
          if (duration) this.duration = duration;
        },
        onEnded: () => {
          this.handleSongCompletion(true);
        }
      });
    }
  }

  /**
   * Allows player to skip countdown with Space key.
   */
  skipCountdown() {
    if (!this.isCountingDown) return;
    this.startAudioAndGameplay();
  }

  /**
   * Binds mouse, context menu, and keyboard listeners for gameplay controls.
   */
  bindInputs() {
    window.addEventListener("mousemove", this.boundOnMouseMove);
    window.addEventListener("mousedown", this.boundOnMouseDown);
    window.addEventListener("contextmenu", this.boundOnContextMenu);
    window.addEventListener("keydown", this.boundOnKeyDown);
  }

  /**
   * Cleans up input listeners.
   */
  unbindInputs() {
    window.removeEventListener("mousemove", this.boundOnMouseMove);
    window.removeEventListener("mousedown", this.boundOnMouseDown);
    window.removeEventListener("contextmenu", this.boundOnContextMenu);
    window.removeEventListener("keydown", this.boundOnKeyDown);
  }

  /**
   * Handles keyboard shortcuts in gameplay (Escape exits/abandons run).
   * @param {KeyboardEvent} e
   */
  onKeyDown(e) {
    if (!this.isRunning) return;
    if (e.key === "Escape") {
      e.preventDefault();
      this.abandonRun();
    } else if (e.code === "Space" || e.key === " ") {
      if (this.isCountingDown) {
        e.preventDefault();
        this.skipCountdown();
      }
    }
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
   * Distance from point (px, py) to line segment (x1, y1)-(x2, y2).
   * @param {number} px
   * @param {number} py
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   * @returns {{ dist: number, t: number }}
   */
  pointToSegmentDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return { dist: Math.hypot(px - x1, py - y1), t: 0 };
    let t = ((px - x1) * dx + (py - y1) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return { dist: Math.hypot(px - projX, py - projY), t };
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

    try {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const dt = this.lastWallTime > 0 ? (now - this.lastWallTime) / 1000 : 0;
      this.lastWallTime = now;

      // Handle 3-second countdown timer before music starts
      if (this.isCountingDown) {
        this.countdownRemaining -= dt;

        const currentSec = Math.ceil(this.countdownRemaining);
        if (currentSec !== this.countdownLastTickSec && currentSec > 0 && currentSec <= 3) {
          this.countdownLastTickSec = currentSec;
          if (this.soundManager && typeof this.soundManager.playHover === "function") {
            this.soundManager.playHover();
          }
        }

        if (this.countdownRemaining <= 0) {
          this.startAudioAndGameplay();
        } else {
          this.updateEffects();
          if (this.onStateChange) {
            this.onStateChange({
              isCountingDown: true,
              countdownRemaining: Math.max(0, this.countdownRemaining),
              countdownDuration: this.countdownDuration,
              firstNote: this.firstNote,
              currentTime: 0,
              duration: this.duration,
              progress: 0,
              remainingNotes: this.remainingNotes,
              score: this.score,
              combo: this.combo,
              color: this.playerOrb.color,
              playerOrb: this.playerOrb,
              notes: [],
              effects: this.effects,
              canExitNormally: false
            });
          }
          return;
        }
      }

      // Resilient clock synchronization
      if (this.musicPlayer) {
        const audioTime = this.musicPlayer.getCurrentTime();
        if (typeof audioTime === "number" && !isNaN(audioTime)) {
          if (audioTime > 0 && audioTime !== this.lastAudioTime) {
            this.currentTime = audioTime;
            this.lastAudioTime = audioTime;
          } else if (typeof this.musicPlayer.isPlaying === "function" && this.musicPlayer.isPlaying()) {
            this.currentTime = Math.max(this.currentTime, audioTime) + Math.min(dt, 0.05);
          } else if (audioTime === 0 && dt > 0) {
            // Buffer/autoplay delay fallback so notes keep advancing
            this.currentTime += Math.min(dt, 0.05);
          }
        } else if (dt > 0) {
          this.currentTime += Math.min(dt, 0.05);
        }
      } else if (dt > 0) {
        this.currentTime += Math.min(dt, 0.05);
      }

      this.updateNotes();
      this.updateEffects();

      // Check if song duration has concluded
      if (this.duration > 0 && this.currentTime >= this.duration) {
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
          effects: this.effects,
          canExitNormally: this.canExitNormally()
        });
      }
    } catch (err) {
      console.error("GameEngine tick error:", err);
    } finally {
      if (this.isRunning) {
        this.animFrameId = requestAnimationFrame(this.boundTick);
      }
    }
  }

  /**
   * Updates note timing, 1-second grow-in phase, 1-second hit window,
   * triangle bomb note collision (-200 points penalty when touched during active window),
   * and 0.5-second fadeout on miss.
   */
  updateNotes() {
    const growDuration = 1.0; // 1.0s grow-in phase
    const fullSizeHittableDuration = 1.0; // 1.0s full-size hittable phase
    const fadeDuration = 0.5; // 0.5s fade out

    const playArea = PlayArea.getMetrics(window.innerWidth, window.innerHeight);
    const baseRadius = playArea.noteRadius || playArea.bigRadius; // Standard round note radius
    const triangleRadius = playArea.triangleRadius || (baseRadius * 1.05); // Triangle circumradius
    const orbRadius = playArea.orbRadius;
    this.playerOrb.radius = orbRadius;

    const orbX = this.playerOrb.x;
    const orbY = this.playerOrb.y;
    const prevOrbX = this.playerOrb.prevX || orbX;
    const prevOrbY = this.playerOrb.prevY || orbY;

    this.notes.forEach((note) => {
      if (note.hit || note.isExpired) {
        return;
      }

      const spawnTime = note.time - growDuration;

      if (this.currentTime < spawnTime) {
        note.phase = "waiting";
        return;
      }

      const isTriangle = note.type === "triangle" || note.type === "bomb";
      const noteRadius = isTriangle ? triangleRadius : baseRadius;
      const noteX = playArea.toScreenX(note.x);
      const noteY = playArea.toScreenY(note.y);

      // ----------------------------------------------------------------------
      // Phase 1: 1.0s Grow-In Phase (Notes grow to full size)
      // Note reaches full size at exactly note.time (the timestamp where placed in editor).
      // NOTES MUST NEVER BE HITTABLE OR PENALIZED BEFORE THEY HAVE FINISHED GROWING.
      // During growth, neither normal hits, perfect hits, nor bomb penalties can occur.
      // ----------------------------------------------------------------------
      if (this.currentTime >= spawnTime && this.currentTime < note.time) {
        note.phase = "growing";
        note.growProgress = Math.max(0, Math.min(1, (this.currentTime - spawnTime) / growDuration));
        const minRadius = Math.max(5, noteRadius * 0.2);
        note.currentRadius = minRadius + (noteRadius - minRadius) * note.growProgress;
        // Strictly visual growth; no hit or penalty detection during this phase.
      }

      // ----------------------------------------------------------------------
      // Phase 2: Full-Size Active Phase (1.0s window starting at note.time)
      // Note becomes active only when its growth animation is completely finished:
      // note.time <= currentTime <= note.time + fullSizeHittableDuration
      //
      // 1. TRIANGLE BOMB NOTE:
      //    Must be avoided! If touched or clicked by the player orb during its
      //    active window, deduct 200 points, reset combo, and trigger bomb explosion.
      //
      // 2. NORMAL NOTE (RED / BLUE):
      //    Requires matching player orb color.
      //    Perfect hit: hittableProgress <= 0.25 (first 250ms of full size): 200 points
      //    Good hit:    hittableProgress > 0.25: 150 down to 50 points based on timing
      // ----------------------------------------------------------------------
      else if (this.currentTime >= note.time && this.currentTime <= (note.time + fullSizeHittableDuration)) {
        note.phase = "full";
        note.currentRadius = noteRadius;
        note.hittableProgress = Math.max(0, Math.min(1, (this.currentTime - note.time) / fullSizeHittableDuration)); // 0 to 1

        if (isTriangle) {
          // Triangle Bomb Note collision detection (any color touches or clicks -> penalty)
          const hitDist = (orbRadius + triangleRadius) * 1.12;
          const dist = Math.hypot(orbX - noteX, orbY - noteY);
          const seg = this.pointToSegmentDist(noteX, noteY, prevOrbX, prevOrbY, orbX, orbY);

          if (dist <= hitDist || seg.dist <= hitDist) {
            // Trigger bomb penalty: single triangle note triggers only once!
            note.hit = true;
            note.isBombHit = true;
            this.bombHits++;
            this.wrongDirectionHits = this.bombHits; // Sync for legacy property
            this.combo = 0;
            this.score = Math.max(0, this.score - 200);
            this.totalBasePointsEarned = Math.max(0, this.totalBasePointsEarned - 200);

            if (this.soundManager && typeof this.soundManager.playWrongTone === "function") {
              this.soundManager.playWrongTone();
            } else if (this.soundManager) {
              this.soundManager.playTestTone();
            }

            this.triggerBombHitAnimation(noteX, noteY);
            return;
          }
        } else {
          // Normal and Directional note hit detection (must match player orb color)
          if (this.playerOrb.color === note.color) {
            const hitDist = (orbRadius + baseRadius) * 1.15;
            const dist = Math.hypot(orbX - noteX, orbY - noteY);
            const seg = this.pointToSegmentDist(noteX, noteY, prevOrbX, prevOrbY, orbX, orbY);
            if (dist <= hitDist || seg.dist <= hitDist) {
              const isDirectional = note.type === "directional" || note.type === "arrow";
              let approachAngleDeg = 0;
              let angularDiff = 0;

              if (isDirectional) {
                // Trigonometry to calculate approach vector
                let vx = orbX - prevOrbX;
                let vy = orbY - prevOrbY;

                if (Math.hypot(vx, vy) < 0.5 && this.mouseHistory.length >= 2) {
                  const recent = this.mouseHistory[this.mouseHistory.length - 1];
                  const older = this.mouseHistory[Math.max(0, this.mouseHistory.length - 4)];
                  vx = recent.x - older.x;
                  vy = recent.y - older.y;
                }

                if (Math.hypot(vx, vy) >= 0.5) {
                  approachAngleDeg = this.normalizeAngle360(Math.atan2(vy, vx) * 180 / Math.PI);
                } else {
                  approachAngleDeg = typeof note.angle === "number" ? note.angle : 0;
                }

                const reqAngle = typeof note.angle === "number" ? note.angle : 0;
                angularDiff = this.getAngularDistanceDeg(reqAngle, approachAngleDeg);
              }

              // Tolerance: ±180° (all directions accepted)
              const isAngleAccepted = !isDirectional || angularDiff <= 180;

              if (isAngleAccepted) {
                note.hit = true;
                this.hitsCount++;
                this.combo++;
                if (this.combo > this.maxCombo) this.maxCombo = this.combo;

                const isPerfect = note.hittableProgress <= 0.25;
                if (isPerfect) {
                  // Perfect hit (200 points) on beat / initial full-size precision window
                  this.perfectHits++;
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

                  this.triggerPerfectHitAnimation(noteX, noteY, note.color, totalPoints);
                } else {
                  // Normal/Good hit (150 down to 50 points based on timing)
                  this.goodHits++;
                  const lateRatio = (note.hittableProgress - 0.25) / 0.75;
                  const basePoints = Math.round(150 - 100 * lateRatio);
                  const comboBonus = Math.min(this.combo, 10) * 5;
                  const totalPoints = basePoints + comboBonus;
                  this.totalBasePointsEarned += basePoints;
                  this.score += totalPoints;

                  if (this.soundManager) this.soundManager.playTestTone();
                  this.triggerGoodHitAnimation(noteX, noteY, note.color, totalPoints);
                }
                return;
              }
            }
          }
        }
      }

      // ----------------------------------------------------------------------
      // Phase 3: Active window expired -> Miss (0 points for normal note, safe avoidance for bomb)
      // ----------------------------------------------------------------------
      else if (this.currentTime > (note.time + fullSizeHittableDuration) && !note.hit) {
        if (!note.missed) {
          note.missed = true;
          if (!isTriangle) {
            // Normal note missed: resets combo, increments miss count
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
          } else {
            // Successfully avoided triangle bomb note!
            this.addEffect({
              type: "float-text",
              text: "AVOIDED",
              x: noteX,
              y: noteY - 10,
              color: "#ffa502",
              opacity: 0.75,
              vy: -0.6
            });
          }
        }

        const fadeElapsed = this.currentTime - (note.time + fullSizeHittableDuration);
        if (fadeElapsed <= fadeDuration) {
          note.phase = "fading";
          note.fadeOpacity = Math.max(0, 1 - fadeElapsed / fadeDuration);
        } else {
          note.phase = "expired";
          note.isExpired = true;
        }
      }
    });

    this.remainingNotes = this.notes.filter((n) => !n.hit && !n.missed && n.type !== "triangle" && n.type !== "bomb").length;

    // Check if all notes in track have finished processing (hit or missed)
    if (this.lastNoteProcessedTime === null) {
      if (this.totalNotes === 0) {
        this.lastNoteProcessedTime = 0;
        this.lastNoteProcessedWallTime = typeof performance !== "undefined" ? performance.now() : Date.now();
      } else {
        const allProcessed = this.notes.every((n) => n.hit || n.missed);
        if (allProcessed) {
          this.lastNoteProcessedTime = this.currentTime;
          this.lastNoteProcessedWallTime = typeof performance !== "undefined" ? performance.now() : Date.now();
        }
      }
    }
  }

  /**
   * Determines if the player is allowed to exit the track normally.
   * A run can be completed normally once 5 seconds have passed since the last note was processed,
   * even if the song has not reached its end duration.
   * @returns {boolean}
   */
  canExitNormally() {
    if (!this.isRunning) return false;

    // Empty track with no notes: allow normal exit after 5s of playback
    if (this.totalNotes === 0) {
      return this.currentTime >= 5.0;
    }

    const allProcessed = this.notes.every((n) => n.hit || n.missed);
    if (!allProcessed) {
      return false;
    }

    if (this.lastNoteProcessedTime !== null) {
      if ((this.currentTime - this.lastNoteProcessedTime) >= 5.0) {
        return true;
      }
    }

    if (this.lastNoteProcessedWallTime !== null) {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      if ((now - this.lastNoteProcessedWallTime) / 1000 >= 5.0) {
        return true;
      }
    }

    // Fallback: check maximum note time + 1.0s active window + 5.0s buffer
    const maxNoteTime = this.notes.reduce((max, n) => Math.max(max, n.time || 0), 0);
    return this.currentTime >= (maxNoteTime + 1.0 + 5.0);
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
   * Spawns wrong-hit fault animation when big ball is hit first (-25 points penalty).
  /**
   * Spawns bomb explosion animation when a triangle bomb note is struck (-200 points penalty).
   * @param {number} x
   * @param {number} y
   */
  triggerBombHitAnimation(x, y) {
    // 1. Expanding fiery explosion shockwaves
    this.addEffect({
      type: "bomb-shockwave",
      x,
      y,
      color: "#ff4757",
      radius: 20,
      maxRadius: 110,
      opacity: 1.0
    });

    this.addEffect({
      type: "bomb-shockwave",
      x,
      y,
      color: "#ffa502",
      radius: 12,
      maxRadius: 80,
      opacity: 0.9
    });

    // 2. High-energy explosive spark burst
    for (let i = 0; i < 14; i++) {
      const angle = (i * Math.PI * 2) / 14 + (Math.random() - 0.5) * 0.4;
      const speed = 2.5 + Math.random() * 4.0;
      this.addEffect({
        type: "sparkle",
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 5 + Math.random() * 4,
        color: i % 2 === 0 ? "#ff4757" : "#ffa502",
        opacity: 1.0,
        decay: 0.035
      });
    }

    // 3. Floating penalty alert
    this.addEffect({
      type: "float-text",
      text: "BOMB -200",
      x,
      y: y - 28,
      color: "#ff4757",
      opacity: 1.0,
      vy: -1.4,
      isWrong: true
    });
  }

  /**
   * Legacy alias for triggerBombHitAnimation.
   */
  triggerWrongHitAnimation(x, y, color) {
    this.triggerBombHitAnimation(x, y);
  }

  /**
   * Legacy alias for triggerWrongHitAnimation.
   */
  triggerWrongDirectionAnimation(x, y, color) {
    this.triggerBombHitAnimation(x, y);
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
   * Calculates performance rank grade based on score percentage = (total score / max possible score) * 100.
   * Checks thresholds strictly from highest to lowest:
   * - SSS: Exactly 100%
   * - SS:  Greater than 95% and below 100%
   * - S:   Greater than 90% and up to 95%
   * - A:   Greater than 80% and up to 90%
   * - B:   Greater than 65% and up to 80%
   * - C:   Greater than 50% and up to 65%
   * - D:   Greater than 35% and up to 50%
   * - E:   Greater than 20% and up to 35%
   * - F:   20% or below
   *
   * Uses the unrounded percentage to determine the rank.
   *
   * @param {number|Object} input Raw unrounded percentage OR results object
   * @returns {{ grade: string, label: string, percentage: number }}
   */
  static computeRank(input) {
    let unroundedPct = 0;
    if (typeof input === "number") {
      unroundedPct = input;
    } else if (input && typeof input.rawScorePercentage === "number") {
      unroundedPct = input.rawScorePercentage;
    } else if (input && typeof input.score === "number" && typeof input.highestPossibleScore === "number") {
      unroundedPct = input.highestPossibleScore > 0 ? (input.score / input.highestPossibleScore) * 100 : 0;
    } else if (input && input.scorePercentage != null) {
      unroundedPct = parseFloat(input.scorePercentage) || 0;
    }

    if (isNaN(unroundedPct)) {
      unroundedPct = 0;
    }

    let label;
    let grade;

    if (unroundedPct >= 100) {
      label = "SSS";
      grade = "sss";
    } else if (unroundedPct > 95) {
      label = "SS";
      grade = "ss";
    } else if (unroundedPct > 90) {
      label = "S";
      grade = "s";
    } else if (unroundedPct > 80) {
      label = "A";
      grade = "a";
    } else if (unroundedPct > 65) {
      label = "B";
      grade = "b";
    } else if (unroundedPct > 50) {
      label = "C";
      grade = "c";
    } else if (unroundedPct > 35) {
      label = "D";
      grade = "d";
    } else if (unroundedPct > 20) {
      label = "E";
      grade = "e";
    } else {
      label = "F";
      grade = "f";
    }

    return { label, grade, percentage: unroundedPct };
  }

  /**
   * Compiles comprehensive performance statistics for the End Screen.
   * @param {boolean} isCompleted
   * @returns {Object}
   */
  getPerformanceSummary(isCompleted = true) {
    const maxPossible = this.highestPossibleScore > 0 ? this.highestPossibleScore : this.calculateHighestPossibleScore();
    const rawScorePct = maxPossible > 0 ? (this.score / maxPossible) * 100 : 0;

    // Determine rank using unrounded score percentage
    const rankInfo = GameEngine.computeRank(rawScorePct);

    // Format score percentage only for display (rounding for display)
    let displayScorePct;
    if (rawScorePct >= 100) {
      displayScorePct = "100.0";
    } else if (rawScorePct <= 0) {
      displayScorePct = "0.0";
    } else if (rawScorePct > 99.9 && rawScorePct < 100) {
      displayScorePct = "99.9"; // Prevent displaying 100.0% when SSS requires exactly 100%
    } else {
      displayScorePct = rawScorePct.toFixed(1);
    }

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
      difficulty: this.song.difficulty || "Normal",
      song: this.song,
      score: this.score,
      highestPossibleScore: maxPossible,
      rawScorePercentage: rawScorePct,
      scorePercentage: displayScorePct,
      rank: rankInfo.label,
      rankGrade: rankInfo.grade,
      accuracy: accuracy,
      totalNotes: this.totalNotes,
      hits: this.hitsCount,
      misses: this.missesCount,
      perfectHits: this.perfectHits,
      goodHits: this.goodHits,
      bombHits: this.bombHits,
      wrongDirectionHits: this.bombHits,
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
   * Called when player leaves a song during gameplay (Exit button or Escape).
   * If 5 seconds have passed since the last note was processed, treats the run as
   * completed normally (calculates score, saves to high scores, no early-exit restrictions).
   * Otherwise, halts session and presents End Screen flagged as abandoned.
   */
  abandonRun() {
    const isCompleted = this.canExitNormally();
    this.handleSongCompletion(isCompleted);
  }

  /**
   * Alias for exiting the track session.
   */
  requestExit() {
    this.abandonRun();
  }

  /**
   * Halts gameplay engine, audio, and inputs.
   */
  stop() {
    this.isRunning = false;
    this.isCountingDown = false;
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

// Expose to window / global
if (typeof window !== "undefined") {
  window.GameEngine = GameEngine;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = GameEngine;
}

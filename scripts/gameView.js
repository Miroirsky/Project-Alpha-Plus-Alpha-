/**
 * @file gameView.js
 * @description Renders gameplay canvas (track, 1-second hit window notes, 0.5s fadeout on miss,
 * mouse-following player orb, hit shockwaves) and comprehensive performance End Screen.
 */

class GameView {
  /**
   * @param {Object} dependencies
   * @param {HTMLElement} dependencies.container
   * @param {Function} dependencies.onExit
   * @param {Function} dependencies.onReplay
   */
  constructor({ container, onExit = null, onReplay = null }) {
    this.container = container;
    this.onExit = onExit;
    this.onReplay = onReplay;

    // Canvas & 2D Context
    this.canvas = document.getElementById("game-canvas");
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;

    // Top HUD Elements
    this.trackTitle = document.getElementById("game-track-title");
    this.trackArtist = document.getElementById("game-track-artist");
    this.progressFill = document.getElementById("game-progress-fill");
    this.progressTime = document.getElementById("game-progress-time");
    this.remainingNotesBadge = document.getElementById("game-remaining-notes");
    this.scoreBadge = document.getElementById("game-score");
    this.comboBadge = document.getElementById("game-combo");
    this.colorDot = document.getElementById("game-color-dot");
    this.colorText = document.getElementById("game-color-text");
    this.exitBtn = document.getElementById("btn-game-exit");

    // Comprehensive End Screen Elements
    this.resultsOverlay = document.getElementById("game-results-overlay");
    this.resultsSongName = document.getElementById("results-song-name");
    this.resultsStatus = document.getElementById("results-status");
    this.resultsScore = document.getElementById("results-score");
    this.resultsBestScore = document.getElementById("results-best-score");
    this.resultsNewBestTag = document.getElementById("results-new-best-tag");
    this.resultsMaxScore = document.getElementById("results-max-score");
    this.resultsScorePct = document.getElementById("results-score-pct");
    this.resultsAccuracy = document.getElementById("results-accuracy");
    this.resultsMaxCombo = document.getElementById("results-max-combo");
    this.resultsFinalCombo = document.getElementById("results-final-combo");
    this.resultsTotalNotes = document.getElementById("results-total-notes");
    this.resultsHits = document.getElementById("results-hits");
    this.resultsMisses = document.getElementById("results-misses");
    this.resultsPerfect = document.getElementById("results-perfect");
    this.resultsGood = document.getElementById("results-good");
    this.resultsWrongDir = document.getElementById("results-wrong-dir");
    this.resultsRecordNotice = document.getElementById("results-record-notice");
    this.resultsReplayBtn = document.getElementById("btn-results-replay");
    this.resultsReturnBtn = document.getElementById("btn-results-return");

    this.boundResize = this.resizeCanvas.bind(this);
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("resize", this.boundResize);
    }
    this.resizeCanvas();
    this.bindEvents();
  }

  /**
   * Adjusts canvas resolution to match window display.
   */
  resizeCanvas() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  /**
   * Binds UI events.
   */
  bindEvents() {
    if (this.exitBtn) {
      this.exitBtn.addEventListener("click", () => {
        if (this.onExit) this.onExit();
      });
    }

    if (this.resultsReturnBtn) {
      this.resultsReturnBtn.addEventListener("click", () => {
        this.hideResults();
        if (this.onExit) this.onExit();
      });
    }

    if (this.resultsReplayBtn) {
      this.resultsReplayBtn.addEventListener("click", () => {
        this.hideResults();
        if (this.onReplay) this.onReplay();
      });
    }
  }

  /**
   * Sets up track metadata in the HUD.
   * @param {Object} song
   */
  setupSong(song) {
    if (this.trackTitle) this.trackTitle.textContent = song.name;
    if (this.trackArtist) this.trackArtist.textContent = `By ${song.creator || "Artist"} &bull; Mapped by ${song.mapper || "Mapper"}`;
    this.hideResults();
  }

  /**
   * Updates HUD and renders frame from engine state.
   * @param {Object} state
   */
  render(state) {
    this.updateHUD(state);
    this.drawScene(state);
  }

  /**
   * Updates HUD DOM elements.
   * @param {Object} state
   */
  updateHUD(state) {
    if (this.progressFill) {
      const pct = Math.max(0, Math.min(100, (state.progress || 0) * 100));
      this.progressFill.style.width = `${pct}%`;
    }

    if (this.progressTime) {
      const curStr = this.formatTime(state.currentTime);
      const durStr = this.formatTime(state.duration);
      this.progressTime.textContent = `${curStr} / ${durStr}`;
    }

    if (this.remainingNotesBadge) {
      this.remainingNotesBadge.textContent = state.remainingNotes;
    }

    if (this.scoreBadge) {
      this.scoreBadge.textContent = state.score.toLocaleString();
    }
    if (this.comboBadge) {
      this.comboBadge.textContent = `${state.combo}x`;
    }

    if (this.colorDot && this.colorText) {
      if (state.color === "red") {
        this.colorDot.className = "color-dot red";
        this.colorText.textContent = "RED [Left Click]";
        this.colorText.style.color = "#ff4757";
      } else {
        this.colorDot.className = "color-dot blue";
        this.colorText.textContent = "BLUE [Right Click]";
        this.colorText.style.color = "#00d4ff";
      }
    }
  }

  /**
   * Draws scene on canvas.
   * @param {Object} state
   */
  drawScene(state) {
    if (!this.ctx || !this.canvas) return;

    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.clearRect(0, 0, width, height);

    this.drawTrackBackground(ctx, width, height, state.currentTime);
    this.drawNotes(ctx, width, height, state.notes, state.currentTime);
    this.drawEffects(ctx, state.effects);
    this.drawPlayerOrb(ctx, state.playerOrb);
  }

  /**
   * Draws ambient rhythmic arena background.
   */
  drawTrackBackground(ctx, width, height, time) {
    const cx = width / 2;
    const cy = height / 2;

    ctx.save();
    ctx.strokeStyle = "rgba(0, 212, 255, 0.06)";
    ctx.lineWidth = 1;

    const pulseRadius = ((time * 60) % 200) + 40;
    ctx.beginPath();
    ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - 300, cy);
    ctx.lineTo(cx + 300, cy);
    ctx.moveTo(cx, cy - 200);
    ctx.lineTo(cx, cy + 200);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Draws active notes across 3 phases:
   * 1. 1.0s Grow-In Phase (grows from 20% to full size; awards 200pt Perfect when approaching from required direction)
   * 2. 1.0s Full-Size Hittable Phase (with circular countdown ring; awards 150–50pt Normal)
   * 3. 0.5s Fadeout Phase on Miss
   */
  drawNotes(ctx, width, height, notes, currentTime) {
    if (!notes) return;

    const growDuration = 1.0;
    const fullDuration = 1.0;
    const baseRadius = 26;

    notes.forEach((note) => {
      if (note.hit || note.isExpired) return;

      const elapsed = currentTime - note.time;
      if (elapsed < 0) return; // Not yet spawned

      const noteX = note.x * width;
      const noteY = note.y * height;
      const colorHex = note.color === "red" ? "#ff4757" : "#00d4ff";

      // Phase 1: Grow-In Phase (0 <= elapsed < 1.0s)
      if (elapsed < growDuration) {
        const growProgress = elapsed / growDuration; // 0 to 1
        const currentRadius = note.currentRadius || Math.max(6, baseRadius * (0.2 + 0.8 * growProgress));

        ctx.save();

        // Outer target outline (showing the target full size they are growing toward)
        ctx.beginPath();
        ctx.arc(noteX, noteY, baseRadius, 0, Math.PI * 2);
        ctx.strokeStyle = colorHex;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.globalAlpha = 0.35 + 0.35 * growProgress;
        ctx.stroke();
        ctx.setLineDash([]);

        // Expanding note core
        ctx.beginPath();
        ctx.arc(noteX, noteY, currentRadius, 0, Math.PI * 2);
        ctx.strokeStyle = colorHex;
        ctx.lineWidth = 3;
        ctx.shadowColor = colorHex;
        ctx.shadowBlur = 18;
        ctx.stroke();

        ctx.fillStyle = note.color === "red" ? "rgba(255, 71, 87, 0.4)" : "rgba(0, 212, 255, 0.4)";
        ctx.fill();

        // Radiant golden "PERFECT (200)" hint ring during grow window
        ctx.beginPath();
        ctx.arc(noteX, noteY, currentRadius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 211, 42, 0.75)";
        ctx.lineWidth = 1.5;
        ctx.shadowColor = "#ffd32a";
        ctx.shadowBlur = 10;
        ctx.stroke();

        // Directional arrow and entry guide (only drawn for arrow notes)
        this.drawDirectionalArrow(ctx, noteX, noteY, currentRadius, note.direction, colorHex, note.angle);

        ctx.restore();
      }
      // Phase 2: Full-Size Hittable Phase (1.0s <= elapsed <= 2.0s)
      else if (elapsed <= growDuration + fullDuration) {
        const hittableProgress = (elapsed - growDuration) / fullDuration; // 0 to 1
        const remainingFraction = Math.max(0, 1 - hittableProgress);

        ctx.save();

        // Target Hit Circle (Full size)
        ctx.beginPath();
        ctx.arc(noteX, noteY, baseRadius, 0, Math.PI * 2);
        ctx.strokeStyle = colorHex;
        ctx.lineWidth = 3;
        ctx.shadowColor = colorHex;
        ctx.shadowBlur = 18;
        ctx.stroke();

        // Translucent core
        ctx.fillStyle = note.color === "red" ? "rgba(255, 71, 87, 0.3)" : "rgba(0, 212, 255, 0.3)";
        ctx.fill();

        // Directional arrow and entry guide (only drawn for arrow notes)
        this.drawDirectionalArrow(ctx, noteX, noteY, baseRadius, note.direction, colorHex, note.angle);

        // Circular countdown ring indicating remaining hittable window
        ctx.beginPath();
        ctx.arc(noteX, noteY, baseRadius + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remainingFraction);
        ctx.strokeStyle = colorHex;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.restore();
      }
      // Phase 3: Fading out on miss (elapsed > 2.0s)
      else if (note.isFading || note.phase === "fading") {
        const opacity = Math.max(0, note.fadeOpacity != null ? note.fadeOpacity : 0);

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.beginPath();
        ctx.arc(noteX, noteY, baseRadius * (0.8 + 0.2 * opacity), 0, Math.PI * 2);
        ctx.strokeStyle = "#8b9bb4";
        ctx.fillStyle = "rgba(139, 155, 180, 0.15)";
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    });
  }

  /**
   * Draws a clear, stylish directional arrow and entry gate indicating the required approach direction.
   * If note is a normal note (no direction and no angle), nothing is drawn.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @param {string} [direction]
   * @param {string} colorHex
   * @param {number} [angle]
   */
  drawDirectionalArrow(ctx, x, y, radius, direction, colorHex, angle) {
    const hasDirection = Boolean(direction && direction !== "any");
    const hasAngle = typeof angle === "number";

    // Normal notes have no directional arrow
    if (!hasDirection && !hasAngle) return;

    ctx.save();
    ctx.translate(x, y);

    let targetAngle = 0;
    if (hasAngle) {
      targetAngle = angle;
    } else {
      const dirMap = {
        left: 0,           // Approach from left (moves rightward ->)
        right: Math.PI,    // Approach from right (moves leftward <-)
        up: Math.PI / 2,   // Approach from top (moves downward \/)
        down: -Math.PI / 2 // Approach from bottom (moves upward /\)
      };
      targetAngle = dirMap[direction.toLowerCase()] ?? 0;
    }

    ctx.rotate(targetAngle);

    // Central movement indicator arrow
    const arrowLen = Math.max(8, radius * 0.5);
    const arrowWing = Math.max(5, radius * 0.35);

    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = colorHex;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(-arrowLen * 0.5, 0);
    ctx.lineTo(arrowLen * 0.6, 0);
    ctx.lineTo(arrowLen * 0.6 - arrowWing, -arrowWing);
    ctx.moveTo(arrowLen * 0.6, 0);
    ctx.lineTo(arrowLen * 0.6 - arrowWing, arrowWing);
    ctx.stroke();

    // Exterior entry chevron on the perimeter showing entry side
    ctx.fillStyle = colorHex;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(-radius - 2, 0);
    ctx.lineTo(-radius - 10, -6);
    ctx.lineTo(-radius - 7, 0);
    ctx.lineTo(-radius - 10, 6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  /**
   * Draws visual effects (hit ripples, switch pulse, floating text, golden halos, star sparkles, wrong-ripples).
   */
  drawEffects(ctx, effects) {
    if (!effects) return;

    effects.forEach((fx) => {
      ctx.save();

      if (fx.type === "perfect-halo") {
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.radius, 0, Math.PI * 2);
        ctx.strokeStyle = fx.color || "#ffd32a";
        ctx.globalAlpha = Math.max(0, fx.opacity);
        ctx.lineWidth = 3.5;
        ctx.shadowColor = fx.color || "#ffd32a";
        ctx.shadowBlur = 24;
        ctx.stroke();
      } else if (fx.type === "wrong-ripple") {
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.radius, 0, Math.PI * 2);
        ctx.strokeStyle = "#ff4757";
        ctx.globalAlpha = Math.max(0, fx.opacity);
        ctx.lineWidth = 4;
        ctx.shadowColor = "#ff4757";
        ctx.shadowBlur = 20;
        ctx.stroke();
      } else if (fx.type === "sparkle") {
        ctx.globalAlpha = Math.max(0, fx.opacity);
        ctx.fillStyle = fx.color || "#ffd32a";
        ctx.shadowColor = fx.color || "#ffd32a";
        ctx.shadowBlur = 10;
        const cx = fx.x;
        const cy = fx.y;
        const s = fx.size || 5;
        ctx.beginPath();
        ctx.moveTo(cx, cy - s);
        ctx.lineTo(cx + s * 0.28, cy - s * 0.28);
        ctx.lineTo(cx + s, cy);
        ctx.lineTo(cx + s * 0.28, cy + s * 0.28);
        ctx.lineTo(cx, cy + s);
        ctx.lineTo(cx - s * 0.28, cy + s * 0.28);
        ctx.lineTo(cx - s, cy);
        ctx.lineTo(cx - s * 0.28, cy - s * 0.28);
        ctx.closePath();
        ctx.fill();
      } else if (fx.type === "hit-ripple" || fx.type === "switch-pulse") {
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.radius, 0, Math.PI * 2);
        ctx.strokeStyle = fx.color;
        ctx.globalAlpha = Math.max(0, fx.opacity);
        ctx.lineWidth = 3;
        ctx.shadowColor = fx.color;
        ctx.shadowBlur = 12;
        ctx.stroke();
      } else if (fx.type === "float-text") {
        if (fx.isPerfect) {
          ctx.font = "900 17px monospace";
          ctx.fillStyle = "#ffd32a";
          ctx.globalAlpha = Math.max(0, fx.opacity);
          ctx.textAlign = "center";
          ctx.shadowColor = "#ffd32a";
          ctx.shadowBlur = 16;
          ctx.fillText(fx.text, fx.x, fx.y);
        } else if (fx.isWrong) {
          ctx.font = "900 16px monospace";
          ctx.fillStyle = "#ff4757";
          ctx.globalAlpha = Math.max(0, fx.opacity);
          ctx.textAlign = "center";
          ctx.shadowColor = "#ff4757";
          ctx.shadowBlur = 16;
          ctx.fillText(fx.text, fx.x, fx.y);
        } else {
          ctx.font = "bold 16px sans-serif";
          ctx.fillStyle = fx.color;
          ctx.globalAlpha = Math.max(0, fx.opacity);
          ctx.textAlign = "center";
          ctx.shadowColor = fx.color;
          ctx.shadowBlur = 8;
          ctx.fillText(fx.text, fx.x, fx.y);
        }
      }

      ctx.restore();
    });
  }

  /**
   * Draws mouse-following player orb.
   */
  drawPlayerOrb(ctx, orb) {
    if (!orb) return;

    const colorHex = orb.color === "red" ? "#ff4757" : "#00d4ff";
    const pulseOffset = (orb.pulse || 0) * 8;
    const radius = orb.radius + pulseOffset;

    ctx.save();

    // Outer glow aura
    const gradient = ctx.createRadialGradient(orb.x, orb.y, 4, orb.x, orb.y, radius * 1.8);
    gradient.addColorStop(0, colorHex);
    gradient.addColorStop(0.5, orb.color === "red" ? "rgba(255, 71, 87, 0.4)" : "rgba(0, 212, 255, 0.4)");
    gradient.addColorStop(1, "transparent");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, radius * 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Solid core
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = colorHex;
    ctx.shadowBlur = 20;
    ctx.fill();

    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Formats seconds into MM:SS.
   * @param {number} sec
   * @returns {string}
   */
  formatTime(sec) {
    if (!sec || isNaN(sec) || sec < 0) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  /**
   * Displays the comprehensive performance End Screen.
   * @param {Object} results
   * @param {Object} scoreRecord
   */
  showResults(results, scoreRecord = { isNewRecord: false, bestScore: 0 }) {
    if (this.resultsSongName) this.resultsSongName.textContent = results.songName;
    if (this.resultsStatus) {
      this.resultsStatus.textContent = results.completionStatus;
      this.resultsStatus.className = `results-status-banner ${results.statusClass || ""}`;
    }

    if (this.resultsScore) this.resultsScore.textContent = (results.score || 0).toLocaleString();
    if (this.resultsBestScore) this.resultsBestScore.textContent = (scoreRecord.bestScore || results.score || 0).toLocaleString();
    if (this.resultsNewBestTag) {
      this.resultsNewBestTag.style.display = scoreRecord.isNewRecord ? "inline-block" : "none";
    }

    if (this.resultsRecordNotice) {
      if (!results.isCompleted) {
        this.resultsRecordNotice.textContent = "Run abandoned early — records only save on completion.";
        this.resultsRecordNotice.style.display = "block";
      } else if (scoreRecord.isNewRecord) {
        this.resultsRecordNotice.textContent = "★ New Personal Best! ★";
        this.resultsRecordNotice.style.display = "block";
      } else {
        this.resultsRecordNotice.textContent = "";
        this.resultsRecordNotice.style.display = "none";
      }
    }

    if (this.resultsMaxScore) this.resultsMaxScore.textContent = (results.highestPossibleScore || 0).toLocaleString();
    if (this.resultsScorePct) this.resultsScorePct.textContent = `${results.scorePercentage || "0.0"}%`;
    if (this.resultsAccuracy) this.resultsAccuracy.textContent = `${results.accuracy || "0.0"}%`;

    if (this.resultsMaxCombo) this.resultsMaxCombo.textContent = `${results.maxCombo || 0}x`;
    if (this.resultsFinalCombo) this.resultsFinalCombo.textContent = `${results.finalCombo || 0}x`;

    if (this.resultsTotalNotes) this.resultsTotalNotes.textContent = results.totalNotes || 0;
    if (this.resultsHits) this.resultsHits.textContent = results.hits || 0;
    if (this.resultsMisses) this.resultsMisses.textContent = results.misses || 0;

    if (this.resultsPerfect) this.resultsPerfect.textContent = results.perfectHits || 0;
    if (this.resultsGood) this.resultsGood.textContent = results.goodHits || 0;
    if (this.resultsWrongDir) this.resultsWrongDir.textContent = results.wrongDirectionHits || 0;

    if (this.resultsOverlay) {
      this.resultsOverlay.classList.add("is-active");
      this.resultsOverlay.setAttribute("aria-hidden", "false");
    }
  }

  /**
   * Hides the End Screen overlay.
   */
  hideResults() {
    if (this.resultsOverlay) {
      this.resultsOverlay.classList.remove("is-active");
      this.resultsOverlay.setAttribute("aria-hidden", "true");
    }
  }

  /**
   * Shows gameplay view.
   */
  show() {
    if (this.container) {
      this.container.classList.add("is-active");
      this.container.setAttribute("aria-hidden", "false");
    }
    this.resizeCanvas();
  }

  /**
   * Hides gameplay view.
   */
  hide() {
    if (this.container) {
      this.container.classList.remove("is-active");
      this.container.setAttribute("aria-hidden", "true");
    }
  }
}

// Expose to window
window.GameView = GameView;

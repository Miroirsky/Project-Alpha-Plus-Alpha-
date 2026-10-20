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

    // Track Background Media (Image or Video)
    this.bgMedia = null;
    this.bgMediaType = null;
    this.bgConfig = null;

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
    this.resultsRankBadge = document.getElementById("results-rank-badge");
    this.resultsMainRankBadge = document.getElementById("results-main-rank-badge");
    this.resultsRankPill = document.getElementById("results-rank-pill");
    this.resultsReplayBtn = document.getElementById("btn-results-replay");
    this.resultsReturnBtn = document.getElementById("btn-results-return");

    this.orbTrail = [];

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

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isOpen()) {
        if (this.onExit) this.onExit();
      }
    });
  }

  /**
   * Sets up track metadata and custom background in the HUD.
   * @param {Object} song
   */
  setupSong(song) {
    const diffTag = song.difficulty ? ` [${song.difficulty}]` : "";
    if (this.trackTitle) this.trackTitle.textContent = `${song.name}${diffTag}`;
    if (this.trackArtist) this.trackArtist.textContent = `By ${song.creator || "Artist"} &bull; Mapped by ${song.mapper || "Mapper"}`;
    this.hideResults();

    if (this.exitBtn) {
      this.exitBtn.classList.remove("can-finish");
      this.exitBtn.innerHTML = "&larr; Exit Track";
      this.exitBtn.title = "Exit track early (Run abandoned)";
    }

    this.cleanupBackgroundMedia();
    if (song && song.background) {
      this.initBackgroundMedia(song.background);
    }
  }

  /**
   * Cleans up and releases background video / image media resources.
   */
  cleanupBackgroundMedia() {
    if (this.bgMedia && this.bgMediaType === "video") {
      try {
        this.bgMedia.pause();
        this.bgMedia.src = "";
      } catch (e) {}
    }
    this.bgMedia = null;
    this.bgMediaType = null;
    this.bgConfig = null;
  }

  /**
   * Initializes background image or video for gameplay.
   * @param {Object} bg
   */
  async initBackgroundMedia(bg) {
    if (!bg) return;
    this.bgConfig = bg;

    let mediaUrl = bg.url;
    if (!mediaUrl && bg.mediaId && typeof window !== "undefined" && window.MediaStorage) {
      const stored = await window.MediaStorage.getBackgroundMedia(bg.mediaId);
      if (stored) {
        if (typeof stored === "string") {
          mediaUrl = stored;
        } else if (typeof window.URL !== "undefined" && window.URL.createObjectURL) {
          mediaUrl = window.URL.createObjectURL(stored);
        }
      }
    }

    if (!mediaUrl) return;

    if (bg.type === "video") {
      try {
        const video = document.createElement("video");
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = "auto";
        video.src = mediaUrl;
        this.bgMedia = video;
        this.bgMediaType = "video";
      } catch (err) {
        console.warn("Failed to initialize gameplay background video:", err);
      }
    } else {
      try {
        const img = new Image();
        img.src = mediaUrl;
        this.bgMedia = img;
        this.bgMediaType = "image";
      } catch (err) {
        console.warn("Failed to initialize gameplay background image:", err);
      }
    }
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

    if (this.exitBtn) {
      if (state.canExitNormally) {
        if (!this.exitBtn.classList.contains("can-finish")) {
          this.exitBtn.classList.add("can-finish");
          this.exitBtn.innerHTML = "&check; Finish Track";
          this.exitBtn.title = "All notes completed. Click or press Escape to complete track.";
        }
      } else {
        if (this.exitBtn.classList.contains("can-finish")) {
          this.exitBtn.classList.remove("can-finish");
          this.exitBtn.innerHTML = "&larr; Exit Track";
          this.exitBtn.title = "Exit track early (Run abandoned)";
        }
      }
    }
  }

  /**
   * Draws scene on canvas with polished visual effects and smooth motion trails.
   * @param {Object} state
   */
  drawScene(state) {
    if (!this.ctx || !this.canvas) return;

    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Track motion trail points for smooth fluid orb movement
    if (state.playerOrb) {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      this.orbTrail.push({
        x: state.playerOrb.x,
        y: state.playerOrb.y,
        color: state.playerOrb.color,
        time: now
      });
      while (this.orbTrail.length > 7 || (this.orbTrail.length > 0 && now - this.orbTrail[0].time > 140)) {
        this.orbTrail.shift();
      }
    }

    ctx.clearRect(0, 0, width, height);

    if (state.isPaused && this.bgMedia && this.bgMediaType === "video" && !this.bgMedia.paused) {
      try { this.bgMedia.pause(); } catch (e) {}
    }

    this.drawTrackBackground(ctx, width, height, state.currentTime);
    this.drawNotes(ctx, width, height, state.notes, state.currentTime);
    this.drawEffects(ctx, state.effects);
    this.drawPlayerOrb(ctx, state.playerOrb);
  }

  /**
   * Draws ambient rhythmic arena background with square playfield boundary and subtle pulses.
   * Also renders custom track background (image or video) inside the square play area.
   */
  drawTrackBackground(ctx, width, height, time) {
    const playArea = PlayArea.getMetrics(width, height);
    const cx = width / 2;
    const cy = height / 2;
    const s = playArea.size;
    const ox = playArea.offsetX;
    const oy = playArea.offsetY;

    // Custom Track Background Media (Image or Video)
    if (this.bgMedia && this.bgConfig) {
      if (this.bgMediaType === "video") {
        if (this.bgMedia.duration > 0 && Math.abs(this.bgMedia.currentTime - (time % this.bgMedia.duration)) > 0.15) {
          try { this.bgMedia.currentTime = time % this.bgMedia.duration; } catch (e) {}
        }
        if (this.bgMedia.paused) {
          this.bgMedia.play().catch(() => {});
        }
      }
      PlayArea.drawBackgroundMedia(ctx, this.bgMedia, ox, oy, s, this.bgConfig.fit || "cover", this.bgConfig.opacity !== undefined ? this.bgConfig.opacity : 0.7);
    }

    ctx.save();

    // 1. Subtle square play area boundary & corner brackets
    ctx.strokeStyle = "rgba(0, 212, 255, 0.12)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox, oy, s, s);

    // Corner accents
    const cornerLen = Math.min(28, s * 0.07);
    ctx.strokeStyle = "rgba(0, 212, 255, 0.4)";
    ctx.lineWidth = 2.5;

    // Top-left
    ctx.beginPath();
    ctx.moveTo(ox, oy + cornerLen);
    ctx.lineTo(ox, oy);
    ctx.lineTo(ox + cornerLen, oy);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(ox + s - cornerLen, oy);
    ctx.lineTo(ox + s, oy);
    ctx.lineTo(ox + s, oy + cornerLen);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(ox, oy + s - cornerLen);
    ctx.lineTo(ox, oy + s);
    ctx.lineTo(ox + cornerLen, oy + s);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(ox + s - cornerLen, oy + s);
    ctx.lineTo(ox + s, oy + s);
    ctx.lineTo(ox + s, oy + s - cornerLen);
    ctx.stroke();

    // 2. Dual concentric rhythmic breathing pulse rings inside square play area
    const maxPulse = s * 0.44;
    const pulse1 = ((time * 70) % maxPulse) + 20;
    const pulse2 = (((time * 70) + maxPulse * 0.5) % maxPulse) + 20;

    ctx.beginPath();
    ctx.arc(cx, cy, pulse1, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0, 212, 255, ${Math.max(0, 0.07 * (1 - pulse1 / maxPulse))})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, pulse2, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0, 212, 255, ${Math.max(0, 0.07 * (1 - pulse2 / maxPulse))})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Circular arena boundary inside square
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.44, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0, 212, 255, 0.08)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Crosshairs centered in square
    ctx.strokeStyle = "rgba(0, 212, 255, 0.05)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox, cy);
    ctx.lineTo(ox + s, cy);
    ctx.moveTo(cx, oy);
    ctx.lineTo(cx, oy + s);
    ctx.stroke();

    // Center rhythmic diamond focal indicator
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx + 6, cy);
    ctx.lineTo(cx, cy + 6);
    ctx.lineTo(cx - 6, cy);
    ctx.closePath();
    ctx.fillStyle = "rgba(0, 212, 255, 0.22)";
    ctx.fill();

    ctx.restore();
  }

  /**
   * Draws active notes across 3 phases in the square play area:
   * 1. 1.0s Grow-In Phase (grows from 20% to full size; strictly immune to hits/penalties)
   * 2. 1.0s Full-Size Active Phase (with circular countdown ring; normal notes hittable, triangle bomb notes hazard)
   * 3. 0.5s Fadeout Phase on Miss / safe expiration
   * Supports normal round notes (red/blue) and triangle bomb hazard notes (yellow/amber).
   */
  drawNotes(ctx, width, height, notes, currentTime) {
    if (!notes) return;

    const playArea = PlayArea.getMetrics(width, height);
    const growDuration = 1.0;
    const fullDuration = 1.0;
    const baseRadius = playArea.noteRadius || playArea.bigRadius;
    const triangleRadius = playArea.triangleRadius || (baseRadius * 1.05);

    notes.forEach((note) => {
      if (note.hit || note.isExpired) return;

      const spawnTime = note.time - growDuration;
      if (currentTime < spawnTime) return; // Not yet spawned

      const isTriangle = note.type === "triangle" || note.type === "bomb";
      const noteRadius = isTriangle ? triangleRadius : baseRadius;
      const noteX = playArea.toScreenX(note.x);
      const noteY = playArea.toScreenY(note.y);
      const colorHex = isTriangle ? "#ffd32a" : (note.color === "red" ? "#ff4757" : "#00d4ff");

      // Phase 1: Grow-In Phase (spawnTime <= currentTime < note.time)
      // Note finishes growing to 100% full size at exactly note.time (editor placement beat)
      if (currentTime < note.time) {
        const growProgress = Math.max(0, Math.min(1, (currentTime - spawnTime) / growDuration)); // 0 to 1
        const minRadius = Math.max(5, noteRadius * 0.2);
        const currentRadius = note.currentRadius || (minRadius + (noteRadius - minRadius) * growProgress);

        ctx.save();

        if (isTriangle) {
          this.drawTriangleNote(
            ctx,
            noteX,
            noteY,
            currentRadius,
            noteRadius,
            "growing",
            growProgress,
            1.0
          );
        } else if (note.type === "directional" || note.type === "arrow") {
          this.drawDirectionalNote(
            ctx,
            noteX,
            noteY,
            currentRadius,
            noteRadius,
            note.color,
            note.angle,
            "growing",
            growProgress,
            1.0
          );
        } else {
          // Normal single-ball note
          // Target outline
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
          ctx.lineWidth = 3.2;
          ctx.shadowColor = colorHex;
          ctx.shadowBlur = 20;
          ctx.stroke();

          ctx.fillStyle = note.color === "red" ? "rgba(255, 71, 87, 0.42)" : "rgba(0, 212, 255, 0.42)";
          ctx.fill();
        }

        ctx.restore();
      }
      // Phase 2: Full-Size Active Phase (note.time <= currentTime <= note.time + fullDuration)
      else if (currentTime <= note.time + fullDuration) {
        const hittableProgress = Math.max(0, Math.min(1, (currentTime - note.time) / fullDuration)); // 0 to 1
        const remainingFraction = Math.max(0, 1 - hittableProgress);

        ctx.save();

        if (isTriangle) {
          this.drawTriangleNote(
            ctx,
            noteX,
            noteY,
            noteRadius,
            noteRadius,
            "full",
            1.0,
            remainingFraction
          );
        } else if (note.type === "directional" || note.type === "arrow") {
          this.drawDirectionalNote(
            ctx,
            noteX,
            noteY,
            noteRadius,
            noteRadius,
            note.color,
            note.angle,
            "full",
            1.0,
            remainingFraction
          );
        } else {
          // Normal single-ball note
          ctx.beginPath();
          ctx.arc(noteX, noteY, baseRadius, 0, Math.PI * 2);
          ctx.strokeStyle = colorHex;
          ctx.lineWidth = 3.2;
          ctx.shadowColor = colorHex;
          ctx.shadowBlur = 20;
          ctx.stroke();

          ctx.fillStyle = note.color === "red" ? "rgba(255, 71, 87, 0.32)" : "rgba(0, 212, 255, 0.32)";
          ctx.fill();

          // Circular countdown ring
          const arcStart = -Math.PI / 2;
          const arcEnd = -Math.PI / 2 + Math.PI * 2 * remainingFraction;

          ctx.beginPath();
          ctx.arc(noteX, noteY, baseRadius + 6, arcStart, arcEnd);
          ctx.strokeStyle = colorHex;
          ctx.lineWidth = 2.5;
          ctx.stroke();

          if (remainingFraction > 0.02) {
            const tipX = noteX + Math.cos(arcEnd) * (baseRadius + 6);
            const tipY = noteY + Math.sin(arcEnd) * (baseRadius + 6);
            ctx.beginPath();
            ctx.arc(tipX, tipY, 3, 0, Math.PI * 2);
            ctx.fillStyle = "#ffffff";
            ctx.shadowColor = colorHex;
            ctx.shadowBlur = 8;
            ctx.fill();
          }
        }

        ctx.restore();
      }
      // Phase 3: Fading out on miss / avoidance (currentTime > note.time + fullDuration)
      else if (note.isFading || note.phase === "fading" || (currentTime > note.time + fullDuration && !note.hit)) {
        const fadeElapsed = currentTime - (note.time + fullDuration);
        const opacity = Math.max(0, note.fadeOpacity != null ? note.fadeOpacity : Math.max(0, 1 - fadeElapsed / 0.5));

        ctx.save();
        ctx.globalAlpha = opacity;

        if (isTriangle) {
          // Fading triangle
          const r = noteRadius * (0.8 + 0.2 * opacity);
          const topX = noteX;
          const topY = noteY - r;
          const brX = noteX + r * Math.cos(Math.PI / 6);
          const brY = noteY + r * Math.sin(Math.PI / 6);
          const blX = noteX - r * Math.cos(Math.PI / 6);
          const blY = noteY + r * Math.sin(Math.PI / 6);

          ctx.beginPath();
          ctx.moveTo(topX, topY);
          ctx.lineTo(brX, brY);
          ctx.lineTo(blX, blY);
          ctx.closePath();
          ctx.strokeStyle = "#8b9bb4";
          ctx.fillStyle = "rgba(139, 155, 180, 0.15)";
          ctx.lineWidth = 1.5;
          ctx.fill();
          ctx.stroke();
        } else if (note.type === "directional" || note.type === "arrow") {
          this.drawDirectionalNote(
            ctx,
            noteX,
            noteY,
            noteRadius * (0.8 + 0.2 * opacity),
            noteRadius,
            note.color,
            note.angle,
            "fading",
            1.0,
            1.0
          );
        } else {
          ctx.beginPath();
          ctx.arc(noteX, noteY, baseRadius * (0.8 + 0.2 * opacity), 0, Math.PI * 2);
          ctx.strokeStyle = "#8b9bb4";
          ctx.fillStyle = "rgba(139, 155, 180, 0.15)";
          ctx.lineWidth = 1.5;
          ctx.fill();
          ctx.stroke();
        }

        ctx.restore();
      }
    });
  }

  /**
   * Draws a clearly recognizable Triangle Bomb Note.
   * Visually distinct from round and square notes with hazard warning stripes and pulsing hazard aura.
   * Must be avoided during its active phase!
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {number} currentRadius
   * @param {number} targetRadius
   * @param {string} phase
   * @param {number} growProgress
   * @param {number} remainingFraction
   */
  drawTriangleNote(
    ctx,
    x,
    y,
    currentRadius,
    targetRadius,
    phase,
    growProgress,
    remainingFraction
  ) {
    const isGrowing = phase === "growing";

    // Compute vertices of equilateral triangle (pointing upwards)
    const computeTriangleVertices = (r) => {
      const topX = x;
      const topY = y - r;
      const brX = x + r * Math.cos(Math.PI / 6);
      const brY = y + r * Math.sin(Math.PI / 6);
      const blX = x - r * Math.cos(Math.PI / 6);
      const blY = y + r * Math.sin(Math.PI / 6);
      return { topX, topY, brX, brY, blX, blY };
    };

    const targetVerts = computeTriangleVertices(targetRadius);
    const currVerts = computeTriangleVertices(currentRadius);

    ctx.save();

    if (isGrowing) {
      // 1. Dashed target boundary outline indicating where full size will be at note.time
      ctx.beginPath();
      ctx.moveTo(targetVerts.topX, targetVerts.topY);
      ctx.lineTo(targetVerts.brX, targetVerts.brY);
      ctx.lineTo(targetVerts.blX, targetVerts.blY);
      ctx.closePath();
      ctx.strokeStyle = "rgba(255, 211, 42, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.globalAlpha = 0.3 + 0.4 * growProgress;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1.0;

      // 2. Growing triangle body
      ctx.beginPath();
      ctx.moveTo(currVerts.topX, currVerts.topY);
      ctx.lineTo(currVerts.brX, currVerts.brY);
      ctx.lineTo(currVerts.blX, currVerts.blY);
      ctx.closePath();
      ctx.strokeStyle = "#ffd32a";
      ctx.lineWidth = 2.8;
      ctx.shadowColor = "#ffa502";
      ctx.shadowBlur = 16;
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 165, 2, 0.28)";
      ctx.fill();

      // Top label indicating hazard
      ctx.font = "bold 9px monospace";
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("BOMB", x, y + 2);
    } else {
      // Full active phase: High-voltage hazard triangle bomb
      // 1. Pulsing hazard aura
      ctx.beginPath();
      ctx.moveTo(currVerts.topX, currVerts.topY);
      ctx.lineTo(currVerts.brX, currVerts.brY);
      ctx.lineTo(currVerts.blX, currVerts.blY);
      ctx.closePath();
      ctx.strokeStyle = "#ff4757";
      ctx.lineWidth = 3.5;
      ctx.shadowColor = "#ff4757";
      ctx.shadowBlur = 22;
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 71, 87, 0.35)";
      ctx.fill();

      // Inner amber triangle
      const innerVerts = computeTriangleVertices(currentRadius * 0.6);
      ctx.beginPath();
      ctx.moveTo(innerVerts.topX, innerVerts.topY);
      ctx.lineTo(innerVerts.brX, innerVerts.brY);
      ctx.lineTo(innerVerts.blX, innerVerts.blY);
      ctx.closePath();
      ctx.strokeStyle = "#ffd32a";
      ctx.lineWidth = 2.0;
      ctx.fillStyle = "rgba(255, 211, 42, 0.45)";
      ctx.fill();
      ctx.stroke();

      // Exclamation mark / Warning glyph inside
      ctx.font = `bold ${Math.max(11, Math.round(targetRadius * 0.55))}px monospace`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 8;
      ctx.fillText("!", x, y + 3);

      // Warning text tag above triangle
      ctx.font = "bold 9px monospace";
      ctx.fillStyle = "#ff4757";
      ctx.shadowColor = "#ff4757";
      ctx.shadowBlur = 8;
      ctx.fillText("AVOID", x, y - targetRadius - 8);

      // Circular countdown ring around the triangle (showing remaining active time)
      const arcStart = -Math.PI / 2;
      const arcEnd = -Math.PI / 2 + Math.PI * 2 * remainingFraction;
      const ringRadius = targetRadius + 6;

      ctx.beginPath();
      ctx.arc(x, y + 2, ringRadius, arcStart, arcEnd);
      ctx.strokeStyle = "#ffa502";
      ctx.lineWidth = 2.4;
      ctx.stroke();

      if (remainingFraction > 0.02) {
        const tipX = x + Math.cos(arcEnd) * ringRadius;
        const tipY = y + 2 + Math.sin(arcEnd) * ringRadius;
        ctx.beginPath();
        ctx.arc(tipX, tipY, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "#ffa502";
        ctx.shadowBlur = 8;
        ctx.fill();
      }
    }

    ctx.restore();
  }

  /**
   * Draws a clearly recognizable Directional Note (red/blue circle with an arrow and thicker stroke on required hit side).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {number} currentRadius
   * @param {number} targetRadius
   * @param {string} color - 'red' | 'blue'
   * @param {number} angleDeg - required direction angle (0-360)
   * @param {string} phase - 'growing' | 'full' | 'fading'
   * @param {number} growProgress
   * @param {number} remainingFraction
   */
  drawDirectionalNote(
    ctx,
    x,
    y,
    currentRadius,
    targetRadius,
    color,
    angleDeg = 0,
    phase = "full",
    growProgress = 1.0,
    remainingFraction = 1.0
  ) {
    const isGrowing = phase === "growing";
    const colorHex = color === "red" ? "#ff4757" : "#00d4ff";
    const rad = ((angleDeg * Math.PI) / 180);

    ctx.save();

    if (isGrowing) {
      // 1. Target dashed outline at full size
      ctx.beginPath();
      ctx.arc(x, y, targetRadius, 0, Math.PI * 2);
      ctx.strokeStyle = colorHex;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.globalAlpha = 0.35 + 0.35 * growProgress;
      ctx.stroke();
      ctx.setLineDash([]);

      // 2. Expanding directional note core
      ctx.beginPath();
      ctx.arc(x, y, currentRadius, 0, Math.PI * 2);
      ctx.strokeStyle = colorHex;
      ctx.lineWidth = 3.2;
      ctx.shadowColor = colorHex;
      ctx.shadowBlur = 18;
      ctx.stroke();

      ctx.fillStyle = color === "red" ? "rgba(255, 71, 87, 0.42)" : "rgba(0, 212, 255, 0.42)";
      ctx.fill();

      // Thicker stroke on required hit side (scaled with current radius)
      ctx.beginPath();
      ctx.arc(x, y, currentRadius, rad - Math.PI / 3, rad + Math.PI / 3);
      ctx.strokeStyle = colorHex;
      ctx.lineWidth = 6;
      ctx.shadowColor = colorHex;
      ctx.shadowBlur = 20;
      ctx.stroke();

      // Scaled directional arrow inside core
      const shaftLen = currentRadius * 0.55;
      const sx = x - Math.cos(rad) * currentRadius * 0.45;
      const sy = y - Math.sin(rad) * currentRadius * 0.45;
      const ex = x + Math.cos(rad) * shaftLen;
      const ey = y + Math.sin(rad) * shaftLen;

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(1.5, currentRadius * 0.14);
      ctx.stroke();

      const headLen = currentRadius * 0.42;
      const headAngle = Math.PI / 5.5;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - Math.cos(rad - headAngle) * headLen, ey - Math.sin(rad - headAngle) * headLen);
      ctx.lineTo(ex - Math.cos(rad + headAngle) * headLen, ey - Math.sin(rad + headAngle) * headLen);
      ctx.closePath();
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    } else {
      // Full active phase or fading
      // 1. Circle body
      ctx.beginPath();
      ctx.arc(x, y, targetRadius, 0, Math.PI * 2);
      ctx.strokeStyle = colorHex;
      ctx.lineWidth = 3.2;
      ctx.shadowColor = colorHex;
      ctx.shadowBlur = 20;
      ctx.stroke();

      ctx.fillStyle = color === "red" ? "rgba(255, 71, 87, 0.35)" : "rgba(0, 212, 255, 0.35)";
      ctx.fill();

      // 2. Thicker stroke on required hit side (arc along angle)
      ctx.beginPath();
      ctx.arc(x, y, targetRadius, rad - Math.PI / 3, rad + Math.PI / 3);
      ctx.strokeStyle = colorHex;
      ctx.lineWidth = 6.5;
      ctx.shadowColor = colorHex;
      ctx.shadowBlur = 22;
      ctx.stroke();

      // 3. Arrow pointing in required direction
      const shaftLen = targetRadius * 0.58;
      const sx = x - Math.cos(rad) * targetRadius * 0.48;
      const sy = y - Math.sin(rad) * targetRadius * 0.48;
      const ex = x + Math.cos(rad) * shaftLen;
      const ey = y + Math.sin(rad) * shaftLen;

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3.6;
      ctx.stroke();

      const headLen = targetRadius * 0.44;
      const headAngle = Math.PI / 5.5;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - Math.cos(rad - headAngle) * headLen, ey - Math.sin(rad - headAngle) * headLen);
      ctx.lineTo(ex - Math.cos(rad + headAngle) * headLen, ey - Math.sin(rad + headAngle) * headLen);
      ctx.closePath();
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 8;
      ctx.fill();

      // 4. Circular countdown timing ring during full active phase
      if (phase === "full") {
        const arcStart = -Math.PI / 2;
        const arcEnd = -Math.PI / 2 + Math.PI * 2 * remainingFraction;

        ctx.beginPath();
        ctx.arc(x, y, targetRadius + 6, arcStart, arcEnd);
        ctx.strokeStyle = colorHex;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        if (remainingFraction > 0.02) {
          const tipX = x + Math.cos(arcEnd) * (targetRadius + 6);
          const tipY = y + Math.sin(arcEnd) * (targetRadius + 6);
          ctx.beginPath();
          ctx.arc(tipX, tipY, 3, 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.shadowColor = colorHex;
          ctx.shadowBlur = 8;
          ctx.fill();
        }
      }
    }

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
      } else if (fx.type === "bomb-shockwave" || fx.type === "wrong-ripple") {
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.radius, 0, Math.PI * 2);
        ctx.strokeStyle = fx.color || "#ff4757";
        ctx.globalAlpha = Math.max(0, fx.opacity);
        ctx.lineWidth = 4;
        ctx.shadowColor = fx.color || "#ff4757";
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
   * Uses unrounded percentage to determine rank.
   *
   * @param {number|Object} input Raw unrounded percentage OR results object
   * @returns {{ grade: string, label: string, percentage: number }}
   */
  computeRank(input) {
    return GameView.computeRank(input);
  }

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
   * Draws mouse-following player orb with dynamic motion trail and multi-layer neon aura.
   */
  drawPlayerOrb(ctx, orb) {
    if (!orb) return;

    const colorHex = orb.color === "red" ? "#ff4757" : "#00d4ff";
    const pulseOffset = (orb.pulse || 0) * 8;
    const radius = orb.radius + pulseOffset;

    ctx.save();

    // 1. Draw smooth dynamic motion trail
    if (this.orbTrail && this.orbTrail.length > 1) {
      for (let i = 0; i < this.orbTrail.length - 1; i++) {
        const pt = this.orbTrail[i];
        const nextPt = this.orbTrail[i + 1];
        const progress = (i + 1) / this.orbTrail.length; // 0 to 1
        const trailRadius = radius * (0.28 + 0.5 * progress);
        const trailColor = pt.color === "red" ? "rgba(255, 71, 87, " : "rgba(0, 212, 255, ";

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, trailRadius, 0, Math.PI * 2);
        ctx.fillStyle = `${trailColor}${0.14 * progress})`;
        ctx.shadowColor = colorHex;
        ctx.shadowBlur = 8 * progress;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(nextPt.x, nextPt.y);
        ctx.strokeStyle = `${trailColor}${0.18 * progress})`;
        ctx.lineWidth = trailRadius * 1.5;
        ctx.lineCap = "round";
        ctx.stroke();
      }
    }

    // 2. Multi-layer ambient radial glow aura
    const gradient = ctx.createRadialGradient(orb.x, orb.y, 4, orb.x, orb.y, radius * 2.1);
    gradient.addColorStop(0, colorHex);
    gradient.addColorStop(0.35, orb.color === "red" ? "rgba(255, 71, 87, 0.45)" : "rgba(0, 212, 255, 0.45)");
    gradient.addColorStop(0.75, orb.color === "red" ? "rgba(255, 71, 87, 0.12)" : "rgba(0, 212, 255, 0.12)");
    gradient.addColorStop(1, "transparent");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, radius * 2.1, 0, Math.PI * 2);
    ctx.fill();

    // 3. Neon stroke ring with intense glow
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 3.5;
    ctx.shadowColor = colorHex;
    ctx.shadowBlur = 24;
    ctx.stroke();

    // 4. Luminous white core
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, Math.max(3, radius * 0.72), 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 14;
    ctx.fill();

    // 5. Center tint pip
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, Math.max(1.5, radius * 0.28), 0, Math.PI * 2);
    ctx.fillStyle = colorHex;
    ctx.fill();

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
    const diffTag = results.difficulty ? ` [${results.difficulty}]` : (results.song && results.song.difficulty ? ` [${results.song.difficulty}]` : "");
    if (this.resultsSongName) this.resultsSongName.textContent = `${results.songName}${diffTag}`;
    if (this.resultsStatus) {
      this.resultsStatus.textContent = results.completionStatus;
      this.resultsStatus.className = `results-status-banner ${results.statusClass || ""}`;
    }

    const rankInfo = this.computeRank(results);
    if (this.resultsRankBadge) {
      this.resultsRankBadge.textContent = rankInfo.label;
      this.resultsRankBadge.className = `results-rank-badge rank-${rankInfo.grade}`;
    }
    if (this.resultsMainRankBadge) {
      this.resultsMainRankBadge.textContent = rankInfo.label;
      this.resultsMainRankBadge.className = `results-rank-badge rank-${rankInfo.grade}`;
    }
    if (this.resultsRankPill) {
      this.resultsRankPill.textContent = rankInfo.label;
      this.resultsRankPill.className = `mini-card-val val-rank rank-${rankInfo.grade}`;
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
    this.cleanupBackgroundMedia();
    if (this.container) {
      this.container.classList.remove("is-active");
      this.container.setAttribute("aria-hidden", "true");
    }
  }

  /**
   * Returns whether the gameplay view is currently active.
   * @returns {boolean}
   */
  isOpen() {
    return this.container ? this.container.classList.contains("is-active") : false;
  }
}

// Expose to window / global
if (typeof window !== "undefined") {
  window.GameView = GameView;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = GameView;
}

/**
 * @file mapEditor.js
 * @description Interactive Rhythm Map Editor for Project Alpha Plus.
 * Allows timeline navigation, Spacebar play/pause, placing red notes with left-click
 * and blue notes with right-click while paused, scrubbing, and playtesting with Enter.
 */

class MapEditor {
  /**
   * @param {Object} dependencies
   * @param {MapStorage} dependencies.mapStorage
   * @param {SoundManager} dependencies.soundManager
   * @param {Function} dependencies.onTestMap
   * @param {Function} dependencies.onExit
   */
  constructor({ mapStorage, soundManager, onTestMap = null, onExit = null }) {
    this.mapStorage = mapStorage;
    this.soundManager = soundManager;
    this.onTestMap = onTestMap;
    this.onExit = onExit;

    this.activeMap = null;
    this.notes = [];
    this.currentTime = 0;
    this.duration = 180;
    this.isPlaying = false;
    this.audio = null;

    // DOM Elements
    this.view = document.getElementById("map-editor-view");
    this.canvas = document.getElementById("editor-canvas");
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;

    this.titleEl = document.getElementById("editor-map-title");
    this.statusEl = document.getElementById("editor-status-text");
    this.notesCountEl = document.getElementById("editor-notes-count");
    this.timeDisplayEl = document.getElementById("editor-time-display");

    this.playPauseBtn = document.getElementById("btn-editor-playpause");
    this.playPauseIcon = document.getElementById("editor-playpause-icon");
    this.testBtn = document.getElementById("btn-editor-test");
    this.backBtn = document.getElementById("btn-editor-back");
    this.clearBtn = document.getElementById("btn-editor-clear");

    this.timelineTrack = document.getElementById("editor-timeline-track");
    this.timelineScrubber = document.getElementById("editor-timeline-scrubber");
    this.timelineMarkers = document.getElementById("editor-timeline-markers");

    // Mouse cursor coordinates inside canvas
    this.mouse = { x: 0, y: 0, isHovering: false };
    this.arrowPlacementDrag = null;

    // Bound handlers for cleanup
    this.boundTick = this.tick.bind(this);
    this.boundKeyDown = this.onKeyDown.bind(this);
    this.boundMouseMove = this.onMouseMove.bind(this);
    this.boundMouseDown = this.onMouseDown.bind(this);
    this.boundMouseUp = this.onMouseUp.bind(this);
    this.boundContextMenu = this.onContextMenu.bind(this);
    this.boundResize = this.resizeCanvas.bind(this);
    this.animFrameId = null;

    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("resize", this.boundResize);
    }
  }

  /**
   * Loads a map into the editor and opens the workspace.
   * @param {Object} map
   */
  open(map) {
    this.activeMap = map;
    this.notes = (map.notes || []).map((n) => ({ ...n }));
    this.duration = map.durationSeconds || 180;
    this.currentTime = 0;
    this.isPlaying = false;

    if (this.titleEl) {
      this.titleEl.textContent = `${map.name} - by ${map.mapper}`;
    }

    // Initialize audio element for timeline playback
    this.initAudio(map.file);

    this.resizeCanvas();
    this.bindEvents();
    this.updateTimelineUI();
    this.renderTimelineMarkers();

    if (this.view) {
      this.view.classList.add("is-active");
      this.view.setAttribute("aria-hidden", "false");
    }

    this.animFrameId = requestAnimationFrame(this.boundTick);
  }

  /**
   * Initializes the HTML5 Audio element for audio scrubbing and playback.
   * @param {string} file
   */
  initAudio(file) {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
      this.audio = null;
    }

    if (file) {
      try {
        const audio = new Audio(file);
        audio.preload = "auto";
        audio.currentTime = 0;

        const soundVol = this.soundManager ? (this.soundManager.isEnabled() ? this.soundManager.getVolume() / 100 : 0) : 0.7;
        audio.volume = soundVol;

        audio.addEventListener("loadedmetadata", () => {
          if (audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
            this.duration = audio.duration;
            this.updateTimelineUI();
          }
        });

        audio.addEventListener("ended", () => {
          this.pause();
          this.seekTo(0);
        });

        this.audio = audio;
      } catch (err) {
        console.warn("Audio loading failed in editor:", err);
      }
    }
  }

  /**
   * Adjusts canvas resolution to match window.
   */
  resizeCanvas() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  /**
   * Attaches listeners for keyboard, mouse clicks, and timeline controls.
   */
  bindEvents() {
    window.addEventListener("keydown", this.boundKeyDown);
    window.addEventListener("mouseup", this.boundMouseUp);

    if (this.canvas) {
      this.canvas.addEventListener("mousemove", this.boundMouseMove);
      this.canvas.addEventListener("mousedown", this.boundMouseDown);
      this.canvas.addEventListener("contextmenu", this.boundContextMenu);
      this.canvas.addEventListener("mouseenter", () => {
        this.mouse.isHovering = true;
      });
      this.canvas.addEventListener("mouseleave", () => {
        this.mouse.isHovering = false;
      });
    }

    if (this.playPauseBtn) {
      this.playPauseBtn.addEventListener("click", () => {
        this.togglePlayPause();
      });
    }

    if (this.testBtn) {
      this.testBtn.addEventListener("click", () => {
        this.testMap();
      });
    }

    if (this.backBtn) {
      this.backBtn.addEventListener("click", () => {
        this.close();
      });
    }

    if (this.clearBtn) {
      this.clearBtn.addEventListener("click", () => {
        if (confirm("Are you sure you want to clear all mapped notes in this track?")) {
          this.notes = [];
          this.saveMapState();
          this.renderTimelineMarkers();
        }
      });
    }

    // Timeline Click / Scrubbing
    if (this.timelineTrack) {
      this.timelineTrack.addEventListener("click", (e) => {
        const rect = this.timelineTrack.getBoundingClientRect();
        const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const targetTime = clickRatio * this.duration;
        this.seekTo(targetTime);
      });
    }
  }

  /**
   * Cleans up event listeners when closing editor.
   */
  unbindEvents() {
    if (typeof window !== "undefined" && window.removeEventListener) {
      window.removeEventListener("keydown", this.boundKeyDown);
      window.removeEventListener("mouseup", this.boundMouseUp);
    }

    if (this.canvas && typeof this.canvas.removeEventListener === "function") {
      this.canvas.removeEventListener("mousemove", this.boundMouseMove);
      this.canvas.removeEventListener("mousedown", this.boundMouseDown);
      this.canvas.removeEventListener("contextmenu", this.boundContextMenu);
    }
  }

  /**
   * Handles keyboard shortcuts:
   * Space: Pause / Resume moving through the song timeline.
   * Enter: Test map as a real song.
   * @param {KeyboardEvent} e
   */
  onKeyDown(e) {
    if (!this.isOpen()) return;

    if (e.code === "Space") {
      e.preventDefault();
      this.togglePlayPause();
    } else if (e.key === "Enter") {
      e.preventDefault();
      this.testMap();
    } else if (e.key === "Escape") {
      this.close();
    } else if (e.key === "d" || e.key === "D") {
      const DIRS = ["left", "up", "right", "down"];
      const curIdx = DIRS.indexOf(this.currentDirection || "left");
      this.currentDirection = DIRS[(curIdx + 1) % DIRS.length];
      if (this.soundManager) this.soundManager.playClick();
    } else if (e.key === "ArrowLeft") {
      this.currentDirection = "left";
    } else if (e.key === "ArrowRight") {
      this.currentDirection = "right";
    } else if (e.key === "ArrowUp") {
      this.currentDirection = "up";
    } else if (e.key === "ArrowDown") {
      this.currentDirection = "down";
    }
  }

  /**
   * Updates mouse coordinates on canvas and updates active arrow placement orientation.
   * @param {MouseEvent} e
   */
  onMouseMove(e) {
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;

    if (this.arrowPlacementDrag) {
      const drag = this.arrowPlacementDrag;
      drag.currentX = e.clientX;
      drag.currentY = e.clientY;
      const dx = e.clientX - drag.originX;
      const dy = e.clientY - drag.originY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 6) {
        const angle = Math.atan2(dy, dx);
        drag.angle = angle;

        // Calculate cardinal orientation label and approach mapping
        const deg = (angle * 180) / Math.PI;
        if (deg >= -45 && deg < 45) {
          drag.directionLabel = "RIGHT →";
          drag.direction = "left"; // Approach from left (moves rightward)
        } else if (deg >= 45 && deg < 135) {
          drag.directionLabel = "DOWN ↓";
          drag.direction = "up"; // Approach from top (moves downward)
        } else if (deg >= -135 && deg < -45) {
          drag.directionLabel = "UP ↑";
          drag.direction = "down"; // Approach from bottom (moves upward)
        } else {
          drag.directionLabel = "LEFT ←";
          drag.direction = "right"; // Approach from right (moves leftward)
        }
      }
    }
  }

  /**
   * Handles note placement while paused:
   * Normal Left-click: places normal RED note.
   * Normal Right-click: places normal BLUE note.
   * Shift + Left/Right click: begins placing directional arrow note oriented toward mouse.
   * @param {MouseEvent} e
   */
  onMouseDown(e) {
    // Only place notes when paused!
    if (this.isPlaying) return;

    let noteColor = null;
    if (e.button === 0) {
      noteColor = "red";
    } else if (e.button === 2) {
      noteColor = "blue";
    }
    if (!noteColor) return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    const roundedTime = parseFloat(this.currentTime.toFixed(2));
    const normalizedX = parseFloat((e.clientX / width).toFixed(3));
    const normalizedY = parseFloat((e.clientY / height).toFixed(3));

    // Arrow note placement: Hold Shift + Left Click or Shift + Right Click
    if (e.shiftKey) {
      this.arrowPlacementDrag = {
        color: noteColor,
        time: roundedTime,
        originX: e.clientX,
        originY: e.clientY,
        normalizedX,
        normalizedY,
        currentX: e.clientX,
        currentY: e.clientY,
        angle: 0,
        direction: "left",
        directionLabel: "RIGHT →",
        button: e.button
      };
      if (this.soundManager) this.soundManager.playClick();
      return;
    }

    // Normal Click (without Shift): place or toggle Normal Note
    const existingIndex = this.notes.findIndex((n) => {
      const dx = n.x * width - e.clientX;
      const dy = n.y * height - e.clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return Math.abs(n.time - roundedTime) <= 0.25 && dist <= 32;
    });

    if (existingIndex !== -1) {
      // Toggle/remove note
      this.notes.splice(existingIndex, 1);
      if (this.soundManager) this.soundManager.playClick();
    } else {
      // Add normal note (no direction)
      this.notes.push({
        time: roundedTime,
        color: noteColor,
        x: normalizedX,
        y: normalizedY
      });

      this.notes.sort((a, b) => a.time - b.time);
      if (this.soundManager) {
        this.soundManager.playTestTone();
      }
    }

    this.saveMapState();
    this.renderTimelineMarkers();
  }

  /**
   * Finalizes directional arrow note placement when the mouse button is released.
   * @param {MouseEvent} e
   */
  onMouseUp(e) {
    if (this.arrowPlacementDrag) {
      const drag = this.arrowPlacementDrag;
      this.arrowPlacementDrag = null;

      // Remove any existing note at the exact position to avoid duplicates
      const existingIndex = this.notes.findIndex((n) => {
        const dx = n.x * this.canvas.width - drag.originX;
        const dy = n.y * this.canvas.height - drag.originY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return Math.abs(n.time - drag.time) <= 0.25 && dist <= 32;
      });

      if (existingIndex !== -1) {
        this.notes.splice(existingIndex, 1);
      }

      // Finalize and place the directional arrow note
      this.notes.push({
        time: drag.time,
        color: drag.color,
        x: drag.normalizedX,
        y: drag.normalizedY,
        direction: drag.direction,
        angle: parseFloat(drag.angle.toFixed(3))
      });

      this.notes.sort((a, b) => a.time - b.time);
      if (this.soundManager) {
        this.soundManager.playTestTone();
      }

      this.saveMapState();
      this.renderTimelineMarkers();
    }
  }

  /**
   * Intercepts context menu on right click in editor.
   * @param {MouseEvent} e
   */
  onContextMenu(e) {
    e.preventDefault();
    return false;
  }

  /**
   * Toggles audio and timeline playback.
   */
  togglePlayPause() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Starts moving through the timeline and resumes audio.
   */
  play() {
    this.isPlaying = true;
    if (this.audio) {
      const playPromise = this.audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => console.warn(err));
      }
    }
    this.updateStatusText();
  }

  /**
   * Pauses the timeline and audio.
   */
  pause() {
    this.isPlaying = false;
    if (this.audio) {
      this.audio.pause();
    }
    this.updateStatusText();
  }

  /**
   * Seeks to a specific timestamp in seconds.
   * @param {number} timeSec
   */
  seekTo(timeSec) {
    const clamped = Math.max(0, Math.min(this.duration, timeSec));
    this.currentTime = clamped;
    if (this.audio) {
      this.audio.currentTime = clamped;
    }
    this.updateTimelineUI();
  }

  /**
   * Updates status readout and Play/Pause icon.
   */
  updateStatusText() {
    if (this.statusEl) {
      if (this.isPlaying) {
        this.statusEl.textContent = "PLAYING (Press Space to Pause)";
        this.statusEl.style.color = "#2ed573";
      } else {
        this.statusEl.textContent = "PAUSED (Click: Left=Red, Right=Blue)";
        this.statusEl.style.color = "var(--color-accent)";
      }
    }

    if (this.playPauseIcon) {
      this.playPauseIcon.textContent = this.isPlaying ? "⏸" : "▶";
    }
  }

  /**
   * Main render/logic frame loop for editor canvas.
   */
  tick() {
    if (!this.isOpen()) return;

    if (this.isPlaying && this.audio) {
      this.currentTime = this.audio.currentTime;
      this.updateTimelineUI();
    }

    this.drawCanvas();

    this.animFrameId = requestAnimationFrame(this.boundTick);
  }

  /**
   * Updates timeline scrubber and time readouts.
   */
  updateTimelineUI() {
    if (this.timeDisplayEl) {
      const curStr = this.formatTime(this.currentTime);
      const durStr = this.formatTime(this.duration);
      this.timeDisplayEl.textContent = `${curStr} / ${durStr}`;
    }

    if (this.timelineScrubber) {
      const pct = this.duration > 0 ? (this.currentTime / this.duration) * 100 : 0;
      this.timelineScrubber.style.left = `${pct}%`;
    }

    if (this.notesCountEl) {
      this.notesCountEl.textContent = `Notes: ${this.notes.length}`;
    }
  }

  /**
   * Renders color-coded tick markers on the timeline for every placed note.
   */
  renderTimelineMarkers() {
    if (!this.timelineMarkers) return;

    this.timelineMarkers.innerHTML = "";

    this.notes.forEach((note) => {
      const marker = document.createElement("span");
      const pct = this.duration > 0 ? (note.time / this.duration) * 100 : 0;
      marker.className = `timeline-note-marker ${note.color}`;
      marker.style.left = `${pct}%`;
      marker.title = `${note.color.toUpperCase()} at ${note.time}s`;
      this.timelineMarkers.appendChild(marker);
    });
  }

  /**
   * Saves updated notes array to MapStorage.
   */
  saveMapState() {
    if (this.activeMap && this.mapStorage) {
      this.activeMap.notes = [...this.notes];
      this.mapStorage.saveMap(this.activeMap);
    }
  }

  /**
   * Launches the current map into real gameplay playtesting.
   */
  testMap() {
    this.pause();
    this.saveMapState();

    if (typeof this.onTestMap === "function") {
      this.onTestMap({
        ...this.activeMap,
        notes: [...this.notes]
      });
    }
  }

  /**
   * Draws the rhythm arena, placed notes, and placement reticle on canvas.
   */
  drawCanvas() {
    if (!this.ctx || !this.canvas) return;

    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const time = this.currentTime;

    ctx.clearRect(0, 0, width, height);

    // 1. Draw rhythm arena guide
    const cx = width / 2;
    const cy = height / 2;

    ctx.save();
    ctx.strokeStyle = "rgba(0, 212, 255, 0.08)";
    ctx.lineWidth = 1.5;

    // Center circular playfield arena
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(width, height) * 0.42, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(cx - 300, cy);
    ctx.lineTo(cx + 300, cy);
    ctx.moveTo(cx, cy - 200);
    ctx.lineTo(cx, cy + 200);
    ctx.stroke();
    ctx.restore();

    // 2. Draw placed notes around the current timestamp (window of +/- 1.4s)
    const windowSpan = 1.4;
    this.notes.forEach((note) => {
      const timeDiff = note.time - time;

      // Only draw notes close in time to current playback
      if (Math.abs(timeDiff) <= windowSpan) {
        const noteX = note.x * width;
        const noteY = note.y * height;
        const colorHex = note.color === "red" ? "#ff4757" : "#00d4ff";

        // Proximity factor (1 = exact current time, 0 = at boundary)
        const proximity = Math.max(0, 1 - Math.abs(timeDiff) / windowSpan);
        const radius = 26;

        ctx.save();
        ctx.beginPath();
        ctx.arc(noteX, noteY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = colorHex;
        ctx.lineWidth = Math.abs(timeDiff) < 0.1 ? 4 : 2;
        ctx.fillStyle = note.color === "red" ? "rgba(255, 71, 87, 0.3)" : "rgba(0, 212, 255, 0.3)";
        ctx.globalAlpha = 0.3 + proximity * 0.7;

        if (Math.abs(timeDiff) < 0.1) {
          ctx.shadowColor = colorHex;
          ctx.shadowBlur = 20;
        }

        ctx.fill();
        ctx.stroke();

        const hasDirection = Boolean(note.direction || typeof note.angle === "number");

        if (hasDirection) {
          // Directional arrow inside note
          ctx.save();
          ctx.translate(noteX, noteY);
          if (typeof note.angle === "number") {
            ctx.rotate(note.angle);
          } else {
            const dirMap = {
              left: 0,           // Approach from left (moves rightward ->)
              right: Math.PI,    // Approach from right (moves leftward <-)
              up: Math.PI / 2,   // Approach from top (moves downward \/)
              down: -Math.PI / 2 // Approach from bottom (moves upward /\)
            };
            ctx.rotate(dirMap[(note.direction || "left").toLowerCase()] ?? 0);
          }

          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2.5;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(-7, 0);
          ctx.lineTo(8, 0);
          ctx.lineTo(4, -4);
          ctx.moveTo(8, 0);
          ctx.lineTo(4, 4);
          ctx.stroke();

          // Rear entry chevron on perimeter
          ctx.fillStyle = colorHex;
          ctx.beginPath();
          ctx.moveTo(-radius - 2, 0);
          ctx.lineTo(-radius - 8, -5);
          ctx.lineTo(-radius - 6, 0);
          ctx.lineTo(-radius - 8, 5);
          ctx.closePath();
          ctx.fill();

          ctx.restore();

          // Note timestamp tag
          ctx.font = "bold 9px monospace";
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(`${note.time}s`, noteX, noteY + 9);
        } else {
          // Normal note: no arrow! Draw color label and timestamp
          ctx.font = "bold 10px monospace";
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(note.color.toUpperCase(), noteX, noteY - 3);

          ctx.font = "bold 9px monospace";
          ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
          ctx.fillText(`${note.time}s`, noteX, noteY + 9);
        }

        ctx.restore();
      }
    });

    // 2.5 Live preview of Directional Arrow Note being placed / oriented with Shift + Drag
    if (this.arrowPlacementDrag) {
      const drag = this.arrowPlacementDrag;
      const colorHex = drag.color === "red" ? "#ff4757" : "#00d4ff";
      const radius = 26;

      ctx.save();

      // Drag line from note origin to mouse
      ctx.beginPath();
      ctx.moveTo(drag.originX, drag.originY);
      ctx.lineTo(drag.currentX, drag.currentY);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Note circle at origin
      ctx.beginPath();
      ctx.arc(drag.originX, drag.originY, radius, 0, Math.PI * 2);
      ctx.strokeStyle = colorHex;
      ctx.lineWidth = 3;
      ctx.fillStyle = drag.color === "red" ? "rgba(255, 71, 87, 0.45)" : "rgba(0, 212, 255, 0.45)";
      ctx.shadowColor = colorHex;
      ctx.shadowBlur = 20;
      ctx.fill();
      ctx.stroke();

      // Rotating arrow oriented toward mouse
      ctx.save();
      ctx.translate(drag.originX, drag.originY);
      ctx.rotate(drag.angle);

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(10, 0);
      ctx.lineTo(5, -5);
      ctx.moveTo(10, 0);
      ctx.lineTo(5, 5);
      ctx.stroke();

      // Rear entry chevron on perimeter
      ctx.fillStyle = colorHex;
      ctx.beginPath();
      ctx.moveTo(-radius - 2, 0);
      ctx.lineTo(-radius - 10, -6);
      ctx.lineTo(-radius - 7, 0);
      ctx.lineTo(-radius - 10, 6);
      ctx.closePath();
      ctx.fill();

      ctx.restore();

      // Direction label badge above note
      ctx.font = "bold 11px monospace";
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const dirBadge = drag.directionLabel || drag.direction.toUpperCase();
      ctx.fillText(`ARROW [${dirBadge}]`, drag.originX, drag.originY - 36);

      ctx.restore();
    }

    // 3. Draw cursor placement reticle (only when paused and not dragging)
    if (!this.isPlaying && this.mouse.isHovering && !this.arrowPlacementDrag) {
      const mx = this.mouse.x;
      const my = this.mouse.y;

      ctx.save();
      // Glowing placement circle
      ctx.beginPath();
      ctx.arc(mx, my, 26, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();

      // Crosshair center dot
      ctx.beginPath();
      ctx.arc(mx, my, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      // Text hints beside cursor
      ctx.font = "bold 11px sans-serif";
      ctx.fillStyle = "#ff4757";
      ctx.fillText("[Click] RED / [Shift+Drag] Arrow", mx + 32, my - 6);
      ctx.fillStyle = "#00d4ff";
      ctx.fillText("[Right Click] BLUE / [Shift+Drag] Arrow", mx + 32, my + 10);

      ctx.restore();
    }
  }

  /**
   * Formats seconds into MM:SS.S.
   * @param {number} sec
   * @returns {string}
   */
  formatTime(sec) {
    if (!sec || isNaN(sec) || sec < 0) return "00:00.0";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const tenths = Math.floor((sec % 1) * 10);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${tenths}`;
  }

  /**
   * Closes the editor, pauses audio, and returns to map list.
   */
  close() {
    this.pause();
    this.saveMapState();
    this.unbindEvents();

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
      this.audio = null;
    }

    if (this.view) {
      this.view.classList.remove("is-active");
      this.view.setAttribute("aria-hidden", "true");
    }

    if (typeof this.onExit === "function") {
      this.onExit();
    }
  }

  /**
   * Returns whether the editor view is active.
   * @returns {boolean}
   */
  isOpen() {
    return this.view ? this.view.classList.contains("is-active") : false;
  }
}

// Expose to window
window.MapEditor = MapEditor;

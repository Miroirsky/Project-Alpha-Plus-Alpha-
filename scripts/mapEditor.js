/**
 * @file mapEditor.js
 * @description Interactive Rhythm Map Editor for Project Alpha Plus.
 * Allows timeline navigation, Spacebar play/pause, tool-based placement of normal notes
 * (red left-click, blue right-click) and triangle bomb hazards with dedicated selection tool,
 * scrubbing, and playtesting with Enter.
 */

class MapEditor {
  /**
   * @param {Object} dependencies
   * @param {MapStorage} dependencies.mapStorage
   * @param {SoundManager} dependencies.soundManager
   * @param {Function} dependencies.onTestMap
   * @param {Function} dependencies.onExit
   */
  constructor({ mapStorage, soundManager, musicPlayer = null, onTestMap = null, onExit = null }) {
    this.mapStorage = mapStorage;
    this.soundManager = soundManager;
    this.musicPlayer = musicPlayer;
    this.onTestMap = onTestMap;
    this.onExit = onExit;

    this.activeMap = null;
    this.notes = [];
    this.currentTime = 0;
    this.duration = 180;
    this.isPlaying = false;
    this.audio = null;
    this.eventsBound = false;
    this.isSeeking = false;
    this.isDirty = false;
    this._isClosing = false;

    // Placement Tool State (Selection-based placement system)
    this.activeTool = "note"; // "note" | "directional" | "bomb"
    this.toolSelectorEl = document.getElementById("editor-tool-selector");
    this.toolBtnNote = document.getElementById("tool-btn-note");
    this.toolBtnDirectional = document.getElementById("tool-btn-directional");
    this.toolBtnBomb = document.getElementById("tool-btn-bomb");

    // Directional Note Drag-Placement State
    this.isPlacingDirectional = false;
    this.directionalDragStart = null;
    this.directionalCurrentAngle = 0;

    // DOM Elements
    this.view = document.getElementById("map-editor-view");
    this.canvas = document.getElementById("editor-canvas");
    this.canvasContainer = document.querySelector(".editor-canvas-container");
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;

    this.titleEl = document.getElementById("editor-map-title");
    this.statusEl = document.getElementById("editor-status-text");
    this.notesCountEl = document.getElementById("editor-notes-count");
    this.npsDisplayEl = document.getElementById("editor-nps-display");
    this.saveIndicatorEl = document.getElementById("editor-save-indicator");
    this.metaAudioEl = document.getElementById("editor-meta-audio");
    this.timeDisplayEl = document.getElementById("editor-time-display");

    this.playPauseBtn = document.getElementById("btn-editor-playpause");
    this.playPauseIcon = document.getElementById("editor-playpause-icon");
    this.testBtn = document.getElementById("btn-editor-test");
    this.backBtn = document.getElementById("btn-editor-back");
    this.clearBtn = document.getElementById("btn-editor-clear");

    this.stepBackBtn = document.getElementById("btn-editor-step-back") || document.getElementById("btn-editor-step-prev");
    this.stepFwdBtn = document.getElementById("btn-editor-step-fwd") || document.getElementById("btn-editor-step-next");
    this.speedSlider = document.getElementById("editor-speed-slider");
    this.speedDisplay = document.getElementById("editor-speed-display");
    this.playSpeed = 1.0;

    // Video-Editing Timeline Workstation DOM Elements & State
    this.timelineWrapper = document.getElementById("video-timeline-wrapper");
    this.timelineScroll = document.getElementById("video-timeline-scroll");
    this.timelineContent = document.getElementById("video-timeline-content");
    this.timelineRulerCanvas = document.getElementById("video-timeline-ruler");
    this.rulerCtx = this.timelineRulerCanvas ? this.timelineRulerCanvas.getContext("2d") : null;
    this.timelineCanvas = document.getElementById("video-timeline-canvas");
    this.timelineCtx = this.timelineCanvas ? this.timelineCanvas.getContext("2d") : null;
    this.timelinePlayhead = document.getElementById("video-timeline-playhead");
    this.playheadBadgeText = document.getElementById("playhead-badge-text");

    // Timeline Zoom Controls
    this.zoomSlider = document.getElementById("timeline-zoom-slider");
    this.zoomDisplay = document.getElementById("timeline-zoom-display");
    this.zoomInBtn = document.getElementById("btn-timeline-zoom-in");
    this.zoomOutBtn = document.getElementById("btn-timeline-zoom-out");
    this.zoomFitBtn = document.getElementById("btn-timeline-zoom-fit");
    this.pixelsPerSecond = 50; // Zoom level: 10px/s (zoomed out) to 400px/s (frame-level precision)

    // Note Selection & Inspector
    this.selectedNote = null;
    this.noteInspector = document.getElementById("timeline-note-inspector");
    this.inspectorNoteType = document.getElementById("inspector-note-type");
    this.inspectorNoteTime = document.getElementById("inspector-note-time");
    this.inspectorNudgeLeft = document.getElementById("btn-inspector-nudge-left");
    this.inspectorNudgeRight = document.getElementById("btn-inspector-nudge-right");
    this.inspectorSnapPlayhead = document.getElementById("btn-inspector-snap-playhead");
    this.inspectorDelete = document.getElementById("btn-inspector-delete");
    this.inspectorClose = document.getElementById("btn-inspector-close");

    this.isDraggingPlayhead = false;
    this.wasPlayingBeforeScrub = false;

    // Timeline Audio Waveform Visualizer
    this.waveformPeaks = null;
    this.isWaveformLoading = false;
    this.currentWaveformFile = null;

    // Export Modal DOM Elements
    this.exportBtn = document.getElementById("btn-editor-export");
    this.exportModal = document.getElementById("export-modal");
    this.closeExportBtn = document.getElementById("btn-close-export");
    this.copyExportBtn = document.getElementById("btn-copy-export-code");
    this.downloadExportBtn = document.getElementById("btn-download-export-json");
    this.exportCodeArea = document.getElementById("export-code-area");
    this.exportTrackName = document.getElementById("export-track-name");
    this.exportTrackNotes = document.getElementById("export-track-notes");
    this.exportTrackDuration = document.getElementById("export-track-duration");
    this.exportTrackNps = document.getElementById("export-track-nps");
    this.exportFeedback = document.getElementById("export-copy-feedback");
    this.lastExportData = null;

    // Track Parameters Modal DOM Elements
    this.paramsBtn = document.getElementById("btn-editor-params");
    this.paramsModal = document.getElementById("params-modal");
    this.closeParamsBtn = document.getElementById("btn-close-params");
    this.cancelParamsBtn = document.getElementById("btn-cancel-params");
    this.paramsForm = document.getElementById("track-params-form");
    this.paramsName = document.getElementById("params-track-name");
    this.paramsMapper = document.getElementById("params-track-mapper");
    this.paramsCreator = document.getElementById("params-track-creator");
    this.paramsDifficulty = document.getElementById("params-track-difficulty");
    this.paramsColor = document.getElementById("params-track-color");
    this.paramsAudio = document.getElementById("params-track-audio");
    this.paramsTypeBadge = document.getElementById("params-track-type-badge");
    this.paramsNoteInfo = document.getElementById("params-note-info");
    this.paramsArtworkGallery = document.getElementById("params-artwork-gallery");
    this.paramsArtworkFile = document.getElementById("params-track-artwork-file");
    this.paramsArtworkStatus = document.getElementById("params-artwork-status");
    this.paramsArtworkPreview = document.getElementById("params-artwork-preview");
    this.paramsArtworkTitle = document.getElementById("params-artwork-title");
    this.selectedParamArtwork = "Assets/Tracks Placeholders/Default-0.png";

    // Track Playfield Background DOM Elements
    this.editorBgBtn = document.getElementById("btn-editor-bg");
    this.paramsBgSection = document.getElementById("params-bg-section");
    this.paramsBgFile = document.getElementById("params-bg-file");
    this.paramsBgRemoveBtn = document.getElementById("btn-params-bg-remove");
    this.paramsBgStatus = document.getElementById("params-bg-status");
    this.paramsBgFit = document.getElementById("params-bg-fit");
    this.paramsBgOpacity = document.getElementById("params-bg-opacity");
    this.paramsBgOpacityVal = document.getElementById("params-bg-opacity-val");
    this.paramsBgPreviewBox = document.getElementById("params-bg-preview-box");
    this.paramsBgPreviewImg = document.getElementById("params-bg-preview-img");
    this.paramsBgPreviewVideo = document.getElementById("params-bg-preview-video");
    this.paramsBgPreviewEmpty = document.getElementById("params-bg-preview-empty");
    this.paramsBgPreviewTitle = document.getElementById("params-bg-preview-title");
    this.paramsBgPreviewBadge = document.getElementById("params-bg-preview-badge");

    // Background Media Runtime State
    this.bgMedia = null;
    this.bgMediaType = null;
    this.activeBgConfig = null;

    // Mouse cursor coordinates inside canvas
    this.mouse = { x: 0, y: 0, isHovering: false };

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
   * Flags the map state as modified with unsaved changes.
   */
  markDirty() {
    this.isDirty = true;
    if (this.saveIndicatorEl) {
      this.saveIndicatorEl.textContent = "• Unsaved changes";
      this.saveIndicatorEl.className = "editor-save-tag dirty";
    }
  }

  /**
   * Loads a map into the editor and opens the workspace.
   * @param {Object} map
   */
  open(map) {
    if (!map) return;

    // If switching between songs while editor has unsaved edits, flush the previous map first
    if (this.isOpen() && this.isDirty && this.activeMap && map.id && this.activeMap.id !== map.id) {
      this.saveMapState();
    }

    // Always fetch fresh map data from mapStorage to avoid stale object references
    const freshMap = (this.mapStorage && map.id && this.mapStorage.getMap(map.id)) || map;
    this.activeMap = freshMap;
    this.isDirty = false;
    this.setTool("note");

    if (this.saveIndicatorEl) {
      this.saveIndicatorEl.textContent = "✓ All changes saved";
      this.saveIndicatorEl.className = "editor-save-tag saved";
    }

    this.notes = (freshMap.notes || []).map((n) => {
      const isTriangle = n.type === "triangle" || n.type === "bomb";
      const isDirectional = n.type === "directional" || n.type === "arrow";
      const item = {
        time: parseFloat(Number(n.time || 0).toFixed(3)),
        color: isTriangle ? "yellow" : (n.color === "red" ? "red" : "blue"),
        type: isTriangle ? "triangle" : (isDirectional ? "directional" : "normal"),
        x: parseFloat(Number(n.x !== undefined ? n.x : 0.5).toFixed(3)),
        y: parseFloat(Number(n.y !== undefined ? n.y : 0.5).toFixed(3))
      };
      if (isDirectional) {
        item.angle = typeof n.angle === "number" ? ((Math.round(n.angle) % 360) + 360) % 360 : 0;
      }
      return item;
    });
    this.duration = freshMap.durationSeconds || 180;
    this.currentTime = 0;
    this.isPlaying = false;

    // Stop any existing music playback in musicPlayer (e.g. from preview or playtesting)
    if (this.musicPlayer && typeof this.musicPlayer.stop === "function") {
      this.musicPlayer.stop();
    }

    if (this.titleEl) {
      this.titleEl.textContent = `${freshMap.name} - by ${freshMap.mapper}`;
    }

    if (this.metaAudioEl && map.file) {
      const audioBasename = map.file.split("/").pop() || "Audio File";
      this.metaAudioEl.textContent = audioBasename;
    }

    // Initialize audio element for timeline playback (stays strictly paused)
    this.initAudio(map.file);

    // Initialize playfield custom background media (image or video)
    this.loadBackgroundMedia(freshMap.background);

    this.resizeCanvas();
    this.selectNote(null);
    this.bindEvents();
    this.updateSpeedUI();
    this.updateStatusText();
    this.resizeTimelineContent();
    this.renderTimeline();
    this.updateTimelineUI();

    if (this.view) {
      this.view.classList.add("is-active");
      this.view.setAttribute("aria-hidden", "false");
    }

    // Recalculate layout once view becomes active to get exact flex container dimensions
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        this.resizeCanvas();
      });
    }

    this.animFrameId = requestAnimationFrame(this.boundTick);
  }

  /**
   * Initializes the HTML5 Audio element for audio scrubbing and playback.
   * Kept strictly paused on creation.
   * Also loads audio waveform peaks for the timeline visualizer.
   * @param {string} file
   */
  initAudio(file) {
    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.src = "";
      } catch (e) {
        // Ignore pause cleanup error
      }
      this.audio = null;
    }

    // Trigger waveform loading/decoding (cached, bundled, or dynamic Web Audio API)
    this.loadAudioWaveform(file);

    if (file) {
      try {
        const audio = new Audio(file);
        audio.preload = "auto";
        audio.currentTime = 0;

        const soundVol = this.soundManager ? (this.soundManager.isEnabled() ? this.soundManager.getVolume() / 100 : 0) : 0.7;
        audio.volume = soundVol;
        audio.playbackRate = this.playSpeed || 1.0;

        audio.addEventListener("loadedmetadata", () => {
          if (audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
            this.duration = audio.duration;
            this.resizeTimelineContent();
            this.renderTimeline();
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
   * Loads and extracts audio waveform peaks for the timeline workstation.
   * Checks in-memory cache first, then pre-extracted bundled waveforms (instantaneous & offline safe),
   * and dynamically decodes custom/imported audio via Web Audio API when needed.
   * @param {string} file
   */
  async loadAudioWaveform(file) {
    if (!file) {
      this.waveformPeaks = null;
      this.isWaveformLoading = false;
      this.currentWaveformFile = null;
      return;
    }

    this.currentWaveformFile = file;

    // 1. Check in-memory runtime cache
    if (MapEditor.waveformCache && MapEditor.waveformCache.has(file)) {
      this.waveformPeaks = MapEditor.waveformCache.get(file);
      this.isWaveformLoading = false;
      this.renderTimeline();
      return;
    }

    // 2. Check bundled waveforms (instantaneous 0ms load & works offline / file:///)
    if (typeof window !== "undefined" && window.BUNDLED_WAVEFORMS && window.BUNDLED_WAVEFORMS[file]) {
      const bundled = window.BUNDLED_WAVEFORMS[file];
      const peaksData = {
        peaks: new Float32Array(bundled.peaks),
        samplesPerSec: bundled.samplesPerSec || 50,
        duration: bundled.duration
      };
      if (!MapEditor.waveformCache) {
        MapEditor.waveformCache = new Map();
      }
      MapEditor.waveformCache.set(file, peaksData);
      this.waveformPeaks = peaksData;
      this.isWaveformLoading = false;
      this.renderTimeline();
      return;
    }

    // 3. Dynamic Web Audio API extraction for custom/imported songs (blob: or http:)
    this.isWaveformLoading = true;
    try {
      const AudioContextClass = (typeof window !== "undefined") && (window.AudioContext || window.webkitAudioContext);
      if (!AudioContextClass) {
        this.isWaveformLoading = false;
        return;
      }

      if (!MapEditor.audioCtx) {
        MapEditor.audioCtx = new AudioContextClass();
      }
      const audioCtx = MapEditor.audioCtx;

      const response = await fetch(file);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching audio`);
      }
      const arrayBuffer = await response.arrayBuffer();

      const audioBuffer = await new Promise((resolve, reject) => {
        const res = audioCtx.decodeAudioData(arrayBuffer, resolve, reject);
        if (res && typeof res.then === "function") {
          res.then(resolve).catch(reject);
        }
      });

      const peaksData = this.extractWaveformPeaks(audioBuffer);
      if (peaksData) {
        if (!MapEditor.waveformCache) {
          MapEditor.waveformCache = new Map();
        }
        MapEditor.waveformCache.set(file, peaksData);

        // Only apply if the editor is still showing this audio file
        if (this.currentWaveformFile === file) {
          this.waveformPeaks = peaksData;
          this.renderTimeline();
        }
      }
    } catch (err) {
      console.warn("Waveform extraction not available for track:", err);
      if (this.currentWaveformFile === file) {
        this.waveformPeaks = null;
      }
    } finally {
      if (this.currentWaveformFile === file) {
        this.isWaveformLoading = false;
      }
    }
  }

  /**
   * Downsamples decoded audio buffer channels into a normalized amplitude envelope array.
   * @param {AudioBuffer} audioBuffer
   * @returns {{peaks: Float32Array, samplesPerSec: number, duration: number}|null}
   */
  extractWaveformPeaks(audioBuffer) {
    if (!audioBuffer) return null;
    const samplesPerSec = 50;
    const dur = audioBuffer.duration;
    const numBins = Math.floor(dur * samplesPerSec);
    if (numBins <= 0) return null;

    const peaks = new Float32Array(numBins);
    const rawSR = audioBuffer.sampleRate;
    const ch0 = audioBuffer.getChannelData(0);
    const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;
    const binSize = rawSR / samplesPerSec;

    let maxPeak = 0;
    for (let b = 0; b < numBins; b++) {
      const start = Math.floor(b * binSize);
      const end = Math.min(audioBuffer.length, Math.floor((b + 1) * binSize));
      let m = 0;
      for (let s = start; s < end; s += 2) {
        const v0 = Math.abs(ch0[s]);
        if (v0 > m) m = v0;
        if (ch1) {
          const v1 = Math.abs(ch1[s]);
          if (v1 > m) m = v1;
        }
      }
      peaks[b] = m;
      if (m > maxPeak) maxPeak = m;
    }

    const norm = maxPeak > 0.01 ? (1.0 / maxPeak) : 1.0;
    for (let b = 0; b < numBins; b++) {
      peaks[b] = Math.min(1.0, peaks[b] * norm);
    }

    return {
      peaks,
      samplesPerSec,
      duration: dur
    };
  }

  /**
   * Loads and initializes playfield background media (image or video).
   * @param {Object|null} bg
   */
  async loadBackgroundMedia(bg) {
    if (this.bgMedia && this.bgMediaType === "video") {
      try {
        this.bgMedia.pause();
        this.bgMedia.src = "";
      } catch (e) {}
    }
    this.bgMedia = null;
    this.bgMediaType = null;
    this.activeBgConfig = null;

    if (!bg) {
      this.updateBgParamsUI();
      return;
    }

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

    this.activeBgConfig = {
      type: bg.type === "video" ? "video" : "image",
      fit: bg.fit === "contain" ? "contain" : "cover",
      opacity: typeof bg.opacity === "number" ? Math.max(0.05, Math.min(1.0, bg.opacity)) : 0.7,
      name: bg.name || (bg.type === "video" ? "background.mp4" : "background.png"),
      url: mediaUrl || bg.url || "",
      mediaId: bg.mediaId || null
    };

    if (mediaUrl) {
      if (bg.type === "video") {
        try {
          const video = document.createElement("video");
          video.muted = true;
          video.loop = true;
          video.playsInline = true;
          video.preload = "auto";
          video.src = mediaUrl;
          video.playbackRate = this.playSpeed || 1.0;
          this.bgMedia = video;
          this.bgMediaType = "video";
        } catch (err) {
          console.warn("Failed to load editor background video:", err);
        }
      } else {
        try {
          const img = new Image();
          img.src = mediaUrl;
          this.bgMedia = img;
          this.bgMediaType = "image";
        } catch (err) {
          console.warn("Failed to load editor background image:", err);
        }
      }
    }

    this.updateBgParamsUI();
  }

  /**
   * Updates Track Parameters modal background preview and controls to reflect activeBgConfig.
   */
  updateBgParamsUI() {
    const bg = this.activeBgConfig;
    const hasMedia = Boolean(bg && (bg.url || bg.mediaId));

    if (this.paramsBgFit && bg) {
      this.paramsBgFit.value = bg.fit || "cover";
    }
    if (this.paramsBgOpacity && bg) {
      this.paramsBgOpacity.value = bg.opacity !== undefined ? bg.opacity : 0.7;
    }
    if (this.paramsBgOpacityVal) {
      const op = bg && bg.opacity !== undefined ? bg.opacity : 0.7;
      this.paramsBgOpacityVal.textContent = `${Math.round(op * 100)}%`;
    }

    if (this.paramsBgRemoveBtn) {
      this.paramsBgRemoveBtn.style.display = hasMedia ? "inline-block" : "none";
    }

    if (this.paramsBgStatus) {
      if (!hasMedia) {
        this.paramsBgStatus.textContent = "Default Arena Grid (No custom background)";
      } else if (bg.type === "video") {
        this.paramsBgStatus.textContent = `Video: ${bg.name || "Custom Video"}`;
      } else {
        this.paramsBgStatus.textContent = `Image: ${bg.name || "Custom Image"}`;
      }
    }

    if (this.paramsBgPreviewTitle) {
      this.paramsBgPreviewTitle.textContent = hasMedia ? (bg.name || "Custom Media") : "Default Arena Grid";
    }

    if (this.paramsBgPreviewBadge) {
      this.paramsBgPreviewBadge.textContent = hasMedia
        ? (bg.type === "video" ? "Video Background" : "Image Background")
        : "No Custom Media";
    }

    if (this.paramsBgPreviewImg && this.paramsBgPreviewVideo && this.paramsBgPreviewEmpty) {
      if (!hasMedia) {
        this.paramsBgPreviewImg.style.display = "none";
        this.paramsBgPreviewVideo.style.display = "none";
        this.paramsBgPreviewEmpty.style.display = "block";
      } else if (bg.type === "video" && bg.url) {
        this.paramsBgPreviewImg.style.display = "none";
        this.paramsBgPreviewEmpty.style.display = "none";
        this.paramsBgPreviewVideo.style.display = "block";
        this.paramsBgPreviewVideo.src = bg.url;
      } else if (bg.url) {
        this.paramsBgPreviewVideo.style.display = "none";
        this.paramsBgPreviewEmpty.style.display = "none";
        this.paramsBgPreviewImg.style.display = "block";
        this.paramsBgPreviewImg.src = bg.url;
      }
    }
  }

  /**
   * Adjusts canvas resolution to match container and window.
   * Keeps play area fully visible and centered without overlap from timeline dock.
   */
  resizeCanvas() {
    if (!this.canvas) return;
    const container = this.canvasContainer || (this.canvas ? this.canvas.parentElement : null);
    if (container) {
      const rect = container.getBoundingClientRect();
      const w = Math.floor(rect.width) || window.innerWidth;
      const h = Math.floor(rect.height) || Math.max(260, window.innerHeight - 340);
      this.canvas.width = Math.max(100, w);
      this.canvas.height = Math.max(100, h);
    } else {
      this.canvas.width = window.innerWidth;
      this.canvas.height = Math.max(260, window.innerHeight - 340);
    }

    this.resizeTimelineContent();
    this.renderTimeline();
  }

  /**
   * Attaches listeners for keyboard, mouse clicks, and timeline controls.
   */
  bindEvents() {
    // Only bind canvas, window, and DOM events once to avoid duplicate firing
    if (this.eventsBound) return;
    this.eventsBound = true;

    window.addEventListener("keydown", this.boundKeyDown);
    window.addEventListener("mouseup", this.boundMouseUp);
    window.addEventListener("mousemove", this.boundMouseMove);

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
          this.markDirty();
          this.saveMapState();
          this.renderTimelineMarkers();
        }
      });
    }

    // Placement Tool Selector Buttons (Normal Note vs Directional Note vs Bomb Hazard)
    if (this.toolBtnNote) {
      this.toolBtnNote.addEventListener("click", () => {
        this.setTool("note");
        if (this.soundManager) this.soundManager.playClick();
      });
    }

    if (this.toolBtnDirectional) {
      this.toolBtnDirectional.addEventListener("click", () => {
        this.setTool("directional");
        if (this.soundManager) this.soundManager.playClick();
      });
    }

    if (this.toolBtnBomb) {
      this.toolBtnBomb.addEventListener("click", () => {
        this.setTool("bomb");
        if (this.soundManager) this.soundManager.playClick();
      });
    }

    // Step Buttons (-0.1s and +0.1s)
    if (this.stepBackBtn) {
      this.stepBackBtn.addEventListener("click", () => {
        this.stepTime(-0.1);
      });
    }

    if (this.stepFwdBtn) {
      this.stepFwdBtn.addEventListener("click", () => {
        this.stepTime(0.1);
      });
    }

    // Play Speed Slider (0.25x - 2.0x)
    if (this.speedSlider) {
      this.speedSlider.addEventListener("input", (e) => {
        this.setPlaySpeed(parseFloat(e.target.value) || 1.0);
      });
    }

    // Preset Speed Buttons
    const speedPresets = this.view ? this.view.querySelectorAll(".btn-speed-preset") : [];
    speedPresets.forEach((btn) => {
      btn.addEventListener("click", () => {
        const speedVal = parseFloat(btn.getAttribute("data-speed"));
        if (!isNaN(speedVal)) {
          this.setPlaySpeed(speedVal);
          if (this.soundManager) this.soundManager.playClick();
        }
      });
    });

    // Zoom Controls
    if (this.zoomSlider) {
      this.zoomSlider.addEventListener("input", (e) => {
        this.setZoom(parseFloat(e.target.value) || 50);
      });
    }

    if (this.zoomInBtn) {
      this.zoomInBtn.addEventListener("click", () => {
        this.setZoom(this.pixelsPerSecond * 1.35);
      });
    }

    if (this.zoomOutBtn) {
      this.zoomOutBtn.addEventListener("click", () => {
        this.setZoom(this.pixelsPerSecond / 1.35);
      });
    }

    if (this.zoomFitBtn) {
      this.zoomFitBtn.addEventListener("click", () => {
        this.zoomFit();
      });
    }

    // Note Inspector Controls
    if (this.inspectorNoteTime) {
      this.inspectorNoteTime.addEventListener("change", (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && this.selectedNote) {
          this.updateSelectedNoteTime(val);
        }
      });
      this.inspectorNoteTime.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.inspectorNoteTime.blur();
        }
      });
    }

    if (this.inspectorNudgeLeft) {
      this.inspectorNudgeLeft.addEventListener("click", () => {
        if (this.selectedNote) {
          this.updateSelectedNoteTime(this.selectedNote.time - 0.05);
        }
      });
    }

    if (this.inspectorNudgeRight) {
      this.inspectorNudgeRight.addEventListener("click", () => {
        if (this.selectedNote) {
          this.updateSelectedNoteTime(this.selectedNote.time + 0.05);
        }
      });
    }

    if (this.inspectorSnapPlayhead) {
      this.inspectorSnapPlayhead.addEventListener("click", () => {
        if (this.selectedNote) {
          this.updateSelectedNoteTime(this.currentTime);
        }
      });
    }

    if (this.inspectorDelete) {
      this.inspectorDelete.addEventListener("click", () => {
        if (this.selectedNote) {
          this.deleteSelectedNote();
        }
      });
    }

    if (this.inspectorClose) {
      this.inspectorClose.addEventListener("click", () => {
        this.selectNote(null);
      });
    }

    // Video-Editing Timeline Mouse & Scroll Interactions
    if (this.timelineScroll) {
      // Mouse Wheel: Scroll horizontally, or Zoom with Ctrl/Meta key
      this.timelineScroll.addEventListener("wheel", (e) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          const factor = e.deltaY < 0 ? 1.25 : 0.8;
          this.setZoom(this.pixelsPerSecond * factor);
        } else {
          const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
          this.timelineScroll.scrollLeft += delta;
        }
      }, { passive: false });
    }

    // Playhead & Timeline Canvas Clicking / Dragging
    const handleTimelinePointerSeek = (clientX) => {
      if (!this.timelineContent || !this.timelineScroll) return;
      const rect = this.timelineScroll.getBoundingClientRect();
      const contentX = (clientX - rect.left) + this.timelineScroll.scrollLeft;
      const targetTime = Math.max(0, Math.min(this.duration, contentX / this.pixelsPerSecond));
      this.seekTo(targetTime);
    };

    if (this.timelineContent) {
      this.timelineContent.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;

        // Check if user clicked on a note on the timeline canvas
        const rect = this.timelineScroll.getBoundingClientRect();
        const contentX = (clientX) => (clientX - rect.left) + this.timelineScroll.scrollLeft;
        const clickContentX = contentX(e.clientX);
        const clickY = e.clientY - rect.top;

        // Note lane is below the ruler (y > 26)
        if (clickY > 26) {
          const clickedNote = this.findNoteAtTimelinePos(clickContentX, clickY - 26);
          if (clickedNote) {
            this.selectNote(clickedNote);
            this.seekTo(clickedNote.time);
            return;
          }
        }

        // Otherwise, seek and begin dragging playhead
        this.isDraggingPlayhead = true;
        this.wasPlayingBeforeScrub = this.isPlaying;
        if (this.isPlaying) {
          this.pause();
        }

        if (this.timelineWrapper) {
          this.timelineWrapper.classList.add("is-dragging-playhead");
        }

        handleTimelinePointerSeek(e.clientX);
      });
    }

    // Window listeners for smooth dragging playhead
    const onWindowTimelineMove = (e) => {
      if (!this.isDraggingPlayhead) return;
      handleTimelinePointerSeek(e.clientX);
    };

    const onWindowTimelineUp = () => {
      if (!this.isDraggingPlayhead) return;
      this.isDraggingPlayhead = false;
      if (this.timelineWrapper) {
        this.timelineWrapper.classList.remove("is-dragging-playhead");
      }
      if (this.wasPlayingBeforeScrub) {
        this.play();
      }
    };

    window.addEventListener("mousemove", onWindowTimelineMove);
    window.addEventListener("mouseup", onWindowTimelineUp);
    this._windowTimelineMove = onWindowTimelineMove;
    this._windowTimelineUp = onWindowTimelineUp;

    // Export Modal Controls
    if (this.exportBtn) {
      this.exportBtn.addEventListener("click", () => {
        this.openExportModal();
      });
    }

    if (this.closeExportBtn) {
      this.closeExportBtn.addEventListener("click", () => {
        this.closeExportModal();
      });
    }

    if (this.copyExportBtn) {
      this.copyExportBtn.addEventListener("click", () => {
        this.copyExportCode();
      });
    }

    if (this.downloadExportBtn) {
      this.downloadExportBtn.addEventListener("click", () => {
        this.downloadExportFile();
      });
    }

    if (this.exportModal) {
      this.exportModal.addEventListener("click", (e) => {
        if (e.target === this.exportModal) {
          this.closeExportModal();
        }
      });
    }

    // Track Parameters Modal Controls
    if (this.paramsBtn) {
      this.paramsBtn.addEventListener("click", () => {
        this.openParamsModal();
      });
    }

    if (this.closeParamsBtn) {
      this.closeParamsBtn.addEventListener("click", () => {
        this.closeParamsModal();
      });
    }

    if (this.cancelParamsBtn) {
      this.cancelParamsBtn.addEventListener("click", () => {
        this.closeParamsModal();
      });
    }

    if (this.paramsModal) {
      this.paramsModal.addEventListener("click", (e) => {
        if (e.target === this.paramsModal) {
          this.closeParamsModal();
        }
      });

      const swatches = this.paramsModal.querySelectorAll(".swatch-btn");
      swatches.forEach((btn) => {
        btn.addEventListener("click", () => {
          const c = btn.getAttribute("data-color");
          if (c && this.paramsColor) {
            this.paramsColor.value = c;
            this.updateColorSwatches(c);
          }
        });
      });
    }

    if (this.paramsColor) {
      this.paramsColor.addEventListener("input", (e) => {
        this.updateColorSwatches(e.target.value);
      });
    }

    // Track Parameters Artwork Gallery Thumbnails
    if (this.paramsArtworkGallery) {
      const thumbs = this.paramsArtworkGallery.querySelectorAll(".artwork-gallery-thumb");
      thumbs.forEach((btn) => {
        btn.addEventListener("click", () => {
          const art = btn.getAttribute("data-artwork");
          if (art) {
            this.setParamArtwork(art, btn.getAttribute("title") || "Preset Artwork");
            thumbs.forEach((b) => b.classList.remove("is-active"));
            btn.classList.add("is-active");
            if (this.paramsArtworkStatus) {
              this.paramsArtworkStatus.textContent = "Using preset artwork";
            }
            if (this.soundManager) this.soundManager.playClick();
          }
        });
      });
    }

    // Track Parameters Custom Artwork File Upload
    if (this.paramsArtworkFile) {
      this.paramsArtworkFile.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            const dataUrl = evt.target.result;
            this.setParamArtwork(dataUrl, `Custom: ${file.name}`);
            if (this.paramsArtworkStatus) {
              this.paramsArtworkStatus.textContent = `Custom: ${file.name}`;
            }
            if (this.paramsArtworkGallery) {
              const thumbs = this.paramsArtworkGallery.querySelectorAll(".artwork-gallery-thumb");
              thumbs.forEach((b) => b.classList.remove("is-active"));
            }
            if (this.soundManager) this.soundManager.playClick();
          };
          reader.readAsDataURL(file);
        }
      });
    }

    // Editor Header Background Button -> Opens modal & scrolls to Background Section
    if (this.editorBgBtn) {
      this.editorBgBtn.addEventListener("click", () => {
        this.openParamsModal();
        if (this.paramsBgSection && typeof this.paramsBgSection.scrollIntoView === "function") {
          setTimeout(() => {
            try { this.paramsBgSection.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
          }, 60);
        }
      });
    }

    // Background Media File Upload (Image or Video)
    if (this.paramsBgFile) {
      this.paramsBgFile.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const isVideo = file.type.startsWith("video");
        const isImage = file.type.startsWith("image");
        if (!isVideo && !isImage) {
          alert("Please upload a valid image or video file.");
          return;
        }

        const mediaKey = `bg_${(this.activeMap && this.activeMap.id) || "track"}_${Date.now()}`;
        const fit = (this.paramsBgFit && this.paramsBgFit.value) || "cover";
        const opacity = this.paramsBgOpacity ? parseFloat(this.paramsBgOpacity.value) : 0.7;

        // Persist blob in MediaStorage if available
        if (typeof window !== "undefined" && window.MediaStorage) {
          window.MediaStorage.saveBackgroundMedia(mediaKey, file, { name: file.name, type: isVideo ? "video" : "image" });
        }

        const blobUrl = typeof window.URL !== "undefined" && window.URL.createObjectURL ? window.URL.createObjectURL(file) : "";
        const bgConfig = {
          type: isVideo ? "video" : "image",
          name: file.name,
          fit,
          opacity,
          mediaId: mediaKey,
          url: blobUrl
        };

        // For portable export, generate data URL for images under 3MB
        if (isImage && file.size < 3 * 1024 * 1024 && typeof FileReader !== "undefined") {
          const reader = new FileReader();
          reader.onload = (evt) => {
            bgConfig.url = evt.target.result;
            this.activeBgConfig = bgConfig;
            this.loadBackgroundMedia(bgConfig);
            this.markDirty();
            this.saveMapState();
          };
          reader.readAsDataURL(file);
        } else {
          this.activeBgConfig = bgConfig;
          this.loadBackgroundMedia(bgConfig);
          this.markDirty();
          this.saveMapState();
        }

        if (this.soundManager) this.soundManager.playClick();
      });
    }

    // Background Fit Mode Selector (Cover / Contain)
    if (this.paramsBgFit) {
      this.paramsBgFit.addEventListener("change", (e) => {
        if (!this.activeBgConfig) {
          this.activeBgConfig = { type: "image", url: "", fit: e.target.value, opacity: 0.7, name: "Default" };
        }
        this.activeBgConfig.fit = e.target.value;
        this.updateBgParamsUI();
        this.markDirty();
        this.saveMapState();
        if (this.soundManager) this.soundManager.playClick();
      });
    }

    // Background Opacity Slider (0.05 - 1.0)
    if (this.paramsBgOpacity) {
      this.paramsBgOpacity.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value) || 0.7;
        if (this.paramsBgOpacityVal) {
          this.paramsBgOpacityVal.textContent = `${Math.round(val * 100)}%`;
        }
        if (this.activeBgConfig) {
          this.activeBgConfig.opacity = val;
          this.markDirty();
          this.saveMapState();
        }
      });
    }

    // Remove Background Button
    if (this.paramsBgRemoveBtn) {
      this.paramsBgRemoveBtn.addEventListener("click", () => {
        if (confirm("Remove background and restore default arena grid?")) {
          if (this.activeBgConfig && this.activeBgConfig.mediaId && typeof window !== "undefined" && window.MediaStorage) {
            window.MediaStorage.deleteBackgroundMedia(this.activeBgConfig.mediaId);
          }
          this.activeBgConfig = null;
          this.loadBackgroundMedia(null);
          if (this.paramsBgFile) this.paramsBgFile.value = "";
          this.markDirty();
          this.saveMapState();
          if (this.soundManager) this.soundManager.playClick();
        }
      });
    }

    if (this.paramsForm) {
      this.paramsForm.addEventListener("submit", (e) => {
        this.onSaveParams(e);
      });
    }
  }

  /**
   * Opens the Export Track modal with the serialized, validated code.
   * Does NOT duplicate saves or mutate the track.
   */
  openExportModal() {
    this.pause();
    if (this.isDirty) {
      this.saveMapState();
    }

    if (!this.activeMap || !this.mapStorage) return;

    try {
      const exportResult = this.mapStorage.exportTrack(this.activeMap);
      this.lastExportData = exportResult;

      if (this.exportTrackName) {
        this.exportTrackName.textContent = this.activeMap.name || "Untitled Track";
      }
      if (this.exportTrackNotes) {
        this.exportTrackNotes.textContent = `${this.notes.length} note${this.notes.length === 1 ? "" : "s"}`;
      }
      if (this.exportTrackDuration) {
        this.exportTrackDuration.textContent = this.formatTime(this.duration);
      }
      if (this.exportTrackNps) {
        const nps = this.duration > 0 ? (this.notes.length / this.duration).toFixed(1) : "0.0";
        this.exportTrackNps.textContent = nps;
      }

      if (this.exportCodeArea) {
        this.exportCodeArea.value = exportResult.code;
      }

      if (this.exportFeedback) {
        this.exportFeedback.style.display = "none";
      }

      if (this.exportModal) {
        this.exportModal.classList.add("is-active");
        this.exportModal.setAttribute("aria-hidden", "false");
      }

      if (this.soundManager) {
        this.soundManager.playClick();
      }
    } catch (err) {
      console.error("Export error:", err);
      alert("Failed to export track: " + err.message);
    }
  }

  /**
   * Copies the exported track code to clipboard and provides instant feedback.
   */
  copyExportCode() {
    if (!this.exportCodeArea || !this.exportCodeArea.value) return;

    const code = this.exportCodeArea.value;

    const notifySuccess = () => {
      if (this.exportFeedback) {
        this.exportFeedback.textContent = "Copied to clipboard! ✓";
        this.exportFeedback.style.display = "inline-block";
        clearTimeout(this._copyTimeout);
        this._copyTimeout = setTimeout(() => {
          if (this.exportFeedback) this.exportFeedback.style.display = "none";
        }, 2800);
      }
      if (this.soundManager) this.soundManager.playClick();
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(notifySuccess).catch(() => {
        this.exportCodeArea.select();
        document.execCommand("copy");
        notifySuccess();
      });
    } else {
      this.exportCodeArea.select();
      document.execCommand("copy");
      notifySuccess();
    }
  }

  /**
   * Downloads the exported track as an .alpha JSON file.
   */
  downloadExportFile() {
    if (!this.lastExportData || !this.lastExportData.json) return;

    try {
      const blob = new Blob([this.lastExportData.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cleanName = (this.activeMap.name || "track").replace(/[^a-zA-Z0-9_\-]/g, "_");
      a.href = url;
      a.download = `${cleanName}.alpha`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (this.soundManager) this.soundManager.playClick();
    } catch (e) {
      console.warn("Download failed:", e);
    }
  }

  /**
   * Closes the Export modal.
   */
  closeExportModal() {
    if (this.exportModal) {
      this.exportModal.classList.remove("is-active");
      this.exportModal.setAttribute("aria-hidden", "true");
    }
    if (this.soundManager) this.soundManager.playClick();
  }

  /**
   * Opens the Track Parameters modal, populating fields with active track data.
   */
  openParamsModal() {
    this.pause();
    if (!this.activeMap) return;

    if (this.paramsName) this.paramsName.value = this.activeMap.name || "";
    if (this.paramsMapper) this.paramsMapper.value = this.activeMap.mapper || "";
    if (this.paramsCreator) this.paramsCreator.value = this.activeMap.creator || "";
    if (this.paramsDifficulty) this.paramsDifficulty.value = this.activeMap.difficulty || "Normal";
    const trackColor = this.activeMap.color || "#00d4ff";
    if (this.paramsColor) this.paramsColor.value = trackColor;
    this.updateColorSwatches(trackColor);

    if (this.paramsAudio) {
      this.paramsAudio.value = this.activeMap.file || "Assets/Songs/IMG_2449.mp3";
    }

    const trackCover = this.activeMap.cover || "Assets/Tracks Placeholders/Default-0.png";
    this.setParamArtwork(trackCover, this.activeMap.cover ? "Track Artwork" : "Default 0");
    if (this.paramsArtworkGallery) {
      const thumbs = this.paramsArtworkGallery.querySelectorAll(".artwork-gallery-thumb");
      thumbs.forEach((btn) => {
        if (btn.getAttribute("data-artwork") === trackCover) {
          btn.classList.add("is-active");
        } else {
          btn.classList.remove("is-active");
        }
      });
    }
    if (this.paramsArtworkFile) {
      this.paramsArtworkFile.value = "";
    }
    if (this.paramsArtworkStatus) {
      this.paramsArtworkStatus.textContent = trackCover.startsWith("data:") ? "Custom Artwork" : "Preset Artwork";
    }

    if (this.paramsTypeBadge) {
      const isDefault = Boolean(this.activeMap.isDefault);
      this.paramsTypeBadge.textContent = isDefault ? "Default Track" : "Custom Track";
      if (isDefault) {
        this.paramsTypeBadge.classList.add("is-default");
      } else {
        this.paramsTypeBadge.classList.remove("is-default");
      }
    }

    if (this.paramsNoteInfo) {
      if (this.activeMap.isDefault) {
        this.paramsNoteInfo.textContent = "This is a default track. Saving changes here will save as an independent custom copy so the original stays unchanged.";
      } else {
        this.paramsNoteInfo.textContent = "Modify track parameters. Changes save directly to this custom track and update in song select and exports.";
      }
    }

    // Refresh Background configuration preview and controls
    this.updateBgParamsUI();

    if (this.paramsModal) {
      this.paramsModal.classList.add("is-active");
      this.paramsModal.setAttribute("aria-hidden", "false");
    }

    if (this.soundManager) this.soundManager.playClick();
  }

  /**
   * Sets the track parameters artwork image and updates preview.
   * @param {string} src
   * @param {string} title
   */
  setParamArtwork(src, title = "") {
    this.selectedParamArtwork = src;
    if (this.paramsArtworkPreview) {
      this.paramsArtworkPreview.src = src;
    }
    if (this.paramsArtworkTitle) {
      this.paramsArtworkTitle.textContent = title || "Selected Artwork";
    }
  }

  /**
   * Closes the Track Parameters modal.
   */
  closeParamsModal() {
    if (this.paramsModal) {
      this.paramsModal.classList.remove("is-active");
      this.paramsModal.setAttribute("aria-hidden", "true");
    }
    if (this.soundManager) this.soundManager.playClick();
  }

  /**
   * Updates color swatch active borders based on chosen hex color.
   * @param {string} activeColor
   */
  updateColorSwatches(activeColor) {
    if (!this.paramsModal) return;
    const swatches = this.paramsModal.querySelectorAll(".swatch-btn");
    swatches.forEach((btn) => {
      const col = btn.getAttribute("data-color");
      if (col && col.toLowerCase() === (activeColor || "").toLowerCase()) {
        btn.classList.add("is-active");
      } else {
        btn.classList.remove("is-active");
      }
    });
  }

  /**
   * Saves updated metadata from the Track Parameters modal into MapStorage.
   * Updates title header, duration, audio source if changed, and notifies all menus.
   * @param {Event} e
   */
  onSaveParams(e) {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }
    if (!this.activeMap || !this.mapStorage) return;

    const newName = this.paramsName ? this.paramsName.value.trim() : this.activeMap.name;
    const newMapper = this.paramsMapper ? this.paramsMapper.value.trim() : this.activeMap.mapper;
    const newCreator = this.paramsCreator ? this.paramsCreator.value.trim() : this.activeMap.creator;
    const newDifficulty = this.paramsDifficulty ? this.paramsDifficulty.value : (this.activeMap.difficulty || "Normal");
    const newColor = this.paramsColor ? this.paramsColor.value : (this.activeMap.color || "#00d4ff");
    const newAudio = this.paramsAudio ? this.paramsAudio.value : (this.activeMap.file || "Assets/Songs/IMG_2449.mp3");
    const newCover = this.selectedParamArtwork || this.activeMap.cover || "Assets/Tracks Placeholders/Default-0.png";

    if (!newName) {
      alert("Track name cannot be empty.");
      return;
    }

    const audioChanged = this.activeMap.file !== newAudio;
    let newDuration = this.activeMap.duration || "03:00";
    let newDurationSeconds = this.activeMap.durationSeconds || 180;

    if (audioChanged && this.paramsAudio && this.paramsAudio.selectedOptions[0]) {
      const dur = Number(this.paramsAudio.selectedOptions[0].getAttribute("data-duration"));
      if (dur > 0) {
        newDurationSeconds = dur;
        const m = Math.floor(dur / 60);
        const s = Math.floor(dur % 60);
        newDuration = `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
      }
    }

    const updated = {
      ...this.activeMap,
      name: newName,
      mapper: newMapper || "Anonymous",
      creator: newCreator || "Unknown Artist",
      difficulty: newDifficulty,
      color: newColor,
      cover: newCover,
      file: newAudio,
      duration: newDuration,
      durationSeconds: newDurationSeconds,
      background: this.activeBgConfig ? { ...this.activeBgConfig } : null,
      notes: [...this.notes]
    };

    const savedMap = this.mapStorage.saveMap(updated);
    this.activeMap = savedMap;
    this.duration = savedMap.durationSeconds || 180;
    this.isDirty = false;

    if (this.saveIndicatorEl) {
      this.saveIndicatorEl.textContent = "✓ All changes saved";
      this.saveIndicatorEl.className = "editor-save-tag saved";
    }

    if (this.paramsTypeBadge && this.mapStorage) {
      const isDef = this.mapStorage.isDefaultTrack(this.activeMap);
      this.paramsTypeBadge.textContent = isDef ? "Default Track" : "Custom Track";
      if (isDef) {
        this.paramsTypeBadge.classList.add("is-default");
      } else {
        this.paramsTypeBadge.classList.remove("is-default");
      }
    }

    if (this.titleEl) {
      this.titleEl.textContent = `${this.activeMap.name} - by ${this.activeMap.mapper}`;
    }

    if (audioChanged) {
      this.initAudio(this.activeMap.file);
      this.updateTimelineUI();
    }

    this.renderTimelineMarkers();
    this.closeParamsModal();

    if (this.soundManager) {
      this.soundManager.playClick();
    }
  }

  /**
   * Cleans up event listeners when closing editor.
   */
  unbindEvents() {
    this.eventsBound = false;
    if (typeof window !== "undefined" && window.removeEventListener) {
      window.removeEventListener("keydown", this.boundKeyDown);
      window.removeEventListener("mouseup", this.boundMouseUp);
      window.removeEventListener("mousemove", this.boundMouseMove);
      if (this._windowTimelineMove) {
        window.removeEventListener("mousemove", this._windowTimelineMove);
        this._windowTimelineMove = null;
      }
      if (this._windowTimelineUp) {
        window.removeEventListener("mouseup", this._windowTimelineUp);
        this._windowTimelineUp = null;
      }
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

    // If typing in any input/textarea/select or contentEditable, never trigger hotkeys except Escape
    const isTextInput = (
      (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT")) ||
      (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA" || document.activeElement.tagName === "SELECT")) ||
      (e.target && e.target.isContentEditable)
    );

    if (isTextInput) {
      if (e.key === "Escape") {
        if (this.paramsModal && this.paramsModal.classList.contains("is-active")) {
          this.closeParamsModal();
          return;
        }
        if (this.exportModal && this.exportModal.classList.contains("is-active")) {
          this.closeExportModal();
          return;
        }
        if (document.activeElement && typeof document.activeElement.blur === "function") {
          document.activeElement.blur();
        }
      }
      return;
    }

    if (e.key === "Escape") {
      if (this.paramsModal && this.paramsModal.classList.contains("is-active")) {
        this.closeParamsModal();
        return;
      }
      if (this.exportModal && this.exportModal.classList.contains("is-active")) {
        this.closeExportModal();
        return;
      }
      this.close();
      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      if (this.selectedNote) {
        e.preventDefault();
        this.deleteSelectedNote();
        return;
      }
    }

    // Hotkeys to switch placement tools: 1 / N for Normal Note, 2 / D for Directional, 3 / B for Bomb
    if (e.key === "1" || e.key.toLowerCase() === "n") {
      e.preventDefault();
      this.setTool("note");
      if (this.soundManager) this.soundManager.playClick();
      return;
    }
    if (e.key === "2" || e.key.toLowerCase() === "d") {
      e.preventDefault();
      this.setTool("directional");
      if (this.soundManager) this.soundManager.playClick();
      return;
    }
    if (e.key === "3" || e.key.toLowerCase() === "b") {
      e.preventDefault();
      this.setTool("bomb");
      if (this.soundManager) this.soundManager.playClick();
      return;
    }

    if (e.code === "Space") {
      e.preventDefault();
      // Ignore key repeat to prevent rapid fluttering on held Spacebar
      if (e.repeat) return;
      this.togglePlayPause();
    } else if (e.key === "Enter") {
      e.preventDefault();
      this.testMap();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const step = e.shiftKey ? 1.0 : 0.1;
      this.stepTime(-step);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      const step = e.shiftKey ? 1.0 : 0.1;
      this.stepTime(step);
    }
  }

  /**
   * Updates mouse coordinates on canvas and tracks directional angle dragging.
   * @param {MouseEvent} e
   */
  onMouseMove(e) {
    if (this.canvas) {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
      this.mouse.isHovering = (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      );
    } else {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    }

    if (this.isPlacingDirectional && this.directionalDragStart) {
      const dx = this.mouse.x - this.directionalDragStart.canvasX;
      const dy = this.mouse.y - this.directionalDragStart.canvasY;
      if (Math.hypot(dx, dy) >= 4) {
        const rad = Math.atan2(dy, dx);
        this.directionalCurrentAngle = ((Math.round(rad * 180 / Math.PI) % 360) + 360) % 360;
      }
    }
  }

  /**
   * Handles note placement both while paused and during live music playback:
   * When Normal Note tool is active:
   *   Left-click: places or toggles normal RED note.
   *   Right-click: places or toggles normal BLUE note.
   * When Directional Note tool is active:
   *   Press and hold to start angle drag (0-360°), finalize on release.
   * When Bomb tool is active:
   *   Click: places or toggles TRIANGLE BOMB hazard note (yellow).
   * @param {MouseEvent} e
   */
  onMouseDown(e) {
    if (e.button !== 0 && e.button !== 2) return;
    if (!this.canvas) return;

    const rect = this.canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    // Ignore clicks outside canvas bounds
    if (canvasX < 0 || canvasX > this.canvas.width || canvasY < 0 || canvasY > this.canvas.height) {
      return;
    }

    // Automatically assign active playback position when playing, or paused scrub position
    const currentPos = (this.isPlaying && this.audio) ? this.audio.currentTime : this.currentTime;
    const roundedTime = parseFloat(currentPos.toFixed(2));

    // Handle Directional Note drag start
    if (this.activeTool === "directional") {
      this.isPlacingDirectional = true;
      this.directionalDragStart = {
        canvasX,
        canvasY,
        clientX: e.clientX,
        clientY: e.clientY,
        button: e.button,
        time: roundedTime
      };
      this.directionalCurrentAngle = 0;
      return;
    }

    const isBomb = this.activeTool === "bomb";
    const noteType = isBomb ? "triangle" : "normal";
    const noteColor = isBomb ? "yellow" : (e.button === 0 ? "red" : "blue");

    const playArea = PlayArea.getMetrics(this.canvas.width, this.canvas.height, 24);
    const normalizedX = playArea.clampNormalized(playArea.toLocalX(canvasX));
    const normalizedY = playArea.clampNormalized(playArea.toLocalY(canvasY));

    // Check if clicking near an existing note at this timestamp to toggle/delete it
    // When playing, use tighter 0.12s tolerance; when paused use standard 0.25s
    const timeTolerance = this.isPlaying ? 0.12 : 0.25;
    const existingIndex = this.notes.findIndex((n) => {
      const dx = playArea.toScreenX(n.x) - canvasX;
      const dy = playArea.toScreenY(n.y) - canvasY;
      const dist = Math.hypot(dx, dy);
      return Math.abs(n.time - roundedTime) <= timeTolerance && dist <= (playArea.bigRadius * 1.25);
    });

    if (existingIndex !== -1) {
      // Toggle / remove note
      this.notes.splice(existingIndex, 1);
      if (this.selectedNote && Math.abs(this.selectedNote.time - roundedTime) <= timeTolerance) {
        this.selectNote(null);
      }
      if (this.soundManager) this.soundManager.playClick();
    } else {
      // Add new note (normal or triangle bomb)
      const newNote = {
        time: roundedTime,
        color: noteColor,
        type: noteType,
        x: normalizedX,
        y: normalizedY
      };
      this.notes.push(newNote);
      this.notes.sort((a, b) => a.time - b.time);
      this.selectNote(newNote);
      if (this.soundManager) {
        this.soundManager.playClick();
      }
    }

    this.markDirty();
    this.saveMapState();
    this.renderTimelineMarkers();
  }

  /**
   * Finalizes directional note placement on mouse release.
   * @param {MouseEvent} e
   */
  onMouseUp(e) {
    if (!this.isPlacingDirectional || !this.directionalDragStart) {
      this.isPlacingDirectional = false;
      this.directionalDragStart = null;
      return;
    }

    const start = this.directionalDragStart;
    this.isPlacingDirectional = false;
    this.directionalDragStart = null;

    const rect = this.canvas ? this.canvas.getBoundingClientRect() : { left: 0, top: 0 };
    const curCanvasX = e.clientX - rect.left;
    const curCanvasY = e.clientY - rect.top;
    const dx = curCanvasX - start.canvasX;
    const dy = curCanvasY - start.canvasY;
    const dist = Math.hypot(dx, dy);

    const playArea = PlayArea.getMetrics(this.canvas.width, this.canvas.height, 24);
    const roundedTime = start.time;
    const noteColor = start.button === 0 ? "red" : "blue";

    // Check if clicking near an existing note at this timestamp to toggle/delete it (short click without drag)
    const timeTolerance = this.isPlaying ? 0.12 : 0.25;
    const existingIndex = this.notes.findIndex((n) => {
      const nx = playArea.toScreenX(n.x);
      const ny = playArea.toScreenY(n.y);
      return Math.abs(n.time - roundedTime) <= timeTolerance && Math.hypot(nx - start.canvasX, ny - start.canvasY) <= (playArea.bigRadius * 1.25);
    });

    if (dist < 6 && existingIndex !== -1) {
      // Toggle / remove note
      this.notes.splice(existingIndex, 1);
      if (this.selectedNote && Math.abs(this.selectedNote.time - roundedTime) <= timeTolerance) {
        this.selectNote(null);
      }
      if (this.soundManager) this.soundManager.playClick();
    } else {
      let finalAngle = this.directionalCurrentAngle;
      if (dist >= 6) {
        const rad = Math.atan2(dy, dx);
        finalAngle = ((Math.round(rad * 180 / Math.PI) % 360) + 360) % 360;
      }

      // If dragged from an existing note position, replace it
      if (existingIndex !== -1) {
        this.notes.splice(existingIndex, 1);
      }

      const normalizedX = playArea.clampNormalized(playArea.toLocalX(start.canvasX));
      const normalizedY = playArea.clampNormalized(playArea.toLocalY(start.canvasY));

      const newNote = {
        time: roundedTime,
        color: noteColor,
        type: "directional",
        angle: finalAngle,
        x: normalizedX,
        y: normalizedY
      };
      this.notes.push(newNote);
      this.notes.sort((a, b) => a.time - b.time);
      this.selectNote(newNote);
      if (this.soundManager) this.soundManager.playClick();
    }

    this.markDirty();
    this.saveMapState();
    this.renderTimelineMarkers();
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
    if (this.bgMedia && this.bgMediaType === "video") {
      this.bgMedia.playbackRate = this.playSpeed || 1.0;
      this.bgMedia.play().catch(() => {});
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
    if (this.bgMedia && this.bgMediaType === "video") {
      try { this.bgMedia.pause(); } catch (e) {}
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
    if (this.bgMedia && this.bgMediaType === "video" && this.bgMedia.duration > 0) {
      try { this.bgMedia.currentTime = clamped % this.bgMedia.duration; } catch (e) {}
    }
    this.updateTimelineUI();
  }

  /**
   * Steps timeline by a given offset in seconds (e.g. -0.1s, +0.1s, -1.0s, +1.0s).
   * Works accurately when paused or playing.
   * @param {number} deltaSeconds
   */
  stepTime(deltaSeconds) {
    const target = Math.max(0, Math.min(this.duration, this.currentTime + deltaSeconds));
    this.seekTo(target);
    if (this.soundManager) {
      this.soundManager.playClick();
    }
  }

  /**
   * Switches the active placement tool (normal note vs directional note vs bomb).
   * @param {"note"|"directional"|"bomb"} tool
   */
  setTool(tool) {
    if (tool !== "note" && tool !== "directional" && tool !== "bomb") return;
    this.activeTool = tool;

    if (this.toolBtnNote) {
      const isNote = tool === "note";
      this.toolBtnNote.classList.toggle("is-active", isNote);
      this.toolBtnNote.setAttribute("aria-pressed", isNote ? "true" : "false");
    }
    if (this.toolBtnDirectional) {
      const isDirectional = tool === "directional";
      this.toolBtnDirectional.classList.toggle("is-active", isDirectional);
      this.toolBtnDirectional.setAttribute("aria-pressed", isDirectional ? "true" : "false");
    }
    if (this.toolBtnBomb) {
      const isBomb = tool === "bomb";
      this.toolBtnBomb.classList.toggle("is-active", isBomb);
      this.toolBtnBomb.setAttribute("aria-pressed", isBomb ? "true" : "false");
    }
  }

  /**
   * Sets editor-only playback speed (e.g. 0.25x, 0.5x, 1.0x, 2.0x).
   * Synchronizes HTML5 audio, background video, and UI presets.
   * Note: This strictly affects editor scrubbing/testing and never modifies saved note data.
   * @param {number} speed
   */
  setPlaySpeed(speed) {
    const clampedSpeed = Math.max(0.25, Math.min(2.0, Number(speed) || 1.0));
    this.playSpeed = clampedSpeed;

    if (this.audio) {
      this.audio.playbackRate = clampedSpeed;
    }
    if (this.bgMedia && this.bgMediaType === "video") {
      this.bgMedia.playbackRate = clampedSpeed;
    }

    this.updateSpeedUI();
  }

  /**
   * Updates playback speed slider, readout label, and preset button highlights.
   */
  updateSpeedUI() {
    if (this.speedSlider) {
      this.speedSlider.value = this.playSpeed;
    }

    if (this.speedDisplay) {
      this.speedDisplay.textContent = `${this.playSpeed.toFixed(1)}x`;
    }

    if (this.view) {
      const presets = this.view.querySelectorAll(".btn-speed-preset");
      presets.forEach((btn) => {
        const val = parseFloat(btn.getAttribute("data-speed"));
        if (Math.abs(val - this.playSpeed) < 0.05) {
          btn.classList.add("is-active");
        } else {
          btn.classList.remove("is-active");
        }
      });
    }
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
   * Sets the timeline zoom in pixels per second.
   * Auto-resizes timeline canvas and adjusts scroll to keep playhead visible.
   * @param {number} pps
   */
  setZoom(pps) {
    const clamped = Math.max(10, Math.min(400, Number(pps) || 50));
    this.pixelsPerSecond = Math.round(clamped);

    if (this.zoomSlider) {
      this.zoomSlider.value = this.pixelsPerSecond;
    }
    if (this.zoomDisplay) {
      this.zoomDisplay.textContent = `${this.pixelsPerSecond} px/s`;
    }

    this.resizeTimelineContent();
    this.renderTimeline();
    this.updatePlayheadPosition(true);
  }

  /**
   * Fits the entire song duration into the current visible timeline container width.
   */
  zoomFit() {
    if (!this.timelineScroll || this.duration <= 0) return;
    const clientWidth = this.timelineScroll.clientWidth || 800;
    const fitPps = Math.max(10, Math.min(400, (clientWidth - 40) / this.duration));
    this.setZoom(fitPps);
  }

  /**
   * Computes content width and resizes ruler and tracks canvases according to duration and zoom.
   */
  resizeTimelineContent() {
    if (!this.timelineContent || !this.duration) return;
    const totalWidth = Math.max(window.innerWidth || 800, Math.ceil(this.duration * this.pixelsPerSecond) + 120);

    this.timelineContent.style.width = `${totalWidth}px`;

    if (this.timelineRulerCanvas) {
      this.timelineRulerCanvas.width = totalWidth;
      this.timelineRulerCanvas.height = 26;
    }

    if (this.timelineCanvas) {
      this.timelineCanvas.width = totalWidth;
      this.timelineCanvas.height = 82;
    }
  }

  /**
   * Updates timeline playhead, time readouts, and auto-scrolls to keep playhead in view during playback.
   */
  updateTimelineUI() {
    if (this.timeDisplayEl) {
      const curStr = this.formatTime(this.currentTime);
      const durStr = this.formatTime(this.duration);
      this.timeDisplayEl.textContent = `${curStr} / ${durStr}`;
    }

    if (this.notesCountEl) {
      this.notesCountEl.textContent = `Notes: ${this.notes.length}`;
    }

    if (this.npsDisplayEl) {
      const nps = (this.duration > 0 && this.notes.length > 0)
        ? (this.notes.length / this.duration).toFixed(1)
        : "0.0";
      this.npsDisplayEl.textContent = `${nps} NPS`;
    }

    this.updatePlayheadPosition(false);
  }

  /**
   * Updates playhead position and badge text, auto-scrolling viewport if needed.
   * @param {boolean} forceCenter
   */
  updatePlayheadPosition(forceCenter = false) {
    const playheadX = this.currentTime * this.pixelsPerSecond;

    if (this.timelinePlayhead) {
      this.timelinePlayhead.style.left = `${playheadX}px`;
    }

    if (this.playheadBadgeText) {
      this.playheadBadgeText.textContent = this.formatTime(this.currentTime);
    }

    // Auto-scroll logic: keep playhead visible while song plays or during zoom fit
    if (this.timelineScroll) {
      const scrollLeft = this.timelineScroll.scrollLeft;
      const clientWidth = this.timelineScroll.clientWidth;

      if (forceCenter) {
        this.timelineScroll.scrollLeft = Math.max(0, playheadX - clientWidth / 2);
      } else if (this.isPlaying) {
        // When playhead moves close to the right edge (within 80px), scroll forward smoothly
        if (playheadX > scrollLeft + clientWidth - 80) {
          this.timelineScroll.scrollLeft = playheadX - clientWidth * 0.35;
        } else if (playheadX < scrollLeft) {
          this.timelineScroll.scrollLeft = Math.max(0, playheadX - 60);
        }
      }
    }
  }

  /**
   * Full video-editing timeline render: draws time ruler and interactive note lanes.
   */
  renderTimeline() {
    this.drawTimelineRuler();
    this.drawTimelineTracks();
  }

  /**
   * Compatibility alias for saving state and updating timeline.
   */
  renderTimelineMarkers() {
    this.renderTimeline();
  }

  /**
   * Draws the professional time ruler with subdivisions (seconds, tenths, frame labels).
   */
  drawTimelineRuler() {
    if (!this.rulerCtx || !this.timelineRulerCanvas) return;
    const ctx = this.rulerCtx;
    const w = this.timelineRulerCanvas.width;
    const h = this.timelineRulerCanvas.height;
    const pps = this.pixelsPerSecond;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "#0a1120";
    ctx.fillRect(0, 0, w, h);

    // Bottom border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h - 0.5);
    ctx.lineTo(w, h - 0.5);
    ctx.stroke();

    // Determine grid step interval dynamically based on zoom
    // pps = 10..400
    let majorStepSec = 1;
    let minorStepSec = 0.5;
    if (pps < 25) {
      majorStepSec = 5;
      minorStepSec = 1;
    } else if (pps < 60) {
      majorStepSec = 2;
      minorStepSec = 0.5;
    } else if (pps < 120) {
      majorStepSec = 1;
      minorStepSec = 0.25;
    } else if (pps < 250) {
      majorStepSec = 0.5;
      minorStepSec = 0.1;
    } else {
      majorStepSec = 0.25;
      minorStepSec = 0.05;
    }

    const totalSeconds = this.duration || 180;

    // Draw Minor Ticks
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let t = 0; t <= totalSeconds; t += minorStepSec) {
      const x = Math.round(t * pps) + 0.5;
      ctx.moveTo(x, h - 5);
      ctx.lineTo(x, h);
    }
    ctx.stroke();

    // Draw Major Ticks and Time Labels
    ctx.strokeStyle = "rgba(0, 212, 255, 0.65)";
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    ctx.beginPath();
    for (let t = 0; t <= totalSeconds; t += majorStepSec) {
      const x = Math.round(t * pps) + 0.5;
      ctx.moveTo(x, h - 11);
      ctx.lineTo(x, h);

      // Label text (e.g. 00:01, 00:01.5)
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      const frac = Math.round((t % 1) * 10);
      let label = `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
      if (majorStepSec < 1) {
        label += `.${frac}`;
      }
      ctx.fillText(label, x + 3, 3);
    }
    ctx.stroke();
  }

  /**
   * Draws note events, type badges, triangle bomb notes, and selection highlight in the tracks area.
   */
  drawTimelineTracks() {
    if (!this.timelineCtx || !this.timelineCanvas) return;
    const ctx = this.timelineCtx;
    const w = this.timelineCanvas.width;
    const h = this.timelineCanvas.height;
    const pps = this.pixelsPerSecond;

    ctx.clearRect(0, 0, w, h);

    // Render Audio Waveform Visualizer in background (aligned to song timestamps and zoom)
    this.drawTimelineWaveform(ctx, w, h, pps);

    // Track divider line (Lane 1: Red Notes y=4..38; Lane 2: Blue Notes y=42..78)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 41.5);
    ctx.lineTo(w, 41.5);
    ctx.stroke();

    // Lane labels on left
    ctx.font = "bold 9px monospace";
    ctx.fillStyle = "rgba(255, 71, 87, 0.4)";
    ctx.fillText("RED", 6, 24);
    ctx.fillStyle = "rgba(0, 212, 255, 0.4)";
    ctx.fillText("BLUE", 6, 64);

    // Render every note on the timeline at its exact timestamp
    this.notes.forEach((note) => {
      const x = note.time * pps;
      const isTriangle = note.type === "triangle" || note.type === "bomb";
      const isRed = note.color === "red";
      // Red lane: 22, Blue lane: 62, Triangle lane: centered at 42 (on line between lanes)
      const laneCenterY = isTriangle ? 42 : (isRed ? 22 : 62);
      const isSelected = this.selectedNote === note;

      ctx.save();

      // Note Selection Halo
      if (isSelected) {
        ctx.strokeStyle = "#ffd700";
        ctx.lineWidth = 2.5;
        ctx.fillStyle = "rgba(255, 215, 0, 0.25)";
        ctx.beginPath();
        ctx.roundRect(x - 14, laneCenterY - 16, 28, 32, 6);
        ctx.fill();
        ctx.stroke();
      }

      if (isTriangle) {
        // Triangle Bomb Note on timeline (semi-transparent so waveform is visible behind)
        const triSize = 10;
        ctx.beginPath();
        ctx.moveTo(x, laneCenterY - triSize);
        ctx.lineTo(x + triSize * Math.cos(Math.PI / 6), laneCenterY + triSize * Math.sin(Math.PI / 6));
        ctx.lineTo(x - triSize * Math.cos(Math.PI / 6), laneCenterY + triSize * Math.sin(Math.PI / 6));
        ctx.closePath();

        ctx.fillStyle = isSelected ? "rgba(255, 211, 42, 0.65)" : "rgba(255, 211, 42, 0.42)";
        ctx.fill();
        ctx.strokeStyle = isSelected ? "#ffd700" : "rgba(255, 71, 87, 0.95)";
        ctx.lineWidth = isSelected ? 2.5 : 2.0;
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 9px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("!", x, laneCenterY + 2);

        ctx.fillStyle = "rgba(255, 211, 42, 0.9)";
        ctx.font = "8px monospace";
        ctx.fillText(`${note.time}s`, x, laneCenterY + 16);
      } else if (note.type === "directional") {
        // Directional Note: Semi-transparent circular ball displaying angle arrow
        const fillAlpha = isSelected ? 0.65 : 0.45;
        const fillColor = isRed
          ? `rgba(255, 71, 87, ${fillAlpha})`
          : `rgba(0, 212, 255, ${fillAlpha})`;
        const strokeColor = isSelected
          ? "#ffd700"
          : (isRed ? "rgba(255, 120, 130, 0.95)" : "rgba(100, 230, 255, 0.95)");

        ctx.beginPath();
        ctx.arc(x, laneCenterY, 8.5, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = isSelected ? 2.5 : 1.75;
        ctx.stroke();

        // Mini arrow indicating angle
        const angRad = ((note.angle || 0) * Math.PI) / 180;
        ctx.save();
        ctx.translate(x, laneCenterY);
        ctx.rotate(angRad);
        ctx.strokeStyle = "#ffffff";
        ctx.fillStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.lineTo(4, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(1.5, -2.5);
        ctx.lineTo(5, 0);
        ctx.lineTo(1.5, 2.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        ctx.font = "8px monospace";
        ctx.fillText(`${note.time}s`, x, laneCenterY + 15);
      } else {
        // Normal Note: Semi-transparent circular ball displaying waveform through body
        const fillAlpha = isSelected ? 0.65 : 0.45;
        const fillColor = isRed
          ? `rgba(255, 71, 87, ${fillAlpha})`
          : `rgba(0, 212, 255, ${fillAlpha})`;
        const strokeColor = isSelected
          ? "#ffd700"
          : (isRed ? "rgba(255, 120, 130, 0.95)" : "rgba(100, 230, 255, 0.95)");

        ctx.beginPath();
        ctx.arc(x, laneCenterY, 8.5, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = isSelected ? 2.5 : 1.75;
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 8.5px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(isRed ? "R" : "B", x, laneCenterY);

        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        ctx.font = "8px monospace";
        ctx.fillText(`${note.time}s`, x, laneCenterY + 15);
      }

      ctx.restore();
    });
  }

  /**
   * Draws the audio waveform directly on the timeline canvas behind notes.
   * Displays changes in sound intensity over time, highlights loud beats and drops,
   * and stays mathematically synchronized across zooming, scrolling, and playback.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w
   * @param {number} h
   * @param {number} pps
   */
  drawTimelineWaveform(ctx, w, h, pps) {
    if (this.isWaveformLoading && !this.waveformPeaks) {
      ctx.save();
      ctx.fillStyle = "rgba(0, 212, 255, 0.4)";
      ctx.font = "italic 9px monospace";
      ctx.fillText("Loading waveform...", 48, 45);
      ctx.restore();
      return;
    }

    if (!this.waveformPeaks || !this.waveformPeaks.peaks) return;

    const peaks = this.waveformPeaks.peaks;
    const samplesPerSec = this.waveformPeaks.samplesPerSec || 50;
    const numPeaks = peaks.length;
    if (numPeaks === 0) return;

    const centerY = 41.5;
    const maxHalfHeight = 35; // Spans from y=6.5 to y=76.5
    const stepPx = 2.0;
    const barWidth = 1.25;

    const usePath2D = typeof Path2D !== "undefined";
    const regularBars = usePath2D ? new Path2D() : null;
    const beatBars = usePath2D ? new Path2D() : null;

    const maxDrawX = Math.min(w, Math.ceil((this.duration || 180) * pps));

    // Prepare styles
    const grad = ctx.createLinearGradient(0, centerY - maxHalfHeight, 0, centerY + maxHalfHeight);
    grad.addColorStop(0.0, "rgba(255, 71, 87, 0.42)");   // Red lane top tint
    grad.addColorStop(0.3, "rgba(255, 107, 129, 0.30)");
    grad.addColorStop(0.5, "rgba(0, 212, 255, 0.52)");   // Electric cyan center
    grad.addColorStop(0.7, "rgba(30, 144, 255, 0.30)");
    grad.addColorStop(1.0, "rgba(0, 168, 255, 0.42)");   // Blue lane bottom tint

    ctx.save();

    for (let x = 0; x <= maxDrawX; x += stepPx) {
      const tStart = x / pps;
      const tEnd = (x + stepPx) / pps;

      const startBin = Math.max(0, Math.floor(tStart * samplesPerSec));
      const endBin = Math.min(numPeaks - 1, Math.ceil(tEnd * samplesPerSec));

      let amp = 0;
      if (endBin <= startBin) {
        amp = peaks[startBin] || 0;
      } else {
        for (let b = startBin; b <= endBin; b++) {
          if (peaks[b] > amp) amp = peaks[b];
        }
      }

      // Quiet baseline: tiny 1.2px bar at center line for smooth visual flow
      const halfH = Math.max(1.2, amp * maxHalfHeight);
      const yTop = centerY - halfH;
      const barH = halfH * 2;

      if (regularBars) {
        regularBars.rect(x, yTop, barWidth, barH);
        if (amp >= 0.65) {
          const beatCapH = Math.max(2.5, halfH * 0.4);
          beatBars.rect(x, centerY - halfH, barWidth, beatCapH);
          beatBars.rect(x, centerY + halfH - beatCapH, barWidth, beatCapH);
        }
      } else {
        // Direct context fallback if Path2D is not available
        ctx.fillStyle = grad;
        ctx.fillRect(x, yTop, barWidth, barH);
        if (amp >= 0.65) {
          ctx.fillStyle = "rgba(255, 215, 0, 0.70)";
          const beatCapH = Math.max(2.5, halfH * 0.4);
          ctx.fillRect(x, centerY - halfH, barWidth, beatCapH);
          ctx.fillRect(x, centerY + halfH - beatCapH, barWidth, beatCapH);
        }
      }
    }

    if (regularBars) {
      ctx.fillStyle = grad;
      ctx.fill(regularBars);

      if (beatBars) {
        ctx.fillStyle = "rgba(255, 215, 0, 0.70)";
        ctx.fill(beatBars);
      }
    }

    ctx.restore();
  }

  /**
   * Finds any note on the timeline track within click hit tolerance of (contentX, trackY).
   * @param {number} contentX
   * @param {number} trackY
   * @returns {Object|null}
   */
  findNoteAtTimelinePos(contentX, trackY) {
    const pps = this.pixelsPerSecond;
    const hitTolerancePx = 16;

    for (let i = this.notes.length - 1; i >= 0; i--) {
      const note = this.notes[i];
      const noteX = note.time * pps;
      const isTriangle = note.type === "triangle" || note.type === "bomb";
      const isRed = note.color === "red";
      const laneCenterY = isTriangle ? 42 : (isRed ? 22 : 62);

      const dist = Math.hypot(contentX - noteX, trackY - laneCenterY);
      if (dist <= hitTolerancePx) {
        return note;
      }
    }
    return null;
  }

  /**
   * Selects or deselects a note on the timeline.
   * Opens the floating Note Inspector panel for precise time editing.
   * @param {Object|null} note
   */
  selectNote(note) {
    this.selectedNote = note;
    this.renderTimeline();

    if (!note) {
      if (this.noteInspector) {
        this.noteInspector.style.display = "none";
      }
      return;
    }

    if (this.noteInspector) {
      this.noteInspector.style.display = "flex";
      const isTriangle = note.type === "triangle" || note.type === "bomb";
      const isDirectional = note.type === "directional" || note.type === "arrow";
      if (this.inspectorNoteType) {
        if (isTriangle) {
          this.inspectorNoteType.textContent = "TRIANGLE BOMB Note";
          this.inspectorNoteType.style.color = "#ffd32a";
        } else if (isDirectional) {
          this.inspectorNoteType.textContent = `${note.color.toUpperCase()} Directional Note (${note.angle || 0}°)`;
          this.inspectorNoteType.style.color = note.color === "red" ? "#ff4757" : "#00d4ff";
        } else {
          this.inspectorNoteType.textContent = `${note.color.toUpperCase()} Normal Note`;
          this.inspectorNoteType.style.color = note.color === "red" ? "#ff4757" : "#00d4ff";
        }
      }
      if (this.inspectorNoteTime) {
        this.inspectorNoteTime.value = note.time;
      }
    }

    if (this.soundManager) {
      this.soundManager.playClick();
    }
  }

  /**
   * Updates selected note's timestamp with validation and keeps notes sorted.
   * @param {number} newTime
   */
  updateSelectedNoteTime(newTime) {
    if (!this.selectedNote) return;
    const clamped = Math.max(0, Math.min(this.duration, parseFloat(newTime.toFixed(3))));
    this.selectedNote.time = clamped;
    if (this.inspectorNoteTime) {
      this.inspectorNoteTime.value = clamped;
    }

    this.notes.sort((a, b) => a.time - b.time);
    this.markDirty();
    this.saveMapState();
    this.renderTimeline();
    this.seekTo(clamped);
  }

  /**
   * Deletes the currently selected note from the map.
   */
  deleteSelectedNote() {
    if (!this.selectedNote) return;
    const idx = this.notes.indexOf(this.selectedNote);
    if (idx !== -1) {
      this.notes.splice(idx, 1);
      this.selectNote(null);
      this.markDirty();
      this.saveMapState();
      this.renderTimeline();
      if (this.soundManager) this.soundManager.playClick();
    }
  }

  /**
   * Saves updated notes array to MapStorage.
   */
  saveMapState() {
    if (this.activeMap && this.mapStorage) {
      // If this is an unmodified default track, never create a copy or save!
      if (!this.isDirty && this.mapStorage.isDefaultTrack(this.activeMap)) {
        return this.activeMap;
      }

      if (this.activeBgConfig) {
        this.activeMap.background = { ...this.activeBgConfig };
      } else {
        this.activeMap.background = null;
      }

      this.activeMap.notes = this.notes.map((n) => {
        const isTriangle = n.type === "triangle" || n.type === "bomb";
        const isDirectional = n.type === "directional" || n.type === "arrow";
        const item = {
          time: parseFloat(Number(n.time || 0).toFixed(3)),
          color: isTriangle ? "yellow" : (n.color === "red" ? "red" : "blue"),
          type: isTriangle ? "triangle" : (isDirectional ? "directional" : "normal"),
          x: parseFloat(Number(n.x !== undefined ? n.x : 0.5).toFixed(3)),
          y: parseFloat(Number(n.y !== undefined ? n.y : 0.5).toFixed(3))
        };
        if (isDirectional) {
          item.angle = typeof n.angle === "number" ? ((Math.round(n.angle) % 360) + 360) % 360 : 0;
        }
        return item;
      });

      const saved = this.mapStorage.saveMap(this.activeMap);
      if (saved) {
        this.activeMap = saved;
        if (this.titleEl) {
          this.titleEl.textContent = `${saved.name} - by ${saved.mapper}`;
        }
        if (this.paramsTypeBadge) {
          const isDef = this.mapStorage.isDefaultTrack(saved);
          this.paramsTypeBadge.textContent = isDef ? "Default Track" : "Custom Track";
          if (isDef) {
            this.paramsTypeBadge.classList.add("is-default");
          } else {
            this.paramsTypeBadge.classList.remove("is-default");
          }
        }
      }

      this.isDirty = false;

      if (this.saveIndicatorEl) {
        this.saveIndicatorEl.textContent = "✓ All changes saved";
        this.saveIndicatorEl.className = "editor-save-tag saved";
      }

      return saved || this.activeMap;
    }
    return this.activeMap;
  }

  /**
   * Launches the current map into real gameplay playtesting.
   */
  testMap() {
    this.pause();
    if (this.isDirty) {
      this.saveMapState();
    }
    this.unbindEvents();

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.audio) {
      this.audio.pause();
    }

    if (this.view) {
      this.view.classList.remove("is-active");
      this.view.setAttribute("aria-hidden", "true");
    }

    if (typeof this.onTestMap === "function") {
      this.onTestMap(
        {
          ...this.activeMap,
          background: this.activeBgConfig ? { ...this.activeBgConfig } : null,
          notes: [...this.notes]
        },
        this.playSpeed || 1.0
      );
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
    const playArea = PlayArea.getMetrics(width, height, 24);

    ctx.clearRect(0, 0, width, height);

    // 1. Draw rhythm arena guide & square play area
    const cx = width / 2;
    const cy = height / 2;
    const s = playArea.size;
    const ox = playArea.offsetX;
    const oy = playArea.offsetY;

    // Draw Custom Track Playfield Background Media (Image or Video) inside square playfield
    if (this.bgMedia && this.activeBgConfig) {
      if (this.bgMediaType === "video") {
        if (this.isPlaying) {
          this.bgMedia.playbackRate = this.playSpeed || 1.0;
          if (this.bgMedia.paused) {
            this.bgMedia.play().catch(() => {});
          }
          if (this.bgMedia.duration > 0 && Math.abs(this.bgMedia.currentTime - (time % this.bgMedia.duration)) > 0.15) {
            try { this.bgMedia.currentTime = time % this.bgMedia.duration; } catch (e) {}
          }
        } else {
          if (!this.bgMedia.paused) {
            try { this.bgMedia.pause(); } catch (e) {}
          }
          if (this.bgMedia.duration > 0 && Math.abs(this.bgMedia.currentTime - (time % this.bgMedia.duration)) > 0.05) {
            try { this.bgMedia.currentTime = time % this.bgMedia.duration; } catch (e) {}
          }
        }
      }
      PlayArea.drawBackgroundMedia(ctx, this.bgMedia, ox, oy, s, this.activeBgConfig.fit || "cover", this.activeBgConfig.opacity !== undefined ? this.activeBgConfig.opacity : 0.7);
    }

    ctx.save();

    // Square play area boundary
    ctx.strokeStyle = "rgba(0, 212, 255, 0.14)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox, oy, s, s);

    // Corner accents
    const cornerLen = Math.min(28, s * 0.07);
    ctx.strokeStyle = "rgba(0, 212, 255, 0.45)";
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

    // Center circular playfield arena guide inside square
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.44, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0, 212, 255, 0.09)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Crosshairs centered in square play area
    ctx.beginPath();
    ctx.moveTo(ox, cy);
    ctx.lineTo(ox + s, cy);
    ctx.moveTo(cx, oy);
    ctx.lineTo(cx, oy + s);
    ctx.strokeStyle = "rgba(0, 212, 255, 0.06)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // 2. Draw placed notes around the current timestamp (window of +/- 1.4s)
    const windowSpan = 1.4;
    const baseRadius = playArea.noteRadius || playArea.bigRadius;
    const triangleRadius = playArea.triangleRadius || (baseRadius * 1.05);

    this.notes.forEach((note) => {
      const timeDiff = note.time - time;

      // Only draw notes close in time to current playback
      if (Math.abs(timeDiff) <= windowSpan) {
        const noteX = playArea.toScreenX(note.x);
        const noteY = playArea.toScreenY(note.y);
        const isTriangle = note.type === "triangle" || note.type === "bomb";
        const isDirectional = note.type === "directional" || note.type === "arrow";
        const colorHex = isTriangle ? "#ffd32a" : (note.color === "red" ? "#ff4757" : "#00d4ff");

        // Proximity factor (1 = exact current time, 0 = at boundary)
        const proximity = Math.max(0, 1 - Math.abs(timeDiff) / windowSpan);
        const radius = isTriangle ? triangleRadius : baseRadius;

        ctx.save();
        ctx.globalAlpha = 0.3 + proximity * 0.7;

        if (isTriangle) {
          // Draw Triangle Bomb Note in editor
          const topX = noteX;
          const topY = noteY - radius;
          const brX = noteX + radius * Math.cos(Math.PI / 6);
          const brY = noteY + radius * Math.sin(Math.PI / 6);
          const blX = noteX - radius * Math.cos(Math.PI / 6);
          const blY = noteY + radius * Math.sin(Math.PI / 6);

          ctx.beginPath();
          ctx.moveTo(topX, topY);
          ctx.lineTo(brX, brY);
          ctx.lineTo(blX, blY);
          ctx.closePath();

          ctx.strokeStyle = Math.abs(timeDiff) < 0.1 ? "#ff4757" : "#ffd32a";
          ctx.lineWidth = Math.abs(timeDiff) < 0.1 ? 4 : 2.5;
          ctx.fillStyle = "rgba(255, 165, 2, 0.35)";

          if (Math.abs(timeDiff) < 0.1) {
            ctx.shadowColor = "#ff4757";
            ctx.shadowBlur = 20;
          }

          ctx.fill();
          ctx.stroke();

          // Exclamation mark / BOMB label
          ctx.font = `bold ${Math.max(10, Math.round(radius * 0.5))}px monospace`;
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("!", noteX, noteY + 3);

          ctx.font = `bold ${Math.max(8, Math.round(radius * 0.35))}px monospace`;
          ctx.fillStyle = "rgba(255, 211, 42, 0.9)";
          ctx.fillText(`${note.time}s`, noteX, noteY + radius + 11);
        } else if (isDirectional) {
          // Directional Note (red/blue circle with arrow and thicker stroke on required hit side)
          ctx.beginPath();
          ctx.arc(noteX, noteY, radius, 0, Math.PI * 2);
          ctx.strokeStyle = colorHex;
          ctx.lineWidth = Math.abs(timeDiff) < 0.1 ? 3.5 : 2;
          ctx.fillStyle = note.color === "red" ? "rgba(255, 71, 87, 0.3)" : "rgba(0, 212, 255, 0.3)";

          if (Math.abs(timeDiff) < 0.1) {
            ctx.shadowColor = colorHex;
            ctx.shadowBlur = 20;
          }

          ctx.fill();
          ctx.stroke();

          // Thicker stroke on required hit side (arc along note.angle)
          const rad = ((note.angle || 0) * Math.PI) / 180;
          ctx.beginPath();
          ctx.arc(noteX, noteY, radius, rad - Math.PI / 3, rad + Math.PI / 3);
          ctx.strokeStyle = colorHex;
          ctx.lineWidth = Math.abs(timeDiff) < 0.1 ? 6.5 : 4.5;
          ctx.shadowColor = colorHex;
          ctx.shadowBlur = 15;
          ctx.stroke();

          // Arrow pointing in direction note.angle
          const shaftLen = radius * 0.55;
          const sx = noteX - Math.cos(rad) * radius * 0.45;
          const sy = noteY - Math.sin(rad) * radius * 0.45;
          const ex = noteX + Math.cos(rad) * shaftLen;
          const ey = noteY + Math.sin(rad) * shaftLen;

          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 3.2;
          ctx.stroke();

          // Arrow head
          const headLen = radius * 0.4;
          const headAngle = Math.PI / 5.5;
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(ex - Math.cos(rad - headAngle) * headLen, ey - Math.sin(rad - headAngle) * headLen);
          ctx.lineTo(ex - Math.cos(rad + headAngle) * headLen, ey - Math.sin(rad + headAngle) * headLen);
          ctx.closePath();
          ctx.fillStyle = "#ffffff";
          ctx.fill();

          // Labels
          ctx.font = `bold ${Math.max(8, Math.round(radius * 0.35))}px monospace`;
          ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(`${note.angle || 0}°`, noteX, noteY - radius - 8);

          ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
          ctx.fillText(`${note.time}s`, noteX, noteY + radius + 10);
        } else {
          // Normal round note
          ctx.beginPath();
          ctx.arc(noteX, noteY, radius, 0, Math.PI * 2);
          ctx.strokeStyle = colorHex;
          ctx.lineWidth = Math.abs(timeDiff) < 0.1 ? 4 : 2;
          ctx.fillStyle = note.color === "red" ? "rgba(255, 71, 87, 0.3)" : "rgba(0, 212, 255, 0.3)";

          if (Math.abs(timeDiff) < 0.1) {
            ctx.shadowColor = colorHex;
            ctx.shadowBlur = 20;
          }

          ctx.fill();
          ctx.stroke();

          ctx.font = `bold ${Math.max(9, Math.round(radius * 0.38))}px monospace`;
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(note.color.toUpperCase(), noteX, noteY - 3);

          ctx.font = `bold ${Math.max(8, Math.round(radius * 0.35))}px monospace`;
          ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
          ctx.fillText(`${note.time}s`, noteX, noteY + 9);
        }

        ctx.restore();
      }
    });

    // 3. Interactive Directional Note Drag-Placement Preview (when dragging to set angle)
    if (this.isPlacingDirectional && this.directionalDragStart) {
      const startX = this.directionalDragStart.canvasX;
      const startY = this.directionalDragStart.canvasY;
      const curX = this.mouse.x;
      const curY = this.mouse.y;
      const angle = this.directionalCurrentAngle;
      const rad = (angle * Math.PI) / 180;
      const radius = baseRadius;
      const isRed = this.directionalDragStart.button === 0;
      const colorHex = isRed ? "#ff4757" : "#00d4ff";

      ctx.save();

      // Dotted drag guide line from start center to mouse cursor
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(curX, curY);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Drag target circle
      ctx.beginPath();
      ctx.arc(startX, startY, radius, 0, Math.PI * 2);
      ctx.fillStyle = isRed ? "rgba(255, 71, 87, 0.35)" : "rgba(0, 212, 255, 0.35)";
      ctx.strokeStyle = colorHex;
      ctx.lineWidth = 2.5;
      ctx.fill();
      ctx.stroke();

      // Thicker stroke on required hit side (arc along angle)
      ctx.beginPath();
      ctx.arc(startX, startY, radius, rad - Math.PI / 3, rad + Math.PI / 3);
      ctx.strokeStyle = colorHex;
      ctx.lineWidth = 6;
      ctx.shadowColor = colorHex;
      ctx.shadowBlur = 18;
      ctx.stroke();

      // Arrow
      const shaftLen = radius * 0.55;
      const sx = startX - Math.cos(rad) * radius * 0.45;
      const sy = startY - Math.sin(rad) * radius * 0.45;
      const ex = startX + Math.cos(rad) * shaftLen;
      const ey = startY + Math.sin(rad) * shaftLen;

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3.5;
      ctx.stroke();

      const headLen = radius * 0.42;
      const headAngle = Math.PI / 5.5;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - Math.cos(rad - headAngle) * headLen, ey - Math.sin(rad - headAngle) * headLen);
      ctx.lineTo(ex - Math.cos(rad + headAngle) * headLen, ey - Math.sin(rad + headAngle) * headLen);
      ctx.closePath();
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      // Floating angle badge beside cursor
      ctx.font = "bold 12px monospace";
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = colorHex;
      ctx.shadowBlur = 8;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`${angle}°`, curX + 14, curY - 10);

      ctx.restore();
    }

    // 4. Draw cursor placement reticle (both while paused and during live music playback)
    if (this.mouse.isHovering && !this.isPlacingDirectional) {
      const mx = this.mouse.x;
      const my = this.mouse.y;
      const isBombTool = this.activeTool === "bomb";
      const isDirectionalTool = this.activeTool === "directional";
      const liveBadge = this.isPlaying ? `[LIVE ${this.currentTime.toFixed(1)}s] ` : "[Click] ";

      ctx.save();

      if (isBombTool) {
        // Bomb Hazard Placement Reticle: glowing yellow dashed triangle
        const r = triangleRadius;
        const topX = mx;
        const topY = my - r;
        const brX = mx + r * Math.cos(Math.PI / 6);
        const brY = my + r * Math.sin(Math.PI / 6);
        const blX = mx - r * Math.cos(Math.PI / 6);
        const blY = my + r * Math.sin(Math.PI / 6);

        ctx.beginPath();
        ctx.moveTo(topX, topY);
        ctx.lineTo(brX, brY);
        ctx.lineTo(blX, blY);
        ctx.closePath();

        ctx.strokeStyle = "#ffd32a";
        ctx.lineWidth = 1.8;
        ctx.setLineDash([4, 4]);
        ctx.fillStyle = "rgba(255, 211, 42, 0.18)";
        ctx.shadowColor = "#ffd32a";
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.stroke();

        // Crosshair / warning symbol at center
        ctx.setLineDash([]);
        ctx.font = `bold ${Math.max(10, Math.round(r * 0.52))}px monospace`;
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("!", mx, my + 3);

        // Text hints beside cursor
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#ffd32a";
        ctx.shadowBlur = 6;
        ctx.fillText(`${liveBadge}PLACE BOMB`, mx + r + 10, my - 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
        ctx.shadowBlur = 0;
        ctx.fillText(this.isPlaying ? "Recording live on beat" : "Hazard note (avoid)", mx + r + 10, my + 13);
      } else if (isDirectionalTool) {
        // Directional Note Reticle
        const reticleRadius = baseRadius;
        ctx.beginPath();
        ctx.arc(mx, my, reticleRadius, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(56, 189, 248, 0.85)";
        ctx.lineWidth = 1.8;
        ctx.setLineDash([4, 4]);
        ctx.stroke();

        // Crosshair center dot
        ctx.beginPath();
        ctx.arc(mx, my, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#38bdf8";
        ctx.fill();

        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#38bdf8";
        const dragBadge = this.isPlaying ? `[LIVE ${this.currentTime.toFixed(1)}s] ` : "[Press & Drag] ";
        ctx.fillText(`${dragBadge}DIRECTIONAL NOTE`, mx + reticleRadius + 8, my - 5);
        ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
        ctx.fillText("Drag to set angle (0-360°)", mx + reticleRadius + 8, my + 11);
      } else {
        // Normal Note Placement Reticle: glowing dashed circle
        const reticleRadius = baseRadius;
        ctx.beginPath();
        ctx.arc(mx, my, reticleRadius, 0, Math.PI * 2);
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
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#ff4757";
        ctx.fillText(`${liveBadge}RED NOTE`, mx + reticleRadius + 8, my - 5);
        ctx.fillStyle = "#00d4ff";
        const rightBadge = this.isPlaying ? `[LIVE ${this.currentTime.toFixed(1)}s] ` : "[Right Click] ";
        ctx.fillText(`${rightBadge}BLUE NOTE`, mx + reticleRadius + 8, my + 11);
      }

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
    if (this._isClosing) return;
    this._isClosing = true;

    try {
      this.pause();
      if (this.isDirty) {
        this.saveMapState();
      }
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

      if (this.bgMedia && this.bgMediaType === "video") {
        try {
          this.bgMedia.pause();
          this.bgMedia.src = "";
        } catch (e) {}
      }
      this.bgMedia = null;
      this.bgMediaType = null;
      this.activeBgConfig = null;

      if (this.view) {
        this.view.classList.remove("is-active");
        this.view.setAttribute("aria-hidden", "true");
      }

      if (typeof this.onExit === "function") {
        this.onExit();
      }
    } finally {
      this._isClosing = false;
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

// Static cache for precomputed and dynamically decoded audio waveforms
MapEditor.waveformCache = new Map();
MapEditor.audioCtx = null;

// Expose to window / global
if (typeof window !== "undefined") {
  window.MapEditor = MapEditor;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = MapEditor;
}

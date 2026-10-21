/**
 * @file playMenu.js
 * @description osu!-Inspired Song Selection Menu for Project Alpha Plus.
 * Features:
 * - Large song list on the left with compact horizontal rows (cover thumb, title, artist, mapper, difficulty badge, NPS, duration, personal best).
 * - Prominent selected-song showcase on the right with full-bleed artwork background, dark translucent overlay, hero typography, metadata grid, and "Play Track" CTA.
 * - Looped music preview on hover; smooth click selection.
 * - Double-click on song row launches track immediately.
 * - Full keyboard navigation: ArrowUp, ArrowDown to navigate; Enter to launch track; Escape to return to main menu.
 * - Auto-scrolls list to keep the highlighted/selected track visible.
 */

class PlayMenu {
  /**
   * @param {Object} dependencies
   * @param {SoundManager} dependencies.soundManager
   * @param {MusicPlayer} dependencies.musicPlayer
   * @param {MapStorage} dependencies.mapStorage
   * @param {Array} dependencies.songs
   * @param {Function} dependencies.onStartTrack
   */
  constructor({ soundManager, musicPlayer, mapStorage = null, songs = [], onStartTrack = null, onEditSongParams = null }) {
    this.soundManager = soundManager;
    this.musicPlayer = musicPlayer;
    this.mapStorage = mapStorage;
    this.songs = songs;
    this.onStartTrack = onStartTrack;
    this.onEditSongParams = onEditSongParams;

    this.selectedSong = null;
    this.selectedIndex = -1;
    this.hoveredSong = null;
    this.selectedDifficulty = null;

    // DOM Elements
    this.view = document.getElementById("play-menu-view");
    this.mainMenuCard = document.getElementById("main-menu-card");
    this.backBtn = document.getElementById("btn-back-menu");
    this.songListContainer = document.getElementById("song-list-container");
    this.songDetailsContainer = document.getElementById("song-details-container");

    this.boundKeyDown = this.onKeyDown.bind(this);
  }

  /**
   * Initializes the Play Menu view, renders cards, and sets up listeners.
   */
  init() {
    this.renderSongList();
    this.bindEvents();
    if (this.songs && this.songs.length > 0) {
      const activeId = (this.mapStorage && this.mapStorage.getSelectedSongId()) || null;
      let targetIdx = activeId ? this.songs.findIndex((s) => s.id === activeId) : -1;
      let persist = true;
      if (targetIdx === -1) {
        targetIdx = 0;
        persist = !activeId; // Don't overwrite saved activeId if custom maps are still loading
      }
      this.selectSongByIndex(targetIdx, false, false, persist);
    } else {
      this.renderDefaultDetails();
    }
  }

  /**
   * Updates song catalog list and re-renders cards.
   * @param {Array} newSongs
   */
  updateSongs(newSongs) {
    if (Array.isArray(newSongs)) {
      this.songs = newSongs;
      const activeId = (this.mapStorage && this.mapStorage.getSelectedSongId()) || (this.selectedSong ? this.selectedSong.id : null);
      this.renderSongList();

      if (this.songs.length > 0) {
        let targetIdx = activeId ? this.songs.findIndex((s) => s.id === activeId) : -1;
        let persist = true;
        if (targetIdx === -1) {
          targetIdx = (this.selectedIndex >= 0 && this.selectedIndex < this.songs.length) ? this.selectedIndex : 0;
          persist = !activeId;
        }
        // Never play preview audio or click sound during background updates
        this.selectSongByIndex(targetIdx, false, false, persist);
      } else {
        this.selectedSong = null;
        this.selectedIndex = -1;
        this.renderDefaultDetails();
      }
    }
  }

  /**
   * Renders the song list on the left side of the screen in compact osu!-style rows.
   */
  renderSongList() {
    if (!this.songListContainer) return;

    this.songListContainer.innerHTML = "";

    if (!this.songs || this.songs.length === 0) {
      const loadErrors = this.mapStorage ? this.mapStorage.getLoadErrors() : [];
      const errorHtml = loadErrors.length > 0
        ? `
          <div class="empty-state-errors" style="margin-top: 12px; padding: 10px 14px; background: rgba(149, 65, 50, 0.12); border: 1px solid var(--color-primary, #954132); border-radius: 8px; font-size: 0.82rem; text-align: left; max-width: 380px;">
            <div style="font-weight: 700; color: var(--color-primary, #954132); margin-bottom: 6px;">⚠️ Loading Diagnostics:</div>
            <ul style="margin: 0; padding-left: 18px; color: var(--color-secondary, #322214);">
              ${loadErrors.map(e => `<li><strong>${e.file}</strong>: ${e.error}</li>`).join("")}
            </ul>
          </div>
        `
        : "";

      const isFileProtocol = typeof window !== "undefined" && window.location && window.location.protocol === "file:";
      const fileProtocolHint = isFileProtocol
        ? `
          <p style="font-size: 0.8rem; opacity: 0.85; margin-top: 8px;">
            Note: Browsers block direct file loading when opened as <code>file:///</code>. Run a local web server (e.g. <code>npx serve</code>, Live Server) or select the folder below:
          </p>
        `
        : "";

      const tracksFolder = (this.mapStorage && this.mapStorage.getDefaultTracksPath()) || "Default Tracks";
      const emptyState = document.createElement("div");
      emptyState.className = "song-list-empty";
      emptyState.innerHTML = `
        <div class="empty-state-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        </div>
        <h4 class="empty-state-title">No Tracks Available</h4>
        <p class="empty-state-desc">
          Place exported song files into the <code>${tracksFolder}</code> folder or create a new map in the <strong>Create</strong> menu.
        </p>
        ${fileProtocolHint}
        ${errorHtml}
        <div class="empty-state-actions" style="margin-top: 14px;">
          <label class="btn-theme-action" style="cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 6px; font-weight: 600; font-size: 0.85rem; background: var(--color-primary, #954132); color: #fff;">
            <span>📁 Load ${tracksFolder} Folder</span>
            <input type="file" class="empty-folder-input" webkitdirectory directory multiple style="display: none;">
          </label>
        </div>
      `;

      const folderInput = emptyState.querySelector(".empty-folder-input");
      if (folderInput) {
        folderInput.addEventListener("change", async (e) => {
          if (e.target.files && e.target.files.length > 0 && this.mapStorage) {
            await this.mapStorage.loadTracksFromFiles(e.target.files);
            this.updateSongs(this.mapStorage.getAllMaps());
          }
        });
      }

      this.songListContainer.appendChild(emptyState);
      return;
    }

    this.songs.forEach((song, idx) => {
      const card = document.createElement("article");
      card.className = "song-card";
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("data-song-id", song.id);
      card.setAttribute("data-song-index", idx);
      card.style.setProperty("--song-accent-color", song.color || "var(--color-accent)");

      const coverSrc = song.cover || "Assets/Tracks Placeholders/Default-0.png";
      const songDiffs = (this.mapStorage && this.mapStorage.getSongDifficulties(song)) || song.difficulties || {};
      const diffKeys = Object.keys(songDiffs);
      const diffBadgeText = diffKeys.length > 1
        ? `${diffKeys.length} Difficulties`
        : (diffKeys[0] || song.difficulty || "Normal");
      const primaryDiffKey = song.selectedDifficulty && songDiffs[song.selectedDifficulty]
        ? song.selectedDifficulty
        : (diffKeys[0] || song.difficulty || "Normal");
      const badgeColor = this.getDifficultyColor(primaryDiffKey, song.color);

      const bestScore = this.mapStorage ? this.mapStorage.getBestScore(song.id, primaryDiffKey) : 0;
      const bestScoreLabel = bestScore > 0 ? `PB: ${bestScore.toLocaleString()}` : "Unplayed";

      card.innerHTML = `
        <div class="song-card-drag-wrapper" style="display: flex; align-items: center; padding-left: 6px;">
          <span class="drag-handle song-card-drag-handle" draggable="true" title="Drag to reorder song" aria-label="Drag to reorder song">&#x22EE;&#x22EE;</span>
        </div>
        <div class="song-card-thumb-wrapper">
          <img class="song-card-thumb" src="${coverSrc}" alt="${song.name}" loading="lazy">
        </div>
        <div class="song-card-main">
          <div class="song-card-header-row">
            <span class="song-card-name" title="${song.name}">${song.name}</span>
            <span class="song-card-diff-badge" style="border-color: ${badgeColor}; color: ${badgeColor};">
              ${diffBadgeText}
            </span>
          </div>
          <div class="song-card-sub-row">
            <span class="song-card-artist" title="${song.creator}">${song.creator || "Unknown Artist"}</span>
            <span class="song-card-mapper" title="Mapped by ${song.mapper}">// ${song.mapper || "Anonymous"}</span>
          </div>
          <div class="song-card-stats-row">
            <span class="song-card-stat-pill nps">${this.getSongNps(song)} NPS</span>
            <span class="song-card-stat-pill duration">${song.duration || "03:00"}</span>
            <span class="song-card-stat-pill score ${bestScore > 0 ? 'has-score' : ''}">${bestScoreLabel}</span>
          </div>
        </div>
      `;

      // Song drag-and-drop listeners
      const songDragHandle = card.querySelector(".song-card-drag-handle");
      if (songDragHandle) {
        songDragHandle.addEventListener("dragstart", (e) => {
          e.stopPropagation();
          e.dataTransfer.setData("application/json", JSON.stringify({ type: "song", id: song.id }));
          e.dataTransfer.effectAllowed = "move";
          card.classList.add("is-dragging");
        });
        songDragHandle.addEventListener("dragend", () => {
          card.classList.remove("is-dragging");
          this.songListContainer.querySelectorAll(".song-card").forEach((c) => {
            c.classList.remove("drop-target-before", "drop-target-after");
          });
        });
      }

      card.addEventListener("dragover", (e) => {
        const draggingEl = this.songListContainer.querySelector(".song-card.is-dragging");
        if (!draggingEl || draggingEl === card) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = card.getBoundingClientRect();
        const isBefore = e.clientY < rect.top + rect.height / 2;
        card.classList.toggle("drop-target-before", isBefore);
        card.classList.toggle("drop-target-after", !isBefore);
      });

      card.addEventListener("dragleave", (e) => {
        if (!card.contains(e.relatedTarget)) {
          card.classList.remove("drop-target-before", "drop-target-after");
        }
      });

      card.addEventListener("drop", (e) => {
        const draggingEl = this.songListContainer.querySelector(".song-card.is-dragging");
        if (!draggingEl || draggingEl === card) return;
        e.preventDefault();
        card.classList.remove("drop-target-before", "drop-target-after");

        let data = null;
        try {
          data = JSON.parse(e.dataTransfer.getData("application/json"));
        } catch (err) {}

        if (data && data.type === "song" && data.id !== song.id) {
          const rect = card.getBoundingClientRect();
          const isBefore = e.clientY < rect.top + rect.height / 2;
          if (isBefore) {
            this.songListContainer.insertBefore(draggingEl, card);
          } else {
            this.songListContainer.insertBefore(draggingEl, card.nextSibling);
          }
          const newOrder = Array.from(this.songListContainer.querySelectorAll(".song-card"))
            .map((c) => c.getAttribute("data-song-id"))
            .filter(Boolean);
          if (this.mapStorage && typeof this.mapStorage.reorderSongs === "function") {
            this.mapStorage.reorderSongs(newOrder);
          }
          if (this.soundManager) this.soundManager.playClick();
          this.updateSongs(this.mapStorage.getAllMaps());
        }
      });

      // Hover: display preview details without playing music
      card.addEventListener("mouseenter", () => {
        this.handleSongHover(song, card);
      });

      // Click: select song, stop previous music, and start playing this song
      card.addEventListener("click", () => {
        this.selectSongByIndex(idx, true, true);
      });

      // Double-click: immediately start game
      card.addEventListener("dblclick", () => {
        this.selectSongByIndex(idx, false, false);
        this.launchCurrentSong();
      });

      // Keyboard accessibility (Enter / Space)
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.launchCurrentSong();
        } else if (e.key === " ") {
          e.preventDefault();
          this.selectSongByIndex(idx, true, true);
        }
      });

      this.songListContainer.appendChild(card);
    });

    this.updateActiveCardHighlight();
  }

  /**
   * Binds navigation and container events.
   */
  bindEvents() {
    // Back button
    if (this.backBtn) {
      this.backBtn.addEventListener("click", () => {
        if (this.soundManager) this.soundManager.playClick();
        this.close();
      });
    }

    // Leaving the song list: stop preview or restore selected song
    if (this.songListContainer) {
      this.songListContainer.addEventListener("mouseleave", () => {
        this.handleListLeave();
      });
    }

    // Import Song via native dialog or file input
    const nativeImportBtn = document.getElementById("btn-play-import-native");
    const importInput = document.getElementById("play-song-import-input");

    if (nativeImportBtn) {
      nativeImportBtn.addEventListener("click", async (e) => {
        if (window.electronAPI && typeof window.electronAPI.importSongFile === "function") {
          e.preventDefault();
          if (this.soundManager) this.soundManager.playClick();
          const res = await window.electronAPI.importSongFile();
          if (res && res.success && res.content) {
            await this.importSongContent(res.content);
          }
          return;
        }
        if (importInput) importInput.click();
      });
    }

    if (importInput) {
      importInput.addEventListener("change", async (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          try {
            const text = await file.text();
            await this.importSongContent(text);
          } catch (err) {
            alert("Failed to read song file: " + err.message);
          }
          importInput.value = "";
        }
      });
    }

    // Open Mod Downloader Modal
    const openDownloaderBtn = document.getElementById("btn-open-downloader");
    if (openDownloaderBtn) {
      openDownloaderBtn.addEventListener("click", () => {
        if (this.soundManager) this.soundManager.playClick();
        if (window.modDownloader && typeof window.modDownloader.open === "function") {
          window.modDownloader.open();
        }
      });
    }

    // Open Custom Songs folder button
    const openCustomSongsBtn = document.getElementById("btn-open-custom-songs");
    if (openCustomSongsBtn) {
      openCustomSongsBtn.addEventListener("click", () => {
        if (this.soundManager) this.soundManager.playClick();
        if (window.electronAPI && typeof window.electronAPI.openFolder === "function") {
          window.electronAPI.openFolder("songs");
        }
      });
    }

    // Link / Open Default Tracks Folder button in header
    const linkFolderBtn = document.getElementById("btn-link-default-tracks");
    if (linkFolderBtn) {
      linkFolderBtn.addEventListener("click", async () => {
        if (this.soundManager) this.soundManager.playClick();
        if (window.electronAPI && typeof window.electronAPI.openFolder === "function") {
          window.electronAPI.openFolder("default-tracks");
          return;
        }
        if (this.mapStorage && typeof this.mapStorage.linkDefaultTracksDirectory === "function") {
          try {
            const tracks = await this.mapStorage.linkDefaultTracksDirectory();
            if (tracks && tracks.length > 0) {
              this.updateSongs(this.mapStorage.getAllMaps());
              alert(`Successfully linked Default Tracks folder! Loaded ${tracks.length} track(s).`);
            }
          } catch (err) {
            alert("Could not link folder: " + err.message);
          }
        }
      });
    }

    // Drag-and-drop song files directly onto Play Menu
    if (this.view) {
      this.view.addEventListener("dragover", (e) => {
        if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes("Files")) {
          e.preventDefault();
          e.stopPropagation();
          this.view.classList.add("is-dragover");
        }
      });

      this.view.addEventListener("dragleave", (e) => {
        if (!this.view.contains(e.relatedTarget)) {
          this.view.classList.remove("is-dragover");
        }
      });

      this.view.addEventListener("drop", async (e) => {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          this.view.classList.remove("is-dragover");
          const files = Array.from(e.dataTransfer.files).filter((f) => f.name.toLowerCase().endsWith(".json"));
          if (files.length === 0) {
            alert("Please drop a valid .json song file.");
            return;
          }
          let lastImportedId = null;
          for (const f of files) {
            try {
              const text = await f.text();
              const imported = await this.importSongContent(text, false);
              if (imported && imported.id) lastImportedId = imported.id;
            } catch (err) {
              console.error("Drop import failed:", err);
            }
          }
          if (lastImportedId) {
            this.updateSongs(this.mapStorage.getAllMaps());
            this.selectSongById(lastImportedId, true, true);
          }
        }
      });
    }

    // Window keyboard listener for ArrowUp, ArrowDown, Enter, Escape
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("keydown", this.boundKeyDown);
    }
  }

  /**
   * Parses, validates, and imports raw song code or JSON string, then selects it.
   * @param {string} rawString
   * @param {boolean} updateUi
   * @returns {Promise<Object|null>}
   */
  async importSongContent(rawString, updateUi = true) {
    if (!this.mapStorage) return null;
    const validation = this.mapStorage.validateAndParseTrackCode(rawString);
    if (!validation.valid || (!validation.song && !validation.track)) {
      alert("Invalid song file: " + (validation.error || "Malformed song structure."));
      return null;
    }
    const songData = validation.song || validation.track;
    const imported = await this.mapStorage.importTrackAsync(songData);
    if (updateUi) {
      this.updateSongs(this.mapStorage.getAllMaps());
      this.selectSongById(imported.id, true, true);
      if (this.soundManager) this.soundManager.playClick();
    }
    return imported;
  }

  /**
   * Keyboard listener for osu!-style navigation.
   * @param {KeyboardEvent} e
   */
  onKeyDown(e) {
    if (!this.isOpen()) return;

    // Ignore keyboard nav when typing inside an input or textarea
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.isContentEditable)) {
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      this.close();
      return;
    }

    if (!this.songs || this.songs.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.selectNextSong();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.selectPreviousSong();
    } else if (e.key === "Enter") {
      e.preventDefault();
      this.launchCurrentSong();
    }
  }

  /**
   * Selects the next song in the list.
   * Browsing via arrow keys does not autoplay music.
   */
  selectNextSong() {
    if (!this.songs || this.songs.length === 0) return;
    const nextIdx = (this.selectedIndex + 1) % this.songs.length;
    this.selectSongByIndex(nextIdx, true, false);
  }

  /**
   * Selects the previous song in the list.
   * Browsing via arrow keys does not autoplay music.
   */
  selectPreviousSong() {
    if (!this.songs || this.songs.length === 0) return;
    const prevIdx = (this.selectedIndex - 1 + this.songs.length) % this.songs.length;
    this.selectSongByIndex(prevIdx, true, false);
  }

  /**
   * Helper to resolve accent color for a difficulty tier.
   * @param {string} diffName
   * @param {string} fallbackColor
   * @returns {string}
   */
  getDifficultyColor(diffName, fallbackColor = "var(--color-accent)") {
    const lower = String(diffName || "").toLowerCase();
    if (lower.includes("easy")) return "#00e676";
    if (lower.includes("normal") || lower.includes("standard")) return "#00d4ff";
    if (lower.includes("hard")) return "#ff9100";
    if (lower.includes("expert") || lower.includes("insane") || lower.includes("master")) return "#ff1744";
    return fallbackColor || "var(--color-accent)";
  }

  /**
   * Returns whether a song is actively playing preview audio.
   * @param {Object} song
   * @returns {boolean}
   */
  isSongPlaying(song) {
    if (!song || !this.musicPlayer) return false;
    const isPlaying = typeof this.musicPlayer.isPlaying === "function"
      ? this.musicPlayer.isPlaying()
      : Boolean(this.musicPlayer.currentAudio && !this.musicPlayer.currentAudio.paused);
    return Boolean(isPlaying && this.musicPlayer.currentSongId === song.id);
  }

  /**
   * Selects song by index and scrolls card into view.
   * Only plays audio if explicitly requested (playMusic = true).
   * Stops current song when another song is selected or when playMusic is false.
   * @param {number} idx
   * @param {boolean} playSound
   * @param {boolean} playMusic
   * @param {boolean} persistSelection
   */
  selectSongByIndex(idx, playSound = true, playMusic = false, persistSelection = true) {
    if (!this.songs || idx < 0 || idx >= this.songs.length) return;

    const previousSongId = this.selectedSong ? this.selectedSong.id : null;
    this.selectedIndex = idx;
    this.selectedSong = this.songs[idx];

    if (persistSelection && this.selectedSong && this.mapStorage) {
      this.mapStorage.setSelectedSongId(this.selectedSong.id);
    }

    // Synchronize difficulty selection to one of this song's mapped difficulties
    const diffs = (this.mapStorage && this.mapStorage.getSongDifficulties(this.selectedSong)) || this.selectedSong.difficulties || {};
    const avail = Object.keys(diffs);
    if (!this.selectedDifficulty || !avail.includes(this.selectedDifficulty)) {
      this.selectedDifficulty = this.selectedSong.selectedDifficulty || this.selectedSong.difficulty || avail[0] || "Normal";
    }

    if (playSound && this.soundManager) {
      this.soundManager.playClick();
    }

    // Stop current song when another song is selected
    if (this.musicPlayer && previousSongId && previousSongId !== this.selectedSong.id) {
      this.musicPlayer.stop();
    }

    // STRICT CHECK: Only play music preview if explicitly requested AND the play menu is actively open on screen!
    if (playMusic) {
      if (this.musicPlayer && this.isOpen()) {
        this.musicPlayer.playPreview(this.selectedSong);
      }
    } else {
      // If playMusic is false and we selected a different song, ensure audio is stopped
      if (this.musicPlayer && previousSongId && previousSongId !== this.selectedSong.id) {
        this.musicPlayer.stop();
      }
    }

    this.updateActiveCardHighlight();
    this.renderSelectedSongDetails(this.selectedSong);

    // Auto-scroll card into view smoothly (only when play menu is open)
    if (this.songListContainer && this.isOpen()) {
      const activeCard = this.songListContainer.querySelector(`.song-card[data-song-index="${idx}"]`);
      if (activeCard && typeof activeCard.scrollIntoView === "function") {
        activeCard.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }

  /**
   * Selects a song by unique song ID.
   * @param {string} songId
   * @param {boolean} playSound
   * @param {boolean} playMusic
   */
  selectSongById(songId, playSound = false, playMusic = false) {
    if (!songId || !this.songs || !this.songs.length) return;
    const idx = this.songs.findIndex((s) => s.id === songId);
    if (idx !== -1) {
      this.selectSongByIndex(idx, playSound, playMusic, true);
    }
  }

  /**
   * Synchronizes `.is-selected` class across all song cards in DOM.
   */
  updateActiveCardHighlight() {
    if (!this.songListContainer) return;
    const cards = this.songListContainer.querySelectorAll(".song-card");
    cards.forEach((card) => {
      const cardIdx = Number(card.getAttribute("data-song-index"));
      if (cardIdx === this.selectedIndex) {
        card.classList.add("is-selected");
      } else {
        card.classList.remove("is-selected");
      }
    });
  }

  /**
   * Handles hovering over a song card.
   * Does NOT autoplay music preview while browsing.
   * @param {Object} song
   * @param {HTMLElement} cardEl
   */
  handleSongHover(song, cardEl) {
    if (!this.isOpen()) return;
    this.hoveredSong = song;

    if (this.soundManager) {
      this.soundManager.playHover();
    }

    // If hovered song is already the selected song, keep showing full view
    if (this.selectedSong && this.selectedSong.id === song.id) {
      this.renderSelectedSongDetails(this.selectedSong);
    } else {
      // Show preview details while keeping rich artwork of hovered track
      this.renderHoverDetails(song);
    }
  }

  /**
   * Handles leaving the song list.
   * Restores selected song details without restarting audio.
   */
  handleListLeave() {
    if (!this.isOpen()) return;
    this.hoveredSong = null;

    if (this.selectedSong) {
      this.renderSelectedSongDetails(this.selectedSong);
    } else {
      this.renderDefaultDetails();
    }
  }

  /**
   * Launches gameplay for currently selected song and chosen difficulty.
   */
  launchCurrentSong() {
    if (!this.selectedSong) return;
    if (this.soundManager) this.soundManager.playClick();
    if (this.musicPlayer) this.musicPlayer.stop();
    if (typeof this.onStartTrack === "function") {
      const diffs = (this.mapStorage && this.mapStorage.getSongDifficulties(this.selectedSong)) || this.selectedSong.difficulties || {};
      const chosenDiff = this.selectedDifficulty || this.selectedSong.difficulty || Object.keys(diffs)[0] || "Normal";
      const diffData = diffs[chosenDiff] || {};
      const activeNotes = diffData.notes || this.selectedSong.notes || [];
      const launchPayload = {
        ...this.selectedSong,
        selectedDifficulty: chosenDiff,
        difficulty: chosenDiff,
        notes: activeNotes,
        nps: diffData.nps !== undefined ? diffData.nps : this.selectedSong.nps
      };
      this.onStartTrack(launchPayload);
    }
  }

  /**
   * Renders hover-only details (title, creator, and preview status with background art).
   * @param {Object} song
   */
  renderHoverDetails(song) {
    if (!this.songDetailsContainer) return;

    const coverSrc = song.cover || "Assets/Tracks Placeholders/Default-0.png";
    const safeCoverUrl = coverSrc ? coverSrc.replace(/'/g, "%27") : "Assets/Tracks Placeholders/Default-0.png";
    const isPlaying = this.isSongPlaying(song);

    this.songDetailsContainer.innerHTML = `
      <div class="selected-song-view hover-mode" style="background-image: url('${safeCoverUrl}');">
        <div class="song-details-backdrop-overlay"></div>
        <div class="song-details-content">
          <div class="song-info-header">
            <span class="preview-mode-tag">Previewing Track</span>
            <div class="song-info-badges">
              <span class="badge-difficulty" style="color: ${song.color || 'var(--color-accent)'}; border-color: ${song.color || 'var(--color-accent)'};">
                ${song.difficulty || "Standard"}
              </span>
              <span class="badge-nps-preview">${this.getSongNps(song)} NPS</span>
              <span class="badge-duration-preview">${song.duration || "03:00"}</span>
            </div>
            <h2 class="song-info-title">${song.name}</h2>
            <p class="song-hover-creator">Music Creator: <strong>${song.creator || "Unknown Artist"}</strong></p>
            <p class="song-hover-mapper">Mapped by: <strong>${song.mapper || "Anonymous"}</strong></p>
          </div>

          <div class="audio-preview-indicator ${isPlaying ? '' : 'is-idle'}">
            <div class="equalizer-bars ${isPlaying ? '' : 'is-paused'}" aria-hidden="true">
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
            </div>
            <span class="preview-status-text">${isPlaying ? 'Playing Preview (Looped)' : 'Click to select & play preview'}</span>
          </div>

          <div class="hover-tip-container">
            <p class="hover-tip-text">Click to select &bull; Double-click or press Enter to launch track</p>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Calculates density (Notes Per Second) dynamically for a song.
   * @param {Object} song
   * @returns {string}
   */
  getSongNps(song) {
    if (!song) return "0.0";
    if (typeof song.nps === "number" && song.nps > 0) {
      return song.nps.toFixed(1);
    }
    const notesCount = (song.notes && song.notes.length) || 0;
    if (notesCount === 0) return "0.0";
    let dur = Number(song.durationSeconds);
    if (!dur || dur <= 0) {
      if (typeof song.duration === "string") {
        const parts = song.duration.split(":");
        if (parts.length === 2) {
          dur = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
        }
      }
    }
    if (!dur || dur <= 0) {
      dur = 180;
    }
    return (notesCount / dur).toFixed(1);
  }

  /**
   * Renders full selected song details with osu!-style background artwork and metadata,
   * including difficulty selector that shows only difficulties with mapped tracks.
   * @param {Object} song
   */
  renderSelectedSongDetails(song) {
    if (!this.songDetailsContainer) return;

    const coverSrc = song.cover || "Assets/Tracks Placeholders/Default-0.png";
    const safeCoverUrl = coverSrc ? coverSrc.replace(/'/g, "%27") : "Assets/Tracks Placeholders/Default-0.png";
    const diffs = (this.mapStorage && this.mapStorage.getSongDifficulties(song)) || song.difficulties || {};
    const availableDiffKeys = Object.keys(diffs);

    if (!availableDiffKeys.includes(this.selectedDifficulty)) {
      this.selectedDifficulty = song.selectedDifficulty || song.difficulty || availableDiffKeys[0] || "Normal";
    }

    const activeDiffData = diffs[this.selectedDifficulty] || { difficulty: this.selectedDifficulty, notes: song.notes || [], nps: song.nps || 0 };
    const activeNotes = activeDiffData.notes || [];
    const notesCount = activeNotes.length;
    const activeNps = this.getSongNps({ ...song, notes: activeNotes, nps: activeDiffData.nps });
    const bestScore = this.mapStorage ? this.mapStorage.getBestScore(song.id, this.selectedDifficulty) : 0;
    const bestScoreDisplay = bestScore > 0 ? bestScore.toLocaleString() : "--";
    const activeDiffColor = this.getDifficultyColor(this.selectedDifficulty, song.color);
    const isPlaying = this.isSongPlaying(song);

    this.songDetailsContainer.innerHTML = `
      <div class="selected-song-view" style="background-image: url('${safeCoverUrl}');">
        <div class="song-details-backdrop-overlay"></div>
        <div class="song-details-content">
          <div class="song-info-header">
            <div class="song-info-badges">
              <span class="badge-difficulty" style="color: ${activeDiffColor}; border-color: ${activeDiffColor};">
                ${this.selectedDifficulty}
              </span>
              <span class="badge-nps-preview">${activeNps} NPS</span>
              <span class="badge-duration-preview">${song.duration || "03:00"}</span>
              <span class="badge-notes-preview">${notesCount} Notes</span>
            </div>
            <h2 class="song-info-title">${song.name}</h2>
            <p class="song-selected-creator">Music Creator: <strong>${song.creator || "Unknown Artist"}</strong></p>

            <!-- Difficulty Track Selector: only shows difficulties that have a mapped track for this song -->
            <div class="song-difficulty-picker" role="radiogroup" aria-label="Select Difficulty Track">
              <span class="diff-picker-label">Difficulty:</span>
              <div class="diff-picker-buttons">
                ${availableDiffKeys.map((diffKey) => {
                  const dData = diffs[diffKey];
                  const dNotes = (dData && dData.notes) ? dData.notes.length : 0;
                  const isSelected = diffKey === this.selectedDifficulty;
                  const dColor = this.getDifficultyColor(diffKey, song.color);
                  return `
                    <button type="button" class="diff-select-btn ${isSelected ? 'is-active' : ''}" data-diff="${diffKey}" style="--diff-color: ${dColor};" aria-pressed="${isSelected}">
                      <span class="drag-handle diff-btn-drag" draggable="true" title="Drag to reorder difficulty" aria-label="Drag to reorder difficulty">&#x22EE;&#x22EE;</span>
                      <span class="diff-btn-dot"></span>
                      <span class="diff-btn-name">${diffKey}</span>
                      <span class="diff-btn-notes">${dNotes} notes</span>
                    </button>
                  `;
                }).join("")}
              </div>
            </div>
          </div>

          <!-- Additional Information Grid -->
          <div class="song-meta-grid">
            <div class="meta-field">
              <span class="meta-label">Mapper</span>
              <span class="meta-value">${song.mapper || "Anonymous"}</span>
            </div>
            <div class="meta-field">
              <span class="meta-label">Length</span>
              <span class="meta-value">${song.duration || "03:00"}</span>
            </div>
            <div class="meta-field">
              <span class="meta-label">Personal Best (${this.selectedDifficulty})</span>
              <span class="meta-value highlight-score">${bestScoreDisplay}</span>
            </div>
            <div class="meta-field">
              <span class="meta-label">Date Added</span>
              <span class="meta-value">${song.date || "Recent"}</span>
            </div>
            <div class="meta-field">
              <span class="meta-label">Density</span>
              <span class="meta-value">${activeNps} NPS</span>
            </div>
            <div class="meta-field">
              <span class="meta-label">Track Type</span>
              <span class="meta-value">${song.isDefault ? "Default Map" : "Custom Map"}</span>
            </div>
          </div>

          <div class="audio-preview-indicator ${isPlaying ? '' : 'is-idle'}">
            <div class="equalizer-bars ${isPlaying ? '' : 'is-paused'}" aria-hidden="true">
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
            </div>
            <span class="preview-status-text">${isPlaying ? 'Preview Playing &bull; Selected' : 'Selected &bull; Click to preview audio'}</span>
          </div>

          <!-- Start Track Action -->
          <div class="song-action-container">
            <div class="selected-status-badge ready">
              <div class="selected-status-textgroup">
                <div class="selected-status-title">Track Ready: ${song.name} [${this.selectedDifficulty}]</div>
                <div class="selected-status-note">Dual Orb System &bull; Press Enter or Click to Play</div>
              </div>
              <div class="selected-status-actions" style="display: flex; gap: 0.65rem; align-items: center; flex-wrap: wrap;">
                <button id="btn-song-edit-params" class="btn-song-params-action" type="button" title="Edit song parameters & metadata">
                  <span>⚙ Parameters</span>
                </button>
                <button id="btn-start-gameplay" class="btn-start-action" type="button">
                  <span>Play Track</span>
                  <span class="btn-arrow">&rarr;</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Connect Difficulty Picker buttons and drag-and-drop
    const diffButtons = this.songDetailsContainer.querySelectorAll(".diff-select-btn");
    diffButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const clickedDiff = btn.getAttribute("data-diff");
        if (clickedDiff && clickedDiff !== this.selectedDifficulty) {
          this.selectedDifficulty = clickedDiff;
          if (this.soundManager) this.soundManager.playClick();
          this.renderSelectedSongDetails(this.selectedSong);
        }
      });

      const diffDrag = btn.querySelector(".diff-btn-drag");
      if (diffDrag) {
        diffDrag.addEventListener("dragstart", (e) => {
          e.stopPropagation();
          e.dataTransfer.setData("application/json", JSON.stringify({ type: "diff", songId: song.id, diffName: btn.getAttribute("data-diff") }));
          e.dataTransfer.effectAllowed = "move";
          btn.classList.add("is-dragging");
        });
        diffDrag.addEventListener("dragend", () => {
          btn.classList.remove("is-dragging");
          this.songDetailsContainer.querySelectorAll(".diff-select-btn").forEach((b) => {
            b.classList.remove("drop-target-h-before", "drop-target-h-after");
          });
        });
      }

      btn.addEventListener("dragover", (e) => {
        const draggingBtn = this.songDetailsContainer.querySelector(".diff-select-btn.is-dragging");
        if (!draggingBtn || draggingBtn === btn) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        const rect = btn.getBoundingClientRect();
        const isBefore = e.clientX < rect.left + rect.width / 2;
        btn.classList.toggle("drop-target-h-before", isBefore);
        btn.classList.toggle("drop-target-h-after", !isBefore);
      });

      btn.addEventListener("dragleave", (e) => {
        if (!btn.contains(e.relatedTarget)) {
          btn.classList.remove("drop-target-h-before", "drop-target-h-after");
        }
      });

      btn.addEventListener("drop", (e) => {
        const draggingBtn = this.songDetailsContainer.querySelector(".diff-select-btn.is-dragging");
        if (!draggingBtn || draggingBtn === btn) return;
        e.preventDefault();
        e.stopPropagation();
        btn.classList.remove("drop-target-h-before", "drop-target-h-after");

        let data = null;
        try {
          data = JSON.parse(e.dataTransfer.getData("application/json"));
        } catch (err) {}

        const targetDiff = btn.getAttribute("data-diff");
        if (data && data.type === "diff" && data.songId === song.id && data.diffName !== targetDiff) {
          const parentBox = btn.parentElement;
          const rect = btn.getBoundingClientRect();
          const isBefore = e.clientX < rect.left + rect.width / 2;
          if (isBefore) {
            parentBox.insertBefore(draggingBtn, btn);
          } else {
            parentBox.insertBefore(draggingBtn, btn.nextSibling);
          }
          const newOrder = Array.from(parentBox.querySelectorAll(".diff-select-btn"))
            .map((b) => b.getAttribute("data-diff"))
            .filter(Boolean);
          if (this.mapStorage && typeof this.mapStorage.reorderDifficulties === "function") {
            this.mapStorage.reorderDifficulties(song.id, newOrder);
          }
          if (this.soundManager) this.soundManager.playClick();
          this.renderSelectedSongDetails(this.selectedSong);
        }
      });
    });

    // Connect Song Parameters button
    const paramsBtn = this.songDetailsContainer.querySelector("#btn-song-edit-params");
    if (paramsBtn) {
      paramsBtn.addEventListener("click", () => {
        if (this.soundManager) this.soundManager.playClick();
        if (typeof this.onEditSongParams === "function") {
          this.onEditSongParams(song);
        }
      });
    }

    // Connect Start Track button
    const startBtn = this.songDetailsContainer.querySelector("#btn-start-gameplay");
    if (startBtn) {
      startBtn.addEventListener("click", () => {
        this.launchCurrentSong();
      });
    }
  }

  /**
   * Renders empty prompt in details panel when nothing is selected or hovered.
   */
  renderDefaultDetails() {
    if (!this.songDetailsContainer) return;

    this.songDetailsContainer.innerHTML = `
      <div class="song-details-empty">
        <div class="song-details-empty-icon">&#9835;</div>
        <h3>Select a Track</h3>
        <p>Use &uarr; &darr; keys or mouse to explore songs. Press Enter or click Play Track to start.</p>
      </div>
    `;
  }

  /**
   * Opens the Play Menu view and hides the main menu.
   */
  open() {
    if (this.musicPlayer) {
      this.musicPlayer.stop();
    }
    if (this.mapStorage && typeof this.mapStorage.getAllMaps === "function") {
      this.updateSongs(this.mapStorage.getAllMaps());
    }
    if (this.mainMenuCard) {
      this.mainMenuCard.style.display = "none";
    }
    if (this.view) {
      this.view.classList.add("is-active");
      this.view.setAttribute("aria-hidden", "false");
    }

    if (this.songs && this.songs.length > 0) {
      const activeId = (this.mapStorage && this.mapStorage.getSelectedSongId()) || (this.selectedSong ? this.selectedSong.id : null);
      let idx = activeId ? this.songs.findIndex((s) => s.id === activeId) : -1;
      if (idx === -1) {
        idx = this.selectedIndex >= 0 ? this.selectedIndex : 0;
      }
      this.selectSongByIndex(idx, false, false);
    }
  }

  /**
   * Closes the Play Menu view, stops preview, and returns to main menu.
   */
  close() {
    if (this.musicPlayer) {
      this.musicPlayer.stop();
    }
    if (this.view) {
      this.view.classList.remove("is-active");
      this.view.setAttribute("aria-hidden", "true");
    }
    if (this.mainMenuCard) {
      this.mainMenuCard.style.display = "";
    }
  }

  /**
   * Hides the Play Menu view without stopping music (used when entering gameplay).
   */
  hideForGame() {
    if (this.view) {
      this.view.classList.remove("is-active");
      this.view.setAttribute("aria-hidden", "true");
    }
  }

  /**
   * Checks if Play Menu is currently open.
   * @returns {boolean}
   */
  isOpen() {
    return this.view ? this.view.classList.contains("is-active") : false;
  }
}

// Expose to window / module
if (typeof window !== "undefined") {
  window.PlayMenu = PlayMenu;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = PlayMenu;
}

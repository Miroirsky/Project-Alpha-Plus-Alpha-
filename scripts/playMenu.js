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
  constructor({ soundManager, musicPlayer, mapStorage = null, songs = [], onStartTrack = null }) {
    this.soundManager = soundManager;
    this.musicPlayer = musicPlayer;
    this.mapStorage = mapStorage;
    this.songs = songs;
    this.onStartTrack = onStartTrack;

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
      this.selectSongByIndex(0, false);
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
      const prevId = this.selectedSong ? this.selectedSong.id : null;
      this.renderSongList();

      if (this.songs.length > 0) {
        let targetIdx = this.songs.findIndex((s) => s.id === prevId);
        if (targetIdx === -1) targetIdx = 0;
        // Never play preview audio or click sound during background updates
        this.selectSongByIndex(targetIdx, false, false);
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
      const emptyState = document.createElement("div");
      emptyState.className = "song-list-empty";
      emptyState.innerHTML = `
        <div class="empty-state-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        </div>
        <h4 class="empty-state-title">No Tracks Available</h4>
        <p class="empty-state-desc">
          Paste exported track codes into <code>scripts/importedTracks.js</code> to load tracks automatically, or build a new map in the <strong>Create</strong> menu.
        </p>
      `;
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

      // Hover: play preview in loop and display preview details
      card.addEventListener("mouseenter", () => {
        this.handleSongHover(song, card);
      });

      // Click: select song, keep music playing, display full metadata
      card.addEventListener("click", () => {
        this.selectSongByIndex(idx, true);
      });

      // Double-click: immediately start game
      card.addEventListener("dblclick", () => {
        this.selectSongByIndex(idx, false);
        this.launchCurrentSong();
      });

      // Keyboard accessibility (Enter / Space)
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.launchCurrentSong();
        } else if (e.key === " ") {
          e.preventDefault();
          this.selectSongByIndex(idx, true);
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

    // Window keyboard listener for ArrowUp, ArrowDown, Enter, Escape
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("keydown", this.boundKeyDown);
    }
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
   */
  selectNextSong() {
    if (!this.songs || this.songs.length === 0) return;
    const nextIdx = (this.selectedIndex + 1) % this.songs.length;
    this.selectSongByIndex(nextIdx, true);
  }

  /**
   * Selects the previous song in the list.
   */
  selectPreviousSong() {
    if (!this.songs || this.songs.length === 0) return;
    const prevIdx = (this.selectedIndex - 1 + this.songs.length) % this.songs.length;
    this.selectSongByIndex(prevIdx, true);
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
   * Selects song by index and scrolls card into view.
   * @param {number} idx
   * @param {boolean} playSound
   * @param {boolean} playPreview
   */
  selectSongByIndex(idx, playSound = true, playPreview = true) {
    if (!this.songs || idx < 0 || idx >= this.songs.length) return;

    this.selectedIndex = idx;
    this.selectedSong = this.songs[idx];

    // Synchronize difficulty selection to one of this song's mapped difficulties
    const diffs = (this.mapStorage && this.mapStorage.getSongDifficulties(this.selectedSong)) || this.selectedSong.difficulties || {};
    const avail = Object.keys(diffs);
    if (!this.selectedDifficulty || !avail.includes(this.selectedDifficulty)) {
      this.selectedDifficulty = this.selectedSong.selectedDifficulty || this.selectedSong.difficulty || avail[0] || "Normal";
    }

    if (playSound && this.soundManager) {
      this.soundManager.playClick();
    }

    // STRICT CHECK: Only play music preview if explicitly requested AND the play menu is actively open on screen!
    if (playPreview && this.musicPlayer && this.isOpen()) {
      this.musicPlayer.playPreview(this.selectedSong);
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
   * Plays music preview in a loop.
   * @param {Object} song
   * @param {HTMLElement} cardEl
   */
  handleSongHover(song, cardEl) {
    if (!this.isOpen()) return;
    this.hoveredSong = song;

    if (this.soundManager) {
      this.soundManager.playHover();
    }

    // Start music preview for this track in a loop (only when menu is open)
    if (this.musicPlayer && this.isOpen()) {
      this.musicPlayer.playPreview(song);
    }

    // If hovered song is already the selected song, keep showing full view
    if (this.selectedSong && this.selectedSong.id === song.id) {
      this.renderSelectedSongDetails(this.selectedSong);
    } else {
      // Show preview badge while keeping rich artwork of hovered track
      this.renderHoverDetails(song);
    }
  }

  /**
   * Handles leaving the song list.
   * Stops preview or restores selected song preview.
   */
  handleListLeave() {
    if (!this.isOpen()) return;
    this.hoveredSong = null;

    if (this.selectedSong) {
      if (this.musicPlayer && this.isOpen()) {
        this.musicPlayer.playPreview(this.selectedSong);
      }
      this.renderSelectedSongDetails(this.selectedSong);
    } else {
      if (this.musicPlayer) {
        this.musicPlayer.stop();
      }
      this.renderDefaultDetails();
    }
  }

  /**
   * Launches gameplay for currently selected song and chosen difficulty.
   */
  launchCurrentSong() {
    if (!this.selectedSong) return;
    if (this.soundManager) this.soundManager.playClick();
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

    this.songDetailsContainer.innerHTML = `
      <div class="selected-song-view hover-mode" style="background-image: url('${coverSrc}');">
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

          <div class="audio-preview-indicator">
            <div class="equalizer-bars" aria-hidden="true">
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
            </div>
            <span class="preview-status-text">Playing Preview (Looped)</span>
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

    this.songDetailsContainer.innerHTML = `
      <div class="selected-song-view" style="background-image: url('${coverSrc}');">
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

          <div class="audio-preview-indicator">
            <div class="equalizer-bars" aria-hidden="true">
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
            </div>
            <span class="preview-status-text">Preview Playing &bull; Selected</span>
          </div>

          <!-- Start Track Action -->
          <div class="song-action-container">
            <div class="selected-status-badge ready">
              <div class="selected-status-textgroup">
                <div class="selected-status-title">Track Ready: ${song.name} [${this.selectedDifficulty}]</div>
                <div class="selected-status-note">Dual Orb System &bull; Press Enter or Click to Play</div>
              </div>
              <button id="btn-start-gameplay" class="btn-start-action" type="button">
                <span>Play Track</span>
                <span class="btn-arrow">&rarr;</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Connect Difficulty Picker buttons
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
    });

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
    if (this.mainMenuCard) {
      this.mainMenuCard.style.display = "none";
    }
    const mainMenuBg = document.getElementById("main-menu-bg");
    if (mainMenuBg) {
      mainMenuBg.style.display = "none";
    }
    if (this.view) {
      this.view.classList.add("is-active");
      this.view.setAttribute("aria-hidden", "false");
    }

    if (this.songs && this.songs.length > 0) {
      const idx = this.selectedIndex >= 0 ? this.selectedIndex : 0;
      this.selectSongByIndex(idx, false, true);
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
    const mainMenuBg = document.getElementById("main-menu-bg");
    if (mainMenuBg) {
      mainMenuBg.style.display = "";
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

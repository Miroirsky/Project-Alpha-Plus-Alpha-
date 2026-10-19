/**
 * @file playMenu.js
 * @description Manages the Song Selection Menu view, song cards with Title/NPS/Duration,
 * hover preview loop (showing only title & creator), and click selection (showing full metadata).
 */

class PlayMenu {
  /**
   * @param {Object} dependencies
   * @param {SoundManager} dependencies.soundManager
   * @param {MusicPlayer} dependencies.musicPlayer
   * @param {Array} dependencies.songs
   * @param {Function} dependencies.onStartTrack
   */
  constructor({ soundManager, musicPlayer, songs = [], onStartTrack = null }) {
    this.soundManager = soundManager;
    this.musicPlayer = musicPlayer;
    this.songs = songs;
    this.onStartTrack = onStartTrack;

    this.selectedSong = null;
    this.hoveredSong = null;

    // DOM Elements
    this.view = document.getElementById("play-menu-view");
    this.mainMenuCard = document.getElementById("main-menu-card");
    this.backBtn = document.getElementById("btn-back-menu");
    this.songListContainer = document.getElementById("song-list-container");
    this.songDetailsContainer = document.getElementById("song-details-container");
  }

  /**
   * Initializes the Play Menu view, renders cards, and sets up listeners.
   */
  init() {
    this.renderSongList();
    this.bindEvents();
    this.renderDefaultDetails();
  }

  /**
   * Updates song catalog list and re-renders cards.
   * @param {Array} newSongs
   */
  updateSongs(newSongs) {
    if (Array.isArray(newSongs)) {
      this.songs = newSongs;
      this.renderSongList();
    }
  }

  /**
   * Renders the song list on the right side of the screen.
   * Displays each song's title, NPS, and duration.
   */
  renderSongList() {
    if (!this.songListContainer) return;

    this.songListContainer.innerHTML = "";

    this.songs.forEach((song) => {
      const card = document.createElement("article");
      card.className = "song-card";
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("data-song-id", song.id);
      card.style.setProperty("--song-accent-color", song.color || "var(--color-accent)");

      // Show title, NPS, and duration
      card.innerHTML = `
        <div class="song-card-main">
          <span class="song-card-name">${song.name}</span>
          <div class="song-card-stats">
            <span class="song-card-nps">${song.nps} NPS</span>
            <span class="song-card-duration">${song.duration || "03:00"}</span>
          </div>
        </div>
      `;

      // Hover: play preview in loop and display only title and creator
      card.addEventListener("mouseenter", () => {
        this.handleSongHover(song, card);
      });

      // Click: select song, keep music playing, display additional info
      card.addEventListener("click", () => {
        this.handleSongClick(song, card);
      });

      // Keyboard accessibility (Enter / Space)
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.handleSongClick(song, card);
        }
      });

      this.songListContainer.appendChild(card);
    });
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

    // Escape key returns to main menu
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isOpen()) {
        this.close();
      }
    });
  }

  /**
   * Handles hovering over a song.
   * On hover: show ONLY song title and music creator, and play its music preview in a loop.
   * Only hovering does NOT select a song.
   * @param {Object} song
   * @param {HTMLElement} cardEl
   */
  handleSongHover(song, cardEl) {
    this.hoveredSong = song;

    if (this.soundManager) {
      this.soundManager.playHover();
    }

    // Start music preview for this track in a loop
    if (this.musicPlayer) {
      this.musicPlayer.playPreview(song);
    }

    // If this hovered song is already the selected song, render its full view
    if (this.selectedSong && this.selectedSong.id === song.id) {
      this.renderSelectedSongDetails(this.selectedSong);
    } else {
      // Hovering an unselected song: show ONLY title and music creator
      this.renderHoverDetails(song);
    }
  }

  /**
   * Handles leaving the song list.
   * Stops preview when hovering another song or leaving the list.
   */
  handleListLeave() {
    this.hoveredSong = null;

    if (this.selectedSong) {
      // Return to selected song's music and full information
      if (this.musicPlayer) {
        this.musicPlayer.playPreview(this.selectedSong);
      }
      this.renderSelectedSongDetails(this.selectedSong);
    } else {
      // No song selected: stop preview completely
      if (this.musicPlayer) {
        this.musicPlayer.stop();
      }
      this.renderDefaultDetails();
    }
  }

  /**
   * Handles clicking a song card.
   * On click: select the song, keep its music playing, and display additional info
   * (mapper, creation date, and other metadata).
   * @param {Object} song
   * @param {HTMLElement} cardEl
   */
  handleSongClick(song, cardEl) {
    if (this.soundManager) {
      this.soundManager.playClick();
    }

    this.selectedSong = song;

    // Keep music preview playing in loop
    if (this.musicPlayer) {
      this.musicPlayer.playPreview(song);
    }

    // Update selected class on cards
    const allCards = this.songListContainer.querySelectorAll(".song-card");
    allCards.forEach((c) => c.classList.remove("is-selected"));
    cardEl.classList.add("is-selected");

    // Display additional information (mapper, creation date, etc.)
    this.renderSelectedSongDetails(song);
  }

  /**
   * Renders hover-only details (shows ONLY song title and music creator).
   * @param {Object} song
   */
  renderHoverDetails(song) {
    if (!this.songDetailsContainer) return;

    this.songDetailsContainer.innerHTML = `
      <div class="hover-preview-view">
        <div class="song-info-header">
          <span class="preview-mode-tag">Previewing</span>
          <h2 class="song-info-title">${song.name}</h2>
          <p class="song-hover-creator">Music Creator: <strong>${song.creator}</strong></p>
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
          <p class="hover-tip-text">Click song to select and view map details &amp; launch track</p>
        </div>
      </div>
    `;
  }

  /**
   * Renders full selected song details (mapper, creation date, duration, NPS, and Start Track button).
   * @param {Object} song
   */
  renderSelectedSongDetails(song) {
    if (!this.songDetailsContainer) return;

    this.songDetailsContainer.innerHTML = `
      <div class="selected-song-view">
        <div class="song-info-header">
          <div class="song-info-badges">
            <span class="badge-difficulty" style="color: ${song.color || 'var(--color-accent)'}; border-color: ${song.color || 'var(--color-accent)'};">
              ${song.difficulty || "Standard"}
            </span>
            <span class="badge-nps-preview">${song.nps} NPS</span>
            <span class="badge-duration-preview">${song.duration || "03:00"}</span>
          </div>
          <h2 class="song-info-title">${song.name}</h2>
          <p class="song-selected-creator">Music Creator: <strong>${song.creator}</strong></p>
        </div>

        <!-- Additional Information Grid -->
        <div class="song-meta-grid">
          <div class="meta-field">
            <span class="meta-label">Mapper</span>
            <span class="meta-value">${song.mapper}</span>
          </div>
          <div class="meta-field">
            <span class="meta-label">Creation Date</span>
            <span class="meta-value">${song.date}</span>
          </div>
          <div class="meta-field">
            <span class="meta-label">Length</span>
            <span class="meta-value">${song.duration}</span>
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
      </div>

      <!-- Start Track Action -->
      <div class="song-action-container">
        <div class="selected-status-badge ready">
          <div>
            <div class="selected-status-title">Track Selected: ${song.name}</div>
            <div class="selected-status-note">Ready to play with mouse orb &bull; 2 Colors</div>
          </div>
          <button id="btn-start-gameplay" class="btn-start-action" type="button">
            Play Track &rarr;
          </button>
        </div>
      </div>
    `;

    // Connect Start Track button
    const startBtn = this.songDetailsContainer.querySelector("#btn-start-gameplay") || document.getElementById("btn-start-gameplay");
    if (startBtn) {
      startBtn.addEventListener("click", () => {
        if (this.soundManager) this.soundManager.playClick();
        if (typeof this.onStartTrack === "function") {
          this.onStartTrack(song);
        }
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
        <p>Hover over a song on the right to hear a looped preview, or click to select and prepare for play.</p>
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
    if (this.view) {
      this.view.classList.add("is-active");
      this.view.setAttribute("aria-hidden", "false");
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

// Expose to window
window.PlayMenu = PlayMenu;

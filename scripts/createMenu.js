/**
 * @file createMenu.js
 * @description Manages the Create Menu view, listing existing maps with Play icon edit buttons,
 * and providing map creation with custom metadata and imported audio files.
 */

class CreateMenu {
  /**
   * @param {Object} dependencies
   * @param {MapStorage} dependencies.mapStorage
   * @param {SoundManager} dependencies.soundManager
   * @param {Function} dependencies.onEditMap
   */
  constructor({ mapStorage, soundManager, onEditMap = null }) {
    this.mapStorage = mapStorage;
    this.soundManager = soundManager;
    this.onEditMap = onEditMap;

    // DOM Elements
    this.view = document.getElementById("create-menu-view");
    this.mainMenuCard = document.getElementById("main-menu-card");
    this.backBtn = document.getElementById("btn-back-create");
    this.mapsListContainer = document.getElementById("create-maps-list");

    // Form Elements
    this.form = document.getElementById("new-map-form");
    this.nameInput = document.getElementById("new-map-name");
    this.mapperInput = document.getElementById("new-map-mapper");
    this.creatorInput = document.getElementById("new-map-creator");
    this.fileInput = document.getElementById("new-map-file");
    this.presetSelect = document.getElementById("new-map-preset-audio");
    this.fileStatusEl = document.getElementById("new-map-file-status");

    this.importedFileUrl = null;
    this.importedDuration = 180;
  }

  /**
   * Initializes the Create Menu view and binds form and list events.
   */
  init() {
    this.bindEvents();
    this.renderMapsList();

    if (this.mapStorage) {
      this.mapStorage.onChange(() => {
        this.renderMapsList();
      });
    }
  }

  /**
   * Binds UI events.
   */
  bindEvents() {
    // Back to main menu
    if (this.backBtn) {
      this.backBtn.addEventListener("click", () => {
        if (this.soundManager) this.soundManager.playClick();
        this.close();
      });
    }

    // Audio file input listener
    if (this.fileInput) {
      this.fileInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          if (this.importedFileUrl) {
            URL.revokeObjectURL(this.importedFileUrl);
          }
          this.importedFileUrl = URL.createObjectURL(file);
          if (this.fileStatusEl) {
            this.fileStatusEl.textContent = `Selected: ${file.name}`;
          }

          // Measure audio length
          const tempAudio = new Audio(this.importedFileUrl);
          tempAudio.addEventListener("loadedmetadata", () => {
            if (tempAudio.duration) {
              this.importedDuration = Math.round(tempAudio.duration);
            }
          });
        }
      });
    }

    // Preset audio dropdown
    if (this.presetSelect) {
      this.presetSelect.addEventListener("change", (e) => {
        if (e.target.value) {
          // If a preset is chosen, reset file input
          if (this.fileInput) this.fileInput.value = "";
          this.importedFileUrl = null;
          if (this.fileStatusEl) {
            this.fileStatusEl.textContent = `Using preset: ${e.target.selectedOptions[0].text}`;
          }
        }
      });
    }

    // Form submission
    if (this.form) {
      this.form.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleCreateMap();
      });
    }
  }

  /**
   * Handles creation of a new map.
   */
  handleCreateMap() {
    const name = this.nameInput ? this.nameInput.value.trim() : "";
    const mapper = this.mapperInput ? this.mapperInput.value.trim() : "";
    const creator = this.creatorInput ? this.creatorInput.value.trim() : "";

    if (!name) {
      alert("Please provide a name for your map.");
      return;
    }

    let audioSource = this.importedFileUrl;
    let durationSeconds = this.importedDuration || 180;

    // If no custom file was uploaded, check preset dropdown
    if (!audioSource && this.presetSelect && this.presetSelect.value) {
      audioSource = this.presetSelect.value;
      const option = this.presetSelect.selectedOptions[0];
      const dur = option.getAttribute("data-duration");
      if (dur) durationSeconds = parseInt(dur, 10);
    }

    // Fallback to default project track if nothing selected
    if (!audioSource) {
      audioSource = "Assets/Songs/IMG_2449.mp3";
      durationSeconds = 229;
    }

    const m = Math.floor(durationSeconds / 60);
    const s = Math.floor(durationSeconds % 60);
    const durationFormatted = `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;

    if (this.mapStorage) {
      const newMap = this.mapStorage.createMap({
        name,
        mapper: mapper || "Anonymous",
        creator: creator || "Unknown Artist",
        file: audioSource,
        duration: durationFormatted,
        durationSeconds
      });

      if (this.soundManager) this.soundManager.playClick();

      // Reset form fields
      if (this.nameInput) this.nameInput.value = "";
      if (this.mapperInput) this.mapperInput.value = "";
      if (this.creatorInput) this.creatorInput.value = "";
      if (this.fileInput) this.fileInput.value = "";
      if (this.fileStatusEl) this.fileStatusEl.textContent = "";

      // Open new map in MapEditor
      if (typeof this.onEditMap === "function") {
        this.hide();
        this.onEditMap(newMap);
      }
    }
  }

  /**
   * Renders the list of existing maps with Play icon edit buttons.
   */
  renderMapsList() {
    if (!this.mapsListContainer || !this.mapStorage) return;

    this.mapsListContainer.innerHTML = "";

    const allMaps = this.mapStorage.getAllMaps();

    if (allMaps.length === 0) {
      this.mapsListContainer.innerHTML = `
        <div class="empty-maps-notice">
          No maps found. Create a new map to start mapping notes!
        </div>
      `;
      return;
    }

    allMaps.forEach((map) => {
      const card = document.createElement("article");
      card.className = "create-map-card";

      const noteCount = (map.notes && map.notes.length) || 0;

      card.innerHTML = `
        <div class="map-card-info">
          <div class="map-card-header">
            <span class="map-name">${map.name}</span>
            ${map.isCustom ? '<span class="map-tag-custom">Custom</span>' : '<span class="map-tag-default">Default</span>'}
          </div>
          <div class="map-card-meta">
            <span>Mapper: <strong>${map.mapper}</strong></span>
            <span>&bull;</span>
            <span>Artist: <strong>${map.creator}</strong></span>
          </div>
          <div class="map-card-stats">
            <span>Duration: <strong>${map.duration || "03:00"}</strong></span>
            <span>&bull;</span>
            <span>Notes: <strong>${noteCount}</strong></span>
          </div>
        </div>

        <div class="map-card-actions">
          <!-- Play Icon Button to Edit the Map -->
          <button class="btn-map-edit-play" type="button" aria-label="Edit map ${map.name}" title="Edit map in Map Editor">
            <span class="play-icon">&#9654;</span>
            <span>Edit</span>
          </button>
          ${
            map.isCustom
              ? `<button class="btn-map-delete" type="button" aria-label="Delete map ${map.name}" title="Delete custom map">&times;</button>`
              : ""
          }
        </div>
      `;

      // Play icon button triggers edit
      const editBtn = card.querySelector(".btn-map-edit-play");
      if (editBtn) {
        editBtn.addEventListener("click", () => {
          if (this.soundManager) this.soundManager.playClick();
          this.hide();
          if (typeof this.onEditMap === "function") {
            this.onEditMap(map);
          }
        });
      }

      // Delete button for custom maps
      const delBtn = card.querySelector(".btn-map-delete");
      if (delBtn) {
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (confirm(`Delete custom map "${map.name}"?`)) {
            if (this.soundManager) this.soundManager.playClick();
            this.mapStorage.deleteMap(map.id);
          }
        });
      }

      this.mapsListContainer.appendChild(card);
    });
  }

  /**
   * Opens the Create Menu and hides the main menu.
   */
  open() {
    if (this.mainMenuCard) {
      this.mainMenuCard.style.display = "none";
    }
    this.renderMapsList();
    if (this.view) {
      this.view.classList.add("is-active");
      this.view.setAttribute("aria-hidden", "false");
    }
  }

  /**
   * Closes the Create Menu and returns to main menu.
   */
  close() {
    if (this.view) {
      this.view.classList.remove("is-active");
      this.view.setAttribute("aria-hidden", "true");
    }
    if (this.mainMenuCard) {
      this.mainMenuCard.style.display = "";
    }
  }

  /**
   * Hides the view (e.g. when opening the MapEditor).
   */
  hide() {
    if (this.view) {
      this.view.classList.remove("is-active");
      this.view.setAttribute("aria-hidden", "true");
    }
  }

  /**
   * Checks if Create Menu is currently open.
   * @returns {boolean}
   */
  isOpen() {
    return this.view ? this.view.classList.contains("is-active") : false;
  }
}

// Expose to window
window.CreateMenu = CreateMenu;

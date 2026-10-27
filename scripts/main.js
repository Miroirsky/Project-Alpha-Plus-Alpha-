/**
 * @file main.js
 * @description Main application entry point for Project Alpha Plus.
 * Coordinates initialization of theme, audio, settings modal, song select,
 * map creation, map editor, and rhythm track gameplay with high scores.
 */

async function initApp() {
  const ThemeClass = window.ThemeManager;
  const SoundClass = window.SoundManager;

  // 1. Initialize Theme & Sound early (works in both Web and Electron)
  const themeManager = ThemeClass ? new ThemeClass() : null;
  if (themeManager && typeof themeManager.init === "function") {
    themeManager.init();
  }

  const soundManager = SoundClass ? new SoundClass() : null;
  if (soundManager) {
    window.soundManager = soundManager;
  }

  // 2. Detect whether the game is running in Electron or in a Web Browser
  const WebLandingClass = window.WebLanding;
  const isElectron = WebLandingClass && typeof WebLandingClass.isElectronEnvironment === "function"
    ? WebLandingClass.isElectronEnvironment()
    : Boolean(
        (window.electronAPI && window.electronAPI.isElectron) ||
        (typeof navigator !== "undefined" && /Electron\/\d+/i.test(navigator.userAgent || ""))
      );

  const webLanding = window.__paplusWebLandingInstance || (WebLandingClass ? new WebLandingClass({ themeManager, soundManager }) : null);
  if (webLanding) {
    window.__paplusWebLandingInstance = webLanding;
    if (themeManager) webLanding.themeManager = themeManager;
    if (soundManager) webLanding.soundManager = soundManager;
  }

  if (!isElectron) {
    // Web Version: Show ONLY the new Web Showcase & Installer Download Menu
    if (webLanding) {
      webLanding.initWebMode();
    }
    return;
  }

  // Electron Version: Hide Web Landing Page and initialize the full game interface
  if (webLanding) {
    webLanding.hideForElectron();
  }

  const SettingsClass = window.SettingsModal;
  const ExitClass = window.ExitHandler;
  const MusicClass = window.MusicPlayer;
  const PlayMenuClass = window.PlayMenu;
  const MapStorageClass = window.MapStorage;
  const MapEditorClass = window.MapEditor;
  const CreateMenuClass = window.CreateMenu;
  const GameEngineClass = window.GameEngine;
  const GameViewClass = window.GameView;

  if (
    !ThemeClass ||
    !SoundClass ||
    !SettingsClass ||
    !ExitClass ||
    !MusicClass ||
    !PlayMenuClass ||
    !MapStorageClass ||
    !MapEditorClass ||
    !CreateMenuClass ||
    !GameEngineClass ||
    !GameViewClass
  ) {
    console.error("Project Alpha Plus: Missing dependencies. Ensure all script files are loaded.");
    return;
  }

  const musicPlayer = new MusicClass({ soundManager });
  const mapStorage = new MapStorageClass();
  window.mapStorage = mapStorage;

  // Initialize Mod & Track Downloader
  if (window.ModDownloader) {
    window.modDownloader = new window.ModDownloader({ mapStorage, soundManager });
    window.modDownloader.init();
  }

  // 2. Initialize Modals
  const settingsModal = new SettingsClass({ soundManager, themeManager });
  settingsModal.init();

  const exitHandler = new ExitClass({ soundManager });
  exitHandler.init();

  // Active game session references
  let activeGameEngine = null;
  let gameReturnTarget = "select"; // 'select' | 'editor'
  let currentTestedMap = null;

  // 3. Initialize Game View (Canvas, HUD, and End Screen)
  const gameViewContainer = document.getElementById("game-view");
  const gameView = new GameViewClass({
    container: gameViewContainer,
    onExit: () => {
      // When actively playing, leaving early triggers the End Screen with abandoned status
      if (activeGameEngine && activeGameEngine.isRunning) {
        activeGameEngine.abandonRun();
        return;
      }
      stopGameAndReturn();
    },
    onReplay: () => {
      if (currentTestedMap) {
        const replaySpeed = gameReturnTarget === "editor" && mapEditor ? (mapEditor.playSpeed || 1.0) : 1.0;
        launchTrackGameplay(currentTestedMap, gameReturnTarget, replaySpeed);
      }
    }
  });

  /**
   * Cleanly terminates active game and returns to either Song Select or Map Editor.
   */
  function stopGameAndReturn() {
    if (activeGameEngine) {
      activeGameEngine.stop();
      activeGameEngine = null;
    }
    // Always reset music player playback rate back to 1.0x when leaving game view
    if (musicPlayer && typeof musicPlayer.setPlaybackRate === "function") {
      musicPlayer.setPlaybackRate(1.0);
    }
    gameView.hide();

    if (currentTestedMap && mapStorage && currentTestedMap.id) {
      mapStorage.setSelectedSongId(currentTestedMap.id);
    }

    if (gameReturnTarget === "editor" && currentTestedMap) {
      mapEditor.open(currentTestedMap);
    } else if (gameReturnTarget === "tutorial") {
      const mainMenuCard = document.getElementById("main-menu-card");
      if (mainMenuCard) {
        mainMenuCard.classList.remove("is-hidden");
        mainMenuCard.style.display = "";
      }
    } else {
      playMenu.updateSongs(mapStorage.getAllMaps());
      playMenu.open();
    }
  }

  /**
   * Transitions to the active Gameplay track.
   * @param {Object} song
   * @param {'select' | 'editor' | 'tutorial'} returnTarget
   * @param {number} speedMultiplier
   */
  function launchTrackGameplay(song, returnTarget = "select", speedMultiplier = 1.0) {
    gameReturnTarget = returnTarget;
    currentTestedMap = song;
    if (mapStorage && song && song.id) {
      mapStorage.setSelectedSongId(song.id);
    }

    // Apply speed multiplier ONLY in editor playtesting; normal gameplay is strictly 1.0x
    const effectiveSpeed = returnTarget === "editor" ? (Number(speedMultiplier) || 1.0) : 1.0;
    if (musicPlayer && typeof musicPlayer.setPlaybackRate === "function") {
      musicPlayer.setPlaybackRate(effectiveSpeed);
    }

    if (activeGameEngine) {
      activeGameEngine.stop();
      activeGameEngine = null;
    }

    // Hide any open menus
    const mainMenuCard = document.getElementById("main-menu-card");
    if (mainMenuCard) {
      mainMenuCard.classList.add("is-hidden");
    }
    playMenu.hideForGame();
    createMenu.hide();

    // Ensure latest map data is queried from mapStorage (including Default Tracks/Tutorial)
    let freshSong = (mapStorage && song && song.id && mapStorage.getMap(song.id)) || null;
    if (!freshSong && mapStorage && song && song.isTutorial) {
      const allMaps = mapStorage.getAllMaps();
      freshSong = allMaps.find(
        (m) =>
          m &&
          (m.id === "custom_1792933532150_9287" ||
            (m._folderName && m._folderName.toLowerCase() === "tutorial") ||
            (m.name && m.name.toLowerCase() === "tutorial"))
      ) || null;
    }
    freshSong = freshSong || song;

    const diffs = (mapStorage && mapStorage.getSongDifficulties(freshSong)) || freshSong.difficulties || {};
    const chosenDiff = song.selectedDifficulty || freshSong.selectedDifficulty || freshSong.difficulty || Object.keys(diffs)[0] || "Normal";
    const diffData = diffs[chosenDiff] || {};

    // Use notes from selected difficulty
    const trackNotes = (Array.isArray(song.notes) && song.selectedDifficulty === chosenDiff && song.notes.length > 0 && !freshSong.difficulties)
      ? song.notes
      : (diffData.notes || freshSong.notes || song.notes || ((window.SAMPLE_MAPS && window.SAMPLE_MAPS[freshSong.id]) || []));

    const songForGame = {
      ...freshSong,
      isTutorial: Boolean(song.isTutorial || freshSong.isTutorial),
      difficulty: chosenDiff,
      selectedDifficulty: chosenDiff,
      notes: trackNotes,
      nps: diffData.nps !== undefined ? diffData.nps : freshSong.nps
    };

    currentTestedMap = songForGame;

    // Prepare game view with track metadata
    gameView.setupSong(songForGame);
    gameView.show();

    // Instantiate and launch game engine
    activeGameEngine = new GameEngineClass({
      song: songForGame,
      notes: trackNotes,
      musicPlayer,
      soundManager,
      onStateChange: (state) => {
        gameView.render(state);
      },
      onSongEnd: (results) => {
        // Record high score (completed runs only) for the chosen difficulty and display comprehensive End Screen
        const scoreRecord = mapStorage
          ? mapStorage.recordScore(results.songId, results.score, results.isCompleted, chosenDiff)
          : { bestScore: results.score, isNewBest: Boolean(results.isCompleted) };
        if (window.saveSystem && typeof window.saveSystem.recordRunResult === "function") {
          window.saveSystem.recordRunResult(results, chosenDiff);
        }
        gameView.showResults(results, scoreRecord);
      }
    });

    activeGameEngine.start();
  }

  // 4. Initialize Map Editor
  const mapEditor = new MapEditorClass({
    mapStorage,
    soundManager,
    musicPlayer,
    onTestMap: (mapToTest, playSpeed = 1.0) => {
      launchTrackGameplay(mapToTest, "editor", playSpeed);
    },
    onExit: () => {
      createMenu.open();
    }
  });

  // 5. Initialize Create Menu
  const createMenu = new CreateMenuClass({
    mapStorage,
    soundManager,
    onEditMap: (mapToEdit, difficulty = null) => {
      mapEditor.open(mapToEdit, difficulty);
    }
  });
  createMenu.init();

  // 6. Initialize Song Selection Menu
  const playMenu = new PlayMenuClass({
    soundManager,
    musicPlayer,
    mapStorage,
    songs: mapStorage.getAllMaps(),
    onStartTrack: (selectedSong) => {
      launchTrackGameplay(selectedSong, "select");
    },
    onEditSongParams: (songToEdit) => {
      createMenu.openSongParams(songToEdit);
    }
  });
  playMenu.init();
  window.playMenu = playMenu;
  window.createMenu = createMenu;

  // Keep play menu and create menu updated whenever map storage changes
  mapStorage.onChange((updatedMaps) => {
    if (playMenu && typeof playMenu.updateSongs === "function") {
      playMenu.updateSongs(updatedMaps);
    }
    if (createMenu && typeof createMenu.renderMapsList === "function") {
      createMenu.renderMapsList();
    }
    if (typeof syncMenuStars === "function") {
      syncMenuStars();
    }
  });

  // 7. Connect Main Menu Buttons
  const btnPlay = document.getElementById("btn-play");
  const btnCreate = document.getElementById("btn-create");
  const btnSettings = document.getElementById("btn-settings");
  const btnExit = document.getElementById("btn-exit");

  if (btnPlay) {
    btnPlay.addEventListener("click", () => {
      try {
        soundManager.playClick();
      } catch (e) {
        console.warn(e);
      }
      playMenu.updateSongs(mapStorage.getAllMaps());
      playMenu.open();
    });
  }

  if (btnCreate) {
    btnCreate.addEventListener("click", () => {
      try {
        soundManager.playClick();
      } catch (e) {
        console.warn(e);
      }
      createMenu.open();
    });
  }

  if (btnSettings) {
    btnSettings.addEventListener("click", () => {
      try {
        soundManager.playClick();
      } catch (e) {
        console.warn(e);
      }
      settingsModal.open();
    });
  }

  if (btnExit) {
    btnExit.addEventListener("click", () => {
      exitHandler.handleExit();
    });
  }

  const menuStarCountEl = document.getElementById("menu-star-count");
  function syncMenuStars() {
    if (!menuStarCountEl) return;
    let stars = 0;
    if (mapStorage && mapStorage.highscores && typeof mapStorage.highscores === "object") {
      stars = Object.values(mapStorage.highscores).filter((v) => Number(v) > 0).length;
    }
    menuStarCountEl.textContent = String(stars);
  }
  syncMenuStars();

  // Initialize First-Time 30s Tutorial Manager
  const TutorialClass = window.TutorialManager;
  const tutorialManager = TutorialClass
    ? new TutorialClass({
        soundManager,
        onStartTutorial: (tutorialSong) => {
          launchTrackGameplay(tutorialSong, "tutorial", 1.0);
        }
      })
    : null;
  if (tutorialManager) {
    tutorialManager.init();
    window.tutorialManager = tutorialManager;
  }

  const btnMenuNotif = document.getElementById("btn-menu-notif");
  const menuWhatsNewBox = document.getElementById("menu-whats-new-box");
  [btnMenuNotif, menuWhatsNewBox].forEach((el) => {
    if (el) {
      el.addEventListener("click", () => {
        try {
          soundManager.playClick();
        } catch (e) {}
        if (tutorialManager && typeof tutorialManager.openPrompt === "function") {
          tutorialManager.openPrompt();
        } else {
          playMenu.updateSongs(mapStorage.getAllMaps());
          playMenu.open();
        }
      });
    }
  });

  // 8. Complete asynchronous storage & save system initialization after UI buttons are bound
  if (mapStorage.initializationPromise) {
    mapStorage.initializationPromise
      .then(() => {
        playMenu.updateSongs(mapStorage.getAllMaps());
        createMenu.renderMapsList();
      })
      .catch((err) => {
        console.warn("MapStorage initialization warning:", err);
      });
  }

  if (window.saveSystem) {
    window.saveSystem
      .init()
      .then(() => {
        if (window.saveSystem.getHighscores) {
          mapStorage.highscores = Object.assign({}, mapStorage.highscores, window.saveSystem.getHighscores());
          if (typeof mapStorage.saveHighScoresToStorage === "function") {
            mapStorage.saveHighScoresToStorage();
          }
        }
        playMenu.updateSongs(mapStorage.getAllMaps());
        settingsModal.syncSaveSlots();
        if (tutorialManager) {
          tutorialManager.checkAndPromptFirstTime();
        }
      })
      .catch((err) => {
        console.warn("SaveSystem initialization warning:", err);
        if (tutorialManager) {
          tutorialManager.checkAndPromptFirstTime();
        }
      });

    window.saveSystem.addListener((event) => {
      if (event === "slotSwitched" || event === "slotCreated" || event === "slotDeleted" || event === "statsUpdated") {
        if (mapStorage && window.saveSystem.getHighscores) {
          mapStorage.highscores = Object.assign({}, mapStorage.highscores, window.saveSystem.getHighscores());
          if (typeof mapStorage.saveHighScoresToStorage === "function") {
            mapStorage.saveHighScoresToStorage();
          }
          mapStorage.notify();
        }
        if (window.playMenu) {
          window.playMenu.updateSongs(mapStorage.getAllMaps());
        }
      }
    });
  }

  // 8. Attach subtle hover audio feedback to all interactive buttons (delegated)
  document.addEventListener(
    "mouseenter",
    (e) => {
      const target = e.target;
      if (
        target &&
        typeof target.closest === "function" &&
        target.closest("button, .btn-theme-action, .btn-folder-tile, .menu-btn, .theme-btn, .chip-btn, .filter-pill, .btn-editor-action, .btn-song-export")
      ) {
        try {
          soundManager.playHover();
        } catch (err) {}
      }
    },
    true
  );
}

// Ensure execution runs whether loaded before or after DOMContentLoaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

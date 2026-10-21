/**
 * @file main.js
 * @description Main application entry point for Project Alpha Plus.
 * Coordinates initialization of theme, audio, settings modal, song select,
 * map creation, map editor, and rhythm track gameplay with high scores.
 */

function initApp() {
  const ThemeClass = window.ThemeManager;
  const SoundClass = window.SoundManager;
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

  // 1. Initialize Core Managers & Storage
  const themeManager = new ThemeClass();
  themeManager.init();

  const soundManager = new SoundClass();
  const musicPlayer = new MusicClass({ soundManager });
  const mapStorage = new MapStorageClass();
  window.mapStorage = mapStorage;
  window.soundManager = soundManager;

  // Initialize SaveSystem (Local File Saves & Profiles)
  if (window.saveSystem) {
    window.saveSystem.init().then(() => {
      if (window.saveSystem.getHighscores) {
        mapStorage.highscores = Object.assign({}, mapStorage.highscores, window.saveSystem.getHighscores());
      }
    });

    window.saveSystem.addListener((event) => {
      if (event === "slotSwitched" || event === "slotCreated" || event === "slotDeleted") {
        if (mapStorage) {
          mapStorage.highscores = window.saveSystem.getHighscores();
          mapStorage.notify();
        }
        if (window.playMenu) {
          window.playMenu.updateSongs(mapStorage.getAllMaps());
        }
      }
    });
  }

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
    } else {
      playMenu.updateSongs(mapStorage.getAllMaps());
      playMenu.open();
    }
  }

  /**
   * Transitions to the active Gameplay track.
   * @param {Object} song
   * @param {'select' | 'editor'} returnTarget
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
    playMenu.hideForGame();
    createMenu.hide();

    // Ensure latest map data is queried from mapStorage
    const freshSong = (mapStorage && song.id && mapStorage.getMap(song.id)) || song;
    const diffs = (mapStorage && mapStorage.getSongDifficulties(freshSong)) || freshSong.difficulties || {};
    const chosenDiff = song.selectedDifficulty || freshSong.selectedDifficulty || freshSong.difficulty || Object.keys(diffs)[0] || "Normal";
    const diffData = diffs[chosenDiff] || {};

    // Use notes from selected difficulty
    const trackNotes = (Array.isArray(song.notes) && song.selectedDifficulty === chosenDiff && song.notes.length > 0)
      ? song.notes
      : (diffData.notes || freshSong.notes || ((window.SAMPLE_MAPS && window.SAMPLE_MAPS[freshSong.id]) || []));

    const songForGame = {
      ...freshSong,
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
        const scoreRecord = mapStorage.recordScore(results.songId, results.score, results.isCompleted, chosenDiff);
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

  // 8. Attach subtle hover audio feedback to interactive buttons
  const attachHoverSounds = () => {
    const interactiveButtons = document.querySelectorAll(
      "button, .menu-btn, .theme-btn, .play-back-btn, .btn-start-action, .btn-game-exit, .btn-editor-action, .btn-editor-test, .btn-map-edit-play, .btn-results-primary, .btn-results-secondary"
    );
    interactiveButtons.forEach((btn) => {
      btn.addEventListener("mouseenter", () => {
        try {
          soundManager.playHover();
        } catch (e) {
          // Ignore audio restrictions
        }
      });
    });
  };

  attachHoverSounds();
}

// Ensure execution runs whether loaded before or after DOMContentLoaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

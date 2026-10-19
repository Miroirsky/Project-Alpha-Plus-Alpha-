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
        launchTrackGameplay(currentTestedMap, gameReturnTarget);
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
    gameView.hide();

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
   */
  function launchTrackGameplay(song, returnTarget = "select") {
    gameReturnTarget = returnTarget;
    currentTestedMap = song;

    // Hide any open menus
    playMenu.hideForGame();
    createMenu.hide();

    // Prepare game view with track metadata
    gameView.setupSong(song);
    gameView.show();

    // Use notes from the map
    const trackNotes = song.notes || (window.SAMPLE_MAPS && window.SAMPLE_MAPS[song.id]) || [];

    // Instantiate and launch game engine
    activeGameEngine = new GameEngineClass({
      song,
      notes: trackNotes,
      musicPlayer,
      soundManager,
      onStateChange: (state) => {
        gameView.render(state);
      },
      onSongEnd: (results) => {
        // Record high score (completed runs only) and display comprehensive End Screen
        const scoreRecord = mapStorage.recordScore(results.songId, results.score, results.isCompleted);
        gameView.showResults(results, scoreRecord);
      }
    });

    activeGameEngine.start();
  }

  // 4. Initialize Map Editor
  const mapEditor = new MapEditorClass({
    mapStorage,
    soundManager,
    onTestMap: (mapToTest) => {
      launchTrackGameplay(mapToTest, "editor");
    },
    onExit: () => {
      createMenu.open();
    }
  });

  // 5. Initialize Create Menu
  const createMenu = new CreateMenuClass({
    mapStorage,
    soundManager,
    onEditMap: (mapToEdit) => {
      mapEditor.open(mapToEdit);
    }
  });
  createMenu.init();

  // 6. Initialize Song Selection Menu
  const playMenu = new PlayMenuClass({
    soundManager,
    musicPlayer,
    songs: mapStorage.getAllMaps(),
    onStartTrack: (selectedSong) => {
      launchTrackGameplay(selectedSong, "select");
    }
  });
  playMenu.init();

  // Keep play menu updated whenever map storage changes
  mapStorage.onChange((updatedMaps) => {
    playMenu.updateSongs(updatedMaps);
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

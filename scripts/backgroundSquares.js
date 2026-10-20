/**
 * @file backgroundSquares.js
 * @description Procedural background animation manager for Project Alpha Plus.
 * Dynamically spawns perfectly square elements (#F7D4BC) along a screen edge,
 * animates them drifting smoothly across to the opposite edge, and immediately
 * cleans up off-screen elements for optimal performance.
 */

class BackgroundSquaresManager {
  /**
   * @param {Object} [options]
   * @param {string} [options.containerId="floating-squares-container"] - ID of DOM container
   * @param {string} [options.wrapperId="main-menu-bg"] - ID of main menu background wrapper
   * @param {number} [options.maxSquares=36] - Maximum concurrent squares to prevent DOM overload
   */
  constructor({
    containerId = "floating-squares-container",
    wrapperId = "main-menu-bg",
    maxSquares = 36
  } = {}) {
    this.containerId = containerId;
    this.wrapperId = wrapperId;
    this.maxSquares = maxSquares;

    this.container = null;
    this.wrapper = null;
    this.squares = [];
    this.rafId = null;
    this.spawnTimerId = null;
    this.lastTime = 0;
    this.isRunning = false;
    this.isPaused = false;

    // Viewport dimensions
    this.width = window.innerWidth || 1280;
    this.height = window.innerHeight || 720;

    this.onResize = this.handleResize.bind(this);
    this.onVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  /**
   * Initializes the procedural spawner, caches DOM nodes, binds events,
   * pre-populates initial drifting squares, and starts the animation loop.
   */
  init() {
    this.container = document.getElementById(this.containerId);
    this.wrapper = document.getElementById(this.wrapperId);

    if (!this.container && this.wrapper) {
      this.container = document.createElement("div");
      this.container.id = this.containerId;
      this.container.className = "floating-squares-container";
      this.wrapper.appendChild(this.container);
    }

    if (!this.container) {
      console.warn("BackgroundSquaresManager: Container element not found.");
      return;
    }

    // Clear any static child elements
    this.container.innerHTML = "";
    this.squares = [];

    this.handleResize();
    window.addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVisibilityChange);

    this.start();
  }

  /**
   * Updates cached viewport dimensions.
   */
  handleResize() {
    this.width = window.innerWidth || 1280;
    this.height = window.innerHeight || 720;
  }

  /**
   * Handles tab visibility changes to conserve battery and CPU.
   */
  handleVisibilityChange() {
    if (document.hidden) {
      this.pause();
    } else {
      this.resume();
    }
  }

  /**
   * Starts procedural spawning and RAF loop.
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;

    // Pre-populate so the screen has squares in mid-flight immediately on load
    this.prePopulate();

    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame((now) => this.tick(now));
    this.scheduleNextSpawn();
  }

  /**
   * Pauses animation loop and spawning.
   */
  pause() {
    this.isPaused = true;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.spawnTimerId) {
      clearTimeout(this.spawnTimerId);
      this.spawnTimerId = null;
    }
  }

  /**
   * Resumes animation loop and spawning.
   */
  resume() {
    if (!this.isRunning || !this.isPaused) return;
    this.isPaused = false;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame((now) => this.tick(now));
    this.scheduleNextSpawn();
  }

  /**
   * Pre-populates 16–22 drifting squares across random screen heights
   * so the background is immediately lively.
   */
  prePopulate() {
    const initialCount = Math.min(20, this.maxSquares);
    for (let i = 0; i < initialCount; i++) {
      const square = this.createSquareData(true);
      if (square) {
        this.container.appendChild(square.el);
        this.squares.push(square);
      }
    }
  }

  /**
   * Creates a procedural square with randomized dimensions, position, velocity,
   * solid fill, no transparency, and rotation.
   *
   * @param {boolean} isInitialSeed - If true, randomizes Y position across screen height
   * @returns {Object} Square data object
   */
  createSquareData(isInitialSeed = false) {
    // Random sizes: 16px - 130px
    const size = Math.round(16 + Math.random() * 114);

    // Spawn along the bottom edge, across the full viewport width
    const x = Math.random() * (this.width + size) - size * 0.5;
    // If seeding, distribute across screen; otherwise start just below bottom screen edge
    const y = isInitialSeed
      ? Math.random() * (this.height + size) - size
      : this.height + size + 8;

    // Upward drift speed: larger squares drift slightly slower for depth/parallax
    // 25px/s to 75px/s
    const baseSpeed = 26 + Math.random() * 46;
    const speedScale = 1 - (size / 150) * 0.35; // Larger = slower
    const vy = -(baseSpeed * speedScale); // Negative = moving upward towards top edge

    // Subtle horizontal drift / sway
    const vx = (Math.random() - 0.5) * 14;

    // Rotation properties
    const rotation = Math.random() * 360;
    const rotationSpeed = (Math.random() - 0.5) * 16; // -8 to +8 deg/sec

    // Create DOM element with solid fill, no transparency, no outlines, no border radius
    const el = document.createElement("div");
    el.className = "floating-square";
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${rotation.toFixed(1)}deg)`;

    return {
      el,
      size,
      x,
      y,
      vx,
      vy,
      rotation,
      rotationSpeed
    };
  }

  /**
   * Spawns a single square at the bottom screen edge and schedules next spawn.
   */
  spawnSquare() {
    if (!this.isRunning || this.isPaused) return;

    // Check if main menu background is currently visible
    if (this.wrapper && this.wrapper.style.display === "none") {
      this.scheduleNextSpawn();
      return;
    }

    if (this.squares.length < this.maxSquares) {
      const square = this.createSquareData(false);
      if (square && this.container) {
        this.container.appendChild(square.el);
        this.squares.push(square);
      }
    }

    this.scheduleNextSpawn();
  }

  /**
   * Schedules next procedural spawn with varied delay (350ms - 950ms)
   * for an organic, non-mechanical rhythm.
   */
  scheduleNextSpawn() {
    if (!this.isRunning || this.isPaused) return;

    if (this.spawnTimerId) {
      clearTimeout(this.spawnTimerId);
    }

    // Varied spawn delay
    const delay = Math.round(380 + Math.random() * 520);
    this.spawnTimerId = setTimeout(() => {
      this.spawnSquare();
    }, delay);
  }

  /**
   * Main animation tick: moves squares upwards, applies GPU transforms,
   * and removes off-screen elements as they cross the opposite edge.
   *
   * @param {DOMHighResTimeStamp} now
   */
  tick(now) {
    if (!this.isRunning || this.isPaused) return;

    const dt = Math.min((now - this.lastTime) / 1000, 0.1); // Cap delta to prevent large leaps
    this.lastTime = now;

    // Check if background container is hidden
    const isVisible = !(this.wrapper && this.wrapper.style.display === "none");

    if (isVisible && dt > 0) {
      const activeSquares = [];
      const len = this.squares.length;

      for (let i = 0; i < len; i++) {
        const sq = this.squares[i];

        // Update movement
        sq.y += sq.vy * dt;
        sq.x += sq.vx * dt;
        sq.rotation += sq.rotationSpeed * dt;

        // Cleanup condition: square has completely drifted past top screen edge (opposite edge)
        // or drifted far past horizontal bounds
        const isOffScreen =
          sq.y < -sq.size - 24 ||
          sq.x < -sq.size - 120 ||
          sq.x > this.width + sq.size + 120;

        if (isOffScreen) {
          // Immediately clean up from DOM
          if (sq.el && sq.el.parentNode) {
            sq.el.parentNode.removeChild(sq.el);
          }
        } else {
          // Update transform with hardware acceleration
          sq.el.style.transform = `translate3d(${sq.x.toFixed(1)}px, ${sq.y.toFixed(1)}px, 0) rotate(${sq.rotation.toFixed(1)}deg)`;
          activeSquares.push(sq);
        }
      }

      this.squares = activeSquares;
    }

    this.rafId = requestAnimationFrame((nextNow) => this.tick(nextNow));
  }

  /**
   * Fully cleans up all elements and stops loops.
   */
  destroy() {
    this.pause();
    this.isRunning = false;

    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);

    if (this.squares && this.squares.length > 0) {
      this.squares.forEach((sq) => {
        if (sq.el && sq.el.parentNode) {
          sq.el.parentNode.removeChild(sq.el);
        }
      });
      this.squares = [];
    }

    if (this.container) {
      this.container.innerHTML = "";
    }
  }
}

// Attach to global window object and auto-initialize
if (typeof window !== "undefined") {
  window.BackgroundSquaresManager = BackgroundSquaresManager;

  const autoInit = () => {
    if (!window.__backgroundSquaresInstance && document.getElementById("main-menu-bg")) {
      window.__backgroundSquaresInstance = new BackgroundSquaresManager();
      window.__backgroundSquaresInstance.init();
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    autoInit();
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = BackgroundSquaresManager;
}

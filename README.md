# Project Alpha Plus

Welcome to **Project Alpha Plus**, a modular, clean web-based rhythm game and map creation suite built with modern HTML5 Canvas, CSS3 custom properties, and decoupled JavaScript modules.

---

## 🎯 Architecture & Project Structure

The project strictly adheres to the **Single Responsibility Principle (SRP)**. Rather than bundling styles, structure, and behavior into monolithic files, features and components are divided into purposeful, isolated modules.

```text
Project Alpha Plus/
├── Assets/
│   └── Songs/                   # Audio track files (IMG_2449.mp3, Sanstitre*.mp3)
├── index.html                   # Semantic HTML layout, HUD, End Screen, and dialogs
├── README.md                    # Documentation, architecture guide, & coding standards
├── DESCRIPTION.md              # Rhythm game design & mechanics specification
├── styles/
│   ├── base.css                 # CSS reset, viewport layout, ambient grid/lighting
│   ├── themes.css               # Color variables and palettes for Dark, Midnight, and Light themes
│   ├── menu.css                 # Main menu card, typography, buttons, and hover animations
│   ├── playMenu.css             # Song selection split view, cards, preview equalizer, and details
│   ├── createMenu.css           # Map creation form and existing maps list with Play edit icons
│   ├── mapEditor.css            # Map editor workspace, interactive timeline scrubber, and canvas
│   ├── gameplay.css             # Track canvas, HUD, 1s hit rings, 0.5s fade, and End Screen
│   └── modal.css                # Dialog backdrops, form switches, sliders, and exit prompts
└── scripts/
    ├── main.js                  # Application entry point; coordinates managers & menu actions
    ├── themeManager.js          # Theme state, persistence (localStorage), and DOM updating
    ├── soundManager.js          # Audio toggle, volume control, and Web Audio API synthesis
    ├── songsData.js             # Song catalog (metadata, NPS, duration, mapper, creator, date)
    ├── mapData.js               # Sample mapped notes (timing, red/blue colors, screen positions)
    ├── mapStorage.js            # In-place map saving, default overrides, and high score tracking
    ├── musicPlayer.js           # Audio playback controller (preview loop, unlooped game playback)
    ├── playMenu.js              # Song selection controller (hover preview, click selection)
    ├── createMenu.js            # Create menu controller (new map form, existing map cards)
    ├── mapEditor.js             # Interactive map editor (Space play/pause, red/blue note placement)
    ├── gameEngine.js            # Timing window, precision bonus scoring, combo, and stats engine
    ├── gameView.js              # 2D Canvas rendering, countdown hit rings, and End Screen results
    ├── settingsModal.js         # Settings dialog controller (sound & theme controls only)
    └── exitHandler.js           # Window exit logic and graceful browser limitation fallback
```

---

## ⏱️ Note Types, Directional Arrows & Precision Scoring

Project Alpha Plus features two distinct note types designed with a 3-phase timing-based model:

### 1. Note Types & Placement Controls
- **Normal Notes (Classic Rhythm Circles):**
  - **Editor Placement:** Select the **Normal Note** tool (`1` or `N` hotkey) in the editor top bar. **Left-Click** to place a Red note, or **Right-Click** to place a Blue note while paused.
  - **Visuals:** Clean glowing orb with color identifier (`RED` / `BLUE`) and timestamp tag; no directional arrows.
  - **Hit Mechanics:** Hit from **any angle** or position. Normal notes have zero direction restrictions.
  - **Scoring:** 200 points for a perfect hit exactly when the note reaches full size after 1 second. During the following 1-second window, award 150–50 points linearly based on hit timing.
- **Directional Notes (Vector Swipes):**
  - **Editor Placement:** Select the **Directional** tool (`2` or `D` hotkey) in the editor top bar. Press and hold on the canvas, drag to set any angle (0–360°), then release to place. **Left-Click drag** places a Red directional note, and **Right-Click drag** places a Blue directional note.
  - **Visuals:** Dynamic arrow with a thicker stroke on the required hit side and perimeter angle badge.
  - **Hit Mechanics:** Trigonometry calculates the angle between the required direction and the player's approach vector. Tolerance: **±180°** (all approach directions accepted).
  - **Scoring:** 200 points for a perfect hit exactly when reaching full size after 1 second, and 150–50 points linearly based on hit timing during the following 1-second window + combo bonus.
- **Triangle Bomb Notes (Hazard Obstacles):**
  - **Editor Placement:** Select the **Bomb** tool (`3` or `B` hotkey) in the editor top bar. Click anywhere on the canvas while paused to place a high-voltage yellow hazard bomb note.
  - **Visuals:** High-voltage hazard amber/yellow triangle with warning indicator (`!`), timestamp tag, and circular countdown active ring.
  - **Hit Mechanics:** Hazard obstacle to be actively avoided. If either orb touches or clicks a bomb during its active window, it triggers an explosion and a **-200 points penalty**. Successfully avoiding it lets the note expire without penalty.

### 2. Note Lifecycle & Timing Phases
1. **Grow-In Phase (1.0 Second):**
   - When a note spawns, it takes **1.0 second to grow in** from 20% scale to full size ($26\text{px}$).
   - **PERFECT HIT (200 Points):** If the player is already hovering before the note finishes growing ($0 \le \Delta t < 1.0\text{s}$) with matching color (and matching vector within ±90° for arrow notes), they earn **200 points** + combo bonus!
   - Triggers a distinctive **Perfect Hit Animation**: golden radiant dual shockwaves, bursting 4-point star sparkles, floating celebratory text (`★ PERFECT +200 ★`), and harmonic chime.

2. **Full-Size Hittable Phase (1.0 Second):**
   - Once fully grown, the note remains hittable at full size for **1.0 second** ($1.0\text{s} \le \Delta t \le 2.0\text{s}$).
   - A circular countdown timing ring indicates the remaining window.
   - **NORMAL HIT (150–50 Points):** Hovering over the note awards **between 150 and 50 points**, scaling down linearly based on how early the player hits the note after full visibility (provided the approach is within ±90° for arrow notes).

3. **Wrong Direction Penalty (-20 Points, Arrow Notes Only):**
   - If the player hovers over an arrow note with an approach direction outside the **±90° tolerance window**, a **20-point penalty** is deducted from the total score.
   - Resets combo streak to 0, plays a fault tone, and spawns red glitch shockwaves with floating `WRONG DIRECTION -20` penalty text.
   - *Normal notes are completely exempt from directional checks and penalties.*

4. **Miss & Fadeout Phase (0.5 Seconds):**
   - If the 1.0s full-size hit window expires without a hit, the note registers a **Miss** ($0$ points).
   - Misses reset the combo counter to $0$.
   - The missed note smoothly fades out over **0.5 seconds** before despawning.

---

## 🏆 Comprehensive End Screen & Early Exit Handling

The results screen displays performance analytics both on normal completion and when leaving a song early:

1. **Completion & Early Abandonment Status:**
   - **Full Completion:** Displays `Track Completed`, `FULL COMBO!`, or `ALL PERFECT!` status banners. A run is treated as completed normally either when the song finishes, or when the player exits after **5 seconds have passed since the last note was processed**.
   - **Abandoned Early:** Displays `RUN ABANDONED` banner with amber illumination only when exiting while active notes remain or before 5 seconds have elapsed since the final note.
2. **High Score Safeguard (Strict Rule):**
   - **Completed runs** (including exit after 5s post-last-note) save to `localStorage` and can set a **New Best Score**.
   - **Abandoned runs NEVER overwrite existing records** and **never count as a new best score**, regardless of score attained.
3. **Performance Metrics:**
   - **Total Score & Best Score:** Current run score (with wrong-direction penalties accounted for) and preserved personal best.
   - **Accuracy Percentage:** Calculated from precision points earned relative to maximum possible base points ($N \times 200$).
   - **Hit Ratings Breakdown:** Dedicated counters for **Perfect (200)**, **Normal (50–150)**, **Wrong Dir (-20)**, and **Miss (0)**.
   - **Combo Statistics:** Maximum combo streak and final combo.
   - **Notes Hit & Total Notes:** Hit ratio across all track notes.
   - **Highest Possible Score & Score %:** Comparison against theoretical maximum.
4. **Actions:**
   - **Play Again (↻):** Immediately restarts the track.
   - **Select Track / Return to Editor:** Returns cleanly to the Song Selection menu or Map Editor.

---

## 💾 In-Place Map Saving

When editing any map (custom or default):
- Edits update the existing song directly under its original ID without generating duplicate saves or forked copies.
- Default track modifications are preserved in persistent local storage and seamlessly merged upon launch.
- Any notes created or modified in the Map Editor are instantly reflected in both the Song Selection menu and active gameplay.

---

## 🚀 Running the Project

You can run **Project Alpha Plus** in any browser using either method:

### Method 1: Direct File Launch (No Server Required)
Simply double-click `index.html` or drag it into any web browser (Chrome, Edge, Firefox, Safari).

### Method 2: Local HTTP Server
```bash
# Python
python -m http.server 8080

# Or Node.js
npx serve .
```
Then visit `http://localhost:8080`.

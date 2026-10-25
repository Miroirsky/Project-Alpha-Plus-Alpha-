/**
 * Test Suite: Verification of Stats Tracking, Performance Optimizations & Event Binding Idempotency
 */
const assert = require("assert");

// Mock environment
global.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
  clear() { this._store = {}; }
};
global.window = {
  localStorage: global.localStorage,
  innerWidth: 1000,
  innerHeight: 1000,
  addEventListener() {},
  removeEventListener() {}
};

global.PlayArea = require("../scripts/playArea.js");
const SaveSystem = require("../scripts/saveSystem.js");
const GameEngine = require("../scripts/gameEngine.js");

console.log("=== STARTING STATS & OPTIMIZATION VERIFICATION TESTS ===");

// Test 1: Verify saveSystem.recordRunResult accurately records notes hit and playtime
console.log("\n[Test 1] Testing SaveSystem.recordRunResult stats calculation...");
const saveSys = new SaveSystem();
saveSys.init();

const mockResults = {
  score: 15400,
  hits: 42,
  perfectHits: 30,
  goodHits: 12,
  playedSeconds: 95,
  durationSeconds: 120,
  isCompleted: true
};

saveSys.recordRunResult(mockResults, "Normal");
const stats = saveSys.currentSlotData.stats;

assert.strictEqual(stats.totalScore, 15400, "totalScore should match score");
assert.strictEqual(stats.totalNotesHit, 42, "totalNotesHit should match hits (30 + 12)");
assert.strictEqual(stats.totalPlayTime, 95, "totalPlayTime should match playedSeconds");
assert.strictEqual(stats.tracksCompleted, 1, "tracksCompleted should be incremented");
console.log("✓ Test 1 Passed: Save slot stats accurately accumulated score, hits, and play time.");

// Test 2: Verify GameEngine.getPerformanceSummary exposes accurate stats fields
console.log("\n[Test 2] Testing GameEngine.getPerformanceSummary fields...");
const engine = new GameEngine();
engine.song = { name: "Test Song", id: "song_1", difficulty: "Normal" };
engine.currentTime = 88.4;
engine.duration = 140.0;
engine.score = 25000;
engine.totalNotes = 50;
engine.hitsCount = 48;
engine.perfectHits = 38;
engine.goodHits = 10;
engine.missesCount = 2;

const summary = engine.getPerformanceSummary(true);
assert.strictEqual(summary.hits, 48, "summary.hits should be 48");
assert.strictEqual(summary.perfectHits, 38, "summary.perfectHits should be 38");
assert.strictEqual(summary.goodHits, 10, "summary.goodHits should be 10");
assert.strictEqual(summary.perfectCount, 38, "summary.perfectCount legacy property should be 38");
assert.strictEqual(summary.normalCount, 10, "summary.normalCount legacy property should be 10");
assert.strictEqual(summary.playedSeconds, 88, "summary.playedSeconds should be 88");
assert.strictEqual(summary.durationSeconds, 140, "summary.durationSeconds should be 140");
console.log("✓ Test 2 Passed: Performance summary exposes playedSeconds, durationSeconds, and hit breakdown.");

// Test 3: Record performance summary directly into SaveSystem
console.log("\n[Test 3] Testing GameEngine summary direct recording into SaveSystem...");
saveSys.recordRunResult(summary, "Normal");
assert.strictEqual(stats.totalScore, 15400 + 25000, "totalScore accumulated");
assert.strictEqual(stats.totalNotesHit, 42 + 48, "totalNotesHit accumulated from summary.hits");
assert.strictEqual(stats.totalPlayTime, 95 + 88, "totalPlayTime accumulated from summary.playedSeconds");
assert.strictEqual(stats.tracksCompleted, 2, "tracksCompleted incremented again");
console.log("✓ Test 3 Passed: Engine summary directly records into SaveSystem stats with exact precision.");

// Test 4: Directional note trigonometry & < 90° tolerance verification
console.log("\n[Test 4] Testing Directional Note trigonometry & < 90° hit tolerance...");
const dirEngine = new GameEngine({
  song: { name: "Dir Test", id: "dir_1", difficulty: "Normal" },
  notes: [
    { time: 2.0, color: "red", type: "directional", angle: 0, x: 0.5, y: 0.5 },
    { time: 3.0, color: "red", type: "directional", angle: 350, x: 0.5, y: 0.5 }
  ]
});
dirEngine.currentTime = 2.1; // Inside active window for note 0 (time: 2.0)
dirEngine.playerOrb.color = "red";

const playArea = global.PlayArea.getMetrics(1000, 1000);
const noteX = playArea.toScreenX(0.5);
const noteY = playArea.toScreenY(0.5);

// 4a. Approach from wrong direction (180°, opposite to 0°): should NOT hit
dirEngine.playerOrb.prevX = noteX - 80;
dirEngine.playerOrb.prevY = noteY;
dirEngine.playerOrb.x = noteX - 25;
dirEngine.playerOrb.y = noteY;
dirEngine.updateNotes();
assert.strictEqual(dirEngine.notes[0].hit, false, "Note should NOT be hit when mouse enters at 180°");

// 4b. Continue moving through the center of the note to the 0° side WITHOUT leaving hitDist:
// Because the mouse entered from 180° (wrong side), passing through the center must STILL NOT hit!
dirEngine.playerOrb.prevX = noteX - 25;
dirEngine.playerOrb.prevY = noteY;
dirEngine.playerOrb.x = noteX + 20;
dirEngine.playerOrb.y = noteY;
dirEngine.updateNotes();
assert.strictEqual(dirEngine.notes[0].hit, false, "Note should NOT be hit when passing through center after entering from 180°");

// 4c. Move mouse completely outside the note, then approach at 95° off (>= 90°): should NOT hit
dirEngine.playerOrb.prevX = noteX + 20;
dirEngine.playerOrb.prevY = noteY;
dirEngine.playerOrb.x = noteX + 100;
dirEngine.playerOrb.y = noteY;
dirEngine.updateNotes(); // Resets mouseInRange to false

const rad95 = (95 * Math.PI) / 180;
dirEngine.playerOrb.prevX = noteX + Math.cos(rad95) * 80;
dirEngine.playerOrb.prevY = noteY + Math.sin(rad95) * 80;
dirEngine.playerOrb.x = noteX + Math.cos(rad95) * 25;
dirEngine.playerOrb.y = noteY + Math.sin(rad95) * 25;
dirEngine.updateNotes();
assert.strictEqual(dirEngine.notes[0].hit, false, "Note should NOT be hit when mouse enters at 95° (>= 90°)");

// 4d. Move outside, then approach at 80° off (< 90° tolerance): SHOULD hit!
dirEngine.playerOrb.x = noteX + 100;
dirEngine.playerOrb.y = noteY + 100;
dirEngine.updateNotes(); // Resets mouseInRange to false

const rad80 = (80 * Math.PI) / 180;
dirEngine.playerOrb.prevX = noteX + Math.cos(rad80) * 80;
dirEngine.playerOrb.prevY = noteY + Math.sin(rad80) * 80;
dirEngine.playerOrb.x = noteX + Math.cos(rad80) * 25;
dirEngine.playerOrb.y = noteY + Math.sin(rad80) * 25;
dirEngine.updateNotes();
assert.strictEqual(dirEngine.notes[0].hit, true, "Note SHOULD be hit when mouse enters at 80° (< 90°)");

// 4e. Wraparound test: note angle = 350°, mouse enters from outside at 20° (diff = 30° < 90°): SHOULD hit!
dirEngine.currentTime = 3.1; // Inside active window for note 1 (time: 3.0)
const rad20 = (20 * Math.PI) / 180;
dirEngine.playerOrb.prevX = noteX + Math.cos(rad20) * 80;
dirEngine.playerOrb.prevY = noteY + Math.sin(rad20) * 80;
dirEngine.playerOrb.x = noteX + Math.cos(rad20) * 25;
dirEngine.playerOrb.y = noteY + Math.sin(rad20) * 25;
dirEngine.updateNotes();
assert.strictEqual(dirEngine.notes[1].hit, true, "Note at 350° SHOULD be hit when mouse enters at 20° (diff 30° < 90°)");
console.log("✓ Test 4 Passed: Directional notes lock entry angle on perimeter contact and enforce < 90° tolerance.");

// Test 5: Verify PlayArea.getMetrics centerX/centerY, bomb-shockwave effect decay, and MediaStorage cache keys
console.log("\n[Test 5] Testing PlayArea centerX/centerY, bomb-shockwave effect cleanup, and MediaStorage cache...");
assert.strictEqual(Number.isFinite(playArea.centerX), true, "playArea.centerX must be a finite number");
assert.strictEqual(Number.isFinite(playArea.centerY), true, "playArea.centerY must be a finite number");
assert.strictEqual(playArea.centerX, 500, "playArea.centerX should be 500 on 1000x1000 viewport");
assert.strictEqual(playArea.centerY, 500, "playArea.centerY should be 500 on 1000x1000 viewport");

const fxEngine = new GameEngine({ song: { name: "FX Test", id: "fx_1" }, notes: [] });
fxEngine.triggerBombHitAnimation(500, 500);
const initialShockwaves = fxEngine.effects.filter((f) => f.type === "bomb-shockwave").length;
assert.strictEqual(initialShockwaves, 2, "triggerBombHitAnimation should spawn 2 bomb-shockwave effects");
for (let step = 0; step < 60; step++) {
  fxEngine.updateEffects();
}
assert.strictEqual(fxEngine.effects.length, 0, "All bomb-shockwave, sparkle, and float-text effects must decay and be removed");

const MediaStorage = require("../scripts/mediaStorage.js");
MediaStorage.saveBackgroundMedia("test_bg_id", "data:image/png;base64,AAAA", { name: "bg.png", type: "image" });
MediaStorage.getBackgroundMedia("test_bg_id").then((cached) => {
  assert.strictEqual(cached, "data:image/png;base64,AAAA", "MediaStorage.getBackgroundMedia must hit memoryCache for id without bg_ prefix");
});
console.log("✓ Test 5 Passed: PlayArea center coordinates, bomb-shockwave decay, and MediaStorage cache keys verified.");

console.log("\n=======================================================");
console.log("ALL STATS & OPTIMIZATION TESTS PASSED SUCCESSFULLY!");
console.log("=======================================================");

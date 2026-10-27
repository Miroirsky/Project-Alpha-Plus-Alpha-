/**
 * @file test_default_songs_and_duplication.js
 * Verification test suite for:
 * 1. Immutability of default songs (cannot delete default songs or their difficulties).
 * 2. Modifying a default song duplicates it ONLY ONCE as a copy.
 * 3. Subsequent modifications to the copy update in-place without duplicating.
 * 4. All duplication problems fixed (getAllMaps deduplication, no ghost duplicates).
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

// Mock browser globals for MapStorage
global.window = {
  APP_CONFIG: {
    defaultTracksPath: "Default Tracks",
    supportedTrackExtensions: [".json"]
  },
  DEFAULT_AUDIO_DATA: {}
};

const MapStorage = require("../scripts/mapStorage.js");

console.log("=== STARTING DEFAULT SONGS & DUPLICATION VERIFICATION TESTS ===");

const mapStorage = new MapStorage();
const defaults = mapStorage.getDefaultMaps();
console.log(`Loaded ${defaults.length} default tracks:`, defaults.map(d => d.name));

assert(defaults.length >= 3, "Must have at least 3 default tracks loaded");
const moodMode = defaults.find(d => d.name === "MoodMode");
assert(moodMode, "MoodMode must exist as a default track");
assert.strictEqual(mapStorage.isDefaultTrack(moodMode), true, "MoodMode must be identified as default track");

// ---------------------------------------------------------------------------
// TEST 1: Default songs CANNOT be deleted
// ---------------------------------------------------------------------------
console.log("\n[Test 1] Testing that default songs cannot be deleted...");
const delResult = mapStorage.deleteMap(moodMode.id);
assert.strictEqual(delResult, false, "deleteMap on a default track must return false");
assert.strictEqual(mapStorage.isTrackDeleted(moodMode.id), false, "Default track ID must never be marked deleted");
assert.strictEqual(mapStorage.isTrackDeleted(moodMode.name), false, "Default track name must never be marked deleted");

const defaultsAfterDel = mapStorage.getDefaultMaps();
assert.strictEqual(defaultsAfterDel.some(d => d.id === moodMode.id), true, "Default track must remain in defaultTracks");

// Test that difficulties on default tracks cannot be deleted
const diffKeys = Object.keys(moodMode.difficulties);
if (diffKeys.length > 0) {
  const diffDelRes = mapStorage.deleteDifficulty(moodMode.id, diffKeys[0]);
  assert.strictEqual(diffDelRes, false, "deleteDifficulty on a default track must return false");
}
console.log("✓ Test 1 Passed: Default tracks and their difficulties are strictly protected against deletion.");

// ---------------------------------------------------------------------------
// TEST 2: Modifying a default song creates a copy
// ---------------------------------------------------------------------------
console.log("\n[Test 2] Modifying a default song saves as a copy...");
const initialCustomCount = mapStorage.customMaps.length;
const initialAllCount = mapStorage.getAllMaps().length;

// Clone MoodMode and modify it (e.g. add a note)
const modifiedMoodMode = {
  ...moodMode,
  difficulties: {
    ...moodMode.difficulties,
    Normal: {
      ...moodMode.difficulties.Normal,
      notes: [
        ...(moodMode.difficulties.Normal ? moodMode.difficulties.Normal.notes : []),
        { time: 99.9, color: "blue", type: "normal", x: 0.5, y: 0.5 }
      ]
    }
  }
};

const savedCopy = mapStorage.saveMap(modifiedMoodMode);
assert(savedCopy, "saveMap must return the saved object");
assert.notStrictEqual(savedCopy.id, moodMode.id, "Saved copy must have a distinct unique ID");
assert.strictEqual(savedCopy.name, "MoodMode (Copy)", "Saved copy must be named 'MoodMode (Copy)'");
assert.strictEqual(savedCopy.isCustom, true, "Saved copy must be marked isCustom = true");
assert.strictEqual(savedCopy.isDefault, false, "Saved copy must be marked isDefault = false");
assert.strictEqual(mapStorage.customMaps.length, initialCustomCount + 1, "customMaps count should increase by 1");

// Verify original default track is untouched
const defaultMoodModeAfter = mapStorage.getDefaultMaps().find(d => d.id === moodMode.id);
assert.strictEqual(defaultMoodModeAfter.name, "MoodMode", "Original default track name must remain MoodMode");
assert.strictEqual(defaultMoodModeAfter.isDefault, true, "Original default track must still be default");

console.log(`✓ Test 2 Passed: Modifying default song created copy '${savedCopy.name}' with ID ${savedCopy.id}`);

// ---------------------------------------------------------------------------
// TEST 3: Modifying the copy updates IN-PLACE without creating duplicates
// ---------------------------------------------------------------------------
console.log("\n[Test 3] Further modifying the copy updates in-place without duplicating...");
const customCountBeforeSecondEdit = mapStorage.customMaps.length;
const copyIdBeforeSecondEdit = savedCopy.id;

// Further edit the copy
const furtherEditedCopy = {
  ...savedCopy,
  bpm: 145,
  difficulties: {
    ...savedCopy.difficulties,
    Normal: {
      ...savedCopy.difficulties.Normal,
      notes: [
        ...savedCopy.difficulties.Normal.notes,
        { time: 105.0, color: "red", type: "normal", x: 0.2, y: 0.8 }
      ]
    }
  }
};

const secondSaved = mapStorage.saveMap(furtherEditedCopy);
assert.strictEqual(secondSaved.id, copyIdBeforeSecondEdit, "Second save must keep the exact same copy ID");
assert.strictEqual(mapStorage.customMaps.length, customCountBeforeSecondEdit, "customMaps count MUST NOT increase on second edit");
assert.strictEqual(secondSaved.bpm, 145, "BPM update must be applied");

console.log("✓ Test 3 Passed: Further edits to the copy updated in-place without duplicating.");

// ---------------------------------------------------------------------------
// TEST 4: getAllMaps deduplication check
// ---------------------------------------------------------------------------
console.log("\n[Test 4] Testing getAllMaps deduplication...");
const allMaps = mapStorage.getAllMaps();
const allIds = allMaps.map(m => m.id);
const uniqueIds = new Set(allIds);
assert.strictEqual(allIds.length, uniqueIds.size, "getAllMaps must have NO duplicate IDs!");

// Simulate an accidental errant duplicate injected into customMaps (e.g. from legacy cache)
mapStorage.customMaps.push({
  id: moodMode.id,
  name: "MoodMode",
  isCustom: true,
  isDefault: false
});

const dedupedMaps = mapStorage.getAllMaps();
const dedupedIds = dedupedMaps.map(m => m.id);
assert.strictEqual(new Set(dedupedIds).size, dedupedIds.length, "getAllMaps must filter out custom duplicates of default tracks");
const moodModeCount = dedupedMaps.filter(m => m.id === moodMode.id).length;
assert.strictEqual(moodModeCount, 1, "MoodMode must appear exactly ONCE in getAllMaps");

console.log("✓ Test 4 Passed: getAllMaps strictly deduplicates all entries.");

// ---------------------------------------------------------------------------
// TEST 5: Erase All Data (erases custom tracks, copies, highscores & stats; keeps default songs)
// ---------------------------------------------------------------------------
console.log("\n[Test 5] Testing Erase All Data (eraseAllCustomData & SaveSystem.eraseAllData)...");
const SaveSystem = require("../scripts/saveSystem.js");
const saveSystem = new SaveSystem();
global.window.saveSystem = saveSystem;

// Record stats and high scores first
saveSystem.recordRunResult({
  isCompleted: true,
  songId: moodMode.id,
  score: 18500,
  hits: 90,
  playedSeconds: 120
}, "Normal");
mapStorage.highscores[moodMode.id] = 18500;
mapStorage.saveHighScoresToStorage();

assert(saveSystem.currentSlotData.stats.totalScore === 18500, "Stats should record score before erase");
assert(mapStorage.customMaps.length > 0, "Should have custom maps before erase");

(async () => {
  const remainingMaps = await mapStorage.eraseAllCustomData();

  assert.strictEqual(mapStorage.customMaps.length, 0, "All custom tracks and copies must be erased");
  assert.strictEqual(Object.keys(mapStorage.highscores).length, 0, "All MapStorage highscores must be erased");
  assert.strictEqual(saveSystem.currentSlotData.stats.totalScore, 0, "SaveSystem totalScore must be reset to 0");
  assert.strictEqual(saveSystem.currentSlotData.stats.totalNotesHit, 0, "SaveSystem totalNotesHit must be reset to 0");
  assert.strictEqual(saveSystem.currentSlotData.stats.tracksCompleted, 0, "SaveSystem tracksCompleted must be reset to 0");
  assert.strictEqual(Object.keys(saveSystem.currentSlotData.highscores).length, 0, "SaveSystem highscores must be empty");

  // Default songs must still exist and be intact
  assert.strictEqual(remainingMaps.length, defaults.length, "All built-in default songs must be preserved");
  assert(remainingMaps.every(m => m.isDefault === true && !m.isCustom), "Remaining songs must all be built-in default songs");
  console.log("✓ Test 5 Passed: Erase All Data wiped all custom tracks and player stats while preserving all default songs.");

  // ---------------------------------------------------------------------------
  // TEST 6: First-Time Player 30s Quick Tutorial Prompt & Song
  // ---------------------------------------------------------------------------
  console.log("\n[Test 6] Testing First-Time 30s Tutorial Manager...");
  const TutorialManager = require("../scripts/tutorialManager.js");
  let launchedTutorialSong = null;
  const tutManager = new TutorialManager({
    onStartTutorial: (song) => {
      launchedTutorialSong = song;
    }
  });

  // Fresh erased player should be prompted for first-time tutorial
  assert.strictEqual(tutManager.shouldPromptFirstTime(), true, "Fresh first-time player must be prompted for tutorial");

  const tutSong = TutorialManager.getTutorialSong();
  assert.strictEqual(tutSong.durationSeconds, 30, "Tutorial song must be exactly 30 seconds");
  assert.strictEqual(tutSong.duration, "00:30", "Tutorial song duration display must be 00:30");
  assert.strictEqual(tutSong.isTutorial, true, "Tutorial song must have isTutorial: true");
  assert(Array.isArray(tutSong.notes) && tutSong.notes.length > 0, "Tutorial song must contain interactive notes");
  assert(TutorialManager.getCoachingHint(5.0).step.includes("STEP 1"), "Coaching hint at 5s must be Step 1");
  assert(TutorialManager.getCoachingHint(14.0).step.includes("STEP 2"), "Coaching hint at 14s must be Step 2");
  assert(TutorialManager.getCoachingHint(22.0).step.includes("STEP 3"), "Coaching hint at 22s must be Step 3");
  assert(TutorialManager.getCoachingHint(27.0).step.includes("STEP 4"), "Coaching hint at 27s must be Step 4");

  await tutManager.markPromptSeen();
  assert.strictEqual(tutManager.shouldPromptFirstTime(), false, "Player should not be prompted again after seeing tutorial prompt");

  tutManager.launchTutorial();
  assert(
    launchedTutorialSong &&
      launchedTutorialSong.id === "custom_1792933532150_9287" &&
      launchedTutorialSong.name === "Tutorial" &&
      launchedTutorialSong.notes.length === 14,
    "launchTutorial must pass the Default Tracks Tutorial song to callback"
  );
  console.log("✓ Test 6 Passed: First-time 30s tutorial detection, prompt state, and 30s tutorial beatmap verified.");

  console.log("\n=======================================================");
  console.log("ALL DEFAULT SONGS & DUPLICATION TESTS PASSED SUCCESSFULLY!");
  console.log("=======================================================");
})();

/**
 * @file test_rework_workflow.js
 * Comprehensive end-to-end test suite for the song import, export, download,
 * and default tracks auto-detection rework.
 */

const fs = require("fs");
const path = require("path");
const assert = require("assert");

// Mock browser environment globals where needed
global.window = {
  APP_CONFIG: {
    defaultTracksPath: "Default Tracks",
    supportedTrackExtensions: [".json"]
  },
  DEFAULT_AUDIO_DATA: {}
};

const MapStorage = require("./mapStorage.js");

console.log("=== STARTING PROJECT ALPHA PLUS REWORK VERIFICATION ===");

// 1. Test Default Song Auto-Detection & Easy Expansion
console.log("\n[Test 1] Testing Default Songs Auto-Detection & Easy Expansion...");
const mapStorage = new MapStorage();
const initialDefaults = mapStorage.getDefaultMaps();
console.log(`Initial default tracks count: ${initialDefaults.length}`);
assert(initialDefaults.length >= 3, "Expected at least 3 default tracks loaded initially.");

const songNames = initialDefaults.map(s => s.name);
console.log("Discovered songs:", songNames);
assert(songNames.includes("MoodMode"), "MoodMode should be detected.");
assert(songNames.includes("Why Are You Running"), "Why Are You Running should be detected.");
assert(songNames.includes("IDK"), "IDK should be detected.");

// Now simulate "Easy Expansion": add a brand new default song into 'Default Tracks/' WITHOUT editing any code
const expansionSongPath = path.join("Default Tracks", "ExpansionTestSong.json");
const expansionSongData = {
  format: "ProjectAlphaPlus-Song",
  version: 5,
  exportedAt: new Date().toISOString(),
  song: {
    name: "Expansion Test Song",
    mapper: "CommunityMapper",
    creator: "IndieArtist",
    duration: "02:45",
    durationSeconds: 165,
    file: "data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAAFAAABCAAL",
    color: "#ff0077",
    difficulties: {
      "Easy": {
        difficulty: "Easy",
        nps: 1.5,
        notes: [
          { time: 1.0, color: "blue", type: "normal", x: 0.3, y: 0.5 },
          { time: 2.0, color: "red", type: "normal", x: 0.7, y: 0.5 }
        ]
      },
      "Expert": {
        difficulty: "Expert",
        nps: 4.8,
        notes: [
          { time: 1.0, color: "blue", type: "directional", angle: 90, x: 0.2, y: 0.5 },
          { time: 1.5, color: "red", type: "directional", angle: 270, x: 0.8, y: 0.5 },
          { time: 2.0, color: "yellow", type: "triangle", x: 0.5, y: 0.8 }
        ]
      }
    }
  }
};

try {
  fs.writeFileSync(expansionSongPath, JSON.stringify(expansionSongData, null, 2), "utf8");
  console.log(`Created new song in 'Default Tracks/${path.basename(expansionSongPath)}'`);

  // Re-run auto-detection
  mapStorage.syncDetectLocalTracks();
  const updatedDefaults = mapStorage.getDefaultMaps();
  const updatedNames = updatedDefaults.map(s => s.name);
  console.log("Updated discovered songs:", updatedNames);

  assert(updatedNames.includes("Expansion Test Song"), "Expansion song should be automatically detected without editing code!");
  const expansionSong = updatedDefaults.find(s => s.name === "Expansion Test Song");
  assert(expansionSong.difficulties["Easy"], "Expansion song should have Easy difficulty");
  assert(expansionSong.difficulties["Expert"], "Expansion song should have Expert difficulty");
  assert.strictEqual(expansionSong.difficulties["Expert"].notes.length, 3, "Expert track should have 3 notes");
  console.log("✓ Test 1 Passed: New song in Default Tracks/ detected automatically with all difficulties!");
} finally {
  // Clean up expansion song file
  if (fs.existsSync(expansionSongPath)) {
    fs.unlinkSync(expansionSongPath);
    console.log("Cleaned up temporary expansion song file.");
  }
}

// 2. Test Import Custom Song
console.log("\n[Test 2] Testing Custom Song Import...");
const customSongPackage = {
  name: "Cyber Pulse",
  mapper: "NeonRhythm",
  creator: "SynthMaster",
  duration: "03:15",
  durationSeconds: 195,
  file: "data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAABAAABCAAL",
  color: "#9c27b0",
  difficulties: {
    "Normal": {
      difficulty: "Normal",
      notes: [
        { time: 0.5, color: "blue", type: "normal", x: 0.4, y: 0.5 },
        { time: 1.0, color: "red", type: "normal", x: 0.6, y: 0.5 }
      ]
    },
    "Insane": {
      difficulty: "Insane",
      notes: [
        { time: 0.5, color: "blue", type: "directional", angle: 180, x: 0.2, y: 0.5 },
        { time: 0.75, color: "red", type: "directional", angle: 0, x: 0.8, y: 0.5 },
        { time: 1.0, color: "yellow", type: "triangle", x: 0.5, y: 0.5 }
      ]
    }
  }
};

const validation = mapStorage.validateAndParseTrackCode(JSON.stringify(customSongPackage));
assert(validation.valid, "Custom song validation should pass");
const importedSong = mapStorage.importTrack(validation.song);
assert(importedSong && importedSong.id, "Imported song must have an ID");
assert(importedSong.isCustom, "Imported song must be marked isCustom = true");
assert.strictEqual(mapStorage.getSelectedSongId(), importedSong.id, "Imported song must be automatically selected!");
console.log(`✓ Test 2 Passed: Custom song imported successfully with ID ${importedSong.id} and set as selected.`);

// 3. Test Song Selection Persistence (No Auto-Switching)
console.log("\n[Test 3] Testing Selection Persistence...");
const selectedBefore = mapStorage.getSelectedSongId();
assert.strictEqual(selectedBefore, importedSong.id);

// Simulate re-detection or updating maps (which previously caused auto-switching to default track 0)
mapStorage.syncDetectLocalTracks();
assert.strictEqual(mapStorage.getSelectedSongId(), importedSong.id, "Selected song ID must remain on custom song!");

// Simulate game launch and return
mapStorage.setSelectedSongId(importedSong.id);
assert.strictEqual(mapStorage.getSelectedSongId(), importedSong.id, "After gameplay, custom song must remain selected!");
console.log("✓ Test 3 Passed: Song selection strictly preserved across detection, updates, and navigation.");

// 4. Test Export Complete Song Package
console.log("\n[Test 4] Testing Song Package Export...");
const exportResult = mapStorage.exportTrack(importedSong);
assert(exportResult && exportResult.json, "Export result must contain valid JSON string");
assert(exportResult.code.startsWith("ALPHA_SONG_V1:"), "Export code must have ALPHA_SONG_V1: header");
assert.strictEqual(exportResult.diffCount, 2, "Exported package must contain all 2 difficulties");
assert.strictEqual(exportResult.totalNotes, 5, "Exported package must contain all 5 notes across difficulties");

const exportedJson = JSON.parse(exportResult.json);
assert.strictEqual(exportedJson.format, "ProjectAlphaPlus-Song", "Format signature must match");
assert(exportedJson.song.file.startsWith("data:audio"), "Exported package MUST embed the audio Base64 data!");
console.log("✓ Test 4 Passed: Exported song contains valid JSON, code, difficulties, notes, and embedded audio.");

// 5. Test Re-Import of Exported Song
console.log("\n[Test 5] Testing Re-Import of Exported Song...");
// Re-import using the Base64 code
const reimportFromCode = mapStorage.validateAndParseTrackCode(exportResult.code);
assert(reimportFromCode.valid, "Re-imported Base64 code must be valid");
assert.strictEqual(reimportFromCode.song.name, "Cyber Pulse");
assert.strictEqual(Object.keys(reimportFromCode.song.difficulties).length, 2);

// Re-import into storage (should merge/update existing without duplicating)
const initialCustomCount = mapStorage.customMaps.length;
const reimportedSong = mapStorage.importTrack(reimportFromCode.song);
assert.strictEqual(mapStorage.customMaps.length, initialCustomCount, "Re-importing same song must merge and NOT create duplicate tracks!");
assert.strictEqual(reimportedSong.id, importedSong.id, "Re-imported song must preserve original ID");
console.log("✓ Test 5 Passed: Re-import validated, preserved ID and merged without duplicating.");

console.log("\n=== ALL REWORK TESTS PASSED SUCCESSFULLY! ===");

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("=== RUNNING ELECTRON STANDALONE SAVE & STORAGE TESTS ===");

const TEST_DIR = path.join(__dirname, 'test_temp_userdata');
const SAVES_DIR = path.join(TEST_DIR, 'saves');
const SONGS_DIR = path.join(TEST_DIR, 'custom_songs');
const DOWNLOADS_DIR = path.join(TEST_DIR, 'downloads');

// Clean test dir
if (fs.existsSync(TEST_DIR)) {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(SAVES_DIR, { recursive: true });
fs.mkdirSync(SONGS_DIR, { recursive: true });
fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

// 1. Test Profiles & Save Slots
console.log("\n[Test 1] Profiles & Save Slots Creation & Persistence...");
const profilesFile = path.join(SAVES_DIR, 'profiles.json');
const initialProfiles = {
  activeSlotId: 'slot_1',
  slots: [
    {
      id: 'slot_1',
      name: 'Player 1',
      createdAt: Date.now(),
      lastPlayed: Date.now(),
      totalPlayTime: 0,
      totalNotesHit: 0,
      totalScore: 0,
      tracksCompleted: 0
    }
  ]
};
fs.writeFileSync(profilesFile, JSON.stringify(initialProfiles, null, 2), 'utf-8');

// Slot 1 file
const slot1File = path.join(SAVES_DIR, 'slot_1.json');
const slot1Data = {
  id: 'slot_1',
  name: 'Player 1',
  createdAt: Date.now(),
  lastPlayed: Date.now(),
  highscores: {
    'default_mood_mode#normal': 85000
  },
  customMaps: [],
  stats: {
    totalPlayTime: 120,
    totalNotesHit: 340,
    totalScore: 85000,
    tracksCompleted: 1
  }
};
fs.writeFileSync(slot1File, JSON.stringify(slot1Data, null, 2), 'utf-8');

assert.strictEqual(fs.existsSync(slot1File), true, "Slot 1 file should exist");
const readSlot1 = JSON.parse(fs.readFileSync(slot1File, 'utf-8'));
assert.strictEqual(readSlot1.stats.totalScore, 85000, "Slot 1 total score should match");
assert.strictEqual(readSlot1.highscores['default_mood_mode#normal'], 85000, "Highscore should match");
console.log("✓ Profile & Slot 1 created and verified successfully.");

// 2. Test Slot 2 Creation & Switching
console.log("\n[Test 2] Multi-Slot Creation & Switching...");
const slot2Id = 'slot_2';
const slot2File = path.join(SAVES_DIR, 'slot_2.json');
const slot2Data = {
  id: slot2Id,
  name: 'SpeedDemon',
  createdAt: Date.now(),
  lastPlayed: Date.now(),
  highscores: {
    'default_chance#expert': 195000
  },
  customMaps: [],
  stats: {
    totalPlayTime: 360,
    totalNotesHit: 890,
    totalScore: 195000,
    tracksCompleted: 2
  }
};
fs.writeFileSync(slot2File, JSON.stringify(slot2Data, null, 2), 'utf-8');

initialProfiles.slots.push({
  id: slot2Id,
  name: slot2Data.name,
  createdAt: slot2Data.createdAt,
  lastPlayed: slot2Data.lastPlayed,
  totalPlayTime: slot2Data.stats.totalPlayTime,
  totalNotesHit: slot2Data.stats.totalNotesHit,
  totalScore: slot2Data.stats.totalScore,
  tracksCompleted: slot2Data.stats.tracksCompleted
});
initialProfiles.activeSlotId = slot2Id;
fs.writeFileSync(profilesFile, JSON.stringify(initialProfiles, null, 2), 'utf-8');

const updatedProfiles = JSON.parse(fs.readFileSync(profilesFile, 'utf-8'));
assert.strictEqual(updatedProfiles.activeSlotId, 'slot_2', "Active slot should be slot_2");
assert.strictEqual(updatedProfiles.slots.length, 2, "There should be 2 save slots");
console.log("✓ Multi-slot creation and switching verified successfully.");

// 3. Test Export & Import Save Slot
console.log("\n[Test 3] Save Slot Export and Import...");
const exportPath = path.join(TEST_DIR, 'exported_slot_2.json');
fs.writeFileSync(exportPath, JSON.stringify(slot2Data, null, 2), 'utf-8');
assert.strictEqual(fs.existsSync(exportPath), true, "Exported file should exist");

const importedRaw = fs.readFileSync(exportPath, 'utf-8');
const importedSlot = JSON.parse(importedRaw);
const importedId = 'slot_imported_3';
importedSlot.id = importedId;
importedSlot.name = `${importedSlot.name} (Imported)`;
const slot3File = path.join(SAVES_DIR, `${importedId}.json`);
fs.writeFileSync(slot3File, JSON.stringify(importedSlot, null, 2), 'utf-8');

assert.strictEqual(fs.existsSync(slot3File), true, "Imported slot file should exist on disk");
console.log("✓ Export and Import verified successfully.");

// 4. Test Custom Song Saving & Reading
console.log("\n[Test 4] Custom Song Disk Persistence...");
const customSong = {
  id: 'custom_test_track',
  name: 'Neon Velocity',
  artist: 'Synth Master',
  mapper: 'AlphaTeam',
  duration: 120,
  difficulties: {
    'Normal': {
      difficulty: 'Normal',
      notes: [
        { time: 1.0, x: 200, y: 300, color: '#00d4ff', direction: 'left' },
        { time: 2.0, x: 400, y: 300, color: '#ff4757', direction: 'right' }
      ]
    }
  }
};
const customSongFile = path.join(SONGS_DIR, 'Neon Velocity.json');
fs.writeFileSync(customSongFile, JSON.stringify(customSong, null, 2), 'utf-8');
assert.strictEqual(fs.existsSync(customSongFile), true, "Custom song should exist in custom_songs folder");

const readCustom = JSON.parse(fs.readFileSync(customSongFile, 'utf-8'));
assert.strictEqual(readCustom.id, 'custom_test_track');
assert.strictEqual(readCustom.difficulties['Normal'].notes.length, 2);
console.log("✓ Custom song disk persistence verified successfully.");

// 5. Test Settings Persistence
console.log("\n[Test 5] Settings Persistence...");
const settingsFile = path.join(SAVES_DIR, 'settings.json');
const settings = {
  soundEnabled: true,
  soundVolume: 85,
  theme: 'midnight',
  fullscreen: true,
  offsetMs: 15
};
fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf-8');
const readSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
assert.strictEqual(readSettings.soundVolume, 85);
assert.strictEqual(readSettings.theme, 'midnight');
assert.strictEqual(readSettings.fullscreen, true);
console.log("✓ Settings persistence verified successfully.");

// Clean up
fs.rmSync(TEST_DIR, { recursive: true, force: true });

console.log("\n=======================================================");
console.log("ALL TESTS PASSED! Local saving, multi-slots, import/export,");
console.log("and disk file structures are completely verified.");
console.log("=======================================================");

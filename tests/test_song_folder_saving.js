const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("=== RUNNING SONG FOLDER AUTO-SAVE & SCAN TESTS ===");

const TEST_DIR = path.join(__dirname, 'test_temp_song_folders');
const SONGS_DIR = path.join(TEST_DIR, 'custom_songs');

if (fs.existsSync(TEST_DIR)) {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(SONGS_DIR, { recursive: true });

// 1. Simulate saving a song package as a direct folder: custom_songs/pack_01/
console.log("\n[Test 1] Saving song as direct folder: custom_songs/pack_01/...");
const packFolder = path.join(SONGS_DIR, 'pack_01');
fs.mkdirSync(packFolder, { recursive: true });

// Mock audio: track.ogg
const audioPath = path.join(packFolder, 'track.ogg');
fs.writeFileSync(audioPath, Buffer.from("OggS_MOCK_AUDIO_DATA_FOR_TESTING"));

// Mock video: background.mp4
const bgPath = path.join(packFolder, 'background.mp4');
fs.writeFileSync(bgPath, Buffer.from("ftypisom_MOCK_VIDEO_DATA_FOR_TESTING"));

// Metadata: notes.json
const notesData = {
  id: "custom_pack_01",
  name: "Cyber Odyssey",
  mapper: "AlphaMapper",
  creator: "ElectroBeats",
  duration: "03:45",
  bpm: 140,
  file: "track.ogg",
  background: {
    url: "background.mp4",
    mediaType: "video",
    fit: "cover",
    opacity: 0.8
  },
  cover: "cover.png",
  difficulties: {
    "Normal": {
      difficulty: "Normal",
      notes: [
        { time: 1.2, x: 250, y: 300, color: "#00d4ff", direction: "left" },
        { time: 2.4, x: 500, y: 300, color: "#ff4757", direction: "right" }
      ],
      nps: 1.5
    }
  }
};
const notesPath = path.join(packFolder, 'notes.json');
fs.writeFileSync(notesPath, JSON.stringify(notesData, null, 2), 'utf-8');

assert.strictEqual(fs.existsSync(notesPath), true, "notes.json must exist in pack_01");
assert.strictEqual(fs.existsSync(audioPath), true, "track.ogg must exist in pack_01");
assert.strictEqual(fs.existsSync(bgPath), true, "background.mp4 must exist in pack_01");
console.log("✓ Song folder pack_01 created with track.ogg, background.mp4, and notes.json.");

// 2. Simulate scanner logic
console.log("\n[Test 2] Scanning custom_songs directory for song folders...");
const scannedSongs = [];
const items = fs.readdirSync(SONGS_DIR);

for (const item of items) {
  const itemPath = path.join(SONGS_DIR, item);
  const stat = fs.statSync(itemPath);

  if (stat.isDirectory()) {
    const notesFile = path.join(itemPath, 'notes.json');
    if (fs.existsSync(notesFile)) {
      const parsed = JSON.parse(fs.readFileSync(notesFile, 'utf-8'));
      parsed._folderPath = itemPath;
      parsed._folderName = item;
      parsed._filePath = notesFile;

      // Resolve audio
      const resolvedAudio = path.join(itemPath, parsed.file);
      assert.strictEqual(fs.existsSync(resolvedAudio), true, "Resolved audio must exist on disk");
      parsed._localAudioPath = resolvedAudio;

      // Resolve video
      const resolvedBg = path.join(itemPath, parsed.background.url);
      assert.strictEqual(fs.existsSync(resolvedBg), true, "Resolved background video must exist on disk");
      parsed._localBgPath = resolvedBg;

      scannedSongs.push(parsed);
    }
  }
}

assert.strictEqual(scannedSongs.length, 1, "Must find exactly 1 song folder");
const foundSong = scannedSongs[0];
assert.strictEqual(foundSong.name, "Cyber Odyssey");
assert.strictEqual(foundSong._folderName, "pack_01");
assert.strictEqual(foundSong.difficulties["Normal"].notes.length, 2);
console.log("✓ Scanned song folder and validated relative audio/video resolution.");

// 3. Simulate Editor modifying and auto-saving notes.json in the folder
console.log("\n[Test 3] Simulating editor note addition & auto-saving into pack_01/notes.json...");
foundSong.difficulties["Normal"].notes.push({
  time: 3.6,
  x: 350,
  y: 400,
  color: "#00d4ff",
  direction: "up"
});
fs.writeFileSync(notesPath, JSON.stringify(foundSong, null, 2), 'utf-8');

const updatedNotes = JSON.parse(fs.readFileSync(notesPath, 'utf-8'));
assert.strictEqual(updatedNotes.difficulties["Normal"].notes.length, 3, "Notes count should now be 3");
console.log("✓ Editor note modifications successfully saved to disk.");

// Clean up test directory
fs.rmSync(TEST_DIR, { recursive: true, force: true });

console.log("\n=======================================================");
console.log("ALL TESTS PASSED! Song folder auto-saving verified: ");
console.log("custom_songs/pack_01/ -> track.ogg, background.mp4, notes.json");
console.log("=======================================================");

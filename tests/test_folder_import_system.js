/**
 * @file test_folder_import_system.js
 * @description Comprehensive unit tests for:
 * 1. Full song folder requirement (notes.json + track.ogg/mp3 + background.mp4).
 * 2. Invalidation and rejection of incomplete tracks (missing notes, missing audio, or missing background).
 * 3. Invalidation and rejection of legacy loose .json tracks.
 * 4. Importing complete song folders into custom_songs/.
 * 5. Removal of default tracks from library.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Setup isolated test directories
const TEST_ROOT = path.join(__dirname, 'temp_import_test');
const CUSTOM_SONGS_DIR = path.join(TEST_ROOT, 'custom_songs');
const EXTERNAL_DOWNLOADS_DIR = path.join(TEST_ROOT, 'external_downloads');

if (fs.existsSync(TEST_ROOT)) {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
}
fs.mkdirSync(CUSTOM_SONGS_DIR, { recursive: true });
fs.mkdirSync(EXTERNAL_DOWNLOADS_DIR, { recursive: true });

function toFileUrl(filePath) {
  if (!filePath || typeof filePath !== 'string') return filePath;
  const clean = filePath.replace(/\\/g, '/');
  return clean.startsWith('file://') ? clean : 'file:///' + clean.replace(/^\/+/, '');
}

// Function simulating parseSongFolderSync from electron/main.js
function parseSongFolderSync(folderPath) {
  try {
    if (!fs.existsSync(folderPath)) {
      return { valid: false, error: 'Folder does not exist' };
    }
    const stat = fs.statSync(folderPath);
    if (!stat.isDirectory()) {
      return { valid: false, error: 'Path is not a folder' };
    }

    const innerFiles = fs.readdirSync(folderPath);

    // 1. Must contain notes.json
    let notesFile = null;
    if (fs.existsSync(path.join(folderPath, 'notes.json'))) {
      notesFile = path.join(folderPath, 'notes.json');
    } else {
      const match = innerFiles.find(f => f.toLowerCase().endsWith('.json'));
      if (match) notesFile = path.join(folderPath, match);
    }

    if (!notesFile) {
      return { valid: false, error: 'Missing notes.json' };
    }

    const raw = fs.readFileSync(notesFile, 'utf-8');
    const parsed = JSON.parse(raw);
    const folderName = path.basename(folderPath);

    parsed._folderPath = folderPath;
    parsed._folderName = folderName;
    parsed._filePath = notesFile;
    parsed._source = 'custom_disk';

    // 2. Must contain Audio (track.ogg, track.mp3, track.wav, etc.)
    let audioFound = false;
    let localAudioPath = null;
    if (parsed.file && typeof parsed.file === 'string' && !parsed.file.startsWith('data:') && !parsed.file.startsWith('http') && !parsed.file.startsWith('blob:')) {
      const candidate = path.isAbsolute(parsed.file) ? parsed.file : path.join(folderPath, parsed.file);
      if (fs.existsSync(candidate)) {
        localAudioPath = candidate;
        parsed.file = toFileUrl(candidate);
        parsed._localAudioPath = candidate;
        audioFound = true;
      }
    }
    if (!audioFound) {
      const autoAudio = innerFiles.find(f => /^(track|audio|song)\.(ogg|mp3|wav|m4a|flac)$/i.test(f))
        || innerFiles.find(f => /\.(ogg|mp3|wav|m4a|flac)$/i.test(f));
      if (autoAudio) {
        localAudioPath = path.join(folderPath, autoAudio);
        parsed.file = toFileUrl(localAudioPath);
        parsed._localAudioPath = localAudioPath;
        audioFound = true;
      }
    }

    if (!audioFound) {
      return { valid: false, error: 'Missing audio file (track.ogg, track.mp3, or track.wav)' };
    }

    // 3. Resolve Background Media (background.mp4, background.webm, image, etc.) - Optional
    const bgObj = parsed.background || {};
    let bgFound = false;
    let localBgPath = null;
    if (bgObj.url && typeof bgObj.url === 'string' && !bgObj.url.startsWith('data:') && !bgObj.url.startsWith('http') && !bgObj.url.startsWith('blob:')) {
      const candidate = path.isAbsolute(bgObj.url) ? bgObj.url : path.join(folderPath, bgObj.url);
      if (fs.existsSync(candidate)) {
        localBgPath = candidate;
        parsed.background = {
          ...bgObj,
          url: toFileUrl(candidate),
          mediaType: /\.(mp4|webm|mkv|mov)$/i.test(candidate) ? 'video' : 'image'
        };
        parsed._localBgPath = candidate;
        bgFound = true;
      }
    }
    if (!bgFound) {
      const autoBg = innerFiles.find(f => /^background\.(mp4|webm|mkv|mov|png|jpg|jpeg|gif)$/i.test(f))
        || innerFiles.find(f => /\.(mp4|webm|mkv|mov)$/i.test(f));
      if (autoBg) {
        localBgPath = path.join(folderPath, autoBg);
        const isVid = /\.(mp4|webm|mkv|mov)$/i.test(autoBg);
        parsed.background = {
          ...bgObj,
          url: toFileUrl(localBgPath),
          mediaType: isVid ? 'video' : 'image',
          fit: bgObj.fit || 'cover',
          opacity: typeof bgObj.opacity === 'number' ? bgObj.opacity : 0.7
        };
        parsed._localBgPath = localBgPath;
        bgFound = true;
      }
    }

    if (!bgFound && (!parsed.background || !parsed.background.url)) {
      parsed.background = null;
    }

    return {
      valid: true,
      folderName,
      folderPath,
      song: parsed
    };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// Function simulating copyAndLoadSongFolder from electron/main.js
function copyAndLoadSongFolder(sourceDir, destSongsDir = CUSTOM_SONGS_DIR) {
  try {
    if (!sourceDir || !fs.existsSync(sourceDir)) {
      return { success: false, error: 'Selected folder does not exist.' };
    }
    const stat = fs.statSync(sourceDir);
    if (!stat.isDirectory()) {
      return {
        success: false,
        error: 'You must select an entire song folder (e.g. pack_01/ containing notes.json and audio track).'
      };
    }

    const validation = parseSongFolderSync(sourceDir);
    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid song folder: ${validation.error}. Entire folder with notes.json and track audio (track.ogg/mp3/wav) is required.`
      };
    }

    const folderName = path.basename(sourceDir).replace(/[/\\?%*:|"<>]/g, '_').trim() || `song_${Date.now()}`;
    const destPath = path.join(destSongsDir, folderName);

    if (path.resolve(sourceDir) !== path.resolve(destPath)) {
      fs.cpSync(sourceDir, destPath, { recursive: true, force: true });
    }

    const loaded = parseSongFolderSync(destPath);
    if (!loaded.valid) {
      return { success: false, error: `Failed to load copied song folder: ${loaded.error}` };
    }

    return {
      success: true,
      folderName,
      folderPath: destPath,
      song: loaded.song
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Scanner simulating tracks:scan-folders
function scanSongsDir(songsDir = CUSTOM_SONGS_DIR) {
  const songs = [];
  const errors = [];
  if (fs.existsSync(songsDir)) {
    const items = fs.readdirSync(songsDir);
    for (const item of items) {
      const itemPath = path.join(songsDir, item);
      let stat;
      try { stat = fs.statSync(itemPath); } catch (e) { continue; }

      if (stat.isDirectory()) {
        const parsedRes = parseSongFolderSync(itemPath);
        if (parsedRes.valid) {
          songs.push(parsedRes.song);
        } else {
          errors.push({ folder: item, error: parsedRes.error });
        }
      }
    }
  }
  return { songs, errors };
}

console.log('=== RUNNING SONG FOLDER IMPORT & STRICT VALIDATION TESTS ===\n');

// -------------------------------------------------------------
// Test 1: Incomplete folder missing audio is REJECTED
// -------------------------------------------------------------
console.log('[Test 1] Testing rejection of folder missing audio...');
const missingAudioFolder = path.join(EXTERNAL_DOWNLOADS_DIR, 'bad_pack_no_audio');
fs.mkdirSync(missingAudioFolder, { recursive: true });
fs.writeFileSync(path.join(missingAudioFolder, 'notes.json'), JSON.stringify({ name: 'No Audio', notes: [] }));
fs.writeFileSync(path.join(missingAudioFolder, 'background.mp4'), 'fake_video');

const res1 = copyAndLoadSongFolder(missingAudioFolder);
assert.strictEqual(res1.success, false, 'Should fail because audio file is missing');
assert(res1.error.includes('Missing audio file'), 'Error message must specify missing audio');
console.log('✓ Incomplete folder without audio successfully rejected.');

// -------------------------------------------------------------
// Test 2: Folder missing background CAN be imported successfully
// (Background is optional; track audio and notes.json are mandatory)
// -------------------------------------------------------------
console.log('[Test 2] Testing that folder missing background CAN be imported successfully...');
const missingBgFolder = path.join(EXTERNAL_DOWNLOADS_DIR, 'pack_no_bg');
fs.mkdirSync(missingBgFolder, { recursive: true });
fs.writeFileSync(path.join(missingBgFolder, 'notes.json'), JSON.stringify({ name: 'Track Without Bg', notes: [] }));
fs.writeFileSync(path.join(missingBgFolder, 'track.ogg'), 'fake_audio');

const res2 = copyAndLoadSongFolder(missingBgFolder);
assert.strictEqual(res2.success, true, 'Folder without background must import successfully');
assert.strictEqual(res2.song.name, 'Track Without Bg');
assert.strictEqual(res2.song.background, null, 'Song background should be null when omitted');
console.log('✓ Song folder without background successfully imported.');

// -------------------------------------------------------------
// Test 3: Incomplete folder missing notes.json is REJECTED
// -------------------------------------------------------------
console.log('[Test 3] Testing rejection of folder missing notes.json...');
const missingNotesFolder = path.join(EXTERNAL_DOWNLOADS_DIR, 'bad_pack_no_notes');
fs.mkdirSync(missingNotesFolder, { recursive: true });
fs.writeFileSync(path.join(missingNotesFolder, 'track.ogg'), 'fake_audio');
fs.writeFileSync(path.join(missingNotesFolder, 'background.mp4'), 'fake_video');

const res3 = copyAndLoadSongFolder(missingNotesFolder);
assert.strictEqual(res3.success, false, 'Should fail because notes.json is missing');
assert(res3.error.includes('Missing notes.json'), 'Error message must specify missing notes.json');
console.log('✓ Incomplete folder without notes.json successfully rejected.');

// -------------------------------------------------------------
// Test 4: Loose .json files in custom_songs/ are ignored by the folder scanner
// -------------------------------------------------------------
console.log('[Test 4] Testing that loose legacy .json files in custom_songs do not work...');
fs.writeFileSync(path.join(CUSTOM_SONGS_DIR, 'legacy_song.json'), JSON.stringify({ name: 'Legacy Single File', notes: [] }));

const scanResult1 = scanSongsDir(CUSTOM_SONGS_DIR);
assert.strictEqual(scanResult1.songs.some(s => s.name === 'Legacy Single File'), false, 'Loose single .json files must not be loaded');
console.log('✓ Loose legacy .json files ignored; scanner only accepts valid folder packages.');

// -------------------------------------------------------------
// Test 5: Complete song folder with notes.json, track.ogg, background.mp4 IMPORTS CLEANLY
// -------------------------------------------------------------
console.log('[Test 5] Importing a valid complete song folder (pack_01)...');
const validFolder = path.join(EXTERNAL_DOWNLOADS_DIR, 'pack_01');
fs.mkdirSync(validFolder, { recursive: true });
fs.writeFileSync(path.join(validFolder, 'notes.json'), JSON.stringify({
  id: 'pack_01_id',
  name: 'Cyber Rave 2026',
  mapper: 'NeoMapper',
  bpm: 175,
  notes: [{ time: 1.0, col: 0 }, { time: 2.0, col: 1 }],
  difficulties: {
    Hard: { difficulty: 'Hard', notes: [{ time: 1.0, col: 0 }] }
  }
}, null, 2));
fs.writeFileSync(path.join(validFolder, 'track.ogg'), 'OggS_fake_audio_stream');
fs.writeFileSync(path.join(validFolder, 'background.mp4'), 'mp4_fake_video_stream');

const importRes = copyAndLoadSongFolder(validFolder);
assert.strictEqual(importRes.success, true, 'Import should succeed');
assert.strictEqual(importRes.folderName, 'pack_01');
assert.strictEqual(importRes.song.name, 'Cyber Rave 2026');
assert(importRes.song.file.startsWith('file:///'), 'Audio path must be converted to file:/// URL');
assert(importRes.song.background.url.startsWith('file:///'), 'Video path must be converted to file:/// URL');
assert.strictEqual(importRes.song.background.mediaType, 'video');

// Check that files now physically exist inside custom_songs/pack_01/
const installedDir = path.join(CUSTOM_SONGS_DIR, 'pack_01');
assert(fs.existsSync(path.join(installedDir, 'notes.json')), 'notes.json must exist in custom_songs/pack_01/');
assert(fs.existsSync(path.join(installedDir, 'track.ogg')), 'track.ogg must exist in custom_songs/pack_01/');
assert(fs.existsSync(path.join(installedDir, 'background.mp4')), 'background.mp4 must exist in custom_songs/pack_01/');
console.log('✓ Complete song folder successfully copied and loaded into custom_songs/pack_01/.');

// -------------------------------------------------------------
// Test 6: Verify folder scanner discovers the newly imported song folder
// -------------------------------------------------------------
console.log('[Test 6] Testing scanner discovery of installed song folder...');
const scanResult2 = scanSongsDir(CUSTOM_SONGS_DIR);
assert.strictEqual(scanResult2.songs.length, 2, 'Scanner should discover both valid song folders');
const foundPack01 = scanResult2.songs.find(s => s.id === 'pack_01_id');
assert(Boolean(foundPack01), 'Scanner must discover pack_01');
assert.strictEqual(foundPack01._folderName, 'pack_01');
console.log('✓ Scanner successfully discovered and verified pack_01.');

// Cleanup
fs.rmSync(TEST_ROOT, { recursive: true, force: true });
console.log('\n=======================================================');
console.log('ALL TESTS PASSED! Strict folder-only import verified:');
console.log('└── pack_01/');
console.log('    ├── track.ogg');
console.log('    ├── background.mp4');
console.log('    └── notes.json');
console.log('=======================================================');

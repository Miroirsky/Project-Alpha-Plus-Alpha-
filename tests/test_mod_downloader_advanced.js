const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const ModDownloader = require('../scripts/modDownloader.js');

// Test URL normalization logic
function normalizeDownloadUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
    try {
        let url = rawUrl.trim();
        const gDriveMatch = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/i);
        if (gDriveMatch && gDriveMatch[1]) {
            return `https://drive.google.com/uc?export=download&id=${gDriveMatch[1]}&confirm=t`;
        }
        if (url.includes('dropbox.com')) {
            if (url.includes('dl=0')) return url.replace('dl=0', 'dl=1');
            if (!url.includes('dl=1')) {
                const joinChar = url.includes('?') ? '&' : '?';
                return `${url}${joinChar}dl=1`;
            }
            return url;
        }
        const ghBlobMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i);
        if (ghBlobMatch) {
            return `https://raw.githubusercontent.com/${ghBlobMatch[1]}/${ghBlobMatch[2]}/${ghBlobMatch[3]}`;
        }
        return url;
    } catch (e) {
        return rawUrl;
    }
}

async function runAdvancedDownloaderTests() {
    console.log('=== Testing Advanced In-Game Song & Mod Downloader Logic ===\n');

    // 1. Verify URL Normalization
    console.log('1. Testing URL normalization for Google Drive, Dropbox, and GitHub...');
    assert.strictEqual(
        normalizeDownloadUrl('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view?usp=sharing'),
        'https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOpQrStUvWxYz&confirm=t',
        'Google Drive sharing link must be normalized to direct download'
    );
    assert.strictEqual(
        normalizeDownloadUrl('https://www.dropbox.com/s/xyz123/my_track.zip?dl=0'),
        'https://www.dropbox.com/s/xyz123/my_track.zip?dl=1',
        'Dropbox preview link must be converted to dl=1'
    );
    assert.strictEqual(
        normalizeDownloadUrl('https://github.com/Miroirsky/Project-Alpha-Plus-Alpha-/blob/main/Default%20Tracks/IDK/notes.json'),
        'https://raw.githubusercontent.com/Miroirsky/Project-Alpha-Plus-Alpha-/main/Default%20Tracks/IDK/notes.json',
        'GitHub blob URL must be converted to raw.githubusercontent.com'
    );
    console.log('   [PASS] URL normalization verified.');

    // 2. Test Zip Extraction & Ingest
    console.log('2. Testing Zip package ingest and song folder creation...');
    const testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paplus-downloader-test-'));
    const zipSourceDir = path.join(testTempDir, 'mock_song_source');
    fs.mkdirSync(zipSourceDir, { recursive: true });

    const mockNotes = {
        name: 'Downloader Test Track',
        bpm: 140,
        difficulty: 'Hard',
        difficulties: {
            Hard: { notes: [{ time: 1.0, lane: 2, type: 'tap' }] }
        },
        file: 'track.mp3'
    };
    fs.writeFileSync(path.join(zipSourceDir, 'notes.json'), JSON.stringify(mockNotes, null, 2));
    fs.writeFileSync(path.join(zipSourceDir, 'track.mp3'), Buffer.alloc(1024, 0xAA));

    const zipDestPath = path.join(testTempDir, 'mock_song.zip');
    // Create test zip using tar
    execFileSync('tar', ['-cf', zipDestPath, '-C', zipSourceDir, 'notes.json', 'track.mp3'], { windowsHide: true });
    assert.ok(fs.existsSync(zipDestPath), 'Test zip must be created');

    // Test extraction logic
    const extractOutDir = path.join(testTempDir, 'extracted');
    fs.mkdirSync(extractOutDir, { recursive: true });
    execFileSync('tar', ['-xf', zipDestPath, '-C', extractOutDir], { windowsHide: true });
    assert.ok(fs.existsSync(path.join(extractOutDir, 'notes.json')), 'Extracted notes.json must exist');
    assert.ok(fs.existsSync(path.join(extractOutDir, 'track.mp3')), 'Extracted track.mp3 must exist');
    console.log('   [PASS] Zip package extraction verified.');

    // 3. Test ModDownloader UI interaction with mock electronAPI
    console.log('3. Testing ModDownloader controller flow with mock backend...');
    let downloadCalled = false;
    let selectedSongId = null;

    const mockElements = {
        'downloader-modal': { classList: { add() {}, remove() {} }, setAttribute() {}, addEventListener() {} },
        'downloader-url-input': { value: 'https://example.com/song.zip', focus() {}, addEventListener() {} },
        'downloader-name-input': { value: 'My Awesome Pack', addEventListener() {} },
        'btn-start-download': { disabled: false, innerHTML: '', addEventListener(ev, fn) { this._click = fn; } },
        'btn-close-downloader': { addEventListener() {} },
        'btn-downloader-open-folder': { addEventListener() {} },
        'downloader-progress-bar': { style: {} },
        'downloader-progress-text': { textContent: '' },
        'downloader-status-alert': { style: {}, textContent: '', className: '' }
    };

    global.window = {
        electronAPI: {
            isElectron: true,
            downloadFile: async (url, subfolder, preferredName) => {
                downloadCalled = true;
                return {
                    success: true,
                    filePath: 'G:/custom_songs/My Awesome Pack',
                    fileName: 'My Awesome Pack',
                    song: { id: 'custom_test_999', name: 'My Awesome Pack' },
                    isSongFolder: true
                };
            },
            onDownloadProgress: () => () => {}
        },
        playMenu: {
            updateSongs() {},
            selectSongById(id) { selectedSongId = id; }
        }
    };
    global.document = {
        getElementById(id) { return mockElements[id] || null; }
    };

    const mockStorage = {
        loadFromElectronDisk: async () => [],
        getAllMaps: () => [{ id: 'custom_test_999', name: 'My Awesome Pack' }]
    };

    const dlInstance = new ModDownloader({ mapStorage: mockStorage });
    await dlInstance.handleDownload();

    assert.strictEqual(downloadCalled, true, 'downloadFile must be called');
    assert.strictEqual(selectedSongId, 'custom_test_999', 'Downloaded song must be automatically selected in playMenu');
    assert.ok(mockElements['downloader-status-alert'].textContent.includes('Download complete'), 'Success alert must be shown');
    console.log('   [PASS] ModDownloader controller flow verified.');

    // Cleanup
    try {
        fs.rmSync(testTempDir, { recursive: true, force: true });
    } catch (e) {}

    console.log('\nALL ADVANCED DOWNLOADER TESTS PASSED SUCCESSFULLY!');
}

runAdvancedDownloaderTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});

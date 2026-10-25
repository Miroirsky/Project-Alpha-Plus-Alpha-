const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { execFileSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const WebLanding = require('../scripts/webLanding.js');
const { createServer } = require('../server.js');

async function runTests() {
    console.log('=== Testing Web vs Electron Detection, Landing Page, & PAPLUS-Downloader.exe ===\n');

    // 1. Test WebLanding.isElectronEnvironment() static detection
    console.log('1. Testing WebLanding.isElectronEnvironment() detection logic...');
    const savedWindow = global.window;
    const savedNavigator = global.navigator;
    const savedProcess = global.process;

    try {
        // Case A: Standard Web Browser (no electronAPI, no electron UA)
        global.window = {
            electronAPI: undefined,
            navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36' }
        };
        global.navigator = global.window.navigator;
        // Temporarily mask process.versions.electron if running in plain Node
        assert.strictEqual(WebLanding.isElectronEnvironment(), false, 'Should detect standard web browser as non-Electron');

        // Case B: Electron via preload bridge (window.electronAPI.isElectron === true)
        global.window = {
            electronAPI: { isElectron: true },
            navigator: { userAgent: 'Mozilla/5.0 Chrome/124.0.0.0' }
        };
        assert.strictEqual(WebLanding.isElectronEnvironment(), true, 'Should detect window.electronAPI.isElectron === true as Electron');

        // Case C: Electron via User-Agent
        global.window = {
            electronAPI: undefined,
            navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ProjectAlphaPlus/1.0.0 Electron/45.0.0 Chrome/130.0.0.0' }
        };
        assert.strictEqual(WebLanding.isElectronEnvironment(), true, 'Should detect Electron user-agent as Electron');
        console.log('   [PASS] Web vs Electron runtime detection works accurately.');
    } finally {
        global.window = savedWindow;
        global.navigator = savedNavigator;
        global.process = savedProcess;
    }

    // 2. Test index.html structure and WebLanding controller behavior in Web Mode vs Electron Mode
    console.log('2. Testing index.html & WebLanding UI controller in Web vs Electron modes...');
    const htmlContent = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    assert.ok(htmlContent.includes('id="web-landing-view"'), 'index.html must include #web-landing-view');
    assert.ok(htmlContent.includes('id="btn-web-download-installer"'), 'index.html must include #btn-web-download-installer');
    assert.ok(htmlContent.includes('PAPLUS-Downloader.exe'), 'index.html must reference PAPLUS-Downloader.exe');
    assert.ok(htmlContent.includes('styles/webLanding.css'), 'index.html must link styles/webLanding.css');
    assert.ok(htmlContent.includes('scripts/webLanding.js'), 'index.html must include scripts/webLanding.js');

    // Mock DOM elements to test WebLanding.initWebMode() and WebLanding.hideForElectron()
    const createMockEl = () => ({
        classes: new Set(),
        attributes: {},
        listeners: {},
        style: {},
        classList: {
            add(c) { this._el.classes.add(c); },
            remove(c) { this._el.classes.delete(c); },
            toggle(c, force) {
                if (force) this._el.classes.add(c);
                else this._el.classes.delete(c);
            }
        },
        setAttribute(k, v) { this.attributes[k] = v; },
        removeAttribute(k) { delete this.attributes[k]; },
        addEventListener(ev, fn) { this.listeners[ev] = fn; }
    });
    const mockElements = {
        'web-landing-view': createMockEl(),
        'main-menu-card': createMockEl(),
        'btn-web-download-installer': createMockEl(),
        'btn-web-nav-download': createMockEl(),
        'btn-web-bottom-download': createMockEl(),
        'web-download-status-banner': createMockEl(),
        'web-download-status-text': createMockEl()
    };
    Object.values(mockElements).forEach(el => { el.classList._el = el; });

    let clickedDownloadHref = null;
    let clickedDownloadAttr = null;
    global.window = {
        location: { protocol: 'http:' }
    };
    global.document = {
        body: {
            classes: new Set(),
            classList: {
                add(c) { global.document.body.classes.add(c); },
                remove(c) { global.document.body.classes.delete(c); }
            },
            setAttribute() {},
            getAttribute() { return 'terracotta'; },
            appendChild() {},
            removeChild() {}
        },
        getElementById(id) { return mockElements[id] || null; },
        querySelectorAll() { return []; },
        createElement(tag) {
            return {
                tag,
                href: '',
                attributes: {},
                style: {},
                setAttribute(k, v) { this.attributes[k] = v; },
                click() {
                    clickedDownloadHref = this.href;
                    clickedDownloadAttr = this.attributes['download'];
                }
            };
        }
    };
    global.localStorage = { getItem() { return 'terracotta'; }, setItem() {} };

    const webLanding = new WebLanding();
    webLanding.initWebMode();

    assert.strictEqual(mockElements['web-landing-view'].classes.has('is-active'), true, 'Web landing view must be active in Web mode');
    assert.strictEqual(mockElements['web-landing-view'].attributes['aria-hidden'], 'false', 'Web landing view aria-hidden must be false in Web mode');
    assert.strictEqual(mockElements['main-menu-card'].style.display, 'none', 'Main game menu must be hidden in Web mode');

    // Trigger download button click
    mockElements['btn-web-download-installer'].listeners['click']({ preventDefault() {} });
    assert.strictEqual(clickedDownloadAttr, 'PAPLUS-Downloader.exe', 'Clicking download button must trigger download of PAPLUS-Downloader.exe');

    webLanding.hideForElectron();
    assert.strictEqual(mockElements['web-landing-view'].classes.has('is-active'), false, 'Web landing view must not be active in Electron mode');
    assert.strictEqual(mockElements['web-landing-view'].style.display, 'none', 'Web landing view display must be none in Electron mode');
    assert.strictEqual(mockElements['main-menu-card'].style.display, '', 'Main game menu must be visible in Electron mode');
    console.log('   [PASS] WebLanding UI mode switching (Web vs Electron) & download trigger verified.');

    // 3. Test server.js HTTP distribution of PAPLUS-Downloader.exe
    console.log('3. Testing HTTP server download endpoint (/PAPLUS-Downloader.exe)...');
    const server = createServer(0);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const responseData = await new Promise((resolve, reject) => {
            http.get(`http://127.0.0.1:${port}/PAPLUS-Downloader.exe`, (res) => {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: Buffer.concat(chunks)
                }));
            }).on('error', reject);
        });

        assert.strictEqual(responseData.statusCode, 200, 'GET /PAPLUS-Downloader.exe must return 200 OK');
        assert.ok(
            (responseData.headers['content-disposition'] || '').includes('PAPLUS-Downloader.exe'),
            'Content-Disposition header must specify PAPLUS-Downloader.exe'
        );
        assert.ok(responseData.body.length > 10000, 'Downloaded PAPLUS-Downloader.exe must be a real binary (>10 KB)');
        assert.strictEqual(responseData.body.slice(0, 2).toString('ascii'), 'MZ', 'Downloaded PAPLUS-Downloader.exe must have valid Windows PE MZ header');
        console.log(`   [PASS] /PAPLUS-Downloader.exe served (${responseData.body.length} bytes, valid Windows PE MZ binary).`);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }

    // 4. Test PAPLUS-Downloader.exe end-to-end installation & shortcut creation
    console.log('4. Running PAPLUS-Downloader.exe end-to-end installation test...');
    const downloaderExe = path.join(ROOT_DIR, 'PAPLUS-Downloader.exe');
    assert.ok(fs.existsSync(downloaderExe), 'PAPLUS-Downloader.exe must exist in project root');

    const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'paplus-e2e-'));
    const targetInstallDir = path.join(tempBase, 'InstalledGame');
    const targetShortcutDir = path.join(tempBase, 'DesktopShortcuts');

    try {
        execFileSync(downloaderExe, [
            '--headless-install', targetInstallDir,
            '--shortcut-dir', targetShortcutDir
        ], {
            cwd: ROOT_DIR,
            timeout: 120000
        });

        const installedGameExe = path.join(targetInstallDir, 'Project Alpha Plus.exe');
        const installedAsar = path.join(targetInstallDir, 'resources', 'app.asar');
        const installedManifest = path.join(targetInstallDir, 'install-manifest.json');
        const desktopShortcut = path.join(targetShortcutDir, 'Project Alpha Plus.lnk');

        assert.ok(fs.existsSync(installedGameExe), 'Installed Project Alpha Plus.exe must exist');
        const exeSize = fs.statSync(installedGameExe).size;
        assert.ok(exeSize > 100 * 1024 * 1024, `Installed Project Alpha Plus.exe must be full standalone binary (>100 MB), got ${exeSize}`);

        assert.ok(fs.existsSync(installedAsar), 'Installed resources/app.asar must exist');
        const asarSize = fs.statSync(installedAsar).size;
        assert.ok(asarSize > 10 * 1024 * 1024, `Installed resources/app.asar must contain game assets (>10 MB), got ${asarSize}`);

        assert.ok(fs.existsSync(installedManifest), 'install-manifest.json must be written by installer');
        const manifest = JSON.parse(fs.readFileSync(installedManifest, 'utf8'));
        assert.strictEqual(manifest.productName, 'Project Alpha Plus', 'Manifest productName must match');
        assert.strictEqual(manifest.executable, installedGameExe, 'Manifest executable path must match installed .exe');

        assert.ok(fs.existsSync(desktopShortcut), 'Desktop shortcut (Project Alpha Plus.lnk) must be created');
        const shortcutSize = fs.statSync(desktopShortcut).size;
        assert.ok(shortcutSize > 100, 'Desktop shortcut (.lnk) must be a valid non-empty Windows shell link');

        console.log(`   [PASS] End-to-end install verified:`);
        console.log(`          - Standalone Exe: ${installedGameExe} (${(exeSize / (1024 * 1024)).toFixed(1)} MB)`);
        console.log(`          - Packaged Asar:  ${installedAsar} (${(asarSize / (1024 * 1024)).toFixed(1)} MB)`);
        console.log(`          - Shortcut (.lnk): ${desktopShortcut} (${shortcutSize} bytes)`);
    } finally {
        // Clean up temporary directory
        try {
            fs.rmSync(tempBase, { recursive: true, force: true });
        } catch (cleanupErr) {
            console.warn('   [WARN] Failed to clean up temp dir:', cleanupErr.message);
        }
    }

    console.log('\nALL WEB & DOWNLOADER END-TO-END TESTS PASSED!');
}

runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});

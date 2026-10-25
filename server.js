/**
 * Project Alpha Plus - Web Showcase & Downloader Distribution Server
 * Serves the web landing portal, PAPLUS-Downloader.exe, and the game package stream.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.mp4': 'video/mp4',
    '.exe': 'application/vnd.microsoft.portable-executable',
    '.zip': 'application/zip'
};

function createServer(port = PORT) {
    const server = http.createServer((req, res) => {
        try {
            const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
            let pathname = decodeURIComponent(parsedUrl.pathname);

            if (pathname === '/') {
                pathname = '/index.html';
            }

            // Endpoint: /PAPLUS-Downloader.exe or /dist/PAPLUS-Downloader.exe
            if (pathname === '/PAPLUS-Downloader.exe' || pathname === '/dist/PAPLUS-Downloader.exe') {
                const exeCandidates = [
                    path.join(ROOT_DIR, 'PAPLUS-Downloader.exe'),
                    path.join(ROOT_DIR, 'dist', 'PAPLUS-Downloader.exe')
                ];
                const exePath = exeCandidates.find(p => fs.existsSync(p));
                if (!exePath) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'PAPLUS-Downloader.exe not found. Run npm run build:downloader first.' }));
                    return;
                }
                const stat = fs.statSync(exePath);
                res.writeHead(200, {
                    'Content-Type': 'application/octet-stream',
                    'Content-Disposition': 'attachment; filename="PAPLUS-Downloader.exe"',
                    'Content-Length': stat.size,
                    'Cache-Control': 'no-cache'
                });
                if (req.method === 'HEAD') {
                    res.end();
                    return;
                }
                fs.createReadStream(exePath).pipe(res);
                return;
            }

            // Endpoint: /download/ProjectAlphaPlus-Win64.zip
            if (pathname === '/download/ProjectAlphaPlus-Win64.zip') {
                const zipCandidates = [
                    path.join(ROOT_DIR, 'dist', 'ProjectAlphaPlus-Win64.zip'),
                    path.join(ROOT_DIR, 'ProjectAlphaPlus-Win64.zip')
                ];
                const zipPath = zipCandidates.find(p => fs.existsSync(p));
                if (!zipPath) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Package archive not found on server; use local build fallback.' }));
                    return;
                }
                const stat = fs.statSync(zipPath);
                res.writeHead(200, {
                    'Content-Type': 'application/zip',
                    'Content-Disposition': 'attachment; filename="ProjectAlphaPlus-Win64.zip"',
                    'Content-Length': stat.size
                });
                if (req.method === 'HEAD') {
                    res.end();
                    return;
                }
                fs.createReadStream(zipPath).pipe(res);
                return;
            }

            // Prevent directory traversal
            const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
            const filePath = path.join(ROOT_DIR, safePath);

            if (!filePath.startsWith(ROOT_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('404 Not Found');
                return;
            }

            const ext = path.extname(filePath).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';
            const stat = fs.statSync(filePath);

            // Support HTTP Range requests for video preview (Tutorial.mp4)
            const range = req.headers.range;
            if (range && ext === '.mp4') {
                const parts = range.replace(/bytes=/, '').split('-');
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
                const chunkSize = (end - start) + 1;
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${stat.size}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunkSize,
                    'Content-Type': contentType
                });
                fs.createReadStream(filePath, { start, end }).pipe(res);
                return;
            }

            res.writeHead(200, {
                'Content-Type': contentType,
                'Content-Length': stat.size
            });
            if (req.method === 'HEAD') {
                res.end();
                return;
            }
            fs.createReadStream(filePath).pipe(res);
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('500 Internal Server Error');
        }
    });

    return server;
}

if (require.main === module) {
    const srv = createServer(PORT);
    srv.listen(PORT, '127.0.0.1', () => {
        console.log(`Project Alpha Plus Web Portal running at http://127.0.0.1:${PORT}`);
        console.log(`Installer endpoint: http://127.0.0.1:${PORT}/PAPLUS-Downloader.exe`);
    });
}

module.exports = { createServer };

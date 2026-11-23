import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// The editor writes straight to disk, so its API must never be reachable
// without the owner's passcode. Set STUDIO_PASS in the environment; if it is
// not set a random one is generated and printed on start (no secret is ever
// committed to the repository).
const STUDIO_PASS = process.env.STUDIO_PASS || String(crypto.randomInt(100000, 1000000));

// Constant-time comparison so the passcode cannot be guessed by timing.
function passMatches(candidate) {
    const a = Buffer.from(String(candidate || ''));
    const b = Buffer.from(STUDIO_PASS);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireStudioAuth(req, res, next) {
    if (passMatches(req.get('x-studio-pass'))) return next();
    return res.status(401).json({ success: false, message: 'Unauthorized: passcode required' });
}

// Body parser for JSON with large limit for all file types (Docs, Spreadsheets, Media, Archives)
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// API to save updated page directly to disk
app.post('/api/save-page', requireStudioAuth, (req, res) => {
    try {
        const { filename, content } = req.body;
        if (!filename || typeof content !== 'string') {
            return res.status(400).json({ success: false, message: 'Invalid file or content' });
        }

        // Sanitize filename to prevent directory traversal. The editor only
        // edits site pages, so only HTML is writable — never server.js, the
        // shared JS/CSS, or config files.
        const safeFilename = path.basename(filename);
        const allowedExtensions = ['.html', '.htm'];
        const ext = path.extname(safeFilename).toLowerCase();

        if (!allowedExtensions.includes(ext)) {
            return res.status(403).json({ success: false, message: 'File type not allowed' });
        }

        const filePath = path.join(__dirname, safeFilename);
        if (path.dirname(filePath) !== __dirname) {
            return res.status(403).json({ success: false, message: 'Invalid path' });
        }
        fs.writeFileSync(filePath, content, 'utf8');

        console.log(`[Owner Studio] Successfully saved ${safeFilename} (${content.length} bytes)`);
        return res.json({ 
            success: true, 
            message: `${safeFilename} has been saved to the local site. Commit and push to publish it on GitHub Pages.`,
            filename: safeFilename,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('[Owner Studio] Error saving page:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

// API to upload ANY file type (Excel, PDF, Word, PPT, Zip, Media, Images, Code, etc.)
app.post('/api/upload-file', requireStudioAuth, (req, res) => {
    try {
        const { fileName, fileData, folder } = req.body;
        if (!fileName || !fileData) {
            return res.status(400).json({ success: false, message: 'Missing file name or data' });
        }

        const ext = path.extname(fileName).toLowerCase();
        let targetSubfolder = folder;

        if (!targetSubfolder) {
            // Intelligent auto-detection of best subfolder by extension for ANY file type
            if (['.xlsx', '.xls', '.csv', '.tsv', '.ods', '.pdf', '.docx', '.doc', '.pptx', '.ppt', '.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) {
                targetSubfolder = 'assets/projects';
            } else if (['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.ico', '.avif', '.bmp', '.tiff'].includes(ext)) {
                targetSubfolder = 'images';
            } else if (['.mp4', '.webm', '.mkv', '.avi', '.mov', '.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac'].includes(ext)) {
                targetSubfolder = 'assets/media';
            } else {
                targetSubfolder = 'assets/files';
            }
        }

        // Clean folder name to prevent directory traversal, then require it to
        // be one of the site's asset folders. Without this allow-list a caller
        // could write into .git/hooks or overwrite server.js.
        const ALLOWED_UPLOAD_FOLDERS = ['images', 'assets/projects', 'assets/media', 'assets/files'];
        const sanitizedFolder = path.posix
            .normalize(String(targetSubfolder).replace(/\\/g, '/').replace(/\.\./g, ''))
            .replace(/^\/+|\/+$/g, '');
        if (!ALLOWED_UPLOAD_FOLDERS.includes(sanitizedFolder)) {
            return res.status(403).json({ success: false, message: 'Upload folder not allowed' });
        }
        const safeName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
        const targetDir = path.resolve(__dirname, sanitizedFolder);
        if (!targetDir.startsWith(__dirname + path.sep)) {
            return res.status(403).json({ success: false, message: 'Invalid folder' });
        }
        
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const targetPath = path.join(targetDir, safeName);
        const base64Data = fileData.replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(targetPath, buffer);

        const bytes = buffer.length;
        const sizeFormatted = bytes > 1024 * 1024 
            ? `${(bytes / (1024 * 1024)).toFixed(2)} MB` 
            : `${(bytes / 1024).toFixed(1)} KB`;

        const relativeUrl = `${sanitizedFolder}/${safeName}`;
        console.log(`[Owner Studio] Uploaded: ${relativeUrl} (${sizeFormatted})`);
        
        return res.json({ 
            success: true, 
            url: relativeUrl, 
            fileName: safeName,
            extension: ext,
            size: sizeFormatted,
            sizeBytes: bytes,
            message: `File saved as ${relativeUrl} (${sizeFormatted})` 
        });
    } catch (err) {
        console.error('[Owner Studio] Upload error:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

// Verify the editor passcode without exposing any data.
app.get('/api/verify', requireStudioAuth, (req, res) => {
    return res.json({ success: true });
});

// API to list all manageable site pages
app.get('/api/pages-list', requireStudioAuth, (req, res) => {
    try {
        const files = fs.readdirSync(__dirname);
        const pages = files.filter(f => f.endsWith('.html') && f !== 'dashboard.html' && f !== 'dasbord.html');
        return res.json({ success: true, pages });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// Serve static files with html extension support
app.use(express.static(__dirname, {
    extensions: ['html', 'htm'],
    index: 'index.html'
}));

// Fallback to index.html for any unmatched route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Gahonsh Freelancing static server running on http://0.0.0.0:${PORT}`);
    console.log(`Owner Studio editor: http://localhost:${PORT}/dashboard.html`);
    if (!process.env.STUDIO_PASS) {
        console.log(`  Editor passcode for this run: ${STUDIO_PASS}`);
        console.log('  Set STUDIO_PASS to reuse your own passcode.');
    }
});


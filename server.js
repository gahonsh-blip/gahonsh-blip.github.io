import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Body parser for JSON
app.use(express.json({ limit: '50mb' }));

// API to save updated page directly to disk
app.post('/api/save-page', (req, res) => {
    try {
        const { filename, content } = req.body;
        if (!filename || typeof content !== 'string') {
            return res.status(400).json({ success: false, message: 'Invalid file or content' });
        }

        // Sanitize filename to prevent directory traversal
        const safeFilename = path.basename(filename);
        const allowedExtensions = ['.html', '.htm', '.xml', '.txt', '.css', '.js', '.json'];
        const ext = path.extname(safeFilename).toLowerCase();

        if (!allowedExtensions.includes(ext)) {
            return res.status(403).json({ success: false, message: 'File type not allowed' });
        }

        const filePath = path.join(__dirname, safeFilename);
        fs.writeFileSync(filePath, content, 'utf8');

        console.log(`[Owner Studio] Successfully saved ${safeFilename} (${content.length} bytes)`);
        return res.json({ 
            success: true, 
            message: `${safeFilename} has been saved and is now LIVE!`,
            filename: safeFilename,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('[Owner Studio] Error saving page:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

// API to upload an asset/image file (Base64)
app.post('/api/upload-file', (req, res) => {
    try {
        const { fileName, fileData, folder = 'images' } = req.body;
        if (!fileName || !fileData) {
            return res.status(400).json({ success: false, message: 'Missing file name or data' });
        }

        const safeFolder = folder === 'assets' ? 'assets' : 'images';
        const safeName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
        const targetDir = path.join(__dirname, safeFolder);
        
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const targetPath = path.join(targetDir, safeName);
        const base64Data = fileData.replace(/^data:[a-zA-Z0-9/+-]+;base64,/, '');
        fs.writeFileSync(targetPath, Buffer.from(base64Data, 'base64'));

        const relativeUrl = `${safeFolder}/${safeName}`;
        console.log(`[Owner Studio] Uploaded file: ${relativeUrl}`);
        return res.json({ success: true, url: relativeUrl, message: `File saved as ${relativeUrl}` });
    } catch (err) {
        console.error('[Owner Studio] Upload error:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

// API to list all manageable site pages
app.get('/api/pages-list', (req, res) => {
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
});


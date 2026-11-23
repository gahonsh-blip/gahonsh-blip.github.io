/**
 * Gahonsh Freelancing — In-Site File Transfer
 *
 * A single shared component that lets a client and a freelancer send files to
 * each other without leaving the website. It renders an upload control and a
 * live file list against `window.GahonshDB.Files`, so it works against both
 * Supabase Storage (when a project is reachable) and the browser-local engine
 * (IndexedDB blobs) when it is not.
 *
 * All dynamic values are written with textContent / DOM APIs rather than
 * interpolated into innerHTML, so a crafted file name can never become markup.
 */

(function () {
    'use strict';

    const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file
    const MAX_FILES = 10;               // per single selection

    // Files that the OS or browser would run directly are blocked: they are
    // never a deliverable and are the main way a shared file becomes a payload.
    // Source scripts (.js, .ps1, .sh) and installers (.apk, .dmg, .deb) stay
    // allowed — this is a software marketplace, files are visible only to the
    // two participants, and the site never executes an uploaded file.
    const BLOCKED_EXT = new Set([
        'exe', 'msi', 'com', 'scr', 'pif', 'cpl', 'dll', 'sys', 'vbs', 'vbe',
        'jse', 'wsf', 'wsh', 'hta', 'lnk', 'reg', 'msc', 'bat', 'cmd'
    ]);

    function formatBytes(bytes) {
        const n = Number(bytes);
        if (!isFinite(n) || n <= 0) return '0 KB';
        if (n >= 1024 * 1024 * 1024) return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
        if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(2) + ' MB';
        if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
        return n + ' B';
    }

    function fileExt(name) {
        const parts = String(name || '').split('.');
        return parts.length > 1 ? parts.pop().toLowerCase() : '';
    }

    function sanitizeFileName(name) {
        return String(name || 'download')
            .replace(/[\u0000-\u001f\u007f]/g, '')
            .replace(/[\\/:*?"<>|]/g, '_')
            .replace(/\.{2,}/g, '.')
            .trim()
            .slice(0, 120) || 'download';
    }

    function iconFor(name) {
        const ext = fileExt(name);
        if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) return 'fa-file-image';
        if (['xlsx', 'xls', 'csv', 'tsv', 'ods'].includes(ext)) return 'fa-file-excel';
        if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'fa-file-word';
        if (['ppt', 'pptx', 'odp'].includes(ext)) return 'fa-file-powerpoint';
        if (['pdf'].includes(ext)) return 'fa-file-pdf';
        if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'fa-file-zipper';
        if (['mp4', 'mov', 'avi', 'webm', 'mkv'].includes(ext)) return 'fa-file-video';
        if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) return 'fa-file-audio';
        if (['txt', 'md', 'json', 'xml', 'log'].includes(ext)) return 'fa-file-lines';
        return 'fa-file';
    }

    // ------------------------------------------------------------------
    // Styles (injected once, themed with the page's CSS custom properties)
    // ------------------------------------------------------------------
    function injectStyles() {
        if (document.getElementById('gft-styles')) return;
        const style = document.createElement('style');
        style.id = 'gft-styles';
        style.textContent = `
            .gft-panel { background: var(--bg-card, rgba(255,255,255,0.03)); border: 1px solid var(--border-color, #1e293b); border-radius: 14px; padding: 22px; margin-top: 22px; }
            .gft-title { font-size: 1.05rem; font-weight: 800; color: var(--text-main, #e2e8f0); margin: 0 0 4px; display: flex; align-items: center; gap: 8px; }
            .gft-title i { color: var(--accent-cyan, #00ffcc); }
            .gft-sub { font-size: 0.85rem; color: var(--text-slate, #94a3b8); margin: 0 0 16px; line-height: 1.5; }
            .gft-safety-note { font-size: 0.78rem; color: var(--text-slate, #94a3b8); margin: -6px 0 16px; line-height: 1.5; }
            .gft-safety-note i { color: var(--accent-cyan, #00ffcc); margin-right: 6px; }
            .gft-drop { border: 1.5px dashed var(--border-color, #1e293b); border-radius: 12px; padding: 18px; text-align: center; transition: border-color 0.2s, background 0.2s; }
            .gft-drop.gft-over { border-color: var(--accent-cyan, #00ffcc); background: rgba(0, 255, 204, 0.06); }
            .gft-input { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
            .gft-choose { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; padding: 12px 22px; background: linear-gradient(135deg, #00ffcc 0%, #0077ff 100%); color: #070c19; font-weight: 800; border: none; border-radius: 8px; cursor: pointer; font-size: 0.95rem; }
            .gft-choose:active { transform: translateY(1px); }
            .gft-hint { display: block; margin-top: 10px; font-size: 0.8rem; color: var(--text-slate, #94a3b8); }
            .gft-status { margin-top: 14px; font-size: 0.88rem; line-height: 1.5; }
            .gft-status:empty { display: none; }
            .gft-status.gft-ok { color: var(--accent-green, #10b981); }
            .gft-status.gft-err { color: #f87171; }
            .gft-status.gft-busy { color: var(--accent-cyan, #00ffcc); }
            .gft-list { list-style: none; margin: 16px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
            .gft-item { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--border-color, #1e293b); border-radius: 10px; background: rgba(255,255,255,0.02); flex-wrap: wrap; }
            .gft-item > i.gft-ico { font-size: 1.25rem; color: var(--accent-cyan, #00ffcc); flex-shrink: 0; }
            .gft-meta { flex: 1 1 200px; min-width: 0; }
            .gft-name { display: block; font-weight: 700; font-size: 0.92rem; color: var(--text-main, #e2e8f0); overflow-wrap: anywhere; }
            .gft-detail { display: block; font-size: 0.78rem; color: var(--text-slate, #94a3b8); margin-top: 3px; }
            .gft-actions { display: flex; gap: 8px; flex-shrink: 0; }
            .gft-btn { min-height: 44px; padding: 8px 16px; border-radius: 8px; border: 1px solid var(--border-color, #1e293b); background: none; color: var(--text-main, #e2e8f0); font-weight: 700; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; text-decoration: none; }
            .gft-btn:hover { border-color: var(--accent-cyan, #00ffcc); color: var(--accent-cyan, #00ffcc); }
            .gft-btn.gft-remove:hover { border-color: #f87171; color: #f87171; }
            .gft-btn:disabled { opacity: 0.6; cursor: wait; }
            .gft-empty { margin: 16px 0 0; font-size: 0.88rem; color: var(--text-slate, #94a3b8); }
            .gft-locked { margin-top: 14px; font-size: 0.88rem; color: var(--text-slate, #94a3b8); }
            .gft-locked a { color: var(--accent-cyan, #00ffcc); }
            @media (max-width: 560px) {
                .gft-item { align-items: flex-start; }
                .gft-actions { width: 100%; }
                .gft-btn { flex: 1; justify-content: center; }
            }
        `;
        document.head.appendChild(style);
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = String(text);
        return node;
    }

    function icon(className) {
        const i = document.createElement('i');
        i.className = className;
        i.setAttribute('aria-hidden', 'true');
        return i;
    }

    function triggerDownload(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = sanitizeFileName(fileName);
        document.body.appendChild(link);
        link.click();
        link.remove();
        // Give the browser a moment to start the download before releasing it.
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    // True when the failure means the live backend has not been migrated yet
    // (no `file_transfers` table or `job-attachments` bucket). The panel then
    // explains what to do instead of showing a raw PostgREST error code.
    function isNotProvisioned(err) {
        if (err && window.GahonshDB && typeof window.GahonshDB.isBackendNotProvisioned === 'function') {
            return window.GahonshDB.isBackendNotProvisioned(err);
        }
        return false;
    }

    const SETUP_MESSAGE = 'File transfer is not enabled on this deployment yet. The site owner needs to apply the latest database migration (docs/marketplace-schema.sql) to switch it on.';

    /**
     * Mounts the transfer panel inside `options.containerId`.
     *
     * options: {
     *   containerId : id of the host element
     *   jobId       : project the files belong to
     *   proposalId  : optional, for proposal-scoped files
     *   scope       : 'job' | 'proposal'
     *   title       : panel heading
     *   subtitle    : panel description
     *   canUpload   : whether the signed-in viewer may upload
     * }
     */
    function mount(options) {
        const host = document.getElementById(options.containerId);
        if (!host) return null;

        injectStyles();

        const scope = options.scope === 'proposal' ? 'proposal' : 'job';
        const title = options.title || 'Project Files';
        const subtitle = options.subtitle ||
            'Send briefs, drafts and final deliverables securely. Files stay inside the site and are visible only to you and the other party on this project.';

        const panel = el('section', 'gft-panel');
        panel.setAttribute('aria-label', title);

        const heading = el('h3', 'gft-title');
        heading.appendChild(icon('fa-solid fa-paperclip'));
        heading.appendChild(document.createTextNode(' ' + title));
        panel.appendChild(heading);

        panel.appendChild(el('p', 'gft-sub', subtitle));

        const safetyNote = el('p', 'gft-safety-note');
        safetyNote.appendChild(icon('fa-solid fa-shield-halved'));
        safetyNote.appendChild(document.createTextNode(
            'Every file is safety-scanned in this browser before upload and again before download. ' +
            'This blocks common unsafe files, but it is not a full antivirus guarantee.'
        ));
        panel.appendChild(safetyNote);

        const status = el('div', 'gft-status');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');

        const list = el('ul', 'gft-list');
        list.setAttribute('aria-label', title + ' list');

        const inputId = 'gft-input-' + Math.random().toString(36).slice(2, 9);
        let input = null;
        let busy = false;

        if (options.canUpload) {
            const drop = el('div', 'gft-drop');
            input = document.createElement('input');
            input.type = 'file';
            input.id = inputId;
            input.className = 'gft-input';
            input.multiple = true;
            input.setAttribute('aria-label', 'Choose files to upload');

            const chooseLabel = el('label', 'gft-choose');
            chooseLabel.setAttribute('for', inputId);
            chooseLabel.appendChild(icon('fa-solid fa-arrow-up-from-bracket'));
            chooseLabel.appendChild(document.createTextNode(' Choose files'));

            drop.appendChild(input);
            drop.appendChild(chooseLabel);
            drop.appendChild(el('span', 'gft-hint', 'Drag files here, or choose them. Up to ' + formatBytes(MAX_BYTES) + ' per file.'));

            drop.addEventListener('dragover', (e) => {
                e.preventDefault();
                drop.classList.add('gft-over');
            });
            drop.addEventListener('dragleave', () => drop.classList.remove('gft-over'));
            drop.addEventListener('drop', (e) => {
                e.preventDefault();
                drop.classList.remove('gft-over');
                if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files);
            });
            input.addEventListener('change', () => {
                if (input.files) handleFiles(input.files);
                input.value = '';
            });

            panel.appendChild(drop);
        } else {
            const locked = el('p', 'gft-locked');
            locked.appendChild(document.createTextNode('Sign in as the client or the hired freelancer to send files on this project. '));
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = 'Sign in';
            link.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.GahonshAuthUI && window.GahonshAuthUI.openAuthModal) {
                    window.GahonshAuthUI.openAuthModal('signin');
                }
            });
            locked.appendChild(link);
            panel.appendChild(locked);
        }

        panel.appendChild(status);
        panel.appendChild(list);

        host.textContent = '';
        host.appendChild(panel);

        function setStatus(message, kind) {
            status.textContent = message || '';
            status.className = 'gft-status' + (kind ? ' gft-' + kind : '');
        }


    // ------------------------------------------------------------------
    // Browser safety scan
    //
    // This is a local content check, not a VirusTotal call. The file never
    // leaves the browser during the scan. It runs before upload and again on
    // the downloaded bytes, so a file that was safe at upload time is checked
    // again before it is handed to the other party.
    //
    // It catches the common delivery risks: executable signatures, double
    // extensions, EICAR test files, PDFs with active content, and Office/ZIP
    // archives containing executables or VBA macros. It cannot prove that a
    // file is malware-free; a real antivirus engine belongs on a server. See
    // docs/FILE-SAFETY.md for that boundary.
    // ------------------------------------------------------------------
    const EICAR_SIGNATURE = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
    const DANGEROUS_EXT = new Set([
        ...BLOCKED_EXT, 'js', 'jse', 'vbs', 'vbe', 'ps1', 'psm1', 'sh', 'bash',
        'zsh', 'jar', 'apk', 'dmg', 'deb', 'rpm', 'iso', 'img', 'hta', 'lnk',
        'reg', 'wsf', 'wsh', 'html', 'htm', 'xhtml', 'svg', 'tar', 'gz'
    ]);
    const ZIP_DANGEROUS_EXT = new Set([
        ...DANGEROUS_EXT, 'class', 'php', 'py', 'rb', 'pl', 'cgi', 'jsp', 'aspx'
    ]);
    const PDF_ACTIVE_PATTERNS = [
        /\/JavaScript\b/i, /\/Launch\b/i, /\/EmbeddedFile\b/i,
        /\/OpenAction\b/i, /\/AA\b/i
    ];
    const EXECUTABLE_MAGIC = [
        [0x4d, 0x5a],                         // Windows PE / DOS
        [0x7f, 0x45, 0x4c, 0x46],             // ELF
        [0xcf, 0xfa, 0xed, 0xfe],             // Mach-O 64 little endian
        [0xca, 0xfe, 0xba, 0xbe],             // Mach-O universal
        [0xfe, 0xed, 0xfa, 0xcf]              // Mach-O 64 big endian
    ];
    const scanCache = new Map();

    function scanLabel(status) {
        switch (String(status || 'pending')) {
            case 'clean': return '✔ Safety scan passed';
            case 'infected': return '⛔ Unsafe file, blocked';
            case 'suspicious': return '⚠ Needs review, blocked';
            case 'scanning': return 'Scanning…';
            case 'error': return 'Safety scan failed';
            default: return 'Safety scan on download';
        }
    }

    function scanCacheKey(id) {
        return String(id || '');
    }

    function hasDangerousName(name) {
        const parts = String(name || '').toLowerCase().split('.');
        return parts.some((part) => part && DANGEROUS_EXT.has(part));
    }

    function startsWithBytes(bytes, signature) {
        if (bytes.length < signature.length) return false;
        for (let i = 0; i < signature.length; i += 1) {
            if (bytes[i] !== signature[i]) return false;
        }
        return true;
    }

    function zipEntryNames(bytes) {
        if (bytes.length < 22) return [];
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        let eocd = -1;
        const start = Math.max(0, bytes.length - 66000);
        for (let i = bytes.length - 22; i >= start; i -= 1) {
            if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
        }
        if (eocd < 0) return [];
        const count = view.getUint16(eocd + 10, true);
        const size = view.getUint32(eocd + 12, true);
        const offset = view.getUint32(eocd + 16, true);
        const end = Math.min(bytes.length, offset + size);
        let cursor = offset;
        const names = [];
        for (let i = 0; i < count && cursor + 46 <= end && names.length < 500; i += 1) {
            if (view.getUint32(cursor, true) !== 0x02014b50) break;
            const nameLength = view.getUint16(cursor + 28, true);
            const extraLength = view.getUint16(cursor + 30, true);
            const commentLength = view.getUint16(cursor + 32, true);
            const nameStart = cursor + 46;
            if (nameStart + nameLength > bytes.length) break;
            try {
                names.push(new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength)));
            } catch (e) {
                names.push('');
            }
            cursor = nameStart + nameLength + extraLength + commentLength;
        }
        return names;
    }

    function decodeText(bytes) {
        try { return new TextDecoder('utf-8', { fatal: false }).decode(bytes); } catch (e) { return ''; }
    }

    async function scanFile(fileOrBlob, name) {
        const fileName = String(name || (fileOrBlob && fileOrBlob.name) || 'file');
        const result = { status: 'clean', detail: '', checkedAt: Date.now(), sha256: '' };

        if (hasDangerousName(fileName)) {
            return Object.assign(result, {
                status: 'suspicious',
                detail: 'The file name contains an executable or script extension.'
            });
        }

        let buffer;
        try {
            buffer = await fileOrBlob.arrayBuffer();
        } catch (e) {
            return Object.assign(result, { status: 'error', detail: 'The file could not be read for scanning.' });
        }
        const bytes = new Uint8Array(buffer);

        try {
            if (window.crypto && window.crypto.subtle) {
                const digest = await window.crypto.subtle.digest('SHA-256', buffer);
                result.sha256 = Array.from(new Uint8Array(digest))
                    .map((b) => b.toString(16).padStart(2, '0')).join('');
            }
        } catch (e) { /* hashing is a convenience, not a gate */ }

        const head = bytes.subarray(0, Math.min(bytes.length, 512));
        const actual = sniff(head);
        const family = EXT_FAMILY[fileExt(fileName)];
        if (family && family !== 'text' && actual !== family) {
            return Object.assign(result, {
                status: 'suspicious',
                detail: 'The file contents do not match its extension.'
            });
        }
        if (family === 'text' && (looksBinary(head) || actual !== 'text')) {
            return Object.assign(result, {
                status: 'suspicious',
                detail: 'The file is named as text but contains binary data.'
            });
        }

        const textHead = decodeText(bytes.subarray(0, Math.min(bytes.length, 2 * 1024 * 1024)));
        if (textHead.includes(EICAR_SIGNATURE)) {
            return Object.assign(result, {
                status: 'infected',
                detail: 'The EICAR antivirus test signature was found.'
            });
        }

        if (EXECUTABLE_MAGIC.some((signature) => startsWithBytes(bytes, signature))) {
            return Object.assign(result, {
                status: 'infected',
                detail: 'An executable file signature was found.'
            });
        }

        if (family === 'pdf' || actual === 'pdf') {
            const pdfText = decodeText(bytes);
            const active = PDF_ACTIVE_PATTERNS.filter((pattern) => pattern.test(pdfText));
            if (active.length) {
                return Object.assign(result, {
                    status: 'suspicious',
                    detail: 'The PDF contains active content (JavaScript, launch action or embedded file).'
                });
            }
        }

        if (family === 'zip' || actual === 'zip') {
            const names = zipEntryNames(bytes);
            const unsafe = names.filter((entry) => {
                const base = entry.split('/').pop() || entry;
                return ZIP_DANGEROUS_EXT.has(fileExt(base)) || /^vbaProject\.bin$/i.test(base);
            });
            if (unsafe.length) {
                return Object.assign(result, {
                    status: 'suspicious',
                    detail: 'The archive contains an executable, script or VBA macro: ' + unsafe.slice(0, 3).join(', ')
                });
            }
        }

        return result;
    }

        function toast(message) {
            if (window.GahonshAuthUI && window.GahonshAuthUI.showToast) {
                window.GahonshAuthUI.showToast(message);
            }
        }

        async function validate(file) {
            if (file.size > MAX_BYTES) {
                return '“' + file.name + '” is ' + formatBytes(file.size) + ', larger than the ' + formatBytes(MAX_BYTES) + ' limit.';
            }
            if (BLOCKED_EXT.has(fileExt(file.name))) {
                return '“' + file.name + '” is an executable file type and cannot be uploaded.';
            }
            return await contentTypeProblem(file);
        }


    // ------------------------------------------------------------------
    // Content verification
    //
    // The extension alone is not proof of what a file is: a "invoice.pdf"
    // that actually starts with "<html>" or "MZ" is how a shared file becomes
    // a payload. Before anything is uploaded the first bytes are read and the
    // real format has to agree with the extension. Storage additionally only
    // accepts the 15 allow-listed MIME types on the bucket, so the check
    // cannot be skipped by calling the API directly.
    // ------------------------------------------------------------------
    const EXT_FAMILY = {
        pdf: 'pdf',
        png: 'png', jpg: 'jpg', jpeg: 'jpg',
        gif: 'gif', webp: 'webp',
        zip: 'zip', docx: 'zip', xlsx: 'zip', pptx: 'zip', odt: 'zip', ods: 'zip', odp: 'zip',
        doc: 'ole', xls: 'ole', ppt: 'ole',
        txt: 'text', md: 'text', csv: 'text', tsv: 'text', json: 'text', xml: 'text', log: 'text', yml: 'text', yaml: 'text'
    };

    function sniff(bytes) {
        const b = bytes;
        const at = (i) => (b[i] === undefined ? -1 : b[i]);
        if (at(0) === 0x25 && at(1) === 0x50 && at(2) === 0x44 && at(3) === 0x46) return 'pdf';
        if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return 'png';
        if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'jpg';
        if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46) return 'gif';
        if (at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 &&
            at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50) return 'webp';
        if (at(0) === 0x50 && at(1) === 0x4b && (at(2) === 0x03 || at(2) === 0x05)) return 'zip';
        if (at(0) === 0xd0 && at(1) === 0xcf && at(2) === 0x11 && at(3) === 0xe0) return 'ole';
        return 'text';
    }

    function looksBinary(bytes) {
        for (let i = 0; i < bytes.length; i += 1) {
            if (bytes[i] === 0) return true;
        }
        return false;
    }

    async function contentTypeProblem(file) {
        const family = EXT_FAMILY[fileExt(file.name)];
        if (!family) return '“' + file.name + '” has a file type this marketplace does not accept.';
        let head;
        try {
            const slice = file.slice(0, 512);
            const buffer = await slice.arrayBuffer();
            head = new Uint8Array(buffer);
        } catch (e) {
            return null; // unreadable in this browser: rely on the server-side bucket rules
        }
        const actual = sniff(head);
        if (family === 'text') {
            if (looksBinary(head) || actual !== 'text') {
                return '“' + file.name + '” is named as text but does not contain text. Please check the file.';
            }
            return null;
        }
        if (actual !== family) {
            return '“' + file.name + '” is named .' + fileExt(file.name) + ' but its contents are not a ' + family.toUpperCase() + ' file. Upload blocked.';
        }
        return null;
    }

        async function handleFiles(fileList) {
            if (busy) return;
            const all = Array.prototype.slice.call(fileList);
            if (!all.length) return;
            const files = all.slice(0, MAX_FILES);

            if (!options.jobId) {
                setStatus('This project is still loading. Please try again in a moment.', 'err');
                return;
            }

            busy = true;
            let uploaded = 0;
            let failed = 0;

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const problem = await validate(file);
                if (problem) {
                    failed += 1;
                    setStatus(problem, 'err');
                    continue;
                }

                setStatus('Safety scan: ' + file.name + '…', 'busy');
                const scan = await scanFile(file, file.name);
                if (scan.status !== 'clean') {
                    failed += 1;
                    setStatus('“' + file.name + '” was blocked by the safety scan: ' + scan.detail, 'err');
                    continue;
                }

                setStatus('Uploading ' + (i + 1) + ' of ' + files.length + ': ' + file.name + '…', 'busy');
                try {
                    const row = await window.GahonshDB.Files.upload({
                        jobId: options.jobId,
                        proposalId: options.proposalId || null,
                        scope: scope,
                        file: file
                    });
                    if (row && row.id) scanCache.set(scanCacheKey(row.id), scan);
                    uploaded += 1;
                } catch (err) {
                    failed += 1;
                    console.warn('[file-transfer] upload failed:', err);
                    setStatus(isNotProvisioned(err) ? SETUP_MESSAGE
                        : '“' + file.name + '” could not be uploaded: ' + (err.message || 'unknown error'), 'err');
                }
            }

            busy = false;

            const skipped = all.length - files.length;
            if (uploaded && !failed) {
                setStatus(uploaded + (uploaded === 1 ? ' file uploaded successfully.' : ' files uploaded successfully.')
                    + (skipped ? ' ' + skipped + ' extra file(s) were not sent — up to ' + MAX_FILES + ' at a time.' : ''), 'ok');
                toast('✅ ' + uploaded + (uploaded === 1 ? ' file uploaded.' : ' files uploaded.'));
            } else if (uploaded && failed) {
                setStatus(uploaded + ' uploaded, ' + failed + ' failed. See the messages above.', 'err');
            } else if (!uploaded && skipped) {
                setStatus('Nothing was sent. Up to ' + MAX_FILES + ' files can be sent at a time.', 'err');
            }

            await refresh();
        }

        function buildRow(record) {
            const item = el('li', 'gft-item');
            item.appendChild(icon('fa-solid ' + iconFor(record.file_name)));

            const meta = el('div', 'gft-meta');
            meta.appendChild(el('span', 'gft-name', record.file_name || 'file'));

            const who = record.uploader && record.uploader.full_name ? record.uploader.full_name : 'Member';
            const size = formatBytes(record.file_size_bytes);
            let when = '';
            try { when = new Date(record.created_at).toLocaleString(); } catch (e) { when = ''; }
            const kind = (record.file_type || 'unknown type').replace('application/', '').replace('vnd.openxmlformats-officedocument.', '').replace('image/', 'image/');
            const detailBits = [
                size,
                kind,
                who,
                when,
                'sent ' + (record.scope === 'proposal' ? 'with a proposal' : 'on this project')
            ].filter(Boolean).join(' • ');
            meta.appendChild(el('span', 'gft-detail', detailBits));

            const scanResult = scanCache.get(scanCacheKey(record.id));
            const scan = el('span', 'gft-scan', scanLabel(scanResult && scanResult.status));
            scan.style.cssText = 'display:inline-block;margin-top:4px;font-size:.74rem;font-weight:700;letter-spacing:.02em;' +
                (scanResult && scanResult.status === 'clean' ? 'color:#4ade80;' :
                 scanResult && scanResult.status === 'infected' ? 'color:#f87171;' :
                 scanResult && scanResult.status === 'suspicious' ? 'color:#fbbf24;' : 'color:#9fb0bf;');
            meta.appendChild(scan);
            if (scanResult && scanResult.detail) {
                meta.appendChild(el('span', 'gft-scan-detail', scanResult.detail));
                meta.lastChild.style.cssText = 'font-size:.7rem;color:#8ba0af;margin-top:2px;word-break:break-word;';
            }
            item.appendChild(meta);

            if (scanResult && scanResult.status !== 'clean') {
                const warn = el('div', 'gft-warning');
                warn.style.cssText = 'margin:8px 0 0;padding:10px 12px;border:1px solid #7f3a3a;border-radius:10px;background:#2a1414;color:#ffd7d7;font-size:.82rem;line-height:1.5;';
                warn.textContent = 'The browser safety scan flagged this file, so download is blocked. Ask the sender to send a safer copy.';
                item.appendChild(warn);
            }

            const actions = el('div', 'gft-actions');

            const downloadBtn = el('button', 'gft-btn');
            downloadBtn.type = 'button';
            downloadBtn.appendChild(icon('fa-solid fa-download'));
            downloadBtn.appendChild(document.createTextNode(' Download'));
            downloadBtn.addEventListener('click', () => doDownload(record.id, downloadBtn));
            actions.appendChild(downloadBtn);

            if (record.can_remove) {
                const removeBtn = el('button', 'gft-btn gft-remove');
                removeBtn.type = 'button';
                removeBtn.appendChild(icon('fa-solid fa-trash'));
                removeBtn.appendChild(document.createTextNode(' Remove'));
                removeBtn.addEventListener('click', () => doRemove(record.id, removeBtn));
                actions.appendChild(removeBtn);
            }

            item.appendChild(actions);
            return item;
        }

        async function doDownload(id, btn) {
            btn.disabled = true;
            btn.textContent = 'Scanning…';
            try {
                const result = await window.GahonshDB.Files.getDownload(id);
                const scan = await scanFile(result.blob, result.fileName);
                scanCache.set(scanCacheKey(id), scan);

                if (scan.status !== 'clean') {
                    setStatus('Download blocked: ' + scan.detail, 'err');
                    toast('⛔ Download blocked by the safety scan.');
                    await refresh();
                    return;
                }

                triggerDownload(result.blob, result.fileName);
                setStatus('Safety scan passed. Download started.', 'ok');
                await refresh();
            } catch (err) {
                console.warn('[file-transfer] download failed:', err);
                setStatus(err.message || 'The file could not be downloaded.', 'err');
                toast('❌ ' + (err.message || 'Download failed.'));
            } finally {
                btn.disabled = false;
                btn.textContent = '';
                btn.appendChild(icon('fa-solid fa-download'));
                btn.appendChild(document.createTextNode(' Download'));
            }
        }

        async function doRemove(id, btn) {
            if (!window.confirm('Remove this file for everyone on the project?')) return;
            btn.disabled = true;
            try {
                await window.GahonshDB.Files.remove(id);
                setStatus('File removed.', 'ok');
                await refresh();
            } catch (err) {
                console.warn('[file-transfer] remove failed:', err);
                setStatus(err.message || 'The file could not be removed.', 'err');
                btn.disabled = false;
            }
        }

        async function refresh() {
            list.textContent = '';
            if (!options.jobId) return;

            let records = [];
            try {
                if (!window.GahonshDB || !window.GahonshDB.Files) return;
                records = scope === 'proposal' && options.proposalId
                    ? await window.GahonshDB.Files.listForProposal(options.proposalId)
                    : await window.GahonshDB.Files.listForJob(options.jobId);
            } catch (err) {
                console.warn('[file-transfer] could not load file list:', err);
                if (isNotProvisioned(err)) {
                    list.appendChild(el('li', 'gft-empty', SETUP_MESSAGE));
                    return;
                }
                setStatus('The file list could not be loaded right now.', 'err');
                return;
            }

            if (!records || !records.length) {
                const empty = el('li', 'gft-empty', 'No files shared yet.');
                list.appendChild(empty);
                return;
            }

            records.forEach((record) => list.appendChild(buildRow(record)));
        }

        refresh();

        return { refresh, setStatus };
    }

    window.GahonshFileTransfer = { mount, formatBytes, MAX_BYTES };
})();

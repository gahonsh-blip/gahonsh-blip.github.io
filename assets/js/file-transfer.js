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
    // Virus scan
    //
    // Every upload is submitted to the scanFile backend function, which pulls
    // the stored object with the service role, asks VirusTotal, and writes the
    // verdict back to the row. The browser only triggers and reads the status,
    // so the API key never reaches a visitor. A file is not handed on until it
    // is 'clean': 'infected' and 'suspicious' stay locked.
    // ------------------------------------------------------------------
    const SCAN_URL = 'https://superagent-9fe3eb93.base44.app/functions/scanFile';

    async function requestScan(fileId) {
        try {
            const res = await fetch(SCAN_URL, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ fileId: fileId })
            });
            return await res.json().catch(() => ({}));
        } catch (e) {
            return { ok: false, error: 'scan_unreachable' };
        }
    }

    function scanLabel(status) {
        switch (String(status || 'pending')) {
            case 'clean': return '✔ Scanned, clean';
            case 'infected': return '⛔ Virus found, blocked';
            case 'suspicious': return '⚠ Flagged, blocked';
            case 'scanning': return 'Scanning…';
            case 'skipped': return 'Not scanned';
            case 'error': return 'Scan failed';
            default: return 'Waiting for scan';
        }
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

    function sanitizeFileName(name) {
        return String(name || 'download')
            .replace(/[\u0000-\u001f\u007f]/g, '')
            .replace(/[\\/:*?"<>|]/g, '_')
            .replace(/\.{2,}/g, '.')
            .trim()
            .slice(0, 120) || 'download';
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

                setStatus('Uploading ' + (i + 1) + ' of ' + files.length + ': ' + file.name + '…', 'busy');
                try {
                    await window.GahonshDB.Files.upload({
                        jobId: options.jobId,
                        proposalId: options.proposalId || null,
                        scope: scope,
                        file: file
                    }).then((row) => {
                        if (row && row.id) { requestScan(row.id).then(() => refresh && refresh()); }
                        return row;
                    });
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
            meta.appendChild(el('span', 'gft-detail', size + ' • ' + who + (when ? ' • ' + when : '')));
            const scan = el('span', 'gft-scan', scanLabel(record.scan_status));
            scan.style.cssText = 'display:inline-block;margin-top:4px;font-size:.74rem;font-weight:700;letter-spacing:.02em;' +
                (record.scan_status === 'clean' ? 'color:#4ade80;' :
                 record.scan_status === 'infected' ? 'color:#f87171;' :
                 record.scan_status === 'suspicious' ? 'color:#fbbf24;' : 'color:#9fb0bf;');
            meta.appendChild(scan);
            item.appendChild(meta);

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
            // A file is only handed on after a clean verdict. Pending files get
            // one scan attempt here so the block never feels arbitrary.
            const rows = await (window.GahonshDB.Files.listForJob(options.jobId).catch(() => []));
            const row = Array.isArray(rows) ? rows.find((r) => r.id === id) : null;
            const status = row ? String(row.scan_status || 'pending') : 'pending';
            if (status === 'infected' || status === 'suspicious') {
                setStatus('This file was flagged by the virus scan and cannot be downloaded.', 'err');
                toast('⛔ Blocked: the virus scan flagged this file.');
                return;
            }
            if (status !== 'clean') {
                btn.disabled = true;
                btn.textContent = 'Scanning…';
                await requestScan(id);
                await refresh();
                btn.disabled = false;
                btn.textContent = '';
                btn.appendChild(icon('fa-solid fa-download'));
                btn.appendChild(document.createTextNode(' Download'));
                setStatus('This file is still being scanned. Please try again in a few seconds.', 'busy');
                return;
            }
            btn.disabled = true;
            btn.textContent = 'Preparing…';
            try {
                const result = await window.GahonshDB.Files.getDownload(id);
                triggerDownload(result.blob, result.fileName);
                setStatus('Download started.', 'ok');
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

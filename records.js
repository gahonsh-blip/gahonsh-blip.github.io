/**
 * Gahonsh record viewer and local export.
 *
 * Public worker/client records are read from the marketplace RPCs. Download
 * buttons build the file in the browser with a Blob and save it to the user's
 * device; nothing is uploaded to the site or to Supabase Storage.
 */
(function () {
    'use strict';

    let activeRecord = null;
    let lastFocus = null;

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (m) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    }

    function num(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    }

    function money(value) {
        return '$' + num(value).toLocaleString('en-US', { maximumFractionDigits: 0 });
    }

    function dateText(value) {
        if (!value) return '—';
        const date = new Date(value);
        return Number.isNaN(date.getTime())
            ? '—'
            : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function initials(name) {
        return String(name || 'G').trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    }

    function safeName(value) {
        return String(value || 'record').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'record';
    }

    function toast(message) {
        if (window.GahonshAuthUI && typeof window.GahonshAuthUI.showToast === 'function') {
            window.GahonshAuthUI.showToast(message);
        } else {
            console.log(message);
        }
    }

    function isSetupError(err) {
        if (window.GahonshDB && typeof window.GahonshDB.isBackendNotProvisioned === 'function') {
            return window.GahonshDB.isBackendNotProvisioned(err);
        }
        return /could not find the function|function .* does not exist|PGRST202/i.test(String((err && err.message) || err));
    }

    function ensureModal() {
        let modal = document.getElementById('recordModal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.className = 'record-modal';
        modal.id = 'recordModal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'recordModalTitle');
        modal.innerHTML = `
            <div class="record-modal-box">
                <div class="record-modal-head">
                    <div>
                        <p class="record-eyebrow">Gahonsh record</p>
                        <h2 id="recordModalTitle">Record</h2>
                    </div>
                    <button type="button" class="record-modal-close" id="recordModalClose" aria-label="Close record">&times;</button>
                </div>
                <div class="record-modal-body" id="recordModalBody"></div>
                <div class="record-modal-foot" id="recordModalFoot"></div>
            </div>`;
        document.body.appendChild(modal);

        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeModal();
        });
        modal.querySelector('#recordModalClose').addEventListener('click', closeModal);
        modal.querySelector('#recordModalFoot').addEventListener('click', (event) => {
            const button = event.target.closest('[data-record-format]');
            if (!button || !activeRecord) return;
            download(activeRecord.kind, activeRecord.record, activeRecord.name, button.dataset.recordFormat);
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && modal.classList.contains('active')) closeModal();
        });
        return modal;
    }

    function closeModal() {
        const modal = document.getElementById('recordModal');
        if (modal) modal.classList.remove('active');
        activeRecord = null;
        if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
        lastFocus = null;
    }

    function openModal(title, bodyHtml, kind, record, name) {
        const modal = ensureModal();
        lastFocus = document.activeElement;
        activeRecord = { kind, record, name };
        modal.querySelector('#recordModalTitle').textContent = title;
        modal.querySelector('#recordModalBody').innerHTML = bodyHtml;
        modal.querySelector('#recordModalFoot').innerHTML = `
            <p class="record-local-note"><i class="fa-solid fa-laptop" aria-hidden="true"></i> Downloads are created on this device and are never uploaded.</p>
            <div class="record-actions">
                <button type="button" class="record-download" data-record-format="json">Download JSON</button>
                <button type="button" class="record-download" data-record-format="csv">Download CSV</button>
            </div>`;
        modal.classList.add('active');
        const close = modal.querySelector('#recordModalClose');
        if (close) close.focus();
    }

    function showNotice(title, message) {
        const modal = ensureModal();
        lastFocus = document.activeElement;
        activeRecord = null;
        modal.querySelector('#recordModalTitle').textContent = title;
        modal.querySelector('#recordModalBody').innerHTML = `<p class="record-empty">${escapeHtml(message)}</p>`;
        modal.querySelector('#recordModalFoot').innerHTML = `
            <div class="record-actions">
                <button type="button" class="record-download" id="recordNoticeClose">Close</button>
            </div>`;
        modal.classList.add('active');
        const close = modal.querySelector('#recordNoticeClose');
        if (close) {
            close.addEventListener('click', closeModal, { once: true });
            close.focus();
        }
    }

    function stat(label, value) {
        return `<div class="record-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
    }

    function workerBody(record) {
        const profile = record.profile || {};
        const summary = record.summary || {};
        const recent = Array.isArray(record.recent) ? record.recent : [];
        const rating = num(summary.review_count) > 0
            ? `${num(summary.avg_rating).toFixed(1)} / 5 (${num(summary.review_count)})`
            : 'No reviews yet';
        const work = recent.length
            ? `<ul class="record-list">${recent.map((item) => `
                <li>
                    <div><strong>${escapeHtml(item.title || 'Project')}</strong><span>${escapeHtml(item.category || 'General')}</span></div>
                    <time>${escapeHtml(dateText(item.completed_at))}</time>
                </li>`).join('')}</ul>`
            : '<p class="record-empty">No completed projects yet. Work appears here after the client marks the contract complete.</p>';

        return `
            <div class="record-hero">
                <div class="record-avatar">${escapeHtml(initials(profile.full_name))}</div>
                <div>
                    <h3>${escapeHtml(profile.full_name || 'Freelancer')}${profile.is_verified ? ' <i class="fa-solid fa-circle-check" title="Verified"></i>' : ''}</h3>
                    <p>${escapeHtml(profile.title || 'Freelance Specialist')}</p>
                    <p class="record-muted">Member since ${escapeHtml(dateText(profile.member_since))}</p>
                </div>
            </div>
            <div class="record-summary">
                ${stat('Completed jobs', num(summary.completed_jobs))}
                ${stat('Active jobs', num(summary.active_jobs))}
                ${stat('Clients served', num(summary.clients_served))}
                ${stat('Rating', rating)}
            </div>
            <h3 class="record-section-title">Recent completed work</h3>
            ${work}
            <p class="record-privacy"><i class="fa-solid fa-lock" aria-hidden="true"></i> Public record. Earnings and client identities are private.</p>`;
    }

    function clientBody(record) {
        const profile = record.profile || {};
        const summary = record.summary || {};
        return `
            <div class="record-hero">
                <div class="record-avatar">${escapeHtml(initials(profile.full_name))}</div>
                <div>
                    <h3>${escapeHtml(profile.full_name || 'Client')}</h3>
                    <p>Client record</p>
                    <p class="record-muted">Member since ${escapeHtml(dateText(profile.member_since))}</p>
                </div>
            </div>
            <div class="record-summary">
                ${stat('Projects posted', num(summary.jobs_posted))}
                ${stat('Hires', num(summary.hires))}
                ${stat('Completed', num(summary.completed_jobs))}
                ${stat('Open now', num(summary.open_jobs) + num(summary.in_progress_jobs))}
            </div>
            <p class="record-privacy"><i class="fa-solid fa-lock" aria-hidden="true"></i> Public summary. Budgets, spend and freelancer names are private to the client.</p>`;
    }

    async function openWorkerRecord(workerId, fallbackName) {
        if (!workerId || !window.GahonshDB || !window.GahonshDB.Records) {
            toast('The record service is not ready. Please try again shortly.');
            return;
        }
        try {
            const record = await window.GahonshDB.Records.getWorkerRecord(workerId);
            if (!record) {
                toast('This freelancer has no public record yet.');
                return;
            }
            openModal(
                `${record.profile?.full_name || fallbackName || 'Freelancer'} — Work record`,
                workerBody(record),
                'worker-record',
                record,
                record.profile?.full_name || fallbackName || 'freelancer'
            );
        } catch (err) {
            if (isSetupError(err)) {
                showNotice('Record setup required', 'The live database does not have the record functions yet. Run docs/marketplace-schema.sql (or the worker_client_records migration) once in the Supabase SQL Editor, then refresh.');
            } else {
                toast('Could not load the record: ' + String((err && err.message) || err));
            }
        }
    }

    async function openClientRecord(clientId, fallbackName) {
        if (!clientId || !window.GahonshDB || !window.GahonshDB.Records) {
            toast('The record service is not ready. Please try again shortly.');
            return;
        }
        try {
            const record = await window.GahonshDB.Records.getClientRecord(clientId);
            if (!record) {
                toast('This client has no public record yet.');
                return;
            }
            openModal(
                `${record.profile?.full_name || fallbackName || 'Client'} — Client record`,
                clientBody(record),
                'client-record',
                record,
                record.profile?.full_name || fallbackName || 'client'
            );
        } catch (err) {
            if (isSetupError(err)) {
                showNotice('Record setup required', 'The live database does not have the record functions yet. Run docs/marketplace-schema.sql (or the worker_client_records migration) once in the Supabase SQL Editor, then refresh.');
            } else {
                toast('Could not load the record: ' + String((err && err.message) || err));
            }
        }
    }

    function renderMyRecord(record) {
        const profile = record?.profile || {};
        const worker = record?.worker || null;
        const client = record?.client || null;
        const workerSummary = worker?.summary || {};
        const clientSummary = client?.summary || {};
        const workerRecent = Array.isArray(worker?.recent) ? worker.recent : [];
        const clientRecent = Array.isArray(client?.recent_jobs) ? client.recent_jobs : [];
        const showWorker = worker && (profile.role === 'freelancer' || num(workerSummary.completed_jobs) > 0 || num(workerSummary.active_jobs) > 0);
        const showClient = client && (profile.role === 'client' || num(clientSummary.jobs_posted) > 0);
        const workerHtml = showWorker ? `
            <section class="record-panel">
                <div class="record-panel-head"><h3>Worker record</h3><span>Private earnings</span></div>
                <div class="record-summary">
                    ${stat('Completed jobs', num(workerSummary.completed_jobs))}
                    ${stat('Active jobs', num(workerSummary.active_jobs))}
                    ${stat('Total earned', money(worker.earnings))}
                    ${stat('Rating', num(workerSummary.review_count) > 0 ? `${num(workerSummary.avg_rating).toFixed(1)} / 5` : 'No reviews yet')}
                </div>
                <h4 class="record-section-title">Completed work</h4>
                ${workerRecent.length ? `<ul class="record-list">${workerRecent.map((item) => `
                    <li>
                        <div><strong>${escapeHtml(item.title || 'Project')}</strong><span>${escapeHtml(item.category || 'General')}</span></div>
                        <div class="record-list-meta"><time>${escapeHtml(dateText(item.completed_at))}</time><b>${escapeHtml(money(item.amount))}</b></div>
                    </li>`).join('')}</ul>` : '<p class="record-empty">No completed work yet.</p>'}
            </section>` : '';

        const clientHtml = showClient ? `
            <section class="record-panel">
                <div class="record-panel-head"><h3>Client record</h3><span>Private spend</span></div>
                <div class="record-summary">
                    ${stat('Projects posted', num(clientSummary.jobs_posted))}
                    ${stat('Hires', num(clientSummary.hires))}
                    ${stat('Completed', num(clientSummary.completed_jobs))}
                    ${stat('Total spent', money(clientSummary.total_spent))}
                </div>
                <h4 class="record-section-title">Posted projects</h4>
                ${clientRecent.length ? `<ul class="record-list">${clientRecent.map((item) => `
                    <li>
                        <div><strong>${escapeHtml(item.title || 'Project')}</strong><span>${escapeHtml(item.status || 'open')}${item.hired_freelancer?.full_name ? ' · ' + escapeHtml(item.hired_freelancer.full_name) : ''}</span></div>
                        <div class="record-list-meta"><time>${escapeHtml(dateText(item.created_at))}</time><b>${escapeHtml(money(item.contract_amount))}</b></div>
                    </li>`).join('')}</ul>` : '<p class="record-empty">No projects posted yet.</p>'}
            </section>` : '';

        return `
            <div class="record-hero">
                <div class="record-avatar">${escapeHtml(initials(profile.full_name))}</div>
                <div>
                    <h3>${escapeHtml(profile.full_name || 'Member')}</h3>
                    <p>Your private record</p>
                    <p class="record-muted">Member since ${escapeHtml(dateText(profile.member_since))}</p>
                </div>
            </div>
            <div class="record-my-actions">
                <button type="button" class="record-download" data-record-download="my-record" data-record-format="json">Download full record (JSON)</button>
                <button type="button" class="record-download" data-record-download="my-record" data-record-format="csv">Download full record (CSV)</button>
            </div>
            <p class="record-local-note"><i class="fa-solid fa-laptop" aria-hidden="true"></i> These files are generated on this device. Nothing is uploaded to the website.</p>
            ${workerHtml}${clientHtml || (showWorker ? '' : '<p class="record-empty">No completed work or posted projects yet. Your record starts after your first hire or completed contract.</p>')}`;
    }

    function recordPayload(kind, record, name) {
        return {
            format: 'gahonsh-record-v1',
            kind,
            subject: name,
            exported_at: new Date().toISOString(),
            notice: 'Generated locally in the browser. This file was not uploaded to Gahonsh.',
            record
        };
    }

    function csvCell(value) {
        const text = String(value ?? '');
        return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    }

    function csvFor(kind, record) {
        const rows = [['section', 'date', 'title', 'category', 'status', 'counterparty', 'amount']];
        if (kind === 'worker-record') {
            (record.recent || []).forEach((item) => {
                rows.push(['work', dateText(item.completed_at), item.title || '', item.category || '', 'completed', '', '']);
            });
        } else if (kind === 'client-record') {
            rows.push(['summary', '', 'Projects posted', '', '', '', record.summary?.jobs_posted ?? 0]);
            rows.push(['summary', '', 'Hires', '', '', '', record.summary?.hires ?? 0]);
            rows.push(['summary', '', 'Completed', '', '', '', record.summary?.completed_jobs ?? 0]);
        } else {
            const worker = record.worker || {};
            const client = record.client || {};
            (worker.recent || []).forEach((item) => {
                rows.push(['work', dateText(item.completed_at), item.title || '', item.category || '', 'completed', '', num(item.amount)]);
            });
            (client.recent_jobs || []).forEach((item) => {
                rows.push(['job', dateText(item.created_at), item.title || '', '', item.status || '', item.hired_freelancer?.full_name || '', num(item.contract_amount)]);
            });
        }
        return rows.map((row) => row.map(csvCell).join(',')).join('\n');
    }

    function download(kind, record, name, format) {
        if (!record) return;
        const base = `gahonsh-${kind}-${safeName(name)}-${new Date().toISOString().slice(0, 10)}`;
        let blob;
        let filename;
        if (format === 'csv') {
            blob = new Blob([csvFor(kind, record)], { type: 'text/csv;charset=utf-8' });
            filename = base + '.csv';
        } else {
            blob = new Blob([JSON.stringify(recordPayload(kind, record, name), null, 2)], { type: 'application/json' });
            filename = base + '.json';
        }
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        toast('Record saved to this device.');
    }

    window.GahonshRecords = {
        openWorkerRecord,
        openClientRecord,
        renderMyRecord,
        download,
        close: closeModal
    };
})();

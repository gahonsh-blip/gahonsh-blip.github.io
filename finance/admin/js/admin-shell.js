/**
 * Shared admin sidebar navigation.
 *
 * Every admin page includes the same `<nav class="sidebar-nav">` element; this
 * script populates it from a single definition so the control centre menu stays
 * consistent across pages and only needs extending in one place. The item whose
 * href matches the current page is marked active.
 */
(function () {
    // Each entry pairs the label with a symbol id from the shared sprite
    // (`/shared/icons.svg`), so the sidebar reads as a scannable icon set.
    const ITEMS = [
        { href: 'index.html', label: 'Dashboard', icon: 'gf-chart' },
        { href: 'customers.html', label: 'Customers', icon: 'gf-users' },
        { href: 'client-completion.html', label: 'Client Completion', icon: 'gf-file-text' },
        { href: 'loan-products.html', label: 'Loan Products', icon: 'gf-bank' },
        { href: 'applications.html', label: 'Applications', icon: 'gf-edit' },
        { href: 'loans.html', label: 'Loans', icon: 'gf-rupee' },
        { href: 'imports.html', label: 'Data Import', icon: 'gf-download' },
        { href: 'rules.html', label: 'Rules & Automation', icon: 'gf-badge-check' },
        { href: 'messaging.html', label: 'Messaging', icon: 'gf-mail' },
        { href: 'documents.html', label: 'Documents', icon: 'gf-file-text' },
        { href: 'reports.html', label: 'Reports', icon: 'gf-chart' },
        { href: 'audit.html', label: 'Audit Logs', icon: 'gf-shield-check' },
        { href: 'settings.html', label: 'Settings', icon: 'gf-percent' }
    ];

    function render() {
        const nav = document.querySelector('.sidebar-nav');
        if (!nav) return;
        const current = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
        nav.innerHTML = ITEMS.map((item) => {
            const active = item.href.toLowerCase() === current ? ' class="active"' : '';
            return `<a href="${item.href}"${active}>`
                + `<svg class="sidebar-icon" aria-hidden="true"><use href="/finance/shared/icons.svg#${item.icon}"></use></svg>`
                + `${item.label}</a>`;
        }).join('');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', render);
    } else {
        render();
    }
})();

/**
 * Small fetch wrapper for the admin pages.
 *
 * Centralises bearer auth, JSON parsing and the platform's uniform error
 * envelope (`{ success:false, error:{ code, message } }`) so every page shows a
 * meaningful message rather than "[object Object]". Throws an Error whose
 * `code` is the server error code, which callers may branch on.
 */
async function apiFetch(path, options = {}) {
    const init = {
        method: options.method || 'GET',
        headers: Object.assign(
            { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` },
            options.body !== undefined ? { 'Content-Type': 'application/json' } : {}
        )
    };
    if (options.body !== undefined) {
        init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }

    let response;
    try {
        response = await fetch(path, init);
    } catch (err) {
        const networkError = new Error('Network unreachable. Check your connection and try again.');
        networkError.code = 'NETWORK_ERROR';
        throw networkError;
    }

    const text = await response.text();
    let payload = null;
    if (text) {
        try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
    }

    if (response.status === 401) {
        localStorage.removeItem('token');
        window.location.href = 'index.html';
        throw new Error('Session expired');
    }

    if (!response.ok) {
        // The API mixes two error envelopes: the uniform
        // `{ success:false, error:{ code, message } }` shape and the older
        // `{ error: "message" }` string. `payload.error.message` is undefined
        // for the string form, which would otherwise surface a generic
        // "Request failed (400)" instead of the server's reason.
        const envelope = payload && payload.error;
        const message = (envelope && typeof envelope === 'object' && envelope.message)
            || (typeof envelope === 'string' && envelope)
            || payload?.detail
            || `Request failed (${response.status})`;
        const error = new Error(message);
        error.code = (envelope && typeof envelope === 'object' && envelope.code) || 'HTTP_ERROR';
        error.status = response.status;
        error.payload = payload;
        throw error;
    }

    return payload;
}

/**
 * Reads a human-readable message out of any of the API's error envelopes.
 *
 * The API answers errors in more than one shape: the uniform
 * `{ success:false, error:{ code, message } }`, the older `{ error: "message" }`
 * string, and the plain `{ detail: "message" }` used by the route handlers that
 * build their own response. Pages that use the shared `apiFetch` get this for
 * free; the pages that call `fetch` directly read `payload.detail` only, so a
 * permission denial (`{ error, code }`, no `detail`) surfaced as the generic
 * fallback. Normalising in one place keeps every page honest.
 */
function apiErrorMessage(payload, fallback) {
    const envelope = payload && payload.error;
    return (envelope && typeof envelope === 'object' && envelope.message)
        || (typeof envelope === 'string' && envelope)
        || (payload && typeof payload.detail === 'string' && payload.detail)
        || (payload && typeof payload.message === 'string' && payload.message)
        || fallback;
}

/** Renders a consistent empty/loading/error state into a container. */
function renderState(container, kind, message) {
    const el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) return;
    const icons = { loading: '&#8987;', empty: '&#128203;', error: '&#9888;', denied: '&#128274;' };
    const color = kind === 'error' || kind === 'denied' ? 'var(--color-danger)' : 'var(--color-text-muted)';
    el.innerHTML = `<div style="text-align:center;padding:40px 16px;color:${color};">
        <div style="font-size:28px;margin-bottom:8px;">${icons[kind] || ''}</div>
        <div>${escapeHtml(message)}</div>
    </div>`;
}

/** Opens a confirmation dialog for a destructive/financial action. */
function confirmAction(title, message, confirmLabel) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:10000;padding:16px;';
        overlay.innerHTML = `
            <div class="card" style="max-width:440px;width:100%;">
                <h3 style="margin-top:0;">${escapeHtml(title)}</h3>
                <p class="text-muted">${escapeHtml(message)}</p>
                <div class="flex gap-2" style="justify-content:flex-end;margin-top:16px;">
                    <button class="btn-secondary" id="confirmCancel">Cancel</button>
                    <button id="confirmOk" style="background:var(--color-danger);border-color:var(--color-danger);">${escapeHtml(confirmLabel || 'Confirm')}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const close = (value) => {
            overlay.remove();
            document.removeEventListener('keydown', onKey);
            resolve(value);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') close(false);
            if (e.key === 'Enter') close(true);
        };
        overlay.querySelector('#confirmCancel').onclick = () => close(false);
        overlay.querySelector('#confirmOk').onclick = () => close(true);
        overlay.querySelector('#confirmOk').focus();
        document.addEventListener('keydown', onKey);
    });
}

/** Simple modal host. Returns an element plus a close function. */
function openModal(title, innerHtml) {
    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:flex-start;justify-content:center;z-index:10000;padding:24px;overflow:auto;';
    overlay.innerHTML = `
        <div class="card" style="max-width:760px;width:100%;position:relative;">
            <button class="btn-secondary" id="modalClose" aria-label="Close" style="position:absolute;top:12px;right:12px;">&times;</button>
            <h3 style="margin-top:0;padding-right:36px;">${escapeHtml(title)}</h3>
            <div id="modalBody">${innerHtml}</div>
        </div>`;
    document.body.appendChild(overlay);
    const close = () => {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    overlay.querySelector('#modalClose').onclick = close;
    document.addEventListener('keydown', onKey);
    return { overlay, body: overlay.querySelector('#modalBody'), close };
}

function gfLocale(fallback) {
    return (typeof window !== 'undefined' && window.GF_PLATFORM && window.GF_PLATFORM.mode
        && window.GF_PLATFORM.mode.locale) || fallback;
}

function formatMoney(value) {
    const n = Number(value || 0);
    const brand = (typeof window !== 'undefined' && window.GF_PLATFORM && window.GF_PLATFORM.brand) || {};
    const locale = gfLocale('en-IN');
    const currency = brand.currency || 'INR';
    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency', currency, maximumFractionDigits: 2
        }).format(n);
    } catch {
        return '\u20B9' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    }
}

function formatDate(value) {
    if (!value) return '-';
    const d = new Date(value);
    const locale = gfLocale('en-IN');
    return isNaN(d.getTime()) ? String(value) : d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

function statusBadge(status) {
    const s = String(status || '').toUpperCase();
    const tone = ['COMPLETED', 'DELIVERED', 'SENT', 'SUCCESS', 'ACTIVE', 'VALID', 'APPROVED'].includes(s) ? 'badge-success'
        : ['FAILED', 'DEAD_LETTER', 'ERROR', 'REJECTED', 'DENIED'].includes(s) ? 'badge-danger'
        : ['QUEUED', 'PROCESSING', 'PENDING', 'WARNING', 'DUPLICATE', 'SUPPRESSED', 'SKIPPED'].includes(s) ? 'badge-warning'
        : '';
    return `<span class="badge ${tone}">${escapeHtml(s || '-')}</span>`;
}

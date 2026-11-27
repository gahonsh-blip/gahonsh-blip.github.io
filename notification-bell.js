/**
 * Site-wide notification bell and the proposal alert.
 *
 * The portal shows notifications in its own tab, but a member who never opens
 * the portal never sees that a proposal arrived. This adds one small button on
 * every page for a signed-in member with unread items, plus the email path for
 * a new proposal.
 *
 * Email note: the site has no mail server. The only working channel is the
 * studio's Formspree form, so a proposal alert is emailed to the studio and the
 * member sees it in the portal. No other member's email or phone is sent.
 */
(function () {
    'use strict';

    // The studio editor captures the page for saving; injected UI would be
    // baked into the saved file.
    if (window.__GAHONSH_STUDIO_PREVIEW__) return;
    if (window.__GAHONSH_BELL__) return;
    window.__GAHONSH_BELL__ = true;

    var FORMSPREE_ENDPOINT = 'https://formspree.io/f/xzdqnoez';
    var PORTAL_URL = 'marketplace-dashboard.html#notifications';
    var POLL_MS = 60000;

    var bell = null;
    var count = 0;
    var timer = null;
    var busy = false;

    function db() { return window.GahonshDB; }

    function signedInUser() {
        var database = db();
        if (!database || !database.Auth || typeof database.Auth.getCurrentUser !== 'function') return null;
        try {
            return Promise.resolve(database.Auth.getCurrentUser()).catch(function () { return null; });
        } catch (e) {
            return Promise.resolve(null);
        }
    }

    function injectStyles() {
        if (document.getElementById('gc-bell-style')) return;
        var style = document.createElement('style');
        style.id = 'gc-bell-style';
        style.textContent = [
            '.gc-bell{position:fixed;left:16px;bottom:16px;z-index:99997;display:none;align-items:center;gap:8px;',
            'min-height:48px;padding:10px 16px;border-radius:26px;border:1px solid rgba(0,224,184,.55);',
            'background:#0d1b2a;color:#e6f1ff;font:600 13px/1 inherit;cursor:pointer;',
            'box-shadow:0 10px 26px rgba(2,8,20,.38);}',
            '.gc-bell[data-visible="1"]{display:inline-flex;}',
            '.gc-bell:hover{border-color:#00e0b8;color:#00e0b8;}',
            '.gc-bell:focus-visible{outline:2px solid #00e0b8;outline-offset:2px;}',
            '.gc-bell-count{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;',
            'padding:0 6px;border-radius:11px;background:#00e0b8;color:#04121a;font-size:12px;font-weight:800;}',
            'body.light-mode .gc-bell{background:#ffffff;color:#0f172a;border-color:#0d9488;box-shadow:0 8px 22px rgba(15,23,42,.16);}',
            'body.light-mode .gc-bell:hover{color:#0f766e;border-color:#0f766e;}',
            'body.light-mode .gc-bell-count{background:#0f766e;color:#ffffff;}',
            '@media (max-width:480px){.gc-bell{left:12px;bottom:12px;padding:10px 14px;}}'
        ].join('');
        document.head.appendChild(style);
    }

    function render() {
        if (!bell) return;
        var label = count === 1 ? '1 new notification' : count + ' new notifications';
        bell.setAttribute('aria-label', label + ' — open your portal');
        bell.title = label;
        bell.innerHTML = '';
        var icon = document.createElement('span');
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '\uD83D\uDD14';
        var text = document.createElement('span');
        text.textContent = 'Notifications';
        var badge = document.createElement('span');
        badge.className = 'gc-bell-count';
        badge.textContent = String(count);
        bell.appendChild(icon);
        bell.appendChild(text);
        bell.appendChild(badge);
        bell.dataset.visible = count > 0 ? '1' : '0';
    }

    function refresh() {
        if (busy) return Promise.resolve(count);
        busy = true;
        return signedInUser().then(function (user) {
            var database = db();
            if (!user || !database || !database.Notifications || typeof database.Notifications.unreadCount !== 'function') {
                count = 0;
                render();
                return 0;
            }
            return Promise.resolve(database.Notifications.unreadCount()).then(function (value) {
                var next = Number(value);
                count = isFinite(next) && next > 0 ? Math.floor(next) : 0;
                render();
                return count;
            }).catch(function () {
                return count;
            });
        }).catch(function () {
            return count;
        }).then(function (value) {
            busy = false;
            return value;
        });
    }

    function openPortal() {
        window.location.href = PORTAL_URL;
    }

    function mount() {
        if (bell || !document.body) return;
        injectStyles();
        bell = document.createElement('button');
        bell.type = 'button';
        bell.className = 'gc-bell';
        bell.dataset.visible = '0';
        bell.addEventListener('click', openPortal);
        document.body.appendChild(bell);
        // The session restore can finish after this script runs, so try a few
        // times before settling into the slow poll.
        [0, 800, 2000, 4000].forEach(function (delay) {
            setTimeout(refresh, delay);
        });
        if (timer) clearInterval(timer);
        timer = setInterval(function () {
            if (document.visibilityState === 'visible') refresh();
        }, POLL_MS);
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') refresh();
        });
        var database = db();
        if (database && database.Auth && typeof database.Auth.onAuthStateChange === 'function') {
            try {
                database.Auth.onAuthStateChange(function () {
                    count = 0;
                    render();
                    refresh();
                });
            } catch (e) { /* auth events are optional */ }
        }
    }

    /**
     * Email the studio that a proposal arrived. Fire and forget: a failure here
     * never blocks the proposal that was already saved.
     */
    function proposalSubmitted(info) {
        var data = info || {};
        var title = String(data.jobTitle || 'a project').replace(/\s+/g, ' ').trim().slice(0, 120);
        var bid = Number(data.bid) || 0;
        var days = Number(data.days) || 0;
        var lines = [
            'A freelancer submitted a proposal.',
            '',
            'Project: ' + title,
            'Bid: $' + bid,
            days ? 'Delivery: ' + days + ' days' : '',
            data.jobUrl ? 'Job: ' + data.jobUrl : '',
            '',
            'The client sees this in the marketplace portal.'
        ].filter(Boolean);
        var body = {
            name: 'Proposal alert',
            email: 'gahonsh@gmail.com',
            service: 'Marketplace proposal',
            budget: '$' + bid,
            message: lines.join('\n')
        };
        try {
            return fetch(FORMSPREE_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(body),
                keepalive: true
            }).then(function (response) { return !!response && response.ok; }).catch(function () { return false; });
        } catch (e) {
            return Promise.resolve(false);
        }
    }

    /**
     * A mailto digest of the unread list. The member's own mail app sends it, so
     * no address is collected and no server is needed.
     */
    function emailDigest(items) {
        var rows = Array.isArray(items) ? items : [];
        if (!rows.length) return false;
        var subject = 'Gahonsh marketplace — ' + rows.length + ' notification' + (rows.length === 1 ? '' : 's');
        var body = rows.map(function (row) {
            return '- ' + String(row.title || 'Update') + (row.body ? ': ' + String(row.body) : '');
        }).join('\n');
        window.location.href = 'mailto:?subject=' + encodeURIComponent(subject) +
            '&body=' + encodeURIComponent(body + '\n\nOpen the portal: ' +
                window.location.origin + '/' + PORTAL_URL);
        return true;
    }

    window.GahonshAlerts = {
        refresh: refresh,
        proposalSubmitted: proposalSubmitted,
        emailDigest: emailDigest
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }
})();

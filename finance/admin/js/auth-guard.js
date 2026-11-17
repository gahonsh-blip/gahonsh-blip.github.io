/**
 * Admin portal guard.
 *
 * A staff page must not render its protected content to a visitor who merely
 * put *some* string in `localStorage`. The previous version only checked that a
 * token *existed*, so any value - including a forged or expired one - opened
 * the page shell. This now delegates to `GFPortal.require('admin')` (see
 * `/shared/session.js`), which verifies the token against `GET /api/auth/me`
 * and enforces the staff roles before the page is allowed to continue.
 *
 * The `headers()` and `logout()` helpers remain globals because every admin
 * page's inline script calls them.
 */
(function () {
    'use strict';

    const token = window.GFPortal ? window.GFPortal.token() : (localStorage.getItem('token') || '');

    window.headers = () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${window.GFPortal ? window.GFPortal.token() : token}`
    });

    window.logout = () => {
        if (window.GFPortal) {
            window.GFPortal.signOut('admin');
        } else {
            localStorage.removeItem('token');
            localStorage.removeItem('userRole');
            window.location.replace('/finance/admin/');
        }
    };

    document.addEventListener('DOMContentLoaded', async () => {
        if (!window.GFPortal) {
            // The shared guard failed to load. Fail closed rather than leaving a
            // protected shell reachable on a token-presence check.
            window.location.replace('/finance/admin/');
            return;
        }
        const session = await window.GFPortal.require('admin');
        if (!session) return; // redirected to sign-in or to the role's own portal
        // Only now is it safe to paint the protected shell. The pages ship their
        // `.app-container` with `hidden`, so a visitor without a verified session
        // never sees admin chrome before the redirect lands.
        document.querySelectorAll('.app-container[hidden]').forEach((el) => el.removeAttribute('hidden'));
        const identity = document.getElementById('identity');
        if (identity) identity.textContent = `Signed in as ${session.user.role}`;
    });
})();

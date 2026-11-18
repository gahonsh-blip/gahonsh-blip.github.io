/**
 * Gahonsh Freelancing Marketplace - Supabase Configuration
 *
 * Production is configured permanently below. The public Supabase project URL
 * and the project's public browser-safe PUBLISHABLE key are committed defaults,
 * so every visitor is configured automatically — no manual browser setup, no
 * localStorage requirement, no environment variables.
 *
 * The production Project URL is fixed and can never be replaced by a dev/local
 * override. A per-browser PUBLISHABLE key override saved via the in-app
 * "Connect Supabase" modal is an optional development/testing fallback only;
 * it is validated so a bad/placeholder/secret value can never be used.
 *
 * NEVER put a service_role / sb_secret key in this or any public file!
 */

// Committed production defaults. Publishable key is public and browser-safe.
var GAHONSH_PRODUCTION_URL = "https://evdpmombgymthzqegqwr.supabase.co";
var GAHONSH_PUBLISHABLE_KEY = "sb_publishable_2r2qEViIYoChRsXGFvpGqg__PeH8GFy";
var GAHONSH_STORAGE_BUCKET = "job-attachments";

function gahonshValidKey(k) {
    return typeof k === 'string' &&
        /^sb_publishable_.+$/i.test(k.trim()) &&
        !k.includes('sb_secret_');
}

// Committed production URL is always used. A validated publishable-key override
// is optional for local development/testing and can never break production.
window.GAHONSH_CONFIG = window.GAHONSH_CONFIG || {};

(function () {
    var lsKey = null;
    try {
        lsKey = localStorage.getItem('GAHONSH_SUPABASE_ANON_KEY');
    } catch (e) { /* localStorage unavailable — use production defaults */ }

    window.GAHONSH_CONFIG.SUPABASE_URL = GAHONSH_PRODUCTION_URL;
    window.GAHONSH_CONFIG.SUPABASE_ANON_KEY = gahonshValidKey(lsKey)
        ? lsKey.trim()
        : GAHONSH_PUBLISHABLE_KEY;
    window.GAHONSH_CONFIG.STORAGE_BUCKET = GAHONSH_STORAGE_BUCKET;
})();

/**
 * Check if Supabase production configuration is active (never requires setup).
 */
window.isSupabaseConfigured = function() {
    const url = window.GAHONSH_CONFIG.SUPABASE_URL;
    const key = window.GAHONSH_CONFIG.SUPABASE_ANON_KEY;
    return url === GAHONSH_PRODUCTION_URL && gahonshValidKey(key);
};

/**
 * Save a validated publishable-key override for local development/testing only.
 * The production URL is never changed; only a valid sb_publishable_ key is saved.
 */
window.saveSupabaseConfig = function(url, anonKey) {
    if (url && gahonshValidUrlForDev(url) && gahonshValidKey(anonKey)) {
        try {
            localStorage.setItem('GAHONSH_SUPABASE_ANON_KEY', anonKey.trim());
        } catch (e) { return false; }
        window.GAHONSH_CONFIG.SUPABASE_ANON_KEY = anonKey.trim();
        window.location.reload();
        return true;
    }
    return false;
};

function gahonshValidUrlForDev(u) {
    // For display purposes only: the modal prefills the production URL.
    return typeof u === 'string' && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(u.trim());
}

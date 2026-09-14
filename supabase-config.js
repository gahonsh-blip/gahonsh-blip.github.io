/**
 * Gahonsh Freelancing Marketplace - Supabase Configuration
 *
 * Production defaults are baked in below so every visitor can use the live
 * Supabase project immediately — no manual browser setup required.
 *
 * A per-browser override can still be saved via the in-app "Connect Supabase"
 * modal (stored in localStorage) for local development/testing, but it is no
 * longer required for production use.
 *
 * NEVER put service_role secret key in this or any public file!
 */

window.GAHONSH_CONFIG = window.GAHONSH_CONFIG || {
    // ------------------------------------------------------------------------
    // PRODUCTION SUPABASE PROJECT DEFAULTS
    // ------------------------------------------------------------------------
    SUPABASE_URL: localStorage.getItem('GAHONSH_SUPABASE_URL') || "https://evdpbombgymthzqgegqwr.supabase.co",

    // Production public anon (publishable) key.
    SUPABASE_ANON_KEY: localStorage.getItem('GAHONSH_SUPABASE_ANON_KEY') || "sb_publishable_2r2qEViIYoChRsXGFvpGqg__PeH8GFy",
    STORAGE_BUCKET: "job-attachments"
};

/**
 * Check if Supabase has been configured with non-empty URL and Key
 */
window.isSupabaseConfigured = function() {
    const url = window.GAHONSH_CONFIG.SUPABASE_URL;
    const key = window.GAHONSH_CONFIG.SUPABASE_ANON_KEY;
    return Boolean(
        url && 
        key && 
        url.trim() !== '' && 
        key.trim() !== '' && 
        !url.includes('YOUR_SUPABASE') &&
        !key.includes('YOUR_SUPABASE')
    );
};

/**
 * Save credentials in localStorage for local development / immediate testing
 */
window.saveSupabaseConfig = function(url, anonKey) {
    if (!url || !anonKey) return false;
    localStorage.setItem('GAHONSH_SUPABASE_URL', url.trim());
    localStorage.setItem('GAHONSH_SUPABASE_ANON_KEY', anonKey.trim());
    window.GAHONSH_CONFIG.SUPABASE_URL = url.trim();
    window.GAHONSH_CONFIG.SUPABASE_ANON_KEY = anonKey.trim();
    window.location.reload();
    return true;
};

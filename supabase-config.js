/**
 * Gahonsh Freelancing Marketplace - Supabase Configuration
 * 
 * Instructions:
 * 1. Create a free project at https://supabase.com
 * 2. Run the SQL in docs/marketplace-schema.sql in Supabase SQL Editor
 * 3. Enter your Project URL and Anon Public Key below (or configure via UI modal in browser)
 * 
 * NEVER put service_role secret key in this or any public file!
 */

window.GAHONSH_CONFIG = window.GAHONSH_CONFIG || {
    // ------------------------------------------------------------------------
    // REPLACE THESE PLACEHOLDERS WITH YOUR ACTUAL SUPABASE CREDENTIALS:
    // ------------------------------------------------------------------------
    SUPABASE_URL: localStorage.getItem('GAHONSH_SUPABASE_URL') || "",
    SUPABASE_ANON_KEY: localStorage.getItem('GAHONSH_SUPABASE_ANON_KEY') || "",
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

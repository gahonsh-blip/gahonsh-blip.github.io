// Dependency-free content and trust checks for the static pages.
// Run with: npm run test:content
//
// These guard the fixes from the November 2026 site audit (docs/SITE-AUDIT-2026-11.md):
//   1. A stat counter must print its real figure in the markup. The count-up
//      animation starts from zero, so a `0` in the HTML means a crawler or a
//      no-JS visitor reads "0 Live Projects" while the page claims 4 elsewhere.
//   2. Every target="_blank" link needs rel="noopener noreferrer".
//   3. The legal pages must keep the marketplace clauses the audit added.
//   4. No page may claim payment protection or escrow that the platform does
//      not provide. Payments move directly between client and freelancer.
//   5. The portal's loading placeholder needs a live region and a noscript
//      fallback, so a failed script cannot leave it on screen forever.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const fail = (file, msg) => failures.push(`${file}: ${msg}`);
const read = (file) => readFileSync(join(root, file), 'utf8');

const pages = readdirSync(root).filter((f) => f.endsWith('.html')).sort();

for (const page of pages) {
    const html = read(page);

    // 1. Static figure must match data-target.
    for (const m of html.matchAll(
        /<(\w+)[^>]*class="[^"]*\bcounter-num\b[^"]*"[^>]*data-target="(\d+)"[^>]*>([^<]*)<\/\1>/g
    )) {
        const shown = m[3].trim();
        if (shown !== m[2]) {
            fail(page, `counter shows "${shown}" in markup but animates to ${m[2]}`);
        }
    }

    // 2. External links opened in a new tab.
    for (const m of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
        if (!/\brel="[^"]*\bnoreferrer\b/.test(m[0])) {
            fail(page, `target="_blank" without rel="noopener noreferrer": ${m[0].slice(0, 90)}`);
        }
    }

    // 4. Payment claims the platform cannot back up.
    for (const claim of [/payment[- ]verified/i, /escrow/i, /payment protection/i, /money[- ]back guarantee/i]) {
        if (claim.test(html)) fail(page, `claims an unbuilt payment feature: ${claim}`);
    }
}

// 3. Legal pages must carry the marketplace clauses.
const terms = read('terms.html');
for (const heading of [
    'Client responsibilities',
    'Freelancer responsibilities',
    'Fees, commission and payments',
    'Revisions, refunds and cancellation',
    'Disputes between clients and freelancers',
    'Verification, fraud and suspension',
    'Intellectual property',
]) {
    if (!terms.includes(heading)) fail('terms.html', `missing clause: ${heading}`);
}

const privacy = read('privacy-policy.html');
for (const [label, pattern] of [
    ['Supabase as a processor', /<strong>Supabase<\/strong>/],
    ['Formspree as a processor', /<strong>Formspree<\/strong>/],
    ['GitHub Pages hosting', /GitHub Pages/],
    ['account deletion', /Deleting your account/],
    ['retention period', /How long we keep it/],
    ['cookies and browser storage', /Cookies and browser storage/],
]) {
    if (!pattern.test(privacy)) fail('privacy-policy.html', `missing disclosure: ${label}`);
}

// 5. Portal loading state.
const portal = read('marketplace-dashboard.html');
const container = portal.match(/<div id="tabListingsContainer"[^>]*>/);
if (!container) {
    fail('marketplace-dashboard.html', 'tabListingsContainer is missing');
} else if (!/aria-live="/.test(container[0])) {
    fail('marketplace-dashboard.html', 'tabListingsContainer needs an aria-live region');
}
if (!/<noscript>[\s\S]*tabListingsContainer|<\/div>\s*<noscript>/.test(portal)) {
    fail('marketplace-dashboard.html', 'portal needs a <noscript> fallback');
}
if (!/function renderPortalError/.test(portal)) {
    fail('marketplace-dashboard.html', 'portal has no error state for a failed load');
}

if (failures.length) {
    console.error(`content check failed (${failures.length}):`);
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
}
console.log(`content check passed: ${pages.length} pages verified.`);

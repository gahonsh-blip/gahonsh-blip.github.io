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
//   6. Private pages must stay noindex and out of the sitemap.
//   7. Links a script writes into the DOM need rel="noreferrer" as well.
//   8. Heading outline: one h1 per page, no skipped levels.
//   9. No page may zero its stat counters at load. Writing "0" before the
//      count-up starts is what printed "0 Live Projects" in the audit.
//  10. The portal load must time out instead of sitting on its placeholder.
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

    // 9. Counters must not be zeroed before the count-up runs.
    if (/counters\.forEach\([^;]*\btextContent = '0'/.test(html)) {
        fail(page, 'zeroes its stat counters at load, so the page reads "0 Live Projects" until the animation starts');
    }
}

// 8. Heading outline: one h1 per page, no skipped levels. Card titles that a
//    script injects are excluded, since they are content of the edited page.
const NO_OUTLINE = new Set(['dasbord.html', 'googleb9deb43124fcee02.html', 'home.html']);
for (const page of pages) {
    if (NO_OUTLINE.has(page)) continue;
    const body = read(page).split('<body')[1] || '';
    const stripped = body
        .replace(/<script\b[\s\S]*?<\/script>/gi, '')
        .replace(/<style\b[\s\S]*?<\/style>/gi, '');
    const levels = [...stripped.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
    if (levels.length === 0) continue;
    const h1s = levels.filter((l) => l === 1).length;
    if (h1s !== 1) fail(page, `expected exactly one <h1>, found ${h1s}`);
    if (levels[0] !== 1) fail(page, `first heading is h${levels[0]}, not h1`);
    for (let i = 1; i < levels.length; i += 1) {
        if (levels[i] > levels[i - 1] + 1) {
            fail(page, `heading level jumps h${levels[i - 1]} -> h${levels[i]}`);
            break;
        }
    }
}

// 6. Private pages are reachable but must never be indexed. Contract messages
//    and the owner studio hold another member's or the owner's data.
const PRIVATE_PAGES = [
    'admin.html', 'dasbord.html', 'dashboard.html', 'home.html',
    'messages.html', 'thank-you.html',
];
for (const page of PRIVATE_PAGES) {
    const html = read(page);
    if (!/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html)) {
        fail(page, 'private page is missing <meta name="robots" content="noindex">');
    }
}
const sitemap = read('sitemap.xml');
for (const page of PRIVATE_PAGES) {
    if (sitemap.includes(`/${page}<`)) fail('sitemap.xml', `private page is listed: ${page}`);
}

// 7. The same link rule applies to markup a script writes into the page.
for (const file of ['auth.js', 'chat-widget.js', 'marketplace-trust.js', 'records.js', 'supabase-client.js']) {
    const js = read(file);
    for (const m of js.matchAll(/<a\b[^>]*target=\\?"_blank[^>]*>/g)) {
        if (!/noreferrer/.test(m[0])) {
            fail(file, `script writes target="_blank" without noreferrer: ${m[0].slice(0, 90)}`);
        }
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
if (!/PORTAL_LOAD_TIMEOUT_MS|PORTAL_LOAD_TIMEOUT/.test(portal) && !/withPortalTimeout/.test(portal)) {
    fail('marketplace-dashboard.html', 'portal load has no timeout guard, so a stalled request hangs on the placeholder');
}

// 11. Enquiry delivery needs a second path. The live project was missing
//     contact_messages, so every contact-form and chat enquiry was lost.
const contact = read('contact.html');
if (!/contact_messages/.test(contact) || !/formspree\.io\/f\//.test(contact)) {
    fail('contact.html', 'contact form needs the dashboard write plus a Formspree fallback');
}
const chat = read('chat-widget.js');
if (!/saveLeadToSupabase/.test(chat) || !/saveLeadToFormspree/.test(chat)) {
    fail('chat-widget.js', 'chat lead capture needs the dashboard write plus a Formspree fallback');
}

// 12. A completed contract must not leave a milestone open forever.
if (!/milestone' \+ \(open\.length|still open/.test(portal)) {
    fail('marketplace-dashboard.html', 'completion must be blocked while a milestone is open');
}

// 13. GitHub Pages serves assets with cache-control: max-age=600 and the
// `?v=` token is the only thing that invalidates that cache. A page that pins
// an older token than its siblings keeps running stale JS after a deploy, and
// the fix that shipped stays invisible for the length of the cache.
const VERSIONED = [/theme\.css\?v=(\d+)/g, /(?:assets\/js\/)?([a-z-]+\.js)\?v=(\d+)/g];
const versions = new Map();
for (const page of pages) {
    const html = read(page);
    for (const re of VERSIONED) {
        for (const m of html.matchAll(re)) {
            const name = re.source.includes('theme') ? 'theme.css' : m[1];
            const version = Number(m[re.source.includes('theme') ? 1 : 2]);
            const seen = versions.get(name);
            if (!seen) versions.set(name, { version, page });
            else if (seen.version !== version) {
                fail(page, `${name}?v=${version} but ${seen.page} loads v=${seen.version}`);
            }
        }
    }
}

if (failures.length) {
    console.error(`content check failed (${failures.length}):`);
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
}
console.log(`content check passed: ${pages.length} pages verified.`);

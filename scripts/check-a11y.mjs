// Dependency-free accessibility regression checks for the static pages.
// Run with: npm run test:a11y
//
// These guard the fixes for the PageSpeed Insights / Lighthouse findings:
// icon-only links and buttons need accessible names, every page needs one
// <main> landmark, iframes need a title, and the JS-injected theme toggle's
// accessible name must contain its visible text (WCAG 2.5.3).
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const fail = (file, msg) => failures.push(`${file}: ${msg}`);

// Pages that intentionally have no <main> landmark: redirect stubs and the
// Google Search Console verification file (which must stay byte-exact).
const NO_MAIN = new Set(['home.html', 'dasbord.html', 'googleb9deb43124fcee02.html']);

const pages = readdirSync(root).filter((f) => f.endsWith('.html')).sort();

// An element is named if it has aria-label, a non-empty title, or visible
// text. Icon-only controls with a title are announced by their title.
const hasName = (attrs, inner) => {
    if (/aria-label\s*=\s*"\s*[^"]/.test(attrs)) return true;
    if (/\btitle\s*=\s*"\s*[^"]/.test(attrs)) return true;
    const text = inner.replace(/<[^>]*>/g, '').replace(/&[a-z#0-9]+;/gi, '').trim();
    return text.length > 0;
};

const ICON_ONLY = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
const ICON_BUTTON = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
const FA_ICON = /<i\b[^>]*class="[^"]*fa-[\w-]+/;

for (const page of pages) {
    const html = readFileSync(join(root, page), 'utf8');

    // 1. Links and buttons whose only content is an icon need an accessible
    //    name (aria-label or title).
    for (const m of html.matchAll(ICON_ONLY)) {
        if (FA_ICON.test(m[2]) && !hasName(m[1], m[2])) {
            fail(page, `icon-only link without a name: ${m[0].slice(0, 80)}`);
        }
    }
    for (const m of html.matchAll(ICON_BUTTON)) {
        if (FA_ICON.test(m[2]) && !hasName(m[1], m[2])) {
            fail(page, `icon-only button without a name: ${m[0].slice(0, 80)}`);
        }
    }

    // 2. Every <iframe> needs a title for screen readers.
    for (const m of html.matchAll(/<iframe\b([^>]*)>/gi)) {
        if (!/\btitle\s*=/.test(m[1])) {
            fail(page, 'iframe without a title attribute');
        }
    }

    // 3. One <main> landmark per page (Lighthouse landmark-one-main).
    if (!NO_MAIN.has(page)) {
        const count = (html.match(/<main\b/g) || []).length;
        if (count !== 1) {
            fail(page, `expected exactly one <main> landmark, found ${count}`);
        }
    }

    // 4. Every <select> needs an aria-label or an associated <label for>.
    for (const m of html.matchAll(/<select\b([^>]*)>/gi)) {
        const id = (m[1].match(/\bid\s*=\s*"([^"]+)"/) || [])[1];
        const labelled = id && new RegExp(`<label[^>]*\\bfor\\s*=\\s*"${id}"`).test(html);
        if (!/aria-label\s*=\s*"\s*[^"]/.test(m[1]) && !labelled) {
            fail(page, `select without aria-label or <label for>: ${m[0].slice(0, 80)}`);
        }
    }
}

// 6. Theme toggle: the accessible name must contain the visible text.
const script = readFileSync(join(root, 'script.js'), 'utf8');
if (!/aria-label",\s*"Switch to "\s*\+/.test(script)) {
    fail('script.js', 'theme toggle aria-label no longer tracks the visible Light/Dark text');
}
if (!/aria-hidden="true"><\/i>\s*(Dark|Light)/.test(script.replace(/\\'/g, "'"))) {
    fail('script.js', 'theme toggle icon should be aria-hidden so it is not read as text');
}

if (failures.length) {
    console.error(`a11y check failed (${failures.length}):`);
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
}
console.log(`a11y check passed: ${pages.length} pages verified.`);

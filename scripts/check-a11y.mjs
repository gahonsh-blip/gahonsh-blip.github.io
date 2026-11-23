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

// 7. Light-theme text contrast. The old light accent (#0284c7) only reached
//    4.1:1 on white and 3.6:1 on the tinted pills, so light mode had text that
//    was hard to read. Keep the accent and the theme button at WCAG AA 4.5:1.
const hexToRgb = (hex) => {
    const h = hex.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const luminance = (rgb) => {
    const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
};
const contrast = (a, b) => {
    const l1 = luminance(a);
    const l2 = luminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
const checkContrast = (file, label, fg, bg) => {
    const ratio = contrast(hexToRgb(fg), hexToRgb(bg));
    if (ratio < 4.5) {
        fail(file, `${label} ${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs 4.5:1`);
    }
};

const themeCss = readFileSync(join(root, 'theme.css'), 'utf8');
const accent = (themeCss.match(/body\.light-mode\s*\{[^}]*--accent-cyan:\s*(#[0-9a-f]{6})/i) || [])[1];
if (!accent) {
    fail('theme.css', 'light-mode --accent-cyan is missing');
} else {
    checkContrast('theme.css', 'light-mode accent', accent, '#ffffff');
    checkContrast('theme.css', 'light-mode accent', accent, '#f8fafc');
}

const lightBtn = (script.match(/isCurrentLight \? "(#[0-9a-f]{6})" :/) || [])[1];
if (!lightBtn) {
    fail('script.js', 'light theme toggle background not found');
} else {
    checkContrast('script.js', 'light theme toggle', lightBtn, '#ffffff');
}

const contact = readFileSync(join(root, 'contact.html'), 'utf8');
const whatsapp = (contact.match(/\.btn-whatsapp-direct\s*\{[^}]*background:\s*(#[0-9a-f]{6})/i) || [])[1];
if (!whatsapp) {
    fail('contact.html', 'WhatsApp button background not found');
} else {
    checkContrast('contact.html', 'WhatsApp button text', whatsapp, '#ffffff');
}

if (failures.length) {
    console.error(`a11y check failed (${failures.length}):`);
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
}
console.log(`a11y check passed: ${pages.length} pages verified.`);

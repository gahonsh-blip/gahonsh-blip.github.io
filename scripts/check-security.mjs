// Dependency-free security regression checks for the static pages.
// Run with: npm run test:security
//
// These guard the fixes for the stored-XSS and inline-handler findings:
//   1. No inline event-handler attribute may contain a template interpolation
//      (`onclick="...${x}..."`). A value rendered into an inline handler runs
//      as JS, and HTML entities are decoded first, so escaping alone cannot
//      make it safe — such handlers must be replaced by data-* + delegation.
//   2. User/DB-sourced values must be escaped (or numeric-coerced) before they
//      reach innerHTML / insertAdjacentHTML.
//   3. The auth toast must set message text via textContent, never innerHTML.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const fail = (file, msg) => failures.push(`${file}: ${msg}`);

function walk(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === '.git' || name.startsWith('.')) continue;
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) out.push(...walk(p));
        else if (/\.(html|js|mjs)$/.test(name)) out.push(p);
    }
    return out;
}

// A value is treated as safe when it is numeric-coerced, escaped inline, a
// literal, or one of the known non-data identifiers. Anything else is flagged
// for review.
const NUMERIC_OR_ESCAPED = /^(?:Number|parseInt|parseFloat|escapeHtml|esc|escHtml)\(/;
const SAFE_IDENT = /^(?:currentPage|type|icon|iconPrefix|messageHtml|pageName|lang|who)$/;
const MONEY = /^moneyText\(/;

const files = walk(root).filter((f) => !f.endsWith('check-security.mjs'));

for (const file of files) {
    const rel = file.slice(root.length + 1);
    const src = readFileSync(file, 'utf8');

    // 1. Inline event handlers must never contain a template interpolation.
    //    Match each quote style separately: the attribute value itself may
    //    contain the other quote (e.g. onclick="f('${id}')").
    for (const m of src.matchAll(/\bon[a-z]+\s*=\s*"[^"]*\$\{[^}]*\}[^"]*"/gi)) {
        fail(rel, `inline event handler contains an interpolation: ${m[0].slice(0, 90)}`);
    }
    for (const m of src.matchAll(/\bon[a-z]+\s*=\s*'[^']*\$\{[^}]*\}[^']*'/gi)) {
        fail(rel, `inline event handler contains an interpolation: ${m[0].slice(0, 90)}`);
    }

    // 2. innerHTML / insertAdjacentHTML must not receive a raw data field.
    for (const line of src.split('\n')) {
        if (!/innerHTML|insertAdjacentHTML/.test(line)) continue;
        if (/textContent/.test(line)) continue;
        for (const m of line.matchAll(/\$\{\s*([^}]+?)\s*\}/g)) {
            const expr = m[1].trim();
            if (/^['"`]/.test(expr)) continue;                       // literal
            if (/^\d+(?:\.\d+)?$/.test(expr)) continue;              // numeric literal
            if (NUMERIC_OR_ESCAPED.test(expr) || MONEY.test(expr)) continue;
            // `field || 0` and `field || 'literal'` are numeric/plain fallbacks.
            if (/\|\|\s*(?:\d+|['"][^'"]*['"])\s*$/.test(expr)) continue;
            const ident = (expr.match(/([A-Za-z_$][\w$]*)\s*(?:\?\.[\w$]+)?\s*$/) || [])[1] || expr;
            if (SAFE_IDENT.test(ident)) continue;
            // A wrapper call whose own argument is escaped is safe.
            if (/escapeHtml\(|esc\(|escHtml\(/.test(expr)) continue;
            // Date/number formatting of a stored timestamp is not user markup.
            if (/new Date\(/.test(expr) && /toLocale/.test(expr)) continue;
            fail(rel, `unescaped value in innerHTML: \${${expr.slice(0, 60)}}`);
        }
    }
}

// 3. No hardcoded passcode may guard the Owner Studio editor.
const dash = readFileSync(join(root, 'dashboard.html'), 'utf8');
if (/AUTH_PASS\s*=\s*["']/.test(dash)) {
    fail('dashboard.html', 'editor passcode is hardcoded in the page');
}
if (/Default:\s*\d{3,}/i.test(dash)) {
    fail('dashboard.html', 'editor page reveals a default passcode');
}
for (const src of [dash, readFileSync(join(root, 'server.js'), 'utf8')]) {
    if (/AUTH_PASS\s*=\s*["']\d+["']/.test(src)) {
        fail('studio', 'hardcoded numeric passcode found');
    }
}

// 4. Toast rendering must not interpolate the message into innerHTML.
const auth = readFileSync(join(root, 'auth.js'), 'utf8');
if (/toast\.innerHTML\s*=/.test(auth)) {
    fail('auth.js', 'showToast interpolates its message into innerHTML');
}
if (!/span\.textContent\s*=/.test(auth)) {
    fail('auth.js', 'showToast should set the message via textContent');
}

if (failures.length) {
    console.error(`security check failed (${failures.length}):`);
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
}
console.log(`security check passed: ${files.length} files verified.`);

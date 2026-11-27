#!/usr/bin/env node
/**
 * Audits the live deployment and prints the evidence table used by
 * `docs/UPWORK-GAP.md`.
 *
 * This is the "deep research" pass in script form: for every URL in the
 * sitemap it fetches the page and records what a crawler can see — status,
 * title, description length, canonical, heading count, the word count of the
 * crawlable `.page-info` block, and which marketplace features the markup
 * actually contains.
 *
 * It reads the deployed site, not the working tree, so it answers "what is
 * live today" rather than "what have I got locally".
 *
 *   node scripts/audit-live-site.mjs
 *   node scripts/audit-live-site.mjs --base http://localhost:3000
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const baseArg = process.argv.indexOf('--base');
const BASE = (baseArg > -1 ? process.argv[baseArg + 1] : 'https://gahonsh-blip.github.io').replace(/\/$/, '');

const sitemap = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const always = [`${BASE}/`, `${BASE}/marketplace-dashboard.html`];
const targets = [...new Set([...always, ...urls.map((u) => u.replace('https://gahonsh-blip.github.io', BASE))])];

const MARKERS = {
    search: /id="(jobSearch|talentSearch|searchInput)"/,
    proposal: /proposal/i,
    milestone: /milestone/i,
    review: /review|rating/i,
    saved: /saved/i,
    invite: /invitation|invite/i,
    payment: /escrow|stripe|razorpay|payout/i,
    verify: /verif/i,
    timesheet: /timesheet|log hours/i
};

function words(html) {
    const block = html.match(/class="page-info"[\s\S]*?<\/section>/i);
    if (!block) return 0;
    return block[0].replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
}

const rows = [];
let failures = 0;

for (const url of targets) {
    try {
        const res = await fetch(url, { redirect: 'follow' });
        const html = await res.text();
        const title = (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
        const desc = (html.match(/<meta name="description" content="([^"]*)"/i) || [])[1] || '';
        const canonical = (html.match(/rel="canonical" href="([^"]*)"/i) || [])[1] || '';
        const h1 = (html.match(/<h1[\s>]/gi) || []).length;
        const found = Object.entries(MARKERS).filter(([, re]) => re.test(html)).map(([k]) => k);
        const row = {
            path: url.replace(BASE, '') || '/',
            status: res.status,
            title: title.trim(),
            desc: desc.length,
            canonical,
            h1,
            words: words(html),
            markers: found
        };
        rows.push(row);
        if (row.status !== 200) failures += 1;
        if (row.h1 !== 1) failures += 1;
        if (!row.canonical) failures += 1;
    } catch (err) {
        rows.push({ path: url.replace(BASE, ''), status: `ERR ${err.message.slice(0, 40)}` });
        failures += 1;
    }
}

const pad = (v, n) => String(v).padEnd(n);
console.log(pad('page', 30) + pad('code', 6) + pad('h1', 4) + pad('desc', 6) + pad('canon', 7) + pad('words', 7) + 'features');
for (const r of rows) {
    if (r.status !== 200) {
        console.log(pad(r.path, 30) + r.status);
        continue;
    }
    console.log(pad(r.path, 30) + pad(r.status, 6) + pad(r.h1, 4) + pad(r.desc, 6)
        + pad(r.canonical ? 'yes' : 'NO', 7) + pad(r.words, 7) + r.markers.join(','));
}

const thin = rows.filter((r) => r.status === 200 && r.words < 500).map((r) => r.path);
if (thin.length) console.log(`\nthin static copy (<500 words): ${thin.join(', ')}`);

console.log(`\n${rows.length} page(s) audited, ${failures} structural problem(s).`);
process.exit(failures ? 1 : 0);

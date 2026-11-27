#!/usr/bin/env node
/**
 * Builds the client and freelancer lead files from public listings.
 *
 * Nothing here is typed by hand: every row comes from a page or an API the
 * script fetched during the run, and every row keeps the URL it came from.
 * That is the point — a hand-written list cannot be re-checked, and a checked
 * URL is the only thing that makes "verified" mean anything.
 *
 *   npm run leads:refresh
 *
 * Rules the script follows, and the files must keep:
 *   - public professional listings only: marketplace directories, public job
 *     posts, public developer profiles. No email, phone or private address is
 *     read, and none is written.
 *   - a name is recorded only when the source publishes one. Where a
 *     marketplace hides the buyer, the row says so instead of inventing one.
 *   - `verification` states how the row was seen, never more than that.
 *
 * The output is committed so the site can show it and `npm run test:leads`
 * can validate it offline. Re-running replaces the files.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'docs', 'leads');
const TODAY = new Date().toISOString().slice(0, 10);
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

// Only terms Gahonsh actually sells. "api" and "ai " alone matched too much
// noise (an iOS contractor, an account executive), so the list is explicit.
const STRONG = /\b(excel|spreadsheet|google sheets|vba|macro|dashboard|power bi|tableau|looker|pdf|report|brochure|pitch deck|word doc|ocr|data entry|data cleaning|data collection|scrap(?:e|ing|er)|crawl(?:er|ing)?|wordpress|shopify|woocommerce|landing page|web ?site|webflow|react|next\.?js|frontend|front-end|full[- ]stack|n8n|zapier|make\.com|airtable|automation|workflow|chatbot|ai agent|llm|openai|python|powerpoint|presentation)\b/gi;

const hasStrong = (text) => {
    STRONG.lastIndex = 0;
    return STRONG.test(text || '');
};

const skillTags = (text) => {
    const found = String(text || '').match(STRONG) || [];
    const unique = [...new Set(found.map((s) => s.toLowerCase().replace(/\s+/g, ' ')))];
    return unique.slice(0, 6).join(', ') || 'See post';
};

async function get(url, { json = false, headers = {} } = {}) {
    const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en', ...headers },
        signal: AbortSignal.timeout(30000)
    });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return json ? res.json() : res.text();
}

const clean = (s) => String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#x2F;|&#47;/gi, '/').replace(/&#(\d{1,5});/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();

const titleCase = (slug) => slug
    .split('-')
    .filter(Boolean)
    .map((w) => (/^\d+$/.test(w) ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ');

// ---------------------------------------------------------------------------
// Freelancer sources
// ---------------------------------------------------------------------------

async function n8nExperts() {
    const html = await get('https://n8nexperts.io/experts');
    const slugs = [...new Set([...html.matchAll(/href="\/experts\/([a-z0-9-]{3,60})"/g)].map((m) => m[1]))];
    return slugs.map((slug) => ({
        name: titleCase(slug),
        name_basis: 'url_handle',
        headline: 'n8n / AI workflow automation expert',
        skills: 'n8n, AI automation, workflow automation',
        country: 'Not published',
        platform: 'n8n Experts',
        profile_url: `https://n8nexperts.io/experts/${slug}`,
        source_kind: 'marketplace_profile',
        verification: 'listing_page_fetched',
        notes: 'Listed in the public n8n Experts directory.'
    }));
}

async function freelancermap(keywords) {
    const rows = [];
    for (const kw of keywords) {
        for (const page of [1, 2, 3]) {
            const url = `https://www.freelancermap.com/freelancer/${kw}${page > 1 ? `?page=${page}` : ''}`;
            let html;
            try { html = await get(url); } catch { continue; }
            const cards = [...html.matchAll(
                /href="(https:\/\/www\.freelancermap\.com\/profile\/[^"]+)"[^>]*class="title[^"]*"[^>]*>([^<]{2,160})</g
            )];
            for (const [, profileUrl, rawTitle] of cards) {
                const headline = clean(rawTitle);
                if (!headline || !hasStrong(headline)) continue;
                const at = html.indexOf(profileUrl);
                const chunk = html.slice(at, at + 2500);
                const countryMatch = chunk.match(/data-id="freelancer-card-country"[^>]*>([^<]{2,40})</);
                const slug = profileUrl.split('/profile/')[1] || '';
                const looksLikeName = /^[a-z]+(-[a-z]+){1,2}$/.test(slug);
                rows.push({
                    name: looksLikeName ? titleCase(slug) : 'Not published',
                    name_basis: looksLikeName ? 'url_handle' : 'not_published',
                    headline,
                    skills: skillTags(headline),
                    country: countryMatch ? clean(countryMatch[1]) : 'Not published',
                    platform: 'freelancermap',
                    profile_url: profileUrl,
                    source_kind: 'marketplace_profile',
                    verification: 'listing_page_fetched',
                    notes: `Found in the public freelancermap search for "${kw}".`
                });
            }
        }
    }
    return rows;
}

async function githubDevs(keywords, limit) {
    const token = process.env.GITHUB_TOKEN || '';
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const logins = new Map();
    for (const kw of keywords) {
        for (const page of [1, 2]) {
            let payload;
            try {
                payload = await get(
                    `https://api.github.com/search/users?q=${encodeURIComponent(`${kw} in:bio`)}+type:user&per_page=50&page=${page}`,
                    { json: true, headers }
                );
            } catch { continue; }
            for (const item of payload.items || []) {
                if (!logins.has(item.login)) logins.set(item.login, kw);
            }
        }
    }
    const rows = [];
    for (const [login, kw] of logins) {
        if (rows.length >= limit) break;
        let profile = null;
        try { profile = await get(`https://api.github.com/users/${login}`, { json: true, headers }); } catch { }
        if (!profile || profile.type !== 'User') continue;
        const bio = clean(profile.bio || '');
        rows.push({
            name: clean(profile.name || '') || login,
            name_basis: profile.name ? 'published_name' : 'url_handle',
            headline: bio || `Developer on GitHub (${kw})`,
            skills: [kw, profile.company ? clean(profile.company) : ''].filter(Boolean).join(', '),
            country: clean(profile.location || '') || 'Not published',
            platform: 'GitHub',
            profile_url: profile.html_url,
            source_kind: 'public_dev_profile',
            verification: 'api_record',
            notes: `Public GitHub profile; matched the bio search "${kw}". Repos: ${profile.public_repos}.`
        });
    }
    return rows;
}

// ---------------------------------------------------------------------------
// Client sources
// ---------------------------------------------------------------------------

async function freelancerJobs(keywords) {
    const rows = [];
    for (const kw of keywords) {
        let html;
        try { html = await get(`https://www.freelancer.com/jobs/${kw}/`); } catch { continue; }
        const cards = [...html.matchAll(
            /href="(\/projects\/[a-z0-9-]+\/[^"#?]+)"[^>]*data-heading-link="true"[^>]*>\s*([^<]{3,160})</g
        )];
        for (const [, href, rawTitle] of cards) {
            const title = clean(rawTitle);
            if (!title) continue;
            const compensation = (() => {
                const at = html.indexOf(href);
                const chunk = html.slice(at, at + 1500);
                const m = chunk.match(/\$[\d,]+(?:\s*-\s*\$[\d,]+)?(?:\s*(?:USD|INR|EUR))?/);
                return m ? m[0] : 'Not published';
            })();
            rows.push({
                client: 'Not published',
                client_basis: 'not_published',
                project_title: title,
                skills: kw.replace(/-/g, ' '),
                country: 'See post',
                compensation,
                platform: 'Freelancer.com',
                post_url: `https://www.freelancer.com${href}`,
                source_kind: 'public_job_post',
                verification: 'listing_page_fetched',
                notes: 'Freelancer.com hides the buyer on the listing; the post itself is public.'
            });
        }
    }
    return rows;
}

async function remoteOk() {
    const jobs = await get('https://remoteok.com/api', { json: true });
    const rows = [];
    for (const job of jobs) {
        if (!job || !job.position) continue;
        const text = `${job.position} ${(job.tags || []).join(' ')}`;
        if (!hasStrong(text)) continue;
        rows.push({
            client: clean(job.company || '') || 'Not published',
            client_basis: job.company ? 'published_name' : 'not_published',
            project_title: clean(job.position),
            skills: skillTags(text),
            country: clean(job.location || '') || 'Remote',
            // A salary band is not a project budget, so it is reported as the
            // post published it rather than passed off as a budget.
            compensation: 'Not published',
            platform: 'Remote OK',
            post_url: job.url || `https://remoteok.com/remote-jobs/${job.slug}`,
            source_kind: 'public_job_post',
            verification: 'api_record',
            notes: `Posted ${String(job.date || '').slice(0, 10)}; company named on the post.`
                + (job.salary_min ? ` Salary band on the post: ${job.salary_min}-${job.salary_max} USD.` : '')
        });
    }
    return rows;
}

async function hackerNewsClients() {
    const rows = [];
    const seen = new Set();
    const queries = [
        'SEEKING FREELANCER', 'SEEKING FREELANCERS', 'SEEKING FREELANCE',
        'freelancer needed', 'looking for a freelancer', 'contract developer needed'
    ];
    for (const q of queries) {
        let payload;
        try {
            payload = await get(
                `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=comment&hitsPerPage=200`,
                { json: true }
            );
        } catch { continue; }
        for (const hit of payload.hits || []) {
            if (seen.has(hit.objectID)) continue;
            const raw = String(hit.comment_text || '');
            // HN separates the header from the pitch with <p>. The pitch is
            // long and full of keywords, so only the header may decide.
            const blocks = raw.split(/<p\s*\/?>|<br\s*\/?>/i).map((b) => clean(b)).filter(Boolean);
            const text = clean(raw);
            if (!/seeking freelanc/i.test(text)) continue;
            const stripPrefix = (v) => v.replace(/^.*?seeking freelancers?\s*\|?\s*/i, '').trim();
            // A header is only usable as a title when it names something. Some
            // posts open with "-- NYC only", so fall through to the next block.
            let head = stripPrefix(blocks[0] || '');
            if (head.length < 12 || /^[-–—.|\s]/.test(head)) {
                head = stripPrefix(blocks[1] || '') || head;
            }
            // The header carries the company, role and location; the body is a
            // long pitch. Only the header decides relevance.
            // The header names the company and the role; the opening of the
            // pitch names the stack. Judge both, but keep the title short.
            const window = `${head} ${text.slice(0, 600)}`;
            if (!hasStrong(window)) continue;
            // A marketplace advertising to freelancers is not a client.
            if (/exclusive marketplace|find contract work by chatting|join our (talent|freelancer)|sign up as a freelancer/i.test(text)) continue;
            const trimmed = head.length > 140 ? head.slice(0, 140).replace(/\s+\S*$/, '') + '…' : head;
            seen.add(hit.objectID);
            rows.push({
                client: hit.author || 'Not published',
                client_basis: 'public_handle',
                project_title: trimmed,
                skills: skillTags(window),
                country: 'Not published',
                compensation: 'See post',
                platform: 'Hacker News',
                post_url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
                source_kind: 'public_job_post',
                verification: 'api_record',
                notes: `Public "Seeking freelancer" comment by ${hit.author}; handle only, no contact details copied.`
            });
        }
    }
    return rows;
}

async function weWorkRemotely() {
    const rows = [];
    const feeds = [
        'https://weworkremotely.com/categories/remote-programming-jobs',
        'https://weworkremotely.com/categories/remote-design-jobs'
    ];
    for (const feed of feeds) {
        let xml;
        try { xml = await get(feed); } catch { continue; }
        // The category pages serve an RSS document, so parse items, not cards.
        for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
            const title = clean((item.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
            const link = clean((item.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '');
            const region = clean((item.match(/<region>([\s\S]*?)<\/region>/) || [])[1] || '');
            if (!title || !link || !hasStrong(title)) continue;
            const [company, role] = title.includes(':')
                ? [title.slice(0, title.indexOf(':')).trim(), title.slice(title.indexOf(':') + 1).trim()]
                : ['Not published', title];
            rows.push({
                client: company,
                client_basis: company === 'Not published' ? 'not_published' : 'published_name',
                project_title: role,
                skills: skillTags(title),
                country: region || 'Remote',
                compensation: 'Not published',
                platform: 'We Work Remotely',
                post_url: link,
                source_kind: 'public_job_post',
                verification: 'api_record',
                notes: 'Company and role as printed in the public RSS listing.'
            });
        }
    }
    return rows;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

function dedupe(rows, key) {
    const seen = new Set();
    return rows.filter((r) => {
        const k = key(r);
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

function toCsv(rows, columns) {
    const esc = (v) => {
        const s = String(v ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [columns.join(','), ...rows.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

const CLIENT_COLUMNS = ['id', 'client', 'client_basis', 'project_title', 'skills', 'country', 'compensation',
    'platform', 'post_url', 'source_kind', 'verification', 'checked_at', 'notes'];
const FREELANCER_COLUMNS = ['id', 'name', 'name_basis', 'headline', 'skills', 'country', 'platform',
    'profile_url', 'source_kind', 'verification', 'checked_at', 'notes'];

async function main() {
    console.log('collecting freelancers...');
    const freelancers = dedupe([
        ...await n8nExperts().catch((e) => (console.warn('n8n:', e.message), [])),
        ...await freelancermap(['excel', 'automation', 'webentwicklung', 'datenbankentwicklung', 'python', 'projektmanagement'])
            .catch((e) => (console.warn('freelancermap:', e.message), [])),
        ...await githubDevs(['excel', 'vba', 'n8n', 'excel automation'], 40)
            .catch((e) => (console.warn('github:', e.message), []))
    ], (r) => r.profile_url).slice(0, 100);

    console.log('collecting clients...');
    const boards = await freelancerJobs(['excel', 'pdf', 'web-development', 'automation', 'data-entry', 'excel-vba'])
        .catch((e) => (console.warn('freelancer jobs:', e.message), []));
    const hn = await hackerNewsClients().catch((e) => (console.warn('hn:', e.message), []));
    const remote = await remoteOk().catch((e) => (console.warn('remoteok:', e.message), []));
    const wwr = await weWorkRemotely().catch((e) => (console.warn('wwr:', e.message), []));
    console.log('  raw:', { boards: boards.length, hn: hn.length, remote: remote.length, wwr: wwr.length });

    // Keep a mix: named buyers from HN and the remote boards, then top up from
    // the marketplace board, which hides the buyer behind the post.
    const ordered = dedupe([
        ...hn.slice(0, 45),
        ...remote.slice(0, 15),
        ...wwr.slice(0, 10),
        ...boards
    ], (r) => r.post_url);
    // One employer must not fill the list: at most two posts per buyer.
    const perClient = new Map();
    const clients = [];
    for (const row of ordered) {
        const key = row.client === 'Not published' ? row.post_url : row.client;
        const used = perClient.get(key) || 0;
        if (used >= 2) continue;
        perClient.set(key, used + 1);
        clients.push(row);
        if (clients.length === 100) break;
    }

    freelancers.forEach((r, i) => {
        r.id = `F${String(i + 1).padStart(3, '0')}`;
        r.checked_at = TODAY;
    });
    clients.forEach((r, i) => {
        r.id = `C${String(i + 1).padStart(3, '0')}`;
        r.checked_at = TODAY;
    });

    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, 'freelancers.csv'), toCsv(freelancers, FREELANCER_COLUMNS), 'utf8');
    await fs.writeFile(path.join(outDir, 'clients.csv'), toCsv(clients, CLIENT_COLUMNS), 'utf8');

    const bySource = (rows, key) => rows.reduce((acc, r) => {
        acc[r[key]] = (acc[r[key]] || 0) + 1; return acc;
    }, {});
    console.log(`\nfreelancers: ${freelancers.length}`, bySource(freelancers, 'platform'));
    console.log(`clients:     ${clients.length}`, bySource(clients, 'platform'));
    if (freelancers.length < 100 || clients.length < 100) {
        console.warn('\nWARNING: short of 100 in a list. Widen the keyword set before committing.');
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

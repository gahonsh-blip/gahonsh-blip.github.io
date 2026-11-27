#!/usr/bin/env node
/**
 * Live deployment check.
 *
 * `npm run test:schema` proves the client and `docs/marketplace-schema.sql`
 * agree. It cannot see the deployed project, so a project created before a
 * feature still 404s at runtime: the live project answered
 * `contract_milestones`, `contact_messages` and `admin_overview` with
 * PGRST205 / PGRST202 while every committed file was correct.
 *
 * This script reads the project URL and publishable key from
 * `supabase-config.js` (or SUPABASE_URL / SUPABASE_ANON_KEY) and probes every
 * table, view and function the client reaches through PostgREST, plus every
 * column the client selects that the committed schema declares.
 *
 * The column pass exists because the deployed project had lost
 * `profiles.email` and `profiles.phone_number` while every table answered 200:
 * the admin views could not be created and nothing here noticed.
 *
 *   npm run check:live
 *
 * Exit codes: 0 every object present, 1 something is missing, 2 unreachable.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.git', '.agents', 'docs']);

function readConfig() {
  const src = readFileSync(join(ROOT, 'supabase-config.js'), 'utf8');
  const url = process.env.SUPABASE_URL
    || /GAHONSH_PRODUCTION_URL\s*=\s*["']([^"']+)["']/.exec(src)?.[1];
  const key = process.env.SUPABASE_ANON_KEY
    || /GAHONSH_PUBLISHABLE_KEY\s*=\s*["']([^"']+)["']/.exec(src)?.[1];
  return { url: (url || '').replace(/\/+$/, ''), key };
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(html|js|mjs)$/.test(entry) && !entry.startsWith('check-')) out.push(full);
  }
  return out;
}

/** Columns the committed schema declares, per table. */
function declaredColumns() {
  const sql = readFileSync(join(ROOT, 'docs', 'marketplace-schema.sql'), 'utf8');
  const out = new Map();
  const add = (table, column) => {
    if (!out.has(table)) out.set(table, new Set());
    out.get(table).add(column);
  };
  const type = '(?:uuid|text|integer|bigint|numeric|boolean|timestamptz|timestamp|date|jsonb|json|smallint|double precision|serial|bigserial|varchar)';
  for (const m of sql.matchAll(/create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
    for (const line of m[2].split('\n')) {
      const col = new RegExp(`^\\s+([a-z_][a-z0-9_]*)\\s+${type}`, 'i').exec(line);
      if (col) add(m[1], col[1]);
    }
  }
  for (const m of sql.matchAll(/alter table public\.(\w+)\s+add column if not exists\s+(\w+)/gi)) {
    add(m[1], m[2]);
  }
  return out;
}

function collect() {
  const tables = new Map();
  const rpcs = new Map();
  const columns = new Map();

  for (const file of walk(ROOT)) {
    const text = readFileSync(file, 'utf8');
    const rel = relative(ROOT, file);

    for (const m of text.matchAll(/\.from\(\s*['"`]([a-z_]+)['"`]\s*\)/g)) {
      if (!tables.has(m[1])) tables.set(m[1], rel);
    }
    for (const m of text.matchAll(/\/rest\/v1\/([a-z_]+)/g)) {
      if (!tables.has(m[1])) tables.set(m[1], rel);
    }
    // Selected columns: `select('id, title, alias:col::text')`. Embedded
    // relations (`client:profiles(...)`) and aggregates are skipped.
    for (const m of text.matchAll(/\.from\(\s*['"`]([a-z_]+)['"`]\s*\)\s*\.select\(\s*['"`]([^'"`]*)['"`]/g)) {
      const [, table, list] = m;
      for (let col of list.split(',')) {
        col = col.trim();
        if (!col || col === '*' || col.includes('(')) continue;
        col = col.split(':').pop().split('::')[0].trim();
        if (!/^[a-z_][a-z0-9_]*$/.test(col)) continue;
        if (!columns.has(table)) columns.set(table, new Set());
        columns.get(table).add(col);
      }
    }
    // `.rpc('name')` and `.rpc('name', { a, b })` — the argument names are
    // needed because PostgREST resolves a function by its parameter list.
    for (const m of text.matchAll(/\.rpc\(\s*['"`]([a-z_]+)['"`]\s*(?:,\s*\{([^}]*)\})?/g)) {
      const args = (m[2] || '')
        .split(',')
        .map((part) => part.split(':')[0].trim())
        .filter((name) => /^[a-z_][a-z0-9_]*$/.test(name));
      if (!rpcs.has(m[1])) rpcs.set(m[1], { file: rel, args });
    }
  }
  return { tables, rpcs, columns };
}

async function probe(url, key, path, init) {
  try {
    const res = await fetch(url + path, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
    const body = await res.text();
    let json = null;
    try { json = JSON.parse(body); } catch { /* not JSON */ }
    return { status: res.status, json, body };
  } catch (err) {
    return { status: 0, json: null, body: String(err) };
  }
}

const { url, key } = readConfig();
if (!url || !key) {
  console.error('check:live FAILED — no project URL / publishable key found in supabase-config.js');
  process.exit(2);
}

const { tables, rpcs, columns } = collect();
const declared = declaredColumns();
const results = [];
let unreachable = 0;

for (const [name, file] of [...tables].sort()) {
  const r = await probe(url, key, `/rest/v1/${name}?select=*&limit=1`);
  if (r.status === 0) unreachable += 1;
  const missing = r.status === 404 && r.json?.code === 'PGRST205';
  results.push({ kind: 'table', name, file, missing, detail: missing ? 'PGRST205' : `HTTP ${r.status}` });
}

for (const [name, { file, args }] of [...rpcs].sort()) {
  const payload = Object.fromEntries(args.map((a) => [a, null]));
  const r = await probe(url, key, `/rest/v1/rpc/${name}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (r.status === 0) unreachable += 1;
  const missing = r.status === 404 && r.json?.code === 'PGRST202';
  results.push({ kind: 'rpc', name, file, missing, detail: missing ? 'PGRST202' : `HTTP ${r.status}` });
}

// Column pass. Every column the committed schema declares for a table the
// client reads must exist on the project — not only the ones a select happens
// to name, because the failure that prompted this check was `profiles.email`
// vanishing while every table still answered 200 and the client never selected
// that column directly. `42703` is the failure; a column that exists but is not
// granted to the publishable key answers 401/403, which is the intended state
// for `profiles.email`.
const columnTargets = [];
for (const [table, cols] of [...declared].sort()) {
  if (!tables.has(table)) continue;
  for (const column of [...cols].sort()) columnTargets.push([table, column]);
}

const columnResults = [];
const CONCURRENCY = 6;
for (let i = 0; i < columnTargets.length; i += CONCURRENCY) {
  const batch = columnTargets.slice(i, i + CONCURRENCY);
  const probed = await Promise.all(batch.map(async ([table, column]) => {
    const r = await probe(url, key, `/rest/v1/${table}?select=${column}&limit=0`);
    if (r.status === 0) unreachable += 1;
    const missing = r.json?.code === '42703' || r.json?.code === 'PGRST204';
    return { kind: 'col', name: `${table}.${column}`, missing, detail: missing ? r.json.code : `HTTP ${r.status}` };
  }));
  columnResults.push(...probed);
}

if (unreachable === results.length && results.length > 0) {
  console.error(`check:live FAILED — ${url} is not reachable (network or DNS).`);
  process.exit(2);
}

const gaps = [...results, ...columnResults].filter((r) => r.missing);
for (const r of results) {
  const mark = r.missing ? 'MISSING' : 'ok     ';
  console.log(`${mark} ${r.kind.padEnd(5)} ${r.name.padEnd(34)} ${r.detail}`);
}
const columnGaps = columnResults.filter((r) => r.missing);
if (columnGaps.length) {
  console.log('');
  for (const r of columnGaps) console.log(`MISSING ${r.kind.padEnd(5)} ${r.name.padEnd(34)} ${r.detail}`);
}

if (gaps.length) {
  console.error(`\ncheck:live FAILED — ${gaps.length} of ${results.length + columnResults.length} object(s) missing on ${url}`);
  console.error('Apply the committed schema (idempotent) in the Supabase SQL editor:');
  console.error('  docs/marketplace-schema.sql');
  console.error('Then re-run: npm run check:live');
  process.exit(1);
}

console.log(`\ncheck:live passed: ${results.length} object(s) and ${columnResults.length} column(s) present on ${url}`);

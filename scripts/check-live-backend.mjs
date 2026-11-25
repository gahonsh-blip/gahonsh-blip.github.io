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
 * table, view and function the client reaches through PostgREST.
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

function collect() {
  const tables = new Map();
  const rpcs = new Map();

  for (const file of walk(ROOT)) {
    const text = readFileSync(file, 'utf8');
    const rel = relative(ROOT, file);

    for (const m of text.matchAll(/\.from\(\s*['"`]([a-z_]+)['"`]\s*\)/g)) {
      if (!tables.has(m[1])) tables.set(m[1], rel);
    }
    for (const m of text.matchAll(/\/rest\/v1\/([a-z_]+)/g)) {
      if (!tables.has(m[1])) tables.set(m[1], rel);
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
  return { tables, rpcs };
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

const { tables, rpcs } = collect();
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

if (unreachable === results.length && results.length > 0) {
  console.error(`check:live FAILED — ${url} is not reachable (network or DNS).`);
  process.exit(2);
}

const gaps = results.filter((r) => r.missing);
for (const r of results) {
  const mark = r.missing ? 'MISSING' : 'ok     ';
  console.log(`${mark} ${r.kind.padEnd(5)} ${r.name.padEnd(34)} ${r.detail}`);
}

if (gaps.length) {
  console.error(`\ncheck:live FAILED — ${gaps.length} of ${results.length} object(s) missing on ${url}`);
  console.error('Apply the committed schema (idempotent) in the Supabase SQL editor:');
  console.error('  docs/marketplace-schema.sql');
  console.error('Then re-run: npm run check:live');
  process.exit(1);
}

console.log(`\ncheck:live passed: ${results.length} object(s) present on ${url}`);

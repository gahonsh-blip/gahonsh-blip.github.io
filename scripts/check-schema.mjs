#!/usr/bin/env node
/**
 * Schema drift check.
 *
 * The marketplace talks to Supabase through PostgREST, so every
 * `.from('x')` / `.rpc('x')` call and every `/rest/v1/x` URL in the client is
 * a hard dependency on an object in `docs/marketplace-schema.sql`. If one is
 * missing the request 404s at runtime, which is exactly the class of bug that
 * shipped `contact_messages` and `admin_overview` missing from the schema.
 *
 * This check fails when the client references a table, view or function the
 * committed schema does not create.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_FILE = join(ROOT, 'docs', 'marketplace-schema.sql');

const SKIP_DIRS = new Set(['node_modules', '.git', '.agents', 'docs']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(html|js|mjs)$/.test(entry) && !entry.startsWith('check-')) out.push(full);
  }
  return out;
}

const schema = readFileSync(SCHEMA_FILE, 'utf8');

const schemaObjects = new Set();
for (const m of schema.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-z_]+)/gi)) {
  schemaObjects.add(m[1].toLowerCase());
}
for (const m of schema.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:VIEW|FUNCTION)\s+public\.([a-z_]+)/gi)) {
  schemaObjects.add(m[1].toLowerCase());
}

const CALL_RE = /\.from\(\s*['"`]([a-z_]+)['"`]\s*\)|\.rpc\(\s*['"`]([a-z_]+)['"`]/g;
const REST_RE = /\/rest\/v1\/([a-z_]+)/g;

const problems = [];
let refs = 0;

for (const file of walk(ROOT)) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);
  const lines = text.split('\n');

  const check = (name, index) => {
    const lower = name.toLowerCase();
    if (lower === 'rpc') return;
    refs += 1;
    if (!schemaObjects.has(lower)) {
      const line = text.slice(0, index).split('\n').length;
      problems.push(`${rel}:${line} references "${name}" which docs/marketplace-schema.sql does not create`);
      void lines;
    }
  };

  for (const m of text.matchAll(CALL_RE)) check(m[1] || m[2], m.index);
  for (const m of text.matchAll(REST_RE)) check(m[1], m.index);
}

// ---------------------------------------------------------------------------
// Ambiguous embedded relations.
//
// PostgREST answers `PGRST201` (HTTP 300) when an embedded relation could mean
// more than one foreign key. `jobs` and `profiles` are linked twice: directly
// through `jobs.client_id`, and again through `saved_jobs`, which the client
// uses as a junction table — so `client:profiles(...)` silently killed the jobs
// feed, the job details page and the saved-jobs list. `invitations` points at
// `profiles` through both `client_id` and `freelancer_id`, which broke the
// invitation tabs. The fix is an explicit hint: `client:profiles!jobs_client_id_fkey(...)`.
// This walk never runs in the test suite unless it is here, because the query
// is a template string no type checker reads.
// ---------------------------------------------------------------------------

// Column FKs need their table: walk the CREATE TABLE blocks in order.
const tableBlocks = [...schema.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-z_]+)\s*\(([\s\S]*?)\n\);/gi)];
const fkEdges = [];
for (const block of tableBlocks) {
  const table = block[1].toLowerCase();
  for (const line of block[2].split('\n')) {
    const fk = /^\s*([a-z_]+)\s+UUID[^,]*REFERENCES\s+public\.([a-z_]+)\s*\(/i.exec(line);
    if (fk) fkEdges.push({ from: table, to: fk[2].toLowerCase(), column: fk[1].toLowerCase() });
  }
}
for (const m of schema.matchAll(/ALTER\s+TABLE\s+public\.([a-z_]+)[\s\S]{0,200}?FOREIGN\s+KEY\s*\(([a-z_]+)\)\s*REFERENCES\s+public\.([a-z_]+)/gi)) {
  fkEdges.push({ from: m[1].toLowerCase(), to: m[3].toLowerCase(), column: m[2].toLowerCase() });
}

const countFks = (from, to) => fkEdges.filter(e => e.from === from && e.to === to).length;
const junctions = (a, b) => {
  const names = new Set(fkEdges.map(e => e.from));
  return [...names].some(t => t !== a && t !== b &&
    fkEdges.some(e => e.from === t && e.to === a) && fkEdges.some(e => e.from === t && e.to === b));
};
const isAmbiguous = (parent, child) =>
  countFks(parent, child) > 1 || countFks(child, parent) > 1 ||
  junctions(parent, child) || junctions(child, parent);

const EMBED_RE = /(?:([a-z_]+)\s*:\s*)?([a-z_]+)\s*(?:!([a-z_]+))?\s*\(/g;
const FROM_RE = /\.from\(\s*['"`]([a-z_]+)['"`]\s*\)/g;

for (const file of walk(ROOT)) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);

  // Ranges of every embed body, so a nested embed can find its parent.
  const embedRanges = [];
  for (const m of text.matchAll(EMBED_RE)) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let end = -1;
    for (let i = open; i < text.length && i < open + 4000; i++) {
      if (text[i] === '(') depth += 1;
      else if (text[i] === ')') {
        depth -= 1;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end > open) {
      embedRanges.push({ start: open, end, alias: m[1], table: m[2].toLowerCase(), hint: m[3], index: m.index });
    }
  }

  for (const embed of embedRanges) {
    if (!fkEdges.some(e => e.to === embed.table)) continue; // no FK target: not an embed we can judge
    const parentEmbed = embedRanges
      .filter(o => o !== embed && o.start < embed.start && o.end > embed.end)
      .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
    let parent = parentEmbed ? parentEmbed.table : null;
    if (!parent) {
      for (const m of text.matchAll(FROM_RE)) {
        if (m.index < embed.index) parent = m[1].toLowerCase();
        else break;
      }
    }
    if (!parent || parent === embed.table) continue;
    if (!isAmbiguous(parent, embed.table)) continue;
    if (embed.hint && embed.hint !== 'inner' && embed.hint !== 'left') continue;
    const line = text.slice(0, embed.index).split('\n').length;
    problems.push(`${rel}:${line} embeds "${embed.table}" from "${parent}" without an FK hint — ` +
      `PostgREST returns PGRST201 when more than one relationship links them ` +
      `(use ${embed.alias || embed.table}:${embed.table}!<constraint>_fkey(...))`);
  }
}

if (problems.length) {
  console.error(`schema check FAILED: ${problems.length} unresolved reference(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`schema check passed: ${refs} client reference(s) resolved against ${schemaObjects.size} schema object(s).`);

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

if (problems.length) {
  console.error(`schema check FAILED: ${problems.length} unresolved reference(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`schema check passed: ${refs} client reference(s) resolved against ${schemaObjects.size} schema object(s).`);

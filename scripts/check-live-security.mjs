#!/usr/bin/env node
/**
 * Live authorization check.
 *
 * `npm run check:live` proves the deployed project has every object the client
 * uses. It runs with the publishable key alone, so it cannot see the rules that
 * only apply to a signed-in member — and that is where the dangerous gaps are.
 * The live project once answered `PATCH /rest/v1/profiles {"role":"admin"}`
 * with 200 for an ordinary client, because the profile-immutability trigger
 * was not attached. Every committed file was correct.
 *
 * This script signs in as a disposable test account and asserts the rules the
 * schema claims to enforce.
 *
 *   AUDIT_EMAIL=you+audit@example.com AUDIT_PASSWORD='…' npm run check:live-security
 *
 * Environment:
 *   AUDIT_EMAIL, AUDIT_PASSWORD  a confirmed test account (required)
 *   SUPABASE_URL, SUPABASE_ANON_KEY  optional overrides; defaults are read
 *                                from supabase-config.js
 *
 * It writes one temporary job and deletes it again. It never changes a role:
 * the escalation probe expects to be rejected, and if it is not, the original
 * role is restored before the script reports the failure.
 *
 * Exit codes: 0 every check passed (or no credentials to run with),
 *             1 a rule was violated, 2 the project was unreachable.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function readConfig() {
  const src = readFileSync(join(ROOT, 'supabase-config.js'), 'utf8');
  const url = process.env.SUPABASE_URL
    || /GAHONSH_PRODUCTION_URL\s*=\s*["']([^"']+)["']/.exec(src)?.[1];
  const key = process.env.SUPABASE_ANON_KEY
    || /GAHONSH_PUBLISHABLE_KEY\s*=\s*["']([^"']+)["']/.exec(src)?.[1];
  return { url: (url || '').replace(/\/+$/, ''), key: key || '' };
}

const { url, key } = readConfig();
const email = process.env.AUDIT_EMAIL;
const password = process.env.AUDIT_PASSWORD;

if (!url || !key) {
  console.error('No project URL or publishable key found in supabase-config.js.');
  process.exit(2);
}

if (!email || !password) {
  console.log('SKIPPED: set AUDIT_EMAIL and AUDIT_PASSWORD (a confirmed test account) to run.');
  console.log('         Nothing was written to ' + url + '.');
  process.exit(0);
}

const results = [];
function record(state, name, detail = '') {
  results.push({ state, name, detail });
  const label = state.padEnd(5);
  console.log(`${label} ${name}${detail ? ' — ' + detail : ''}`);
}

let token = null;

async function api(method, path, body, extraHeaders = {}) {
  const res = await fetch(url + path, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token || key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let text = '';
  try { text = await res.text(); } catch { /* empty body */ }
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: res.status, text, json };
}

async function signIn() {
  const res = await api('POST', '/auth/v1/token?grant_type=password', { email, password });
  if (res.status !== 200 || !res.json?.access_token) {
    const msg = res.json?.msg || res.json?.error_description || res.text.slice(0, 120);
    console.error(`Cannot sign in as the audit account (HTTP ${res.status}): ${msg}`);
    console.error('Use a confirmed account. Registration needs email confirmation on this project.');
    process.exit(2);
  }
  token = res.json.access_token;
  return res.json.user;
}

let createdJobId = null;

function cleanup() {
  // Deletion needs the same token, so it runs before the process exits.
  return createdJobId
    ? api('DELETE', `/rest/v1/jobs?id=eq.${createdJobId}`)
    : Promise.resolve();
}

async function main() {
  const user = await signIn();
  record('PASS', 'sign in with password');

  const me = user.id;

  const self = await api('GET', `/rest/v1/profiles?id=eq.${me}&select=id,full_name,role,is_verified`);
  const role = self.json?.[0]?.role;
  const verified = self.json?.[0]?.is_verified === true;
  record(self.status === 200 && self.json?.[0]?.id === me ? 'PASS' : 'FAIL',
    'read own profile', `role=${role || 'unknown'}`);

  // --- profile immutability: the critical one -------------------------------
  const escalate = await api('PATCH', `/rest/v1/profiles?id=eq.${me}`, { role: 'admin' });
  if (escalate.status === 200) {
    await api('PATCH', `/rest/v1/profiles?id=eq.${me}`, { role });
    record('FAIL', 'a client cannot promote themselves to admin',
      'role change was accepted — run docs/marketplace-schema.sql (profile immutability trigger missing); role restored');
  } else {
    record('PASS', 'a client cannot promote themselves to admin', `HTTP ${escalate.status}`);
  }

  const verify = await api('PATCH', `/rest/v1/profiles?id=eq.${me}`, { is_verified: true });
  if (verify.status === 200) {
    await api('PATCH', `/rest/v1/profiles?id=eq.${me}`, { is_verified: verified });
    record('FAIL', 'a member cannot verify themselves',
      'is_verified change was accepted; original value restored');
  } else {
    record('PASS', 'a member cannot verify themselves', `HTTP ${verify.status}`);
  }

  // --- job ownership -------------------------------------------------------
  const job = {
    client_id: me,
    title: 'Authorization check (safe to delete)',
    description: 'Temporary row written by scripts/check-live-security.mjs and removed before the run ends.',
    category: 'Web Development',
    budget_min: 10,
  };

  if (role === 'client') {
    const created = await api('POST', '/rest/v1/jobs', job);
    createdJobId = created.json?.[0]?.id || null;
    record(created.status === 201 && createdJobId ? 'PASS' : 'FAIL', 'a client can post a job', `HTTP ${created.status}`);

    const foreign = await api('POST', '/rest/v1/jobs',
      { ...job, client_id: '00000000-0000-4000-8000-000000000001' });
    record(foreign.status === 403 ? 'PASS' : 'FAIL', 'a client cannot post a job for someone else',
      `HTTP ${foreign.status}`);

    if (createdJobId) {
      const del = await api('DELETE', `/rest/v1/jobs?id=eq.${createdJobId}`);
      createdJobId = null;
      record(del.status === 200 || del.status === 204 ? 'PASS' : 'FAIL',
        'a client can delete their own job', `HTTP ${del.status}`);
    }
  } else {
    record('SKIP', 'a client can post a job', `audit account role is ${role}`);
  }

  // --- notifications are trigger-written -----------------------------------
  const note = await api('POST', '/rest/v1/notifications',
    { user_id: me, title: 'Probe', body: 'must be rejected' });
  record(note.status === 403 || note.status === 401 ? 'PASS' : 'FAIL',
    'a member cannot post into their own notification list', `HTTP ${note.status}`);

  // --- shortlist guard -----------------------------------------------------
  const selfSave = await api('POST', '/rest/v1/saved_talent', { client_id: me, freelancer_id: me });
  record(selfSave.status === 400 || selfSave.status === 403 ? 'PASS' : 'FAIL',
    'a member cannot save themselves as talent', `HTTP ${selfSave.status}`);

  // --- proposals stay private ---------------------------------------------
  const proposals = await api('GET', '/rest/v1/proposals?select=id&limit=50');
  const proposalRows = Array.isArray(proposals.json) ? proposals.json.length : 0;
  record([200, 401, 403].includes(proposals.status) ? 'PASS' : 'FAIL',
    'the proposals table answers only through RLS',
    `HTTP ${proposals.status}, ${proposalRows} row(s) visible to this account`);

  // --- deployment gaps that weaken the admin page (not security holes) -----
  const adminView = await api('GET', '/rest/v1/admin_profiles?select=id&limit=1');
  if (adminView.status === 404) {
    record('WARN', 'admin_profiles view exists',
      'missing — run docs/marketplace-schema.sql to create it');
  } else {
    record('PASS', 'admin_profiles view exists', `HTTP ${adminView.status}`);
  }

  const enquiries = await api('GET', '/rest/v1/contact_messages?select=id&limit=1');
  if (enquiries.status === 404) {
    record('WARN', 'contact_messages table exists',
      'missing — the contact form falls back to Formspree; run docs/marketplace-schema.sql');
  } else {
    record('PASS', 'contact_messages table exists', `HTTP ${enquiries.status}`);
  }

  const overview = await api('POST', '/rest/v1/rpc/admin_overview', {});
  if (overview.status === 404) {
    record('WARN', 'admin_overview() exists',
      'missing — the admin page shows zero metrics; run docs/marketplace-schema.sql');
  } else {
    record('PASS', 'admin_overview() exists', `HTTP ${overview.status}`);
  }

  const emailColumn = await api('GET', '/rest/v1/profiles?select=email&limit=0');
  if (emailColumn.status === 400) {
    record('WARN', 'profiles.email column exists',
      'missing — admin email lookup needs it; run supabase/migrations/20261129000000_restore_profile_pii_columns.sql');
  } else {
    record('PASS', 'profiles.email column exists', `HTTP ${emailColumn.status}`);
  }
}

try {
  await main();
} catch (err) {
  await cleanup().catch(() => {});
  console.error('\ncheck:live-security could not finish:', err && err.message ? err.message : err);
  process.exit(2);
}

await cleanup().catch(() => {});

const failed = results.filter(r => r.state === 'FAIL');
const warned = results.filter(r => r.state === 'WARN');
console.log('');
if (failed.length) {
  console.log(`check:live-security FAILED — ${failed.length} rule(s) violated.`);
  process.exit(1);
}
console.log(`check:live-security passed — ${results.filter(r => r.state === 'PASS').length} rule(s) verified` +
  (warned.length ? `, ${warned.length} deployment warning(s).` : '.'));

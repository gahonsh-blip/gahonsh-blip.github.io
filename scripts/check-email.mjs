#!/usr/bin/env node
/**
 * Email pipeline checks.
 *
 * The site has no server, so automatic email runs on Supabase: a trigger copies
 * every notification into `email_outbox`, and an Edge Function drains it
 * through Resend with a key that never enters this repository. Three things can
 * silently rot:
 *
 *   - the table or the trigger disappears from the schema, and every
 *     notification quietly stops queueing;
 *   - a browser gets a grant on the outbox, which exposes member addresses;
 *   - the function stops guarding itself, which turns it into an open sender.
 *
 * These checks are static on purpose: the pipeline cannot be exercised without
 * a deployed project, but its contract can be pinned.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let failures = 0;
const results = [];
function check(name, ok, detail) {
    results.push({ name, ok, detail });
    if (!ok) failures += 1;
}

const schema = read('docs/marketplace-schema.sql');
const migrationPath = 'supabase/migrations/20261201000000_add_email_outbox.sql';
const migration = fs.existsSync(path.join(root, migrationPath)) ? read(migrationPath) : '';
const fn = read('supabase/functions/send-email/index.ts');

// ------------------------------------------------------------------ schema
check('the schema creates the outbox', /CREATE TABLE IF NOT EXISTS public\.email_outbox/i.test(schema));
check('the outbox has RLS enabled', /ALTER TABLE public\.email_outbox ENABLE ROW LEVEL SECURITY/i.test(schema));
check('no browser role is granted the outbox',
    /REVOKE ALL ON public\.email_outbox FROM anon, authenticated/i.test(schema) &&
    !/GRANT[^;]*ON public\.email_outbox TO (anon|authenticated)/i.test(schema));
check('no policy exposes the outbox',
    !/CREATE POLICY[\s\S]{0,120}ON public\.email_outbox/i.test(schema));
check('a trigger queues a row per notification',
    /CREATE TRIGGER notifications_email_outbox[\s\S]{0,120}AFTER INSERT ON public\.notifications/i.test(schema));
check('the queue function swallows its own errors',
    /EXCEPTION WHEN OTHERS THEN[\s\S]{0,120}NULL;/i.test(schema));
check('the consent flag exists and defaults to on',
    /email_notifications BOOLEAN NOT NULL DEFAULT TRUE/i.test(schema));
check('a member may read and write only their own flag',
    /GRANT SELECT \(email_notifications\) ON public\.profiles TO authenticated/i.test(schema) &&
    /GRANT UPDATE \(email_notifications\) ON public\.profiles TO authenticated/i.test(schema) &&
    !/GRANT (SELECT|UPDATE) \(email_notifications\)[^;]*TO anon/i.test(schema));
check('the sender helpers are callable by the function',
    /CREATE OR REPLACE FUNCTION public\.claim_email_batch/i.test(schema) &&
    /CREATE OR REPLACE FUNCTION public\.settle_email/i.test(schema));
check('the cron job is optional',
    /Email drain not scheduled/i.test(schema));

// --------------------------------------------------------------- migration
check('the migration ships the same objects', migration.length > 0 &&
    /CREATE TABLE IF NOT EXISTS public\.email_outbox/i.test(migration) &&
    /CREATE TRIGGER notifications_email_outbox/i.test(migration) &&
    /claim_email_batch/i.test(migration));
check('the migration states the setup steps', /supabase secrets set RESEND_API_KEY/.test(migration));

// ---------------------------------------------------------------- function
check('the function refuses to run without its secret',
    /if \(!expected \|\| presented !== expected\) return json\(\{ error: 'forbidden' \}, 401\)/.test(fn));
check('the Resend key comes from the environment only',
    /Deno\.env\.get\('RESEND_API_KEY'\)/.test(fn) && !/re_[A-Za-z0-9]{16,}/.test(fn));
check('the function claims and settles through the schema helpers',
    /rpc\('claim_email_batch'/.test(fn) && /rpc\('settle_email'/.test(fn));
check('the email body is escaped before it becomes HTML',
    /escapeHtml\(subject\)/.test(fn) && /escapeHtml\(body\)/.test(fn));

// ------------------------------------------------------------------ client
const clientFiles = fs.readdirSync(root).filter((f) => f.endsWith('.js'));
// A file may name the table in a message ("run the migration"); what it must
// never do is query it, because a browser has no business reading the outbox.
const touchesOutbox = clientFiles.filter((f) =>
    /from\(['"]email_outbox['"]\)|rest\/v1\/email_outbox/.test(fs.readFileSync(path.join(root, f), 'utf8')));
check('no browser script reads the outbox', touchesOutbox.length === 0, touchesOutbox.join(', '));
check('both engines allow the consent flag',
    /'email_notifications'/.test(read('supabase-client.js')) &&
    /'email_notifications'/.test(read('marketplace-local.js')));
check('the profile editor exposes the toggle',
    /editProfileEmailNotifications/.test(read('auth.js')));

results.forEach((r) => {
    console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok || !r.detail ? '' : ' (' + r.detail + ')'));
});
// The queue must survive a sender that dies mid-flight, and it must not send
// the same notification twice. Both are one clause in SQL and easy to lose in a
// refactor, so they are pinned here as text and exercised at runtime by
// `npm run check:sql`.
const schemaText = fs.readFileSync(path.join(root, 'docs/marketplace-schema.sql'), 'utf8');
const migrationText = fs.readFileSync(path.join(root, 'supabase/migrations/20261201000000_add_email_outbox.sql'), 'utf8');

for (const [name, text] of [['schema', schemaText], ['migration', migrationText]]) {
    check(`${name}: a stranded claim is reclaimed after ten minutes`,
        /status = 'sending'[\s\S]{0,120}INTERVAL '10 minutes'/.test(text));
    check(`${name}: claimed_at is set when a row is taken`,
        /claimed_at = TIMEZONE\('utc', NOW\(\)\)/.test(text));
    check(`${name}: one outbox row per notification is enforced`,
        /UNIQUE INDEX[\s\S]{0,120}email_outbox \(notification_id\)/.test(text));
    check(`${name}: the queue insert is idempotent`,
        /ON CONFLICT \(notification_id\)[\s\S]{0,60}DO NOTHING/.test(text));
}

if (failures) {
    console.error('\nemail check failed: ' + failures + ' case(s)');
    process.exit(1);
}
console.log('\nemail check passed: ' + results.length + ' case(s) verified.');

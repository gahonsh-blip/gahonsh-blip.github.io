#!/usr/bin/env node
/**
 * Runtime check of the email outbox SQL against a real PostgreSQL.
 *
 * The static check (`npm run test:email`) proves the objects exist and the
 * browser cannot touch them. It cannot prove the queue behaves: that a claim is
 * exclusive, that a stranded claim comes back, that five failures end in
 * `failed`, or that an opt-out stops the queue without stopping the
 * notification. Those need a database.
 *
 * PGlite is a WASM build of PostgreSQL, so no server is required. It is not a
 * dependency of this repository — install it when you want to run this check:
 *
 *   npm i --no-save @electric-sql/pglite
 *   npm run check:sql
 *
 * Without the package the script says so and exits 0, so `npm test` stays
 * green on a machine that has not installed it.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let PGlite;
try {
    ({ PGlite } = await import('@electric-sql/pglite'));
} catch {
    console.log('outbox sql check skipped: npm i --no-save @electric-sql/pglite');
    process.exit(0);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite();
await db.exec(`
  create schema if not exists auth;
  create role anon; create role authenticated; create role service_role;
  create table if not exists auth.users (id uuid primary key, email text,
    raw_user_meta_data jsonb default '{}'::jsonb);
  create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create or replace function public.uuid_generate_v4() returns uuid language sql as $$ select gen_random_uuid() $$;
  create schema if not exists storage;
  create table if not exists storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
  create or replace function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
  create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, created_at timestamptz default now());
`);
// Supabase provides uuid-ossp, pgcrypto and the storage schema; PGlite does
// not, so they are stubbed to the smallest shape the schema touches.
await db.exec(readFileSync(join(ROOT, 'docs', 'marketplace-schema.sql'), 'utf8')
    .replace(/CREATE EXTENSION[^;]*;/gi, ''));

let fail = 0;
const ok = (name, cond, extra='') => { console.log((cond?'ok   ':'FAIL ')+name+(cond?'':' '+extra)); if(!cond) fail++; };
const one = async (q, p) => (await db.query(q, p)).rows[0];

// seed a member with an address
const u = await one(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'buyer@example.test', '{"full_name":"Buyer One","role":"client"}'::jsonb) returning id`);
await db.query(`update public.profiles set email='buyer@example.test' where id=$1`, [u.id]);

// 1. a notification queues one email
await db.query(`insert into public.notifications (user_id, title, body, link) values ($1,'New proposal','Aditya sent a proposal.','/marketplace-dashboard.html')`, [u.id]);
const queued = await one(`select * from public.email_outbox where user_id=$1`, [u.id]);
ok('a notification queues exactly one email', !!queued);
ok('the address comes from the private profile', queued?.to_email === 'buyer@example.test', queued?.to_email);
ok('the relative link is made absolute', /^https:\/\/gahonsh-blip\.github\.io\/marketplace-dashboard\.html$/.test(queued?.link||''), queued?.link);

// 2. the unique key stops a duplicate queue row for the same notification
const notifId = queued.notification_id;
let dupBlocked = false;
try {
  await db.query(`insert into public.email_outbox (notification_id, user_id, to_email, subject, body) values ($1,$2,'x@y.z','s','b')`, [notifId, u.id]);
} catch (e) { dupBlocked = /duplicate key|unique/i.test(e.message); }
ok('a second row for the same notification is rejected', dupBlocked);

// 3. claim -> sending
const claim = await one(`select * from public.claim_email_batch(10) limit 1`);
ok('claim_email_batch takes the row', claim?.id === queued.id);
ok('claim marks it sending with a claim time', claim?.status === 'sending' && !!claim?.claimed_at);
ok('claim counts the attempt', claim?.attempts === 1);

// 4. a crash strands the row; after ten minutes it is reclaimed
await db.query(`update public.email_outbox set claimed_at = now() - interval '11 minutes' where id=$1`, [queued.id]);
const reclaim = await one(`select * from public.claim_email_batch(10) limit 1`);
ok('a stranded sending row is reclaimed', reclaim?.id === queued.id, JSON.stringify(reclaim));
ok('the reclaim counts a second attempt', reclaim?.attempts === 2);

// 5. fresh claim is not stolen
await db.query(`update public.email_outbox set claimed_at = now() where id=$1`, [queued.id]);
const stolen = await db.query(`select * from public.claim_email_batch(10)`);
ok('a fresh claim is not taken by a second run', stolen.rows.length === 0);

// 6. settle ok
await db.query(`select public.settle_email($1, true, 'resend_123', null)`, [queued.id]);
const sent = await one(`select * from public.email_outbox where id=$1`, [queued.id]);
ok('settle marks it sent with the provider id', sent.status==='sent' && sent.provider_id==='resend_123' && !!sent.sent_at);

// 7. five failures end in failed
await db.query(`insert into public.notifications (user_id, title, body) values ($1,'Second','Body')`, [u.id]);
const second = await one(`select * from public.email_outbox where user_id=$1 and status='queued'`, [u.id]);
for (let i=0;i<5;i++) { await db.query(`select * from public.claim_email_batch(10)`); await db.query(`select public.settle_email($1,false,null,'provider said no')`, [second.id]); }
const failed = await one(`select * from public.email_outbox where id=$1`, [second.id]);
ok('five failures end in failed', failed.status==='failed', failed.status);
ok('the provider error is kept', failed.last_error === 'provider said no');
ok('a failed row is never claimed again', (await db.query(`select * from public.claim_email_batch(10)`)).rows.length === 0);

// 8. opt out stops the queue but not the notification
await db.query(`update public.profiles set email_notifications=false where id=$1`, [u.id]);
await db.query(`insert into public.notifications (user_id, title, body) values ($1,'Third','Body')`, [u.id]);
ok('an opt-out queues nothing', (await one(`select count(*)::int c from public.email_outbox where subject='Third'`)).c === 0);
ok('the in-app notification still lands', (await one(`select count(*)::int c from public.notifications where user_id=$1`, [u.id])).c === 3);

// 9. a browser role cannot read the outbox
await db.exec(`set role authenticated`);
let denied = false;
try { await db.query(`select * from public.email_outbox`); } catch (e) { denied = /permission denied/i.test(e.message); }
await db.exec(`reset role`);
ok('authenticated cannot read the outbox', denied);

console.log(fail ? `\noutbox sql check failed: ${fail}` : '\noutbox sql check passed.');
process.exit(fail ? 1 : 0);

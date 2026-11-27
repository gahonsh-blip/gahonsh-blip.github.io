#!/usr/bin/env node
/**
 * Runtime check of the marketplace SQL against a real PostgreSQL.
 *
 * The static checks prove the objects exist and that no browser script reaches
 * them. They cannot prove the rules hold: that a member cannot approve their own
 * verification, that hours can only be logged by the freelancer on an hourly
 * contract, that a stranded email claim comes back. Those need a database.
 *
 * PGlite is a WASM build of PostgreSQL, so no server is required. It is not a
 * dependency of this repository — install it when you want to run this check:
 *
 *   npm i --no-save @electric-sql/pglite
 *   npm run check:sql
 *
 * Without the package the script says so and exits 0, so `npm test` stays green
 * on a machine that has not installed it.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let PGlite;
try {
    ({ PGlite } = await import('@electric-sql/pglite'));
} catch {
    console.log('sql check skipped: npm i --no-save @electric-sql/pglite');
    process.exit(0);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite();

// Supabase provides these; PGlite does not, so they are stubbed to the smallest
// shape the schema touches. auth.uid() reads the claim GUC exactly as Supabase
// does, which is what lets the tests act as different members.
await db.exec(`
  create schema if not exists auth;
  create role anon; create role authenticated; create role service_role bypassrls;
  create table if not exists auth.users (
    id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create or replace function public.uuid_generate_v4() returns uuid language sql as $$
    select gen_random_uuid() $$;
  create schema if not exists storage;
  create table if not exists storage.buckets (
    id text primary key, name text, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
  create or replace function storage.foldername(text) returns text[] language sql immutable as $$
    select string_to_array($1, '/') $$;
  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text, name text,
    owner uuid, created_at timestamptz default now());
`);

// Supabase grants table privileges by default and lets RLS filter the rows. The
// stub roles need the same, otherwise a foreign-key check fails before any
// policy runs. Objects the schema explicitly revokes stay revoked.
await db.exec(`
  alter default privileges in schema public grant all on tables to authenticated;
  alter default privileges in schema public grant select on tables to anon;
  alter default privileges in schema public grant all on sequences to authenticated;
  alter default privileges in schema public grant execute on functions to authenticated;
`);

const SCHEMA_SQL = readFileSync(join(ROOT, 'docs', 'marketplace-schema.sql'), 'utf8')
    .replace(/CREATE EXTENSION[^;]*;/gi, '');
await db.exec(SCHEMA_SQL);

// Supabase gives service_role full privileges and BYPASSRLS. The stub roles need
// the same so a test can act as trusted server code.
await db.exec(`
  grant all on all tables in schema public to service_role;
  grant all on all sequences in schema public to service_role;
  grant execute on all functions in schema public to service_role;
`);

let failures = 0;
const check = (name, ok, extra = '') => {
    console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : ' ' + extra));
    if (!ok) failures += 1;
};
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

/** Act as a member: role `authenticated` with that member's claim. */
async function as(uid, fn) {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false)`);
    await db.exec('set role authenticated');
    try {
        return await fn();
    } finally {
        await db.exec('reset role');
        await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
    }
}

async function expectError(fn) {
    try {
        await fn();
        return null;
    } catch (err) {
        return err.message;
    }
}

// ---------------------------------------------------------------- fixtures --
const member = async (name, role = 'freelancer', email = null) => {
    const address = email || `${name.toLowerCase().replace(/\s+/g, '.')}@example.test`;
    const row = await one(
        `insert into auth.users (id, email, raw_user_meta_data)
         values (gen_random_uuid(), $1::text, jsonb_build_object('full_name', $2::text, 'role', $3::text))
         returning id`, [address, name, role]);
    if (role === 'admin') {
        // The signup trigger only assigns client or freelancer; the first owner
        // is promoted the way the documented provisioning step does it.
        await db.exec(`set role service_role`);
        await db.query(`update public.profiles set role = 'admin' where id = $1`, [row.id]);
        await db.exec('reset role');
    }
    return row.id;
};

const freelancer = await member('Aditya Kumar', 'freelancer', 'aditya@example.test');
const client = await member('Meera Shah', 'client', 'meera@example.test');
const other = await member('Rahul Verma', 'freelancer');
const admin = await member('Owner Admin', 'admin');

// A job + contract pair for each contract type, inserted directly: this file
// tests the timesheet rules, not the hiring flow.
const makeContract = async (type, amount) => {
    const job = await one(
        `insert into public.jobs (client_id, title, description, category, budget_min, job_type, status)
         values ($1, 'Hourly build', 'A long description of the work to be done.', 'Web Development', $2, $3, 'in_progress')
         returning id`, [client, amount, type]);
    const proposal = await one(
        `insert into public.proposals (job_id, freelancer_id, bid_amount, delivery_time_days, cover_letter, status)
         values ($1, $2, $3, 14, 'I can do this work well and on time.', 'accepted') returning id`,
        [job.id, freelancer, amount]);
    const contract = await one(
        `insert into public.contracts (job_id, proposal_id, client_id, freelancer_id, agreed_amount, status)
         values ($1, $2, $3, $4, $5, 'active') returning id`, [job.id, proposal.id, client, freelancer, amount]);
    return contract.id;
};

const hourlyContract = await makeContract('hourly', 800);
const fixedContract = await makeContract('fixed', 5000);

// ------------------------------------------------------------ 1. outbox ----
const queued = await one(
    `insert into public.notifications (user_id, title, body, link)
     values ($1, 'New proposal', 'A client sent a proposal.', '/marketplace-dashboard.html')
     returning id`, [client]);
const email = await one('select * from public.email_outbox where notification_id = $1', [queued.id]);
check('a notification queues exactly one email', !!email);
check('the relative link is made absolute',
    /^https:\/\/gahonsh-blip\.github\.io\/marketplace-dashboard\.html$/.test(email?.link || ''), email?.link);
check('a second row for the same notification is rejected',
    !!(await expectError(() => db.query(
        `insert into public.email_outbox (notification_id, user_id, to_email, subject, body)
         values ($1, $2, 'x@y.z', 's', 'b')`, [queued.id, client]))));

const claim = await one('select * from public.claim_email_batch(10) limit 1');
check('a claim marks the row sending with a time', claim?.status === 'sending' && !!claim?.claimed_at);
await db.query(`update public.email_outbox set claimed_at = now() - interval '11 minutes' where id = $1`, [email.id]);
const reclaimed = await one('select * from public.claim_email_batch(10) limit 1');
check('a stranded claim is reclaimed after ten minutes', reclaimed?.id === email.id && reclaimed?.attempts === 2);
await db.query('select public.settle_email($1, true, $2, null)', [email.id, 'resend_1']);
check('settle marks it sent', (await one('select status from public.email_outbox where id = $1', [email.id])).status === 'sent');
check('authenticated cannot read the outbox', !!(await expectError(() => as(client, () => db.query('select * from public.email_outbox')))));

// ------------------------------------------------------ 2. verification ----
const request = await as(freelancer, () => one(
    `insert into public.verification_requests (user_id, method, reference, note, status)
     values ($1, 'video_call', 'Call booked for Monday', 'Happy to show my work.', 'approved')
     returning *`, [freelancer]));
check('a member can request verification', !!request?.id);
check('the request always starts pending', request?.status === 'pending');

check('a member cannot request verification for someone else',
    !!(await expectError(() => as(other, () => db.query(
        `insert into public.verification_requests (user_id, method) values ($1, 'video_call')`, [freelancer])))));
check('one open request per member',
    !!(await expectError(() => as(freelancer, () => db.query(
        `insert into public.verification_requests (user_id, method) values ($1, 'portfolio_review')`, [freelancer])))));
check('a member cannot read another member\'s request',
    (await as(other, () => db.query('select * from public.verification_requests'))).rows.length === 0);

const selfDecide = await expectError(() => as(freelancer, () => db.query(
    'select public.decide_verification($1, true, null)', [request.id])));
check('a member cannot approve their own request', /Only an admin/i.test(selfDecide || ''), selfDecide);

const noNote = await expectError(() => as(admin, () => db.query(
    'select public.decide_verification($1, false, null)', [request.id])));
check('a rejection must say why', /Say why/i.test(noNote || ''), noNote);

await as(admin, () => db.query('select public.decide_verification($1, true, $2)', [request.id, 'Checked on a call']));
const decided = await one('select * from public.verification_requests where id = $1', [request.id]);
check('an admin can approve', decided?.status === 'approved');
check('the decision records who made it', decided?.decided_by === admin && !!decided?.decided_at);
check('approval flips the verified flag',
    (await one('select is_verified from public.profiles where id = $1', [freelancer])).is_verified === true);
check('the member is told about the decision',
    (await one(`select count(*)::int c from public.notifications where user_id = $1 and type = 'verification'`, [freelancer])).c === 1);
check('a decided request cannot be decided again',
    !!(await expectError(() => as(admin, () => db.query('select public.decide_verification($1, true, null)', [request.id])))));

const second = await as(freelancer, () => one(
    `insert into public.verification_requests (user_id, method) values ($1, 'client_reference') returning *`, [freelancer]));
check('a decided member may ask again', !!second?.id);
await as(freelancer, () => db.query('delete from public.verification_requests where id = $1', [second.id]));
check('a member can withdraw an open request',
    (await one('select count(*)::int c from public.verification_requests where id = $1', [second.id])).c === 0);
check('anon cannot read verification requests',
    !!(await expectError(() => db.exec('set role anon; select * from public.verification_requests'))));
await db.exec('reset role');

// --------------------------------------------------------- 3. timesheets ---
const logHours = (contractId, date, hours, actor = freelancer) => as(actor, () => one(
    `insert into public.contract_timesheets (contract_id, freelancer_id, work_date, hours, note)
     values ($1, $2, $3, $4, 'Built the dashboard') returning *`, [contractId, actor, date, hours]));

const today = new Date().toISOString().slice(0, 10);
const entry = await logHours(hourlyContract, today, 6.5);
check('the freelancer can log hours on an hourly contract', !!entry?.id);
check('a logged day starts submitted', entry?.status === 'submitted');
check('the freelancer id comes from the contract', entry?.freelancer_id === freelancer);

check('hours cannot be logged on a fixed-price contract',
    /only for hourly/i.test(await expectError(() => logHours(fixedContract, today, 3)) || ''));
check('the client cannot log hours',
    /Only the freelancer/i.test(await expectError(() => logHours(hourlyContract, today, 3, client)) || ''));
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
check('a future date is refused',
    /future/i.test(await expectError(() => logHours(hourlyContract, tomorrow, 2)) || ''));
check('a second entry for the same day is refused',
    !!(await expectError(() => logHours(hourlyContract, today, 2))));
check('more than 24 hours is refused',
    !!(await expectError(() => logHours(hourlyContract, '2026-11-01', 25))));

// RLS filters rather than throws: a member the policy does not match simply
// changes no rows. The check is on the state that results, which is what a
// caller actually experiences.
await as(freelancer, () => db.query(
    `update public.contract_timesheets set status = 'approved' where id = $1`, [entry.id]));
check('the freelancer cannot approve their own hours',
    (await one('select status from public.contract_timesheets where id = $1', [entry.id])).status === 'submitted');

await as(client, () => db.query(
    `update public.contract_timesheets set hours = 1 where id = $1`, [entry.id]));
check('the client cannot rewrite the hours',
    Number((await one('select hours from public.contract_timesheets where id = $1', [entry.id])).hours) === 6.5);

const approved = await as(client, () => one(
    `update public.contract_timesheets set status = 'approved' where id = $1 returning *`, [entry.id]));
check('the client can approve a day', approved?.status === 'approved');
check('the approval records who decided', approved?.reviewed_by === client && !!approved?.reviewed_at);
await as(freelancer, () => db.query('delete from public.contract_timesheets where id = $1', [entry.id]));
check('approved hours cannot be deleted by the freelancer',
    (await one('select count(*)::int c from public.contract_timesheets where id = $1', [entry.id])).c === 1);

const pending = await logHours(hourlyContract, '2026-11-02', 4);
await as(freelancer, () => db.query('delete from public.contract_timesheets where id = $1', [pending.id]));
check('a submitted day can be withdrawn',
    (await one('select count(*)::int c from public.contract_timesheets where id = $1', [pending.id])).c === 0);

const summary = await one(
    `select count(*) filter (where status = 'approved')::int days,
            sum(hours) filter (where status = 'approved')::numeric approved_hours
     from public.contract_timesheets where contract_id = $1`, [hourlyContract]);
check('approved hours are what the client signed off', summary.days === 1 && Number(summary.approved_hours) === 6.5);

// ------------------------------------------------------- 4. success score --
await db.query(`update public.contracts set status = 'completed' where id = $1`, [hourlyContract]);
await db.query(`update public.contracts set status = 'cancelled' where id = $1`, [fixedContract]);
await db.query(
    `insert into public.reviews (contract_id, reviewer_id, reviewee_id, rating, comment)
     values ($1, $2, $3, 5, 'Excellent work.')`, [hourlyContract, client, freelancer]);

const score = await one('select * from public.worker_ratings where reviewee_id = $1', [freelancer]);
check('the score view counts finished work', score?.completed_contracts === 1 && score?.cancelled_contracts === 1);
check('the completion rate is finished over finished plus cancelled', score?.completion_rate === 50, String(score?.completion_rate));
check('the score mixes completion and rating', score?.success_score === 70, String(score?.success_score));
check('a member with no history has no score',
    (await one('select success_score from public.worker_ratings where reviewee_id = $1', [other]))?.success_score == null);

// ------------------------------------------- 5. drift repair (live project) --
// The live project (evdpmombgymthzqegqwr) had lost `profiles.email` and
// `profiles.phone_number`, so `admin_profiles` and `admin_overview()` could not
// be created, and the profile immutability trigger was not attached. This
// reproduces that exact state and proves the committed schema repairs it.
await db.exec('reset role');
await db.exec(`
  drop view if exists public.admin_profiles cascade;
  drop function if exists public.admin_overview();
  drop trigger if exists trg_protect_profile_fields on public.profiles;
  drop function if exists public.protect_profile_immutable_fields() cascade;
  alter table public.profiles drop column if exists email;
  alter table public.profiles drop column if exists phone_number;
`);
const drifted = await one(`select count(*)::int n from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name in ('email', 'phone_number')`);
check('the fixture really dropped the private columns', drifted.n === 0, String(drifted.n));

const replayError = await expectError(() => db.exec(SCHEMA_SQL));
check('the committed schema re-runs on a drifted project without error',
    replayError === null, replayError || '');

const restored = await one(`select count(*)::int n from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name in ('email', 'phone_number')`);
check('the schema restores profiles.email and phone_number', restored.n === 2, String(restored.n));
check('admin_profiles is created once the columns exist',
    (await one(`select to_regclass('public.admin_profiles') is not null ok`)).ok === true);
check('admin_overview() is created once the columns exist',
    (await one(`select to_regprocedure('public.admin_overview()') is not null ok`)).ok === true);
const immutability = await one(`select count(*)::int n from pg_trigger
    where tgrelid = 'public.profiles'::regclass and tgname = 'trg_protect_profile_fields'`);
check('the profile immutability trigger is attached again', immutability.n === 1, String(immutability.n));

console.log(failures
    ? `\nsql check failed: ${failures} case(s)`
    : '\nsql check passed.');
process.exit(failures ? 1 : 0);

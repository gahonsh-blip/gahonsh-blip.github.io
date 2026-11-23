#!/usr/bin/env node
/**
 * Local marketplace engine authorization check.
 *
 * `marketplace-local.js` is the offline fallback the whole site runs on when no
 * Supabase project is reachable, so it has to enforce the same access rules as
 * the RLS policies and RPCs in `docs/marketplace-schema.sql`. It is not a trust
 * boundary, but a divergence is a real bug: the UI can only be tested against
 * it, and a rule that holds in SQL but not here is a rule that silently breaks
 * the moment the backend goes offline.
 *
 * Each case below reproduces a divergence that shipped: hiring a withdrawn
 * proposal, withdrawing another user's proposal, reading a competitor's bids,
 * reading a stranger's contract, changing a job you do not own, and moving a
 * job through an illegal status transition.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { Blob } from 'node:buffer';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE = join(ROOT, 'marketplace-local.js');
const PREFIX = 'gahonsh_mkt_v1_';

// Minimal in-memory IndexedDB covering the open/transaction/put/get/delete
// calls the engine makes. Resume bytes are stored there, so the resume tests
// need the same store the browser provides.
function makeIdbMock() {
  const databases = new Map();
  return {
    open(name) {
      const request = {};
      setTimeout(() => {
        if (!databases.has(name)) databases.set(name, new Map());
        const stores = databases.get(name);
        const db = {
          objectStoreNames: { contains: (store) => stores.has(store) },
          createObjectStore: (store) => {
            if (!stores.has(store)) stores.set(store, new Map());
            return {};
          },
          transaction: (storeName) => {
            if (!stores.has(storeName)) stores.set(storeName, new Map());
            const map = stores.get(storeName);
            const tx = { oncomplete: null, onerror: null, onabort: null };
            const store = {
              put: (value, key) => {
                map.set(key, value);
                const req = {};
                setTimeout(() => { req.result = key; if (tx.oncomplete) tx.oncomplete(); }, 0);
                return req;
              },
              get: (key) => {
                const req = {};
                setTimeout(() => { req.result = map.get(key); if (tx.oncomplete) tx.oncomplete(); }, 0);
                return req;
              },
              delete: (key) => {
                map.delete(key);
                const req = {};
                setTimeout(() => { req.result = undefined; if (tx.oncomplete) tx.oncomplete(); }, 0);
                return req;
              }
            };
            tx.objectStore = () => store;
            return tx;
          },
          close: () => {}
        };
        request.result = db;
        if (request.onupgradeneeded) request.onupgradeneeded();
        if (request.onsuccess) request.onsuccess();
      }, 0);
      return request;
    }
  };
}

function makeContext() {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };
  const sandbox = {
    localStorage,
    crypto: webcrypto,
    console,
    setTimeout,
    clearTimeout,
    Blob,
    URL,
    indexedDB: makeIdbMock()
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(ENGINE, 'utf8'), sandbox, { filename: ENGINE });
  return sandbox;
}

const failures = [];
let checks = 0;
function check(name, condition, detail) {
  checks++;
  if (condition) console.log('  ok   ' + name);
  else { console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); failures.push(name); }
}

const read = (ctx, table) => JSON.parse(ctx.localStorage.getItem(PREFIX + table) || '[]');
const write = (ctx, table, rows) => ctx.localStorage.setItem(PREFIX + table, JSON.stringify(rows));

async function refuse(fn) {
  try { await fn(); return null; } catch (e) { return e.message || 'error'; }
}

(async () => {
  const ctx = makeContext();
  const DB = ctx.GahonshLocal;
  await DB.ready();

  const client = read(ctx, 'profiles').find((p) => p.id === 'client-apex');
  const freelancers = read(ctx, 'profiles').filter((p) => p.role === 'freelancer');
  const password = DB._demoPassword;

  // --- hiring a withdrawn proposal (SQL RPC refuses it) -------------------
  await DB.Auth.signIn(freelancers[0]._email, password);
  const withdrawn = await DB.Proposals.submitProposal('demo-job-1', 'brief', 300, 5);
  await DB.Proposals.withdrawProposal(withdrawn.id);
  await DB.Auth.signIn(client._email, password);
  check('refuses to hire a withdrawn proposal',
    await refuse(() => DB.Contracts.acceptProposalAndHire(withdrawn.id)) !== null);

  // --- withdrawing someone else's proposal (UPDATE policy) ---------------
  await DB.Auth.signIn(freelancers[0]._email, password);
  const mine = await DB.Proposals.submitProposal('demo-job-1', 'mine', 320, 6);
  await DB.Auth.signIn(freelancers[1]._email, password);
  check("refuses to withdraw another user's proposal",
    await refuse(() => DB.Proposals.withdrawProposal(mine.id)) !== null);

  // --- reading a competitor's proposal (SELECT policy) -------------------
  await DB.Auth.signIn(freelancers[0]._email, password);
  const visible = await DB.Proposals.getProposalsForJob('demo-job-1');
  check('a bidder sees only their own proposals',
    visible.length > 0 && visible.every((p) => p.freelancer_id === freelancers[0].id));
  await DB.Auth.signIn(freelancers[1]._email, password);
  check('a bidder with no proposal on the job sees none',
    (await DB.Proposals.getProposalsForJob('demo-job-1')).length === 0);

  // --- reading a contract you are not party to (SELECT policy) -----------
  write(ctx, 'contracts', [{
    id: 'contract-probe', job_id: 'demo-job-1', proposal_id: 'probe',
    client_id: client.id, freelancer_id: freelancers[0].id,
    agreed_amount: 9999, status: 'active', created_at: new Date().toISOString()
  }]);
  await DB.Auth.signIn(freelancers[2]._email, password);
  check('hides a contract from a non-party',
    (await DB.Contracts.getContractForJob('demo-job-1')) === null);
  await DB.Auth.signIn(client._email, password);
  check('still shows the contract to its client',
    (await DB.Contracts.getContractForJob('demo-job-1')) !== null);

  // --- changing a job you do not own (UPDATE policy) ---------------------
  await DB.Auth.signIn(freelancers[0]._email, password);
  check('refuses a status change by a non-owner',
    await refuse(() => DB.Jobs.updateJobStatus('demo-job-1', 'cancelled')) !== null);

  // --- illegal status transition (validate_job_mutation trigger) ---------
  await DB.Auth.signIn(client._email, password);
  check('refuses an illegal status transition (open -> completed)',
    await refuse(() => DB.Jobs.updateJobStatus('demo-job-1', 'completed')) !== null);
  check('allows a legal status transition (open -> in_progress)',
    (await DB.Jobs.updateJobStatus('demo-job-1', 'in_progress')).status === 'in_progress');

  // --- editing a job (owner-only UPDATE policy) --------------------------
  const edited = await DB.Jobs.updateJob('demo-job-1', {
    title: 'Updated demo project title',
    required_skills: ['Excel VBA', 'SQL', 'Power BI'],
    budget_min: 750
  });
  check('owner can edit an open or active job',
    edited.title === 'Updated demo project title' &&
    edited.required_skills.length === 3 &&
    Number(edited.budget_min) === 750);

  await DB.Auth.signIn(freelancers[0]._email, password);
  check('refuses a job edit by a non-owner',
    await refuse(() => DB.Jobs.updateJob('demo-job-1', { title: 'Hijacked title' })) !== null);

  await DB.Auth.signIn(client._email, password);
  const protectedEdit = await DB.Jobs.updateJob('demo-job-1', {
    title: 'Second edit title',
    client_id: 'someone-else',
    proposals_count: 999
  });
  check('keeps immutable job fields on edit',
    protectedEdit.client_id === client.id && protectedEdit.proposals_count !== 999);

  // A closed job is read-only, mirroring the trigger/policy guard.
  const jobs = read(ctx, 'jobs');
  const closed = jobs.find((j) => j.id === 'demo-job-1');
  closed.status = 'cancelled';
  write(ctx, 'jobs', jobs);
  check('refuses to edit a closed job',
    await refuse(() => DB.Jobs.updateJob('demo-job-1', { title: 'Closed job edit' })) !== null);

  // --- resumes (PDF) -----------------------------------------------------
  // Mirrors the private `resumes` bucket: only signed-in users may read a
  // resume, and only freelancers may upload one.
  const resumePdf = new Blob([Buffer.from('%PDF-1.4\nresume test\n')], { type: 'application/pdf' });
  resumePdf.name = 'resume.pdf';

  await DB.Auth.signOut();
  check('anonymous visitors cannot view a resume',
    await refuse(() => DB.Profiles.getResume(freelancers[0].id)) !== null);

  await DB.Auth.signIn(client._email, password);
  check('clients cannot upload a resume',
    await refuse(() => DB.Profiles.uploadResume(resumePdf)) !== null);

  await DB.Auth.signIn(freelancers[0]._email, password);
  const notPdf = new Blob([Buffer.from('not a pdf')], { type: 'text/plain' });
  notPdf.name = 'notes.txt';
  check('freelancers cannot upload a non-PDF file',
    await refuse(() => DB.Profiles.uploadResume(notPdf)) !== null);

  const uploadedResume = await DB.Profiles.uploadResume(resumePdf);
  check('freelancer can upload a PDF resume',
    !!(uploadedResume && uploadedResume.resume_name === 'resume.pdf' && uploadedResume.has_resume === true));

  const talentRow = (await DB.Profiles.getPublicFreelancers({}))
    .find((p) => p.id === freelancers[0].id);
  check('talent listing exposes has_resume and the display name',
    !!(talentRow && talentRow.has_resume === true && talentRow.resume_name === 'resume.pdf'));

  await DB.Auth.signIn(client._email, password);
  const viewedResume = await DB.Profiles.getResume(freelancers[0].id);
  check('a signed-in client can view the resume',
    !!(viewedResume && viewedResume.url && viewedResume.name === 'resume.pdf'));
  if (viewedResume && viewedResume.revoke) viewedResume.revoke();

  await DB.Auth.signIn(freelancers[0]._email, password);
  const removedResume = await DB.Profiles.removeResume();
  check('owner can remove the resume',
    !!(removedResume && !removedResume.resume_name && removedResume.has_resume === false));
  check('a removed resume is no longer viewable',
    (await DB.Profiles.getResume(freelancers[0].id)) === null);

  // --- profile privacy (public_profiles view + column grants) -------------
  // Mirrors the SQL grants: email, phone_number and the password salt/hash are
  // never part of a public profile, and a crafted update cannot touch another
  // row or a privilege column.
  await DB.Auth.signOut();
  check('anonymous visitors cannot update a profile',
    await refuse(() => DB.Profiles.updateMyProfile({ full_name: 'Anon' })) !== null);

  const privateKeys = ['email', 'phone_number', '_email', '_hash', '_salt'];
  const publicRow = await DB.Profiles.getPublicProfile(freelancers[0].id);
  const publicRows = await DB.Profiles.getPublicFreelancers({});
  check('public profile never exposes email, phone or password material',
    !!publicRow &&
    privateKeys.every((k) => !(k in publicRow)) &&
    publicRows.every((p) => privateKeys.every((k) => !(k in p))));

  await DB.Auth.signIn(freelancers[0]._email, password);
  const myProfile = await DB.Profiles.getMyProfile();
  check('own profile also hides the password hash and private contact fields',
    !!myProfile && privateKeys.every((k) => !(k in myProfile)));

  const beforeMe = read(ctx, 'profiles').find((p) => p.id === freelancers[0].id);
  const beforeOther = read(ctx, 'profiles').find((p) => p.id === freelancers[1].id);
  await DB.Profiles.updateMyProfile({
    id: freelancers[1].id,
    email: 'attacker@example.com',
    role: 'admin',
    is_verified: true,
    _email: 'attacker@example.com',
    _hash: 'forged',
    _salt: 'forged',
    full_name: 'Privacy Probe',
    title: 'Privacy Tester'
  });
  const afterMe = read(ctx, 'profiles').find((p) => p.id === freelancers[0].id);
  const afterOther = read(ctx, 'profiles').find((p) => p.id === freelancers[1].id);
  check('a crafted update cannot edit another profile',
    afterOther.full_name === beforeOther.full_name &&
    afterOther.role === beforeOther.role &&
    afterOther.is_verified === beforeOther.is_verified);
  check('a crafted update cannot change role, email, verification or password material',
    afterMe.role === beforeMe.role &&
    afterMe.email === beforeMe.email &&
    afterMe.is_verified === beforeMe.is_verified &&
    afterMe._email === beforeMe._email &&
    afterMe._hash === beforeMe._hash &&
    afterMe._salt === beforeMe._salt);
  check('a crafted update applies only the allow-listed fields',
    afterMe.full_name === 'Privacy Probe' && afterMe.title === 'Privacy Tester');

  const fresh = await DB.Auth.signUp('privacy-' + Date.now() + '@example.com', 'password123', 'Privacy New', 'freelancer');
  const beforeFresh = read(ctx, 'profiles').find((p) => p.id === fresh.id);
  await DB.Profiles.updateMyProfile({ is_verified: true, role: 'admin', full_name: 'Privacy New' });
  const afterFresh = read(ctx, 'profiles').find((p) => p.id === fresh.id);
  check('a new user cannot self-verify or self-promote',
    beforeFresh.is_verified === false && afterFresh.is_verified === false && afterFresh.role === 'freelancer');

  check('rejects a too-short full name',
    await refuse(() => DB.Profiles.updateMyProfile({ full_name: 'A' })) !== null);
  check('rejects a negative hourly rate',
    await refuse(() => DB.Profiles.updateMyProfile({ hourly_rate: -5 })) !== null);
  check('rejects a non-list skills value',
    await refuse(() => DB.Profiles.updateMyProfile({ skills: 'Excel' })) !== null);
  check('rejects an unsafe avatar URL',
    await refuse(() => DB.Profiles.updateMyProfile({ avatar_url: 'javascript:alert(1)' })) !== null);

  if (failures.length) {
    console.error('\nlocal engine check failed: ' + failures.length + ' case(s).');
    process.exit(1);
  }
  console.log('\nlocal engine check passed: ' + checks + ' authorization case(s) verified.');
})();

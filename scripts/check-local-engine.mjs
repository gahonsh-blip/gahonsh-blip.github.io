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
function check(name, condition, detail) {
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

  if (failures.length) {
    console.error('\nlocal engine check failed: ' + failures.length + ' case(s).');
    process.exit(1);
  }
  console.log('\nlocal engine check passed: 17 authorization case(s) verified.');
})();

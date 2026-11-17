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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE = join(ROOT, 'marketplace-local.js');
const PREFIX = 'gahonsh_mkt_v1_';

function makeContext() {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };
  const sandbox = { localStorage, crypto: webcrypto, console, setTimeout, clearTimeout };
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

  if (failures.length) {
    console.error('\nlocal engine check failed: ' + failures.length + ' case(s).');
    process.exit(1);
  }
  console.log('\nlocal engine check passed: 9 authorization case(s) verified.');
})();

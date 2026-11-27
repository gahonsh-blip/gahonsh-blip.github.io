# Cancellation and disputes

How an engagement ends early, and what happens when the two sides disagree.
The customer-facing rules are on `dispute-policy.html`; this page is the
implementation map for whoever touches the code next.

## States

`contract_status` has four values and every one of them is now reachable:

| From | To | Who | Function |
| --- | --- | --- | --- |
| `active` | `completed` | client (or admin) | `complete_contract` |
| `active` | `cancelled` | client, freelancer (or admin) | `cancel_contract` |
| `active` | `disputed` | client, freelancer (or admin) | `raise_contract_dispute` |

A cancelled or completed contract is final: it cannot be completed, cancelled or
disputed again. A disputed contract can only leave `disputed` through an admin
(`UPDATE public.contracts SET status = ...`), because a dispute is resolved by a
person reading the evidence, not by a button.

Cancelling also moves the job to `cancelled`. A dispute leaves the job
`in_progress` on purpose: the work has not stopped, it is under review.

## Layers

| Layer | File | Notes |
| --- | --- | --- |
| Schema | `docs/marketplace-schema.sql` (§9a) | `cancel_contract`, `raise_contract_dispute`; `SECURITY DEFINER`, `search_path` pinned |
| Migration | `supabase/migrations/20261130000000_add_contract_cancellation.sql` | For projects created before §9a existed |
| Supabase client | `supabase-client.js` → `Contracts.cancelContract` / `Contracts.raiseDispute` | Calls the RPC, surfaces the RPC error message |
| Offline engine | `marketplace-local.js` → same two methods | Same rules and error text as the RPCs |
| Portal UI | `marketplace-dashboard.html` contract cards | Buttons only on `active` contracts; `confirm()` before either action |
| Tests | `scripts/check-local-engine.mjs` | 11 cases: strangers refused, double actions refused, job status follows |

Both engines must keep the same rules. `npm run test:local` fails if they drift,
and `npm run test:schema` fails if the client calls an RPC the schema lacks.

## What the platform cannot do

Payments move directly between the client and the freelancer, so there is no
escrow balance to release, reverse or hold. A dispute records a state and a
recommendation; a refund is a transfer the freelancer makes. Do not add UI that
implies the platform can move money — `npm run test:content` fails on
`escrow`, `payment protection`, `payment-verified` and `money-back guarantee`
unless the sentence negates them.

## Resolving a dispute (admin)

1. Read the contract, its milestones, its message thread and the files.
2. Write the view to both parties from `gahonsh@gmail.com` within 10 business
   days of having the evidence.
3. Record the outcome in SQL: `cancelled` (stop it), `completed` (accept the
   work), or leave `disputed` while a fix is delivered.
4. If an account ignored the outcome, restrict it in `profiles` and note why.

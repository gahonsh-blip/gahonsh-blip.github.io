# Gahonsh vs Upwork: where the marketplace stands

Research date: 2026-11-27. Crawl refreshed 2026-11-24 against the deployment of
PR #30. Re-run with `npm run audit:live`.

This report answers one question: **how much of an Upwork-class marketplace is
already built, and what is genuinely missing?** It is a build plan, not a
scorecard for its own sake — every row names the evidence and the next action.

## 1. How this was researched

| Step | What was done |
|------|---------------|
| Live crawl | Every URL in `sitemap.xml` plus `/` and the portal fetched from the deployment: status, title, description length, canonical, `h1` count, `.page-info` word count, and which features the markup contains (`scripts/audit-live-site.mjs`) |
| Code inventory | Tables, views, functions and triggers in `docs/marketplace-schema.sql`; every namespace and method in `supabase-client.js`; which of those the pages actually call |
| Gap probes | Targeted searches for the capabilities Upwork is known for: payments, escrow, timesheets, saved searches, verification workflow, realtime messaging |
| Reference set | Upwork's public product surface (job posts, contracts, milestones, hourly diary, reviews, JSS, connects, verification, payments, support) |

**Limits, stated plainly.** Upwork's internals are not public, so the reference
column describes its published features, not its implementation. No paid
research API was used for this pass (TinyFish and Tavily were both unavailable:
TinyFish needs an account key, Tavily was over its plan limit), so the crawl and
the repository are the evidence. A capability marked "live" below was confirmed
in the deployed HTML or in the shipped client code; a capability marked "schema
only" exists in SQL but has no UI.

## 2. What is already built

| Area | Evidence |
|------|----------|
| 15 indexable pages, all 200, one `h1`, canonical, unique descriptions, 505–772 words of static copy each | live crawl |
| Profiles: name, title, bio, skills, hourly rate, location, availability + note | `profiles`, `public_profiles` |
| Resume upload to a private bucket | `uploadResume`, `resumes` bucket |
| Job posting with category, budget, duration, experience, skills | `post-job.html`, `jobs` |
| Job search and filters, saved jobs | `jobs.html`, `SavedJobs` |
| Talent directory with search, skill and availability filters, saved talent | `find-talent.html`, `SavedTalent` |
| Proposals: submit, withdraw, shortlist, decline, hire | `proposals`, `set_proposal_status`, `accept_proposal_and_create_contract` |
| Contracts: active, complete, cancel, dispute | `contracts`, `complete_contract`, `cancel_contract`, `raise_contract_dispute` |
| Milestones as a shared checklist (explicitly not escrow) | `contract_milestones` |
| Reviews bound to a completed contract, one per side | `reviews`, `worker_ratings` |
| Average rating shown on talent cards | `marketplace-trust.js` |
| Direct invitations from client to freelancer | `invitations` |
| Service packages (fixed-price catalogue) | `catalog.html`, `service_packages` |
| Messaging page, notification bell, email outbox | `messages.html`, `notifications`, `email_outbox` |
| File transfer with local scanning, 25 MB limit, MIME allow-list | `file_transfers`, `job-attachments` |
| Admin: KPIs, leads, member list, studio editor | `admin.html`, `admin_overview`, `admin_profiles` |
| Dispute policy page | `dispute-policy.html` |
| Row Level Security on every table, offline engine mirroring the rules | `docs/marketplace-schema.sql`, `npm run test:local` |
| Accessibility, security, schema, content and chat checks in `npm test` | 8 suites |

That is a real marketplace, not a landing page: a client can post, receive,
shortlist, hire, milestone, review and dispute; a freelancer can build a
profile, apply, deliver, and get paid work recorded.

## 3. Feature matrix

Weight is the share of an Upwork-class product the area represents. Status is
what this repository can do today, judged conservatively.

| # | Capability | Upwork | Gahonsh today | Status | Weight |
|---|------------|--------|---------------|--------|--------|
| 1 | Profiles, skills, rates, resume, portfolio | full | profile, rate, skills, resume, availability; no per-freelancer project gallery | 85% | 10 |
| 2 | Job posting and browsing | full | post, categories, budget, duration, skills, filters, saved jobs | 90% | 10 |
| 3 | Proposals and hiring | full + connects | submit, withdraw, shortlist, decline, hire; no connects or proposal limits | 90% | 10 |
| 4 | Contracts and milestones | full + escrow | contracts, checklist milestones, complete/cancel/dispute; no funded milestones | 75% | 10 |
| 5 | Hourly work and timesheets | full | `job_type = 'hourly'`; freelancer logs a day, client approves or rejects, contract totals; no weekly limit, no work diary screenshots, no automatic billing | 50% | 10 |
| 6 | Payments, escrow, payouts, invoices, tax | full | none. No processor, no ledger, no invoice | 5% | 15 |
| 7 | Trust: identity verification, badges, JSS | full | request + admin decision with a note, badge flips on approval, member notified; completion-based success score beside the stars; no ID-document provider, no connects, no private-feedback JSS | 55% | 10 |
| 8 | Reviews and ratings | public + private | contract-bound review, one per side, average + success score shown | 85% | 5 |
| 9 | Messaging and notifications | full, realtime | message page, bell, email outbox; polling, not realtime | 75% | 5 |
| 10 | Discovery quality, saved searches, alerts | full | search + filters + saved items; no saved searches, no alerts | 65% | 5 |
| 11 | Disputes and support | arbitration | policy page, dispute state, admin overview; no ticket trail | 60% | 5 |
| 12 | Admin, ops, reporting, compliance | full | admin KPIs, leads, members, records, RLS; no invoices or tax reports | 45% | 5 |
| 13 | Mobile and accessibility | apps | responsive down to 320px, 48px targets, a11y suite; no PWA install, no offline shell | 70% | 5 |

**Weighted completion: ~62%** (was ~57% before this pass; hourly work and
verification moved, payments did not).

The shape matters more than the number. Everything that makes a marketplace
*work* is there. What is missing is everything that makes it *trusted with
money* — and that is the part that cannot be finished by writing code alone.

## 4. What is actually left, in order

### Phase 1 — trust and hourly work (done in this pass)

| Item | Why it mattered | State |
|------|-----------------|-------|
| Verification request + admin decision | `is_verified` was set by hand, so the "verified freelancer" claim had no trail | Done — `verification_requests`, `decide_verification()`, profile editor, admin queue |
| Timesheets for hourly contracts | Hourly jobs could be posted but never recorded | Done — `contract_timesheets`, portal panel, client sign-off |
| Success score from completed work + reviews | The directory showed stars but not reliability | Done — `worker_ratings.success_score` |
| Static copy on thin pages | The crawl measured `.page-info` alone, and `/`, `/pricing.html` and `/services.html` held 247, 296 and 209 words there — under the 500-word floor `AGENTS.md` sets | Done — all three rewritten, and six more pages topped up: every indexable page now carries 505–772 words. `npm run test:content` rule 11 fails below 500, so it cannot drift back |

### Phase 2 — money (needs a provider and a decision, not just code)

The provider comparison, the cost facts, the recommendation and the acceptance
criteria live in [PAYMENTS-DECISION.md](PAYMENTS-DECISION.md). Short version:
Razorpay Route first for INR collection and Indian payouts, Stripe Connect later
for cross-border cards, and no "funded" label until money has actually arrived.

| Item | Blocker |
|------|---------|
| Escrow: fund on hire, release on approval | Needs a payment provider (Stripe Connect or Razorpay Route), a business entity, KYC for payouts, and refund/dispute terms |
| Payouts to freelancers | Same, plus tax reporting in each jurisdiction |
| Invoices and receipts | Needs the above to be meaningful |
| Milestone funding | A milestone marked "funded" with no money behind it is a lie, so this waits for escrow |

Until Phase 2 lands, the site must not imply money is held. It currently does
not: `docs/marketplace-schema.sql` calls milestones "a manual checklist, not an
escrow", and `dispute-policy.html` describes the process without promising a
refund.

### Phase 3 — reach

| Item | Notes |
|------|-------|
| Saved searches + job alerts | Needs a scheduler; the email outbox and pg_cron are already in place, so this is mostly a query |
| Realtime messaging | Supabase Realtime subscription instead of polling |
| PWA install + offline shell | Service worker; must not cache stale pages for the studio editor |
| Freelancer portfolio gallery | Per-freelancer work samples, not the agency portfolio page |
| Support tickets | Contact form today; a ticket table with status would close the loop |
| Multi-currency | Depends on Phase 2 |

## 5. What this report changed

Phase 1 is implemented in the same pull request as this document:

1. `verification_requests` — a member asks, an admin decides with a note, the
   profile flips and the member is notified. The badge finally has a trail. No
   ID number, scan or document image is stored; only the kind of evidence and a
   short reference.
2. `contract_timesheets` — a freelancer logs hours against an hourly contract,
   one row per day, and the client approves or rejects each entry. It is a
   record of work, not a bill: no money moves through it, and the UI says so.
3. `worker_ratings` gains completion counts, a completion rate and a 0–100
   success score (60% completion, 40% rating) shown beside the stars. A member
   with no history scores `null`, never zero.
4. The rules are enforced twice — RLS plus a trigger in SQL, and the same rules
   in the offline engine — and checked by two new suites: `npm run check:sql`
   (41 cases against a real PostgreSQL) and 24 new cases in `npm run test:local`.
5. The static copy on nine pages was raised to the 500-word floor the repo
   documents, and `npm run test:content` now enforces it.
6. The Security Advisor's findings are answered: the function surface is
   re-granted explicitly, `public_profiles` runs as the caller, and the two
   owner-privileged views are gated and tested. Leaked password protection is an
   Auth toggle the owner sets once (`docs/SETUP.md` Step 2c).

**Live deployment status (2026-11-24).** `npm run check:live` reports nine gaps
on the deployed Supabase project:

| Kind | Missing |
|---|---|
| Tables | `contact_messages`, `admin_profiles`, `verification_requests`, `contract_timesheets` |
| Functions | `admin_overview()`, `decide_verification()` |
| Columns | `profiles.email`, `profiles.phone_number`, `profiles.email_notifications` |

The first three tables and both functions predate this work: the live contact
form still reaches the owner through Formspree, but the dashboard keeps no
record of those enquiries, and the admin views are absent. The columns matter
because `admin_profiles` and `admin_overview()` read `profiles.email`, so the
admin views cannot be created until they are back.

One run of `docs/marketplace-schema.sql` closes all nine: it restores the
columns, backfills the addresses, re-attaches the profile immutability trigger
and then creates the views. `npm run check:sql` case 5 proves that repair on a
reproduction of the live state. `docs/SETUP.md` Step 2a is the procedure.

Phase 2 is deliberately not attempted. A payment button that moves no money, or
a milestone labelled "in escrow" with nothing behind it, would be worse than the
honest gap. The new timesheet panel says, in the panel itself, that hours are a
record and not a payment.

## 6. How to re-check this report

```bash
node scripts/audit-live-site.mjs                    # what is live now
npm test                                            # static + engine guarantees
npm i --no-save @electric-sql/pglite && npm run check:sql   # SQL rules against real PostgreSQL
```

When a Phase 2 decision is made, update the matrix in section 3 and re-run both.

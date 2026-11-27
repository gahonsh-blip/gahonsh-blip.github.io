# Payments: the Phase 2 decision

Status: **proposal, waiting on the owner.** Nothing in this document is built.
It exists so the decision is made once, with the numbers on the table, instead
of drifting into a payment button that moves no money.

Checked 2026-11-24. Fees change; re-read the provider pages before signing.

## 1. What has to be decided

The marketplace can already take a brief, collect proposals, hire, milestone,
deliver, review and dispute. The one thing it cannot do is move money, so:

- a client pays a freelancer outside the platform, and the platform has no
  record of whether it happened;
- a freelancer cannot be paid for approved hours, only told the hours are
  approved;
- "milestone funded" cannot be shown, because nothing is funded.

Three questions decide the rest:

1. **Who collects?** The platform collects and pays out, or the two parties pay
   each other and the platform only records.
2. **In which currency, from which country?** INR collection with Indian
   payouts is a different product from card collection in USD with payouts to
   five countries.
3. **Who carries the loss?** Chargebacks, refunds and a freelancer who vanishes
   mid-contract are the platform's problem the moment it holds the money.

## 2. The constraint set

| Constraint | Reality today |
|---|---|
| Entity | One owner-operator, India. No second entity, no US/EU company |
| Frontend | Static pages on GitHub Pages; no server of our own |
| Backend | Supabase (Postgres, Auth, RLS, Edge Functions available) |
| Clients | Global — the demo set is UK, US and Germany |
| Freelancers | Global — India, Estonia, US in the demo set |
| Turnover | Low and irregular; a fixed monthly platform fee is worse than a percentage |
| Compliance | GST on Indian services, TDS on some payouts, invoices clients can book |
| Current claim | None. The site says it does not hold funds, and a test enforces that |

That last row is the important one: the site currently makes **no** payment
claim, so there is nothing to walk back. Whatever is chosen must be built
before it is advertised.

## 3. The candidates

### A. Razorpay Route (India-first)

Razorpay's Route product splits one payment between a platform and linked
accounts, which is the shape a marketplace needs: the client pays once, the
platform keeps its fee, the freelancer receives the rest.

- **Collect:** cards, UPI, netbanking, wallets in INR. International cards carry
  a surcharge over the domestic rate (published on the pricing page).
- **Pay out:** to Indian bank accounts and UPI through RazorpayX. Cross-border
  payouts exist as a separate product and depend on the corridor and on account
  approval — confirm before promising a non-Indian freelancer anything.
- **Paperwork:** GST invoice in the platform's name, which Indian clients
  expect; TDS handling for payouts.
- **Onboarding:** business KYC (PAN, GST, bank proof) in India. This is the
  path an Indian sole proprietor or private limited company can actually
  complete.

### B. Stripe Connect (global-first)

Stripe Connect is the better product for a marketplace that spans countries:
connected accounts, destination charges, and a mature dispute toolset.

- **Collect:** published standard rate is **2.9% + 30¢** for domestic cards;
  international cards and currency conversion cost more. Platforms that bring
  their own payments pricing pay a **0.25% starting** Connect fee per
  transaction (stripe.com/pricing, read 2026-11-24).
- **Pay out:** to connected accounts in supported countries. Payout rails have
  their own fees — for example $0.25 for a same-day ACH payout and from £0.50
  for a UK/EU payout.
- **Paperwork:** Stripe is the merchant of record for the collection; invoices
  and GST treatment for Indian clients need an accountant's sign-off.
- **Onboarding:** requires a business in a country Stripe supports for new
  accounts. **Confirm Stripe's current onboarding status for a new Indian
  business before planning around it** — this has changed more than once, and a
  plan that assumes it works is a plan that can stall at step one.

### C. Record only, no processor (the status quo, made honest)

Keep payments off-platform and make the record better: mark a milestone
"settled by the client" with a date and method, let the freelancer confirm
receipt, and show the confirmation on the contract. No money moves, no KYC, no
chargeback exposure, and the platform's books stay out of it.

This is not a failure state. It is what most small marketplaces do in year one,
and it is strictly better than a payment button that lies.

## 4. Comparison

Weights are for this business: one operator in India, global clients, low and
irregular volume.

| Criterion | Weight | A. Razorpay Route | B. Stripe Connect | C. Record only |
|---|---|---|---|---|
| Can the owner actually onboard | 20 | Yes, Indian entity | Uncertain for a new Indian business | N/A |
| Client experience for Indian clients (UPI, INR) | 15 | Best | Weak | N/A |
| Client experience for UK/US clients | 15 | International cards with a surcharge | Best | N/A |
| Payout to Indian freelancers | 15 | Best (RazorpayX) | Good | N/A |
| Payout to non-Indian freelancers | 10 | Corridor-dependent, confirm | Good where supported | N/A |
| GST invoices and TDS | 10 | Native | Needs accountant work | Manual |
| Chargeback and dispute handling | 10 | Available | Best tooling | None |
| Build effort on this stack | 5 | Medium: Edge Function + webhooks | Medium: same | Low |
| **Weighted fit** | | **~80%** | ~60% | ~35% |

The scores are a judgement, not a measurement. The point of the table is that
**A wins on the things that block, B wins on the things that scale.** Neither
is right for every client, which is why the recommendation is sequenced.

## 5. Recommendation

**Start with A, and design the schema so B can be added without a rewrite.**

1. **Razorpay Route for collection and Indian payouts.** It is the only option
   the owner can complete the paperwork for today, it covers UPI and INR, and
   it produces the GST invoice Indian clients ask for.
2. **Add Stripe Connect later, for cross-border card collection**, once there
   is enough non-Indian volume to justify a second KYC file. Until then,
   non-Indian clients pay by invoice, which is how they are paying now.
3. **Never show a "funded" milestone until money has actually arrived** on the
   chosen rail. The word "funded" is a promise; a checklist entry is not.

Why not B first: the build is comparable, but if onboarding stalls, the work is
stranded and the marketplace still cannot take a payment. Why not C forever:
approved hours with no way to pay them is the exact gap this decision exists to
close, and the trust story is stronger when the platform can say "we handle the
money" rather than "we hope they paid".

## 6. What must be true before any money UI ships

These are acceptance criteria, not suggestions.

- [ ] A payment can be **collected** and a payout **settled**, tested end to end
      on the provider's test mode with two real accounts.
- [ ] Webhooks are verified by signature in a Supabase Edge Function; the
      service-role key never reaches the browser.
- [ ] The database records the provider's identifiers (`payment_id`,
      `transfer_id`, `status`) and reconciles them against the contract.
- [ ] Refund and cancellation rules exist in `terms.html` **before** the first
      real charge, not after.
- [ ] The dispute path names who decides, in what window, with what evidence.
- [ ] `npm run test:content` still passes: no page may claim escrow or payment
      protection until the feature exists.
- [ ] `docs/UPWORK-GAP.md` matrix row 6 moves off 5% in the same commit that
      ships the first real charge.

## 7. Phased plan

| Phase | Work | Effort | Exit test |
|---|---|---|---|
| 0 | Decide A/B/C; open the provider account; collect PAN, GST, bank proof | Owner, days | Account approved in test mode |
| 1 | Schema: `payments`, `payouts`, `platform_fees`; RLS so only the parties and an admin read them | 2–3 days | `npm run check:sql` covers who may read a payment |
| 2 | Edge Function: create order on hire, verify webhook, write the row | 2–3 days | A test-mode payment produces exactly one row |
| 3 | UI: "Pay" on an accepted contract, "Settled" badge, receipt link | 2 days | The client can pay and both sides see it |
| 4 | Payout: transfer on milestone acceptance, minus the platform fee | 2–3 days | The freelancer receives the balance in test mode |
| 5 | Refunds, disputes, reconciliation report in the admin page | 3–4 days | A refund leaves both ledgers consistent |

Phase 5 is where most marketplaces quietly fail. Budget for it before phase 3.

## 8. Open questions for the owner

1. Sole proprietor or private limited company? (GST registration and payout
   limits differ; so does personal liability for chargebacks.)
2. What is the platform fee? 0% launch pricing is a marketing choice, but the
   fee must exist in the schema before it can be shown.
3. Who arbitrates a dispute — the owner personally, or "the provider's process"?
   The current dispute page describes a process without naming a decider.
4. Is TDS withheld on freelancer payouts? This changes every payout amount and
   the wording of the contract.

Answer those four and the build order above is unambiguous.

## 9. How to re-check this decision

```bash
npm run check:live     # is the backend provisioned at all?
npm test               # is the no-false-claim rule still enforced?
```

Re-read the provider pricing pages before signing: Stripe publishes its rates on
stripe.com/pricing, Razorpay on razorpay.com/pricing, and the Route fee is
quoted in the dashboard or by sales rather than in the public HTML.

# Site Audit — November 2026

Date: 2026-11-24
Scope: the public pages of `https://gahonsh-blip.github.io/` and the claims they
make, checked against the TinyFish research report supplied by the owner.
Method: read the repository and the served HTML, then verify each finding in a
local browser (`python3 -m http.server`, Chromium). No authenticated Supabase
project was available, so database behaviour is covered by `npm run test:local`
and the schema checks rather than by a live sign-in.

## 1. Report findings, checked against the repository

| Report finding | What the code shows | Status |
| --- | --- | --- |
| Homepage and About show **0 Live Projects**, Contact and Portfolio show 4 | The markup held `0` and the count-up script raised it to 4 only in a browser. A crawler, a fetch tool or a no-JS visitor really did read "0". | Fixed |
| Marketplace portal stuck on `Loading activity records...` | The placeholder is replaced 300 ms after load. Any thrown error, or a script that failed to load, left it on screen forever. | Fixed |
| "Verified freelancer" workflow unverified | Verification is a real but **manual** admin action (`admin.html` sets `profiles.is_verified`). There is no automated identity or KYC check. | Clarified in Terms §9 |
| "Payment protection" / escrow claimed in the portal copy | No payment processing, escrow or milestone hold exists. Clients and freelancers pay each other directly. | Claims removed; model stated in Terms §6–8 |
| Dispute resolution missing from policy | There was no procedure. | Added: Terms §8 |
| Terms missing client/freelancer duties, commission, refunds, fraud, suspension | Only execution, IP, liability and quotes were covered. | Added: Terms §3–9, §11, §13 |
| Privacy Policy contradicts itself and does not name providers | It promised data is "never shared" while a later section admitted hosting, auth and form providers. Supabase, Formspree and the CDNs were never named. | Rewritten: §5 names every processor, plus retention, deletion, cookies, payments and rights |
| SEO basics (title, description, canonical, viewport, robots, OG, Twitter, JSON-LD) | All present on every indexable page. | No change needed |
| "100 clients and 100 freelancers" CSV | Not produced. The report's own list is unverified discovery candidates, and inventing entries or emails would be worse than leaving it open. | Out of scope, see §4 |
| KYC, escrow, reviews, notifications, saved jobs, availability, multi-currency | None of these are built. | Backlog, see §4 |

## 2. Bugs fixed

- **Stat counters** (`index.html`, `about.html`, `contact.html`). The markup
  carries the real figure and `data-target` matches it. See Round 3: the first
  pass still zeroed every counter at load, which is what a JS-capable crawler
  and a screenshot read.
- **Portal loading state** (`marketplace-dashboard.html`). `initDashboard()` is
  wrapped in `try/catch/finally` with a visible error card and a **Try again**
  button, the listings container is an `aria-live` region with `aria-busy`
  tracking, tab handlers catch their own rejections, and a `<noscript>`
  fallback explains that the portal needs JavaScript.
- **Link hygiene.** 26 `target="_blank"` anchors carried `rel="noopener"` but
  not `noreferrer`, against the contract in `AGENTS.md`.
- **Unbacked claims.** "Payment Verified Guarantee" (`job-details.html`),
  "payment-verified guarantee" (portal copy), "Complete Data Confidentiality
  Guaranteed" (`pricing.html`) and "absolute ... confidentiality"
  (`index.html`) were replaced with statements the platform can support.
- **Legal pages.** `terms.html` and `privacy-policy.html` were rewritten; both
  keep their `.page-info` crawlable summary, expanded to match the new clauses.
- **Regression guard.** `scripts/check-content.mjs` (`npm run test:content`,
  part of `npm test`) fails the build if a counter drifts from its target, a
  `_blank` link loses `noreferrer`, a legal clause disappears, a payment
  feature is claimed again, or the portal loses its error state.

### Round 2 — second pass (same PR series)

A static sweep of every page (links, ids, headings, field names, sitemap) found
six further defects. None came from the research report; all were found by
reading the code.

- **`messages.html` was indexable.** The private contract-message thread
  carried a canonical URL and no `robots` meta, so a search engine could index
  a page that only ever renders one member's conversation. It is now
  `noindex, nofollow` and stays out of `sitemap.xml`.
- **`messages.html` sent signed-out visitors to the Owner Studio.**
  `href="dashboard.html"` is the passcode-protected local editor, not a sign-in
  page. It now points at `marketplace-dashboard.html`.
- **`messages.html` loaded the whole message history with no `?contract=`**
  and painted "Loading..." forever when it had nothing to show. It now asks
  the reader to open the page from a contract card, and says that messaging
  needs the live database when the offline engine is in use.
- **Unnamed form fields.** The newsletter input on six pages, the jobs and
  talent search boxes, the admin sign-in fields, the studio's form fields and
  the message box relied on a placeholder, which is not a label (WCAG 2.1 SC
  1.3.1 / 4.1.2). All now carry `aria-label`.
- **Heading outline.** `dashboard.html` opened with an `h2` before its `h1` and
  then jumped `h1 -> h3`; `admin.html` opened with the sign-in `h2` before the
  dashboard `h1`. Both pages now have one `h1` and no skipped level.
- **Studio "add card" wrote markup the target page does not style.** The
  service template emitted `.service-card`, a class `services.html` never
  defines, and fell back to appending it to `<main>`; the portfolio templates
  emitted `<h3>` where `portfolio.html` uses `p.project-name`. Both now match
  the page they are inserted into, and *clone last card* also recognises
  `.flip-card`.

Guards added in the same pass:

- `check-a11y.mjs` — every text, email, search, password, url, tel or number
  input and every `<textarea>` needs a label, `aria-label`, `aria-labelledby`
  or `title`.
- `check-content.mjs` — private pages must be `noindex` and absent from the
  sitemap; scripts that write `target="_blank"` links need `noreferrer`; and
  every page must keep exactly one `<h1>` with no skipped heading level.

### Round 3 — follow-up pass (same PR series)

Three findings from the report were only half fixed by the first two passes, and
the browser QA of the demo flow exposed a fourth gap. This pass closes them.

- **The counters were still zeroed at load.** `index.html`, `about.html` and
  `contact.html` ran `counters.forEach(c => { c.textContent = '0'; ... })` on
  every page load. The markup said 4, and a reader without JavaScript saw 4,
  but anything that executed the script and then stopped — a crawler, a fetch
  tool, a screenshot, a tab that never scrolled the counter into view — read
  **0 Live Projects**. The zeroing is gone: the real figure stays in the DOM
  and the count-up starts from zero only when a counter actually scrolls into
  view. The observer is also behind an `IntersectionObserver` feature check, so
  a browser without it keeps the static number instead of throwing and taking
  the rest of the inline script down with it.
- **The portal could still sit on its placeholder.** `try/catch` covered a
  *failed* request, not a request that never settles. `initDashboard()` now
  runs the activity load through `withPortalTimeout()`, a 20-second race that
  renders the existing retry card, so a stalled PostgREST call cannot leave
  "Loading your projects, proposals and contracts…" on screen indefinitely. The
  late response still paints if it ever arrives.
- **Proposals had no review step.** A client could hire or reject, and a
  freelancer could only wait. `Proposals.setStatus()` (backed by the
  `set_proposal_status()` RPC) adds **Shortlist** and **Decline** on the client
  side, and `Proposals.withdrawProposal()` adds **Withdraw** for the
  freelancer. Hiring still goes through `accept_proposal_and_create_contract()`,
  which is the only path that creates a contract.
- **Contracts had no delivery record.** Milestones and post-completion reviews
  now exist as a written plan both parties can see: the freelancer marks a
  milestone delivered, the client accepts it or sends it back, the contract can
  only be completed once something is accepted, and each party may leave one
  review afterwards. `docs/marketplace-schema.sql` and
  `supabase/migrations/20261127000000_add_milestones_and_review_rules.sql`
  carry the tables, policies and triggers; `marketplace-local.js` mirrors them
  so the offline demo behaves the same way.

Verified end to end in a browser against the offline engine: sign in as
**Apex Global Logistics** (client) and **Aditya Sharma** (freelancer), submit a
proposal on `demo-job-1`, shortlist it, hire, add a milestone, mark it
delivered as the freelancer, accept it as the client, complete the contract and
submit a review. Every step persisted and re-rendered after a reload.

Guards added in this pass:

- `check-content.mjs` fails if any page zeroes its counters at load again
  (`counters.forEach(... '0')`), or if the portal loses its load timeout.

## 3. What the audit changed in the product's own words

The marketplace now says what it does:

- the contract for a marketplace job is between the client and the freelancer;
- Gahonsh does not hold funds, so it cannot reverse a transfer or freeze a
  milestone;
- posting, applying and joining are free, and no commission is charged today;
- a verified badge means samples, references and claimed skills were reviewed
  by a person, not that a background or credit check was run.

If escrow, milestone holds or automated KYC are ever added, these pages and
`docs/marketplace-schema.sql` must change together.

## 4. Open items

| Item | Why it is still open | What it needs |
| --- | --- | --- |
| Verified client/freelancer lists (100 each) | Only unverified public profiles were found; publishing them without consent would be wrong | Owner-approved sourcing, per-record source URL, consent status column |
| Escrow / milestone payments | No payment provider is integrated. Milestones now exist as a **written record** (`contract_milestones`) with no money attached | Provider decision, schema tables, RLS policies, Terms and Privacy updates |
| KYC / identity verification | Manual admin badge only | Document collection, storage bucket, retention rules, legal basis |
| Reviews and ratings | Shipped: one review per party per completed contract, aggregated by `worker_ratings`. Moderation is admin-only delete | A report/flag path and moderation queue |
| Proposal tracking | Shipped: shortlist, decline and withdraw, with the state machine enforced by `set_proposal_status()` | Saved jobs, availability, notifications |
| Admin fraud monitoring | Admin page lists profiles only | Reporting view over `profiles`, `jobs`, `proposals`, `contracts` |
| Multi-currency | Prices are USD | Currency column, display formatting, Terms update |

## 5. Benchmark: published marketplace fees

Figures as published by each platform at the time of writing. Real charges vary
by account, country, plan and contract type, so treat them as a range, not a
quote.

| Marketplace | Freelancer fee | Client fee | Source |
| --- | --- | --- | --- |
| Upwork | 0–15% | up to 7.99% | <https://support.upwork.com/hc/en-us/articles/211062538> |
| Fiverr | typically 20% | 5.5% plus small-order fees | <https://help.fiverr.com/hc/en-us/articles/360049646033> |
| Freelancer.com | typically 10% | 3% or $3 minimum on fixed price | <https://www.freelancer.com/feesandcharges> |
| Gahonsh | none today | none today | `terms.html` §6, `pricing.html` |

Low or zero commission is only a differentiator if trust keeps up. That is why
the legal pages now state the payment model plainly instead of implying
protection that does not exist.

## 6. Verification

```
npm test
  a11y check passed: 20 pages verified.
  security check passed: 110 files verified.
  schema check passed: 64 client reference(s) resolved against 30 schema object(s).
  local engine check passed: 94 authorization case(s) verified.
  content check passed: 20 pages verified.
```

Browser checks: `index.html` renders 4 / 100% in the markup, in the DOM after
the script runs, and with the animation intact; `marketplace-dashboard.html`
shows the sign-in prompt instead of a stuck placeholder and loads a signed-in
member's projects; `terms.html` and `privacy-policy.html` render with one `<h1>`
and their crawlable summary intact. The full demo flow (proposal → shortlist →
hire → milestone delivered → accepted → contract completed → review) was walked
end to end in Chromium against the offline engine.

## 7. Points for the owner to confirm

These are policy choices written into the pages in this change. Confirm or edit
them before relying on the documents:

- retention periods (24 months for enquiries, 12 months after account closure);
- the 30-day notice before any future marketplace fee;
- the 7-day window to raise a dispute, 2 business days to acknowledge and 10
  business days for a written view;
- a deposit becoming non-refundable once work starts;
- governing law India and jurisdiction at Ranchi, Jharkhand;
- that a human really reviews samples before the verified badge is granted,
  because Terms §9 now says so;
- a legal review of both pages before they are treated as final.

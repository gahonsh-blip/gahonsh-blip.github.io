# AGENTS.md

Repository guide for AI agents and human contributors working on the
**Gahonsh Freelancing & Marketplace** GitHub Pages repository.

## Project Type & Runtime

- **Type:** Agency Website & Freelance Marketplace.
- **Frontend Runtime:** Vanilla HTML5 / CSS3 / JavaScript (ES6+), zero heavy build bundlers required.
- **Backend & Database:** [Supabase](https://supabase.com) (PostgreSQL 15+, Auth, Row-Level Security, Triggers, RPC) with a built-in browser-local fallback engine (`marketplace-local.js`) so the marketplace stays fully usable — browse, post, apply, hire — even when no Supabase project is reachable.
- **Hosting:** Hosted directly on **GitHub Pages** (`https://gahonsh-blip.github.io/`) from the `main` branch.
- **Preview Server:** Node.js static preview server (`server.js`) on Port 3000.

## Non-Negotiable Rules

1. **Never break a page.** Every HTML file is a standalone page with dedicated layout styling and scripts. Any structural change to shared headers/footers must be applied across all active pages.
2. **Keep paths relative.** Links and assets use relative paths (`index.html`, `assets/logo.png`, `theme.css`). Do not introduce absolute local paths.
3. **No secrets in code.** Never commit database service-role secret keys, admin passwords, or personal credentials. The public Supabase `anon` key, Formspree endpoint, and WhatsApp number are public client-side contact points.
4. **Preserve SEO & Metadata assets.** `sitemap.xml`, `robots.txt`, `metadata.json`, Open Graph meta tags, Google verification file (`googleb9deb43124fcee02.html`), and JSON-LD structured data must remain intact and updated when URLs change.
5. **Enforce Row Level Security (RLS).** Any new tables in `docs/marketplace-schema.sql` must enforce RLS and validate user identity (`auth.uid()`).
6. **Preserve Demo Fallback Capability.** `marketplace-local.js` is the offline data engine; `supabase-client.js` must keep preferring a reachable Supabase project and degrade to that local engine only when the project is unreachable (or a live request fails at the network layer). Pages gate on `window.isMarketplaceReady()`, never on raw `isSupabaseConfigured()`, so the marketplace stays fully testable before live credentials exist.
   - Do **not** fall back to the local engine for a *reachable* project that has merely not been migrated yet (missing table or bucket). That splits the user's identity — Auth stays on Supabase while data goes to a per-browser store — so a signed-in user is told to sign in and an "uploaded" file never reaches the other party. Surface the deployment gap instead: `isBackendNotProvisioned()` classifies the error and the file-transfer panel shows a setup message. See `docs/SETUP.md` for the migration step.
7. **Keep the schema and the client in step.** Any table, view or function the
   client reaches through PostgREST must exist in `docs/marketplace-schema.sql`
   (`npm run test:schema` enforces this). New tables need RLS plus policies, and
   new policies must be declared after the helper functions they call.

## Code Conventions

- **HTML:** Semantic sections with unique element IDs where required. CSS custom properties defined in each page's `:root` (`--bg-dark`, `--accent-cyan`, `--text-main`, etc.).
- **CSS:** Shared light-mode overrides and mobile touch-target rules in `theme.css`; page-specific styles in `<style>` blocks.
  - Never leave a hardcoded dark surface (e.g. `#070c19`, `#02050c`, a dark gradient) whose text is coloured by a theme variable: in light mode the variable turns dark and the text disappears. Add a `body.light-mode` override in `theme.css` that lightens the surface or fixes the text colour.
- **JS:** Plain ES6 functions, modules, and clear comments.
  - A `MutationObserver` must never observe mutations its own callback produces. `textContent` assignment always replaces the text node, so a painter that rewrites text inside an observed subtree re-triggers itself forever and hangs the tab. Guard by writing only when the value changed, and scope selectors to the specific placeholder (e.g. `.mt-rating[data-rating-uid]`, not every `[data-rating-uid]`).
- **Mobile Usability:** Maintain at least 48px minimum touch targets for all interactive mobile buttons, links, and drawer close controls. Long CTA and search rows must wrap or shrink instead of forcing a horizontal scroll at 390px or 320px; `npm run test:a11y` guards the home hero CTA and the jobs/talent search rows.
  - A grid or flex child keeps `min-width: auto`, so one unbreakable row inside a card (a long title next to a `nowrap` badge) widens the whole column past the viewport. Give the column `minmax(0, 1fr)` and the children `min-width: 0`, then wrap the inner row below 600px. Check with `document.documentElement.scrollWidth` against `window.innerWidth` in the browser; `test:a11y` guards the jobs card and the portal tab strip.

## Main Menu Contract

The header nav is duplicated in every page's inline markup, so the main menu
must be kept in sync manually. The shared behaviour lives in `theme.css`
(the `SHARED MAIN MENU` block); each page only needs the matching markup.

- **Items and order:** Home, Find Work, Find Talent, Post a Job, Portal, About,
  Services (dropdown), Portfolio, Pricing, Contact.
- **Active state:** mark exactly one desktop `<a>` and one mobile drawer `<a>`
  with `class="active"`. `job-details.html` marks Find Work; `home.html` marks Home.
- **Dropdown:** Services is a `.dropdown` wrapper containing `.dropdown-content`
  with `services.html#excel`, `#pdf`, `#web`.
- **Responsive:** the full nav needs about 1100px to fit on one line (home.html
  renders in a wider webfont), so `theme.css` collapses it below 1101px and
  shows the `.menu-toggle` hamburger. Do not rely on page-local breakpoints for
  the menu.
- **theme.css order:** the `theme.css` link must stay *after* the page's inline
  `<style>` block so the shared rules win the cascade. Do not add a second copy
  in `<head>`.

## SEO & Crawlable Content

- **Static content requirement.** JS-rendered listings (jobs, talent, portal,
  proposals) must always be backed by real copy in the HTML. Every indexable
  page carries a `.page-info` `<section>` just above the footer holding 500+
  words of crawlable body text, because audits and non-JS crawlers see only the
  raw HTML. Styles for it live in `theme.css` under `STATIC PAGE CONTENT`.
- **Heading outline.** Keep exactly one `<h1>` per page and do not skip levels
  (no `h2` -> `h4`). Footer column labels and card titles use
  `<p class="footer-heading">` / `<p class="project-name">`, not `<h4>`/`<h3>`,
  so they stay out of the outline.
- **Indexability contract.** Every URL in `sitemap.xml` must be indexable and
  must have at least one static inbound link from another page. Private pages
  (`admin.html`, `dasbord.html`, `dashboard.html`, `home.html`, `messages.html`,
  `thank-you.html`) stay `noindex` and out of the sitemap. `messages.html` shows
  one member's contract thread, so it must never be indexed or canonicalised.
- **Field names.** A placeholder is not a label. Every text, email, search,
  password, url, tel or number input and every `<textarea>` needs a `<label
  for>`, `aria-label`, `aria-labelledby` or `title`; `npm run test:a11y`
  enforces it.
- **Meta.** Each indexable page needs a unique `<title>`, a unique
  `<meta name="description">` (roughly 70-160 characters) and a
  `<link rel="canonical">` pointing at its own URL.
- **External links.** Any `target="_blank"` anchor must carry
  `rel="noopener noreferrer"`.
- **Stat counters.** The markup carries the real figure and it matches
  `data-target`; the script must never zero a counter at load, because a
  crawler or a fetch tool that runs the script and stops then reads "0 Live
  Projects". The count-up starts from zero only when the counter scrolls into
  view, and the observer sits behind an `IntersectionObserver` feature check.
  `npm run test:content` enforces both halves.
- **Known limitation.** The `www.` host does not resolve (`www.gahonsh-blip.github.io`
  returns no response). A redirect cannot be added on GitHub Pages without a
  custom domain, so link only to the apex `https://gahonsh-blip.github.io/`.

## Testing & Verification

- **Local Preview:** Run `npm run dev` (Node.js) or `python3 -m http.server 8000` (Python).
- **Automated checks:** `npm test` runs all five suites.
  - `npm run test:a11y` — static accessibility contract across all pages.
  - `npm run test:security` — flags inline-handler interpolation, unescaped
    `innerHTML` sinks, and hardcoded studio passcodes. Run it after touching any
    rendering code.
  - `npm run test:schema` — verifies every table/view/function the client
    reaches through PostgREST exists in `docs/marketplace-schema.sql`. Run it
    after adding a `.from(...)`, `.rpc(...)` or `/rest/v1/...` call, or after
    editing the schema. A missing object otherwise 404s only at runtime.
  - `npm run check:live` — not part of `npm test` (it needs the network). Probes
    the **deployed** project, using the URL and publishable key from
    `supabase-config.js` (or `SUPABASE_URL` / `SUPABASE_ANON_KEY`), for every
    object the client calls, and exits non-zero listing what is missing. Run it
    after deploying a schema change, and whenever a live page reports a missing
    table or function. `test:schema` only compares the client with the committed
    SQL: the live project was once missing `contact_messages`,
    `contract_milestones`, `admin_overview` and five RPCs while every test
    passed. `HTTP 401` on a table means it exists and RLS blocks `anon`, which
    is expected for `proposals` and `contracts`.
  - `npm run test:local` — runs `marketplace-local.js` in a sandbox and asserts
    it enforces the same access rules as the SQL policies (who may hire,
    withdraw, shortlist, list proposals, read a contract, change a job status,
    add / deliver / accept a milestone, complete a contract, write a review,
    and which status transitions are legal, plus the client → freelancer file
    transfer flow). Run it after editing the offline engine or the matching
    policies/RPCs in the schema.
  - `npm run test:content` — guards the trust and legal contract: a stat
    counter must print its real figure in the markup (a `0` there is what a
    crawler reads), `target="_blank"` links need `rel="noopener noreferrer"`
    (including the ones a script writes), the Terms and Privacy clauses must
    stay present, no page may claim payment protection the platform does not
    provide, private pages stay `noindex` and out of the sitemap, every page
    keeps one `<h1>` with no skipped level, and the portal keeps its
    `aria-live` / error state. See `docs/SITE-AUDIT-2026-11.md`.
- **Core Checks:**
  - Agency pages: Service flip cards, portfolio filters, FAQ accordions, Formspree form submission, WhatsApp deep links.
  - Marketplace pages: Job search & filters (`jobs.html`), proposal submission & hiring (`job-details.html`), job creation (`post-job.html`), talent directory (`find-talent.html`), portal tabs (`marketplace-dashboard.html`), in-site file send/receive (`job-details.html`, `marketplace-dashboard.html` contract cards), resume upload/view (`auth.js` profile modal, `find-talent.html`, `job-details.html` proposal cards), guided chat tasks (`chat-widget.js` — profile, job, proposal, resume handoff).
  - Auth & Theme: Sign in/out modal, role switching, light/dark mode persistence in `localStorage`.

## Contract Milestones, Proposal Review & Reviews

The three steps between "hired" and "done". All of them are records, not money
movement: there is still no escrow and no payment processing.

- **Milestones** (`contract_milestones`, `window.GahonshDB.Milestones`). The
  freelancer marks a milestone `delivered`; the client marks it `accepted` or
  sends it back to `pending`. `accepted` is final, a new row is forced to
  `pending`, and rows freeze once the contract is no longer `active`.
  `validate_milestone_mutation()` owns those rules in SQL; the offline engine
  must mirror them and `npm run test:local` asserts it.
- **Contract completion.** `contracts.status` only moves `active` →
  `completed`, and only once a milestone is accepted, so "completed" always
  means the client checked something. Do not add a client-side shortcut.
- **Proposal review.** Shortlist / decline go through the
  `set_proposal_status()` RPC; withdraw is the freelancer's own update. Hiring
  stays in `accept_proposal_and_create_contract()`, the only path that creates
  a contract. Never let `set_proposal_status()` accept `accepted`.
- **Reviews.** One per party per `completed` contract. The INSERT policy checks
  the contract and derives the other party; `sync_review_contract()` derives
  `job_id`; a unique index on `(contract_id, reviewer_id)` keeps the public
  average honest. `worker_ratings` publishes the aggregate.
- **Portal loading.** `initDashboard()` renders a guest sign-in prompt, an
  error card with **Try again**, and runs the activity load through
  `withPortalTimeout()`. Keep the timeout: a PostgREST call that never settles
  must not leave the placeholder on screen. `npm run test:content` guards it.
- Migration for existing projects:
  `supabase/migrations/20261127000000_add_milestones_and_review_rules.sql`.

## Resume Uploads (PDF)

Freelancers attach a CV from the profile editor (`auth.js` → Edit Profile).
The file goes to the private `resumes` Storage bucket at
`<user id>/resume.pdf`; only metadata (`resume_name`, `resume_size_bytes`,
`resume_updated_at`) is stored on `profiles`, and `public_profiles` exposes
`has_resume` plus the display name. Clients view it from the Resume button in
`find-talent.html` and on proposal cards in `job-details.html`. Viewing needs a
signed-in user because the bucket is private; anonymous visitors get a sign-in
prompt. The offline engine keeps the bytes in IndexedDB under
`resume:<user id>`.

Keep `uploadResume` / `getResume` / `removeResume` in step between
`supabase-client.js` and `marketplace-local.js`, and run `npm run test:local`
after changing either. Existing Supabase projects need
`supabase/migrations/20261123000000_add_freelancer_resumes.sql`; fresh
installs get the bucket and columns from `docs/marketplace-schema.sql`.

## Chat Assistant (guided tasks)

`chat-widget.js` answers questions from a curated knowledge base and can run
real tasks step by step: **post a job** (client), **build/update a profile**
(worker or client), **upload a resume** (worker) and **submit a proposal**
(worker). It calls the same `GahonshDB` services as the page forms, so RLS and
the offline fallback still apply. Every write is gated on sign-in and role; the
bot opens the normal auth modal and offers a **Continue** action. User input is
escaped before it reaches the chat log.

The task state lives in memory (`task` in the IIFE); it is deliberately not
persisted. Chat history is stored in `localStorage`. The chat panel uses
`z-index: 99998` so the auth and profile modals (`99999`) always sit above it.

Keep the knowledge-base action intents (`buildProfileBot`, `postJobBot`,
`proposalBot`, `uploadResumeBot`, `botHelp`) and the task step definitions in
step when a service field changes. See `docs/CHAT-ASSISTANT.md` for the
capability table, commands, safety rules and browser test steps.

## Chat Assistant (site-wide)

`chat-widget.js` is the assistant loaded on every page. It answers from a
curated knowledge base, runs guided tasks through `GahonshDB`, and audits a
saved profile or job post with a deterministic score. There is no LLM call and
no API key; keep it that way.

- **Audit engine.** `auditProfile()` and `auditJob()` return
  `{ score, items }` with `ok` / `warn` / `missing` states and both English and
  Hindi copy. `renderAudit()` escapes every value. The profile weights are
  name 10, title 20, location 10, skills 20, hourly rate 15, bio 15, resume 10
  (client: name 20, title 25, location 15, about 40); the job weights are title
  15, category 5, scope 30, budget 15, duration 10, experience 10, skills 15.
- **Guided fixes.** `startProfileFix()` / `startJobFix()` ask only the gaps,
  reuse `profileSteps()` / `jobSteps()`, save through
  `Profiles.updateMyProfile()` / `Jobs.updateJob()`, then re-audit. The job
  picker accepts a number, title, UUID, `job-*` or `demo-job-*` ID.
- **Auth changes clear private state.** `clearPrivateChat()` clears the log and
  `gc_hist`, resets the task, picker and quote flow, and bumps `chatEpoch`.
  Async reads/writes compare the epoch (and the task object) before rendering,
  so a late response cannot show the previous account's data. Do not remove
  these guards when adding a new async flow.
- **Bilingual.** `norm()` preserves Unicode combining marks (`\p{M}`), so
  Devanagari keywords such as `प्रोफाइल` match. Keep that behaviour.
- **Security.** User and DB values must stay behind `escapeHtml()` or
  `textContent`; `npm run test:security` scans this file. Never put an
  interpolated value into an inline handler.
- **Docs/tests.** See `docs/CHAT-ASSISTANT.md` and the chat section of
  `docs/BUG_REPORT.md`. `npm test` covers the static checks; browser flows use
  the demo accounts and `demo-job-1`.

## Owner Studio Editor (local only)

`dashboard.html` is a private visual editor served by `server.js`. Its write
APIs (`/api/save-page`, `/api/upload-file`, `/api/pages-list`) require the
`STUDIO_PASS` passcode, sent as the `x-studio-pass` header and checked in
constant time. The passcode is never stored in the page or committed: the page
verifies it against `/api/verify` and keeps it in `sessionStorage` for the tab.
If `STUDIO_PASS` is unset the server generates a random one and prints it on
startup. Never reintroduce a hardcoded passcode — `npm run test:security`
fails the build if one appears.

**Login.** There is no username/password pair and no default passcode. Start
the server with a passcode of your choice (`STUDIO_PASS=yourpass npm run dev`)
or read the random one it prints, then open
`http://localhost:3000/dashboard.html` and enter it. The dashboard only works
while `server.js` is running; on GitHub Pages it has no write API.

**Save model.** The editor fetches the page and previews it in an iframe with
`window.__GAHONSH_STUDIO_PREVIEW__` set before the page's own scripts run.
Every script that injects DOM at runtime (`script.js`, `auth.js`,
`chat-widget.js`, `marketplace-trust.js`) must bail out when that flag is set,
otherwise the injected widget is captured by `cleanForSave()` and baked into
the page. `cleanForSave()` also strips editor helpers, scroll-reveal classes
and the `light-mode` class before serializing, and the preview iframe is
recreated on each render so a re-render gets a fresh JS realm.

**Card templates.** The *add card* action injects markup into the edited page,
so each template must use that page's own classes. `services.html` styles
`.flip-card` / `.flip-front` / `.flip-back` inside `.services-flip-grid`;
`portfolio.html` styles `.project-card` and titles cards with
`<p class="project-name">` (a heading there would skip a level in the outline).
`pricing.html` uses `.pricing-card` with an `<h3>`.

**Save vs publish.** `/api/save-page` writes `.html`/`.htm` to the repo root
only, and `/api/upload-file` is limited to `images`, `assets/projects`,
`assets/media` and `assets/files`. A save updates the local file the server is
serving; it does **not** publish to GitHub Pages. To publish, commit and push
`main`. The UI labels say this — do not restore the old "LIVE" wording.

## Legal Pages & Public Claims

`terms.html` and `privacy-policy.html` are the contract with clients and
freelancers, so they change with the product, not after it.

- **Do not claim a feature the code does not have.** There is no escrow, no
  payment processing and no automated identity check. The platform records the
  amount and milestones agreed; money moves directly between client and
  freelancer. `npm run test:content` fails the build if a page says
  "payment verified", "escrow", "payment protection" or "money-back guarantee".
- **Name the processors.** The Privacy Policy lists GitHub Pages, Supabase,
  Formspree, cdnjs (Cloudflare), Google Fonts and WhatsApp (Meta). Add a new
  provider there in the same change that adds it to a page.
- **Keep the two pages in step.** A new fee, refund rule, retention period or
  dispute step belongs in the numbered clauses *and* in the `.page-info`
  summary that crawlers read.
- **Open items are tracked.** `docs/SITE-AUDIT-2026-11.md` records what is
  fixed, what is still missing (escrow, KYC, saved jobs, notifications,
  multi-currency) and which policy numbers the owner must confirm.

## Security Notes

- **File safety is a browser scan, not a server antivirus.** `file-transfer.js`
  scans content locally before upload and again before download. Do not
  reintroduce the retired external `scanFile` endpoint: it was credit-limited,
  the table has no verdict columns, and the download path stalled waiting for
  a `clean` status. The boundary and the optional ClamAV/VirusTotal design are
  documented in `docs/FILE-SAFETY.md`.
- The private `job-attachments` bucket keeps a 25 MB object limit and a MIME
  allow-list in `docs/marketplace-schema.sql` and
  `supabase/migrations/20261126000000_harden_file_transfers.sql`. Keep the
  browser extension list and the bucket allow-list in step.
- User- and DB-supplied values must never reach `innerHTML` unescaped. Escape
  with `escapeHtml()`/`escHtml()`, or set the value with `textContent`.
- Never place interpolated values inside inline `onclick`/`onchange`
  attributes — HTML entity decoding happens before the JS parser, so escaping
  is not enough. Use `data-*` attributes with event delegation instead.
- Numeric fields (budgets, bids, amounts) must be coerced with `Number(...)`
  before interpolation; PostgREST returns them as strings.
- Profile privacy is documented in `docs/SECURITY.md`: public reads use
  `public_profiles`, the private `profiles` table grants only safe columns,
  email is admin-only through `admin_profiles`, and `updateMyProfile()` is
  allow-listed and scoped to `auth.uid()`. Never grant `email`/`phone_number`
  to `anon` or `authenticated`, and never accept an `id` in a profile update.


## Enquiry Delivery

`contact.html` and the chat assistant's quote flow deliver an enquiry twice:
first to `contact_messages` (the owner dashboard), then to the Formspree
endpoint. The second call is not decoration — the live project was missing the
table, so every enquiry was lost while the form showed a polite error. Keep
both paths: the dashboard write is the record, the email is the safety net.
The success copy must match the path that succeeded (the chat reports which
one). Never hardcode the Supabase URL or publishable key outside
`supabase-config.js`; `npm run test:security` fails the build if one appears
elsewhere (a stale key in `chat-widget.js` was answering 401).

## External Services & Endpoints

- **Supabase Cloud:** Client-side integration via `supabase-client.js` & `auth.js`
- **Formspree Endpoint:** `https://formspree.io/f/xzdqnoez` (enquiry fallback)
- **WhatsApp Support:** `+91 88251 83628` (`wa.me/918825183628`)
- **Official Email:** `gahonsh@gmail.com`
- **Google Maps Embed:** `https://maps.app.goo.gl/bPxXtFfKWn3NzwhJ7`
- **Font Awesome:** Version 6.4.0 via cdnjs

See [ARCHITECTURE.md](ARCHITECTURE.md), [docs/SETUP.md](docs/SETUP.md), and [docs/DATABASE.md](docs/DATABASE.md) for full technical references.

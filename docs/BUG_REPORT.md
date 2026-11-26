# Bug Fix Report

Date: 2026-11-16
Scope: full repository audit of `gahonsh-blip.github.io` (vanilla HTML/CSS/JS +
Supabase marketplace, hosted on GitHub Pages) with fixes, plus the local
Owner Studio preview server (`server.js`).

Method: static audit of every page, stylesheet and script; a runtime sweep of
all pages in headless Chromium (console errors, warnings, failed requests,
4xx/5xx responses); `npm run test:a11y`; and a new dependency-free security
regression check `npm run test:security`.

## Summary

| # | Severity | Area | Bug | Status |
|---|----------|------|-----|--------|
| 1 | High | Stored XSS | `job-details.html` rendered unescaped DB/user values | Fixed |
| 2 | High | XSS | `auth.js` `showToast()` interpolated text into `innerHTML` | Fixed |
| 3 | High | Auth | Owner Studio guarded by a hardcoded passcode in the page | Fixed |
| 4 | High | Auth | `server.js` write APIs had no authentication at all | Fixed |
| 5 | Medium | XSS | `admin.html` row ids interpolated into inline `onclick` | Fixed |
| 6 | Medium | XSS | `dashboard.html` file names / URLs interpolated into `innerHTML` | Fixed |
| 7 | Medium | XSS | Numeric money fields used raw in `innerHTML` (4 pages) | Fixed |
| 8 | Low | SEO/content | `portfolio.html` had no `.page-info` crawlable section | Fixed |
| 9 | Low | Layout/CLS | `thank-you.html` logo `<img>` had no width/height | Fixed |
| 10 | Low | Console | `dashboard.html` preview iframe logged a sandbox warning | Fixed |
| 11 | Low | Privacy | `contact.html` Maps embed lacked `referrerpolicy` | Fixed |
| 12 | Medium | CSS cascade | 5 marketplace pages loaded `theme.css` before their inline `<style>`, inverting the documented cascade order | Fixed |
| 13 | Info | A11y | `dashboard.html` heading order skips `h1` → `h3` | Not a bug (private page) |
| 14 | High | Database | `contact_messages` table was missing from the committed schema, so every contact-form and chat-lead submission 404'd | Fixed |
| 15 | High | Database | `admin_overview()` RPC was missing, so the admin dashboard KPIs failed to load | Fixed |
| 16 | High | Database | `provision_admin_user()` could never promote the first owner — the immutability trigger rejected its own write, so `admin.html` was unreachable | Fixed |
| 17 | Low | Docs | `docs/DATABASE.md` documented a `reviews` table that the schema never created | Fixed |

## 1. Stored XSS in the job marketplace (High)

`post-job.html` accepts free-typed `required_skills` and a free-typed
description, stores them, and `job-details.html` renders them through
`assets/js/job-details-flow.js`. Several of those sinks used `innerHTML`
without escaping, so a job posted with a skill such as
`<img src=x onerror=alert(document.cookie)>` would execute for every visitor
who opened that job — a classic stored XSS in a multi-user marketplace.

Fixed by escaping every DB/user value that reaches `innerHTML`:
skills cloud, category/experience/duration badges, contract status, proposal
status, and the server error message. Budget and bid amounts are now coerced
with `Number(...)` before interpolation. The per-row hire button was moved
from an inline `onclick="hireFreelancer('${p.id}')"` to a
`data-proposal-id` attribute read by one delegated click listener, because a
value placed inside an inline handler is decoded from HTML *before* the JS
parser sees it — escaping alone cannot make it safe.

## 2. `showToast()` innerHTML sink (High)

`auth.js` built its toast as
`toast.innerHTML = '… <span>${message}</span>'`. `message` can be a server
error or an email the user typed. It now creates the icon and a `<span>`,
sets the span with `textContent`, and appends both, so no value is ever parsed
as markup.

## 3. Hardcoded editor passcode (High)

`dashboard.html` guarded the whole Owner Studio editor with
`const AUTH_PASS = "8825";`, and the login input even displayed
`placeholder="… (Default: 8825)"`. The file is published to GitHub Pages, so
the passcode was public to anyone who read the page source, and it also
unlocked the write APIs.

Fixed by removing the constant and the hint. The page now posts the entered
passcode to a new `/api/verify` endpoint and stores the verified value only in
`sessionStorage` for the tab. The passcode itself lives in the server
environment (`STUDIO_PASS`); see `.env.example`. Locking the editor clears
both `owner_auth` and the stored passcode.

## 4. Unauthenticated write APIs (High)

`server.js` exposed `POST /api/save-page`, `POST /api/upload-file` and
`GET /api/pages-list`, all of which write to (or read) the working tree with
no authentication. Anyone able to reach the preview server could overwrite any
allowed file or upload arbitrary content.

Fixed by adding `requireStudioAuth`, a constant-time passcode check
(`crypto.timingSafeEqual`) on all three routes plus the new `/api/verify`.
When `STUDIO_PASS` is unset the server generates a random passcode at startup
and prints it, so no secret is ever committed. Static file serving stays
public, as a preview server should be.

## 5. Inline handlers in the admin console (Medium)

`admin.html` rendered table rows with
`onclick="toggleVerify('${esc(p.id)}', …)"`. HTML-escaping the id is not
sufficient inside an inline handler, because the browser decodes entities
before the JS parser runs. Rows now carry
`data-action` / `data-id` / `data-value` attributes and a single delegated
listener on `#tableArea` dispatches to the three action functions.

## 6. `dashboard.html` innerHTML sinks (Medium)

The file-upload status line and the link-label editor interpolated
`file.name`, the returned upload URL, the formatted size and the operator's
link text straight into `innerHTML`. A file named `<img src=x onerror=…>`
would execute. All four now pass through a small local `escHtml()` helper.

## 7. Unescaped numeric money fields (Medium)

`job-details-flow.js`, `jobs.html` and `marketplace-dashboard.html`
interpolated `bid_amount`, `agreed_amount` and the budget fields directly.
These are numeric in the schema, but PostgREST returns them as strings, and a
string is a string until coerced. All are now wrapped in `Number(...) || 0`.

## 8. Missing crawlable content on the portfolio page (Low)

The repository contract requires every indexable page to carry a `.page-info`
section with 500+ words of static body copy, because non-JS crawlers only see
raw HTML. `portfolio.html` was the one indexable page without it. A section
with headings, paragraphs and internal links was added, and the heading
outline still passes (`h1` count 1, no skipped levels).

## 9. Missing image dimensions (Low)

`thank-you.html`'s logo `<img>` had no `width`/`height`, so the browser had to
reflow once the image loaded — a layout-shift (CLS) source. Explicit
`width="100" height="100"` were added to match the CSS box.

## 10. Preview iframe sandbox warning (Low)

`dashboard.html`'s editor iframe used
`sandbox="allow-scripts allow-same-origin allow-forms"`. A frame carrying both
`allow-scripts` and `allow-same-origin` can remove its own sandbox, so the
combination provides no isolation and Chrome logs a console warning. The
attribute was removed: the preview is same-origin content the parent writes
itself, and the parent needs `contentDocument` access for the editor.

## 11. Maps embed referrer policy (Low)

`contact.html`'s Google Maps iframe had no `referrerpolicy`. A
`no-referrer-when-downgrade` policy was added, matching best practice for
third-party embeds.

## 12. Inverted stylesheet cascade on marketplace pages (Medium)

`AGENTS.md` requires each page's `theme.css` link to sit *after* its inline
`<style>` block, so the shared rules (light-mode overrides, mobile touch
targets, shared main menu) win the cascade. Five pages — `jobs.html`,
`find-talent.html`, `post-job.html`, `job-details.html` and
`marketplace-dashboard.html` — linked `theme.css` in the head *before* the
inline block instead, so their page-local rules overrode the shared ones.

The visible effect: with light mode saved, the five pages kept the inline
dark background (`rgb(11,17,32)`) while every other page switched to the
shared light background (`rgb(248,250,252)`), and the shared
`.mobile-nav-close` light-mode rule never applied. Verified by reading computed
styles in headless Chromium with `theme=light` before and after the fix; all
six pages now report identical body, header and drawer-close colours.

Fixed by moving the single `<link rel="stylesheet" href="theme.css">` line to
just after the inline `</style>` on those five pages.

## 13. Heading order in the editor (Informational)

`dashboard.html` jumps `h1` → `h3` in its modal titles. It is a private,
`noindex` tool, so the SEO impact is nil; left unchanged to avoid churning the
editor markup.

## 14. `contact_messages` missing from the schema (High)

`contact.html` posts leads to `/rest/v1/contact_messages`, and
`chat-widget.js` posts quote requests to the same table, but
`docs/marketplace-schema.sql` never created it. On a project built from the
committed schema, every contact-form and website-chat submission failed with a
404 from PostgREST, so the site silently lost all enquiries. `admin.html` also
reads the table for its Enquiries list, which failed the same way.

The table was added with RLS enabled: anonymous and authenticated visitors may
`INSERT` a lead, and only the owner (`public.is_admin()`) may `SELECT`,
`UPDATE` or `DELETE`. A visitor can never read other people's submissions back
with the public key. The policies are declared in section 11, after
`is_admin()` exists, because a policy that references a function before it is
created fails to compile.

## 15. `admin_overview()` missing from the schema (High)

`admin.html` fills its KPI tiles by calling `client.rpc('admin_overview')`, but
no such function existed, so the dashboard's counters never loaded. Added as a
`SECURITY DEFINER` function returning JSONB with the exact keys the page reads
(`workers`, `clients`, `verified_workers`, `open_jobs`, `proposals`,
`active_contracts`, `contract_value`). It raises `42501` unless
`public.is_admin()`, so the aggregate counts are never exposed to non-owners.
Execute is granted to `authenticated` only.

## 16. The first owner could never be created (High)

`provision_admin_user()` is the documented, `service_role`-only way to promote
a user to `admin`. It was unusable: `protect_profile_immutable_fields` (a
`BEFORE UPDATE` trigger) guards `role`, `is_verified` and `email` with
`IF NOT public.is_admin() THEN RAISE`, and it is `SECURITY DEFINER`. Two
independent reasons made that check always fail for this call:

1. `current_user` inside a `SECURITY DEFINER` function is the function's owner,
   not the caller, so a role check on it cannot work at all.
2. During bootstrap there is no admin yet, so `is_admin()` is false by
   definition — the function that creates the first admin was blocked by the
   rule that only an admin may set a role.

Net effect: `admin.html` was unreachable on any project built from this schema.
Verified by running the schema against a real PostgreSQL 17 instance and
calling `provision_admin_user()` as `service_role`; it raised
`Unauthorized: Direct modification of role…`.

Fixed by also accepting callers whose PostgREST role is `service_role`, read
from the `role` GUC (`current_setting('role', true)`), which PostgREST sets to
the JWT role and which survives into a `SECURITY DEFINER` function. A normal
signed-in user's role is `authenticated`, and an anonymous visitor's is `anon`,
so self-promotion stays blocked. Confirmed both ways: `service_role` promotes
the first owner, while an `authenticated` freelancer updating their own row to
`admin` is still rejected.

## 17. `reviews` table documented but never created (Low)

`docs/DATABASE.md` listed a `reviews` table with its RLS policies, but the
schema never created it and no client code uses it. The documentation row was
replaced with the real `contact_messages` table, and a note records that
`reviews` is not implemented so nobody builds a review UI against a
non-existent table.

## Verification

- `npm run test:a11y` — 19 pages, passes.
- `npm run test:security` — new check: inline-handler interpolation, unescaped
  `innerHTML` sinks, and hardcoded studio passcodes. 30 files, passes.
- `npm run test:schema` — new check: every `.from('x')` / `.rpc('x')` /
  `/rest/v1/x` reference in the client resolves to an object in
  `docs/marketplace-schema.sql`. 30 references, passes. Negative-tested by
  removing the table and confirming it fails on all four call sites.
- `docs/marketplace-schema.sql` executed against PostgreSQL 17 (with `auth`
  stubbed) — loads clean and is idempotent on a second run.
- RLS and bootstrap verified end-to-end in that database: anon inserts a lead
  but reads none back; signup creates a freelancer; `service_role` promotes the
  first owner; the owner reads leads and gets the `admin_overview()` KPI keys;
  a non-admin can neither read leads, call `admin_overview()`, nor self-promote.
- Headless-Chromium sweep of all pages: 0 console errors, warnings or failed
  requests.
- Server auth exercised with `curl`: no/wrong passcode → 401, correct → 200,
  static assets stay 200.
- Editor login exercised end-to-end: wrong passcode rejected, correct passcode
  unlocks and loads `index.html` into the preview.

---

# Live-site follow-up — 2026-11-23

Scope: the live GitHub Pages deployment (`https://gahonsh-blip.github.io/`)
plus the linked finance site under `/finance/`. Focus: light-mode text that
was hard to read and reports of pages that appeared to hang or crash Chrome on
load.

Method: headless Chromium at 1440×1000 and 390×844 (4× CPU throttle), both
light and dark themes, on 18 main pages and 11 finance pages. Captured console
errors, `pageerror`, dialogs, failed requests, 4xx responses, long tasks and an
alpha-composited WCAG contrast scan of every visible text node.

## Summary

| # | Severity | Area | Bug | Status |
|---|----------|------|-----|--------|
| 1 | Medium | Light mode | Accent `#0284c7` reached only 4.1:1 on white and 3.6:1 on tinted pills; active nav, category pills and links were hard to read | Fixed (`#0369a1`) |
| 2 | Medium | Light mode | `.project-tag` pills sit on a dark thumbnail but used the dark light-mode accent (3.33:1) | Fixed (light pill + dark text) |
| 3 | Medium | Contrast | Contact page WhatsApp button was white on `#25d366` (1.98:1) | Fixed (`#0f7a3d`, 5.6:1) |
| 4 | Medium | Load | Scroll-reveal cards could stay at `opacity: 0` if `IntersectionObserver` never fired | Fixed (2.5s fail-safe reveal) |
| 5 | Low | Redirect | `finance/index.html` meta refresh pointed at `/site/` (404) instead of `/finance/site/` | Fixed |
| 6 | Low | PWA | Finance manifest `id`/`start_url`/`scope`/icons used root `/site/` paths | Fixed |

## 1–2. Light-mode text contrast

`theme.css` sets the light-theme accent in `body.light-mode`. It was
`#0284c7`; against the page background `#f8fafc` that is 3.91:1, and against
the `rgba(2,132,199,.08)` active-nav tint it is 3.7:1. Both are below the WCAG
AA 4.5:1 threshold for normal text, so links, badges and the active menu item
looked washed out. The accent is now `#0369a1` (5.9:1 on white, 5.6:1 on the
tint).

Portfolio thumbnails keep a dark image overlay in both themes, so the
`.project-tag` pill needs a light surface in light mode. It now uses a white
pill with `#0369a1` text instead of the dark accent on a dark overlay.

`npm run test:a11y` now computes the contrast of the light accent, the theme
toggle background and the WhatsApp button, and fails the build below 4.5:1.

## 3. WhatsApp button

`.btn-whatsapp-direct` on `contact.html` used white text on `#25d366`
(1.98:1). The background is now `#0f7a3d` (5.6:1), with the shadow matched to
the new green.

## 4. Scroll-reveal fail-safe

`script.js` hides below-the-fold cards with `.gs-hide` and reveals them from
an `IntersectionObserver`. If the observer never reports (background tab,
zero-height container, browser quirk), the cards stay invisible. A 2.5-second
fail-safe now removes `.gs-hide` from anything still hidden and adds the
visible classes, so content cannot stay blank.

## 5–6. Finance redirect and manifest

`finance/index.html` carried both a script redirect to `/finance/site/` and a
meta refresh to `/site/`, which 404s on GitHub Pages. The meta refresh now
matches the script. `finance/site/manifest.webmanifest` used `/site/` for its
`id`, `start_url`, `scope` and icon URLs, so a PWA install or icon fetch hit
the 404 root path; all now use `/finance/site/`.

## Load-audit result

No uncaught JS errors, page errors, dialogs, failed requests or long tasks were
reproduced on the 18 main pages at desktop or mobile sizes. The finance pages
log 404s only for the optional `/api/public/config` and
`/api/public/loan-products` backend calls; the app already falls back to its
bundled catalogue, so the pages render. The only reproducible load-blocking
patterns were the finance redirect race and the reveal fail-safe above, both
fixed.

## Verification

- `npm test` — a11y (20 pages), security (115 files), schema (47 references)
  and local engine (17 cases) all pass.
- Alpha-composited contrast sweep of 13 main pages in light and dark themes —
  0 violations below 4.5:1 (3:1 for large text).
- Desktop and mobile load sweep — 0 console errors, page errors, dialogs or
  failed requests.

---

# Profile privacy & authorization audit — 2026-11-23

Scope: who may read or change a marketplace profile, and whether email,
phone number or password material can leak. Reviewed
`docs/marketplace-schema.sql`, `supabase-client.js`, `marketplace-local.js`,
`auth.js`, `chat-widget.js`, `admin.html` and the profile callers.

## Summary

| # | Severity | Area | Bug | Status |
|---|----------|------|-----|--------|
| 1 | High | Offline engine | `publicProfile()` was a black-list: it removed `_salt`/`_hash` but returned `email`, `_email` and `phone_number`, so the demo talent directory exposed private contact data | Fixed |
| 2 | High | Schema install | `docs/marketplace-schema.sql` granted only the resume columns after the view but never revoked the default table-level `SELECT`, so a fresh install could expose `email`/`phone_number` | Fixed |
| 3 | Medium | Client update | `updateMyProfile()` used a black-list and accepted unknown fields; no client-side validation | Fixed (allow-list + validation) |
| 4 | Medium | Admin email | `admin.html` read `email` from `profiles`; granting that column to all authenticated users would expose every email | Fixed (`admin_profiles` view gated by `is_admin()`) |
| 5 | Info | Passwords | Supabase Auth owns passwords; the offline engine stores a salted SHA-256 hash only, never plaintext | Verified |

## 1. Offline public profile leaked private fields

`publicProfile()` returned the whole profile row after deleting `_salt` and
`_hash`. Every demo profile carries `_email`, and real local profiles can carry
`email`/`phone_number`, so `getPublicFreelancers()` and `getPublicProfile()`
handed those to any caller. It is now an explicit allow-list that matches the
`public_profiles` view: `id`, `full_name`, `avatar_url`, `role`, `location`,
`bio`, `title`, `hourly_rate`, `skills`, `is_verified`, `created_at`, resume
metadata and `has_resume`. A new private column cannot leak by default.

## 2. Fresh schema install could expose email and phone

The hardening migration `20250913000000_harden_profiles_column_privileges.sql`
revoked table-level `SELECT`, but the canonical schema file only added the
resume-column grant. Running the schema alone on a fresh Supabase project left
the default grants in place. The schema now revokes table-level `SELECT` and
grants only the safe directory columns, so the install and the migration agree.

## 3. Profile updates are now allow-listed

Both `supabase-client.js` and `marketplace-local.js` accepted a payload and
removed a few known-bad keys. A future column (or an alias such as `_email`)
could slip through. Both now copy only `full_name`, `avatar_url`, `location`,
`bio`, `title`, `hourly_rate`, `skills` and `phone_number`, validate the values,
and keep the update scoped to the signed-in user (`auth.uid() = id` in SQL,
`profiles[index]` in the offline engine). `id`, `email`, `role`, `is_verified`,
`_salt`, `_hash` and `_email` are never writable through this path. The SQL
`protect_profile_immutable_fields` trigger remains the second line of defence.

## 4. Admin email without a public email grant

`admin.html` needs contact email. Granting `email` to `authenticated` while the
`profiles` read policy is public would expose every address. The new
`admin_profiles` view is owned by the schema owner and filtered with
`WHERE public.is_admin()`: an admin sees all rows, a signed-in non-admin sees
zero rows, and anonymous callers have no grant. `admin.html` uses the view and
falls back to the safe columns plus `session.user.email` on an older
deployment that has not applied the migration.

## 5. Password handling

Supabase Auth stores password hashes outside `public.profiles`; the client never
selects `auth.users`. The offline engine stores only a per-user salt and a
SHA-256 hash, and the new public allow-list removes both. The profile editor and
the chat assistant never receive them.

## Verification

- `npm run test:local` — 28 cases, including: anonymous cannot update; public
  and own profiles exclude `email`, `phone_number`, `_email`, `_hash`, `_salt`;
  a crafted update with another `id` cannot edit that row; `role`,
  `is_verified`, `email`, `_hash` and `_salt` cannot be changed; invalid name,
  rate, skills and avatar URL are rejected.
- `npm run test:security` — asserts the schema revokes table-level `SELECT`,
  the safe grant excludes `email`/`phone_number`, `public_profiles` excludes
  them, and `admin_profiles` exists and is gated by `is_admin()`.
- `npm run test:schema` — 50 client references resolve against 22 schema
  objects, including the new `admin_profiles` view.
- RLS UPDATE remains `auth.uid() = id OR public.is_admin()`, and the trigger
  blocks self-service `role` / `email` / `is_verified` changes.

---

# Chat assistant audit & guided fixes — 2026-11-23

Scope: the `chat-widget.js` profile/job audit engine, the guided fix flows, the
bilingual matcher, auth-change privacy and `Jobs.updateJob()` in
`supabase-client.js` / `marketplace-local.js`.

## Summary

| # | Severity | Area | Bug | Status |
|---|----------|------|-----|--------|
| 1 | High | Privacy | A previous account's chat log and `gc_hist` survived sign-out or an account switch on a shared browser | Fixed |
| 2 | High | Privacy | An in-flight audit or save could render the previous account's profile/job after the chat was cleared | Fixed |
| 3 | High | Functional | Job links with the offline `demo-job-*` IDs were rejected by `extractJobId()` | Fixed |
| 4 | Medium | Bilingual | Devanagari keywords did not match because `norm()` stripped combining marks | Fixed |
| 5 | Medium | UX | Role-specific chips stayed stale when the visitor signed in with the chat already open | Fixed |
| 6 | Medium | Privacy | The quote form (`flow`) survived a sign-out and could take the next message | Fixed |
| 7 | Low | A11y | Light-mode audit warnings used the dark-theme amber and red | Fixed |
| 8 | Low | Robustness | A synchronous `getCurrentUser()` throw could stop the chat widget from initialising | Fixed |
| 9 | Info | Service gap | The job-fix flow needed `Jobs.updateJob()`, which neither client provided | Added |

## 1. Previous account's chat survived an auth change

`chat-widget.js` kept its log, `localStorage` history and in-memory task when
the user signed out or signed in as someone else. On a shared browser the next
visitor could read the previous profile audit, job titles or proposal details.
The widget now watches `GahonshDB.Auth.onAuthStateChange`, clears the log and
`gc_hist`, resets the task, job picker, quote flow and greeting, and shows a
short "previous chat was cleared" message.

## 2. Late responses could leak the previous account's data

Clearing the DOM was not enough while an audit or save was awaiting the
service. The continuation still held the old profile/job and could append it
after the clear. A `chatEpoch` counter is bumped on every auth change, and
`startProfileAudit`, `startJobAudit`, `startProfileFix`, `greetUser`,
`handleContinue`, `startResumeUpload`, `startTask` and `submitTask` compare the
epoch after each await. `submitTask` and `handleTaskInput` also compare the
task object, so a late result cannot mutate a replacement task. The service
call may still complete for the old account, but its result is never rendered
in the new session.

## 3. Demo job links were rejected

`extractJobId()` accepted UUIDs and IDs starting with `job-` / `job_`. The
site's own demo job link is `job-details.html?id=demo-job-1`, so the proposal
and job-check steps answered "That does not look like a job link or ID." The
pattern now accepts `demo-job-*`, and the ID is lower-cased. Verified with the
proposal flow: `demo-job-1` advanced to the bid step and saved a proposal.

## 4. Devanagari keywords did not match

`norm()` removed every character in `\p{M}`, which includes the vowel signs
and virama that Hindi/Devanagari needs. `प्रोफाइल` was reduced to a different
string from the keyword. The normaliser now preserves combining marks while
still lower-casing and collapsing whitespace. Verified: the Hindi profile
audit heading and items render in Devanagari.

## 5. Stale role-specific chips

The greeting and its chips ran only when the panel opened. A visitor who
opened the chat as a guest and then signed in kept the guest chips. The
`SIGNED_IN` handler now calls `greetUser()` when the panel is open and no task,
pending task, job picker or quote form is active, and a `greetedUserId` guard
prevents duplicate welcomes. The freelancer chips also include **Submit a
proposal**.

## 6. The quote form survived a sign-out

`clearPrivateChat()` reset the task and picker but not `flow`, so a signed-out
visitor could still be asked for the previous account's quote details. It now
resets `flow` to idle.

## 7. Light-mode audit warnings were hard to read

The audit card used the dark-theme amber (`#f59e0b`) and red for `warn` and
`missing` items. On the light card those colours were low-contrast. `theme.css`
now sets `#b45309` (amber) and `#b91c1c` (red) in light mode. The browser check
reported `rgb(180, 83, 9)` and `rgb(185, 28, 28)` against the light background.

## 8. A synchronous auth probe could stop the widget

`watchPrivateChatAuth()` called `auth.getCurrentUser()` inside
`Promise.resolve(...)`, which still evaluates the call synchronously. A custom
or broken auth implementation that throws would abort the rest of the widget
setup. The probe is now wrapped in `try/catch`; auth state remains optional.

## 9. Job edits needed a service

The **Improve this job** flow cannot save through `createJob()`. Both clients
now expose `Jobs.updateJob(jobId, updates)`:

- `supabase-client.js` strips `id`, `client_id`, counters, `status` and
  timestamps, coerces numeric budget fields, normalises `required_skills`, and
  refuses a job whose status is `completed` or `cancelled`.
- `marketplace-local.js` mirrors the owner-or-admin UPDATE policy and the SQL
  CHECK constraints (title length, description length, category, job type,
  experience level, non-negative and ordered budgets/rates), and refuses a
  closed job.
- `scripts/check-local-engine.mjs` now covers an owner edit, a non-owner
  refusal, immutable fields and a closed-job refusal.

## Verification

- `npm test` — all four suites pass. `test:local` now reports 32 authorization
  cases, including the four new job-edit cases.
- Browser E2E (headless Chromium, Supabase network aborted, offline engine):
  - Profile audit `20/100` → fix flow → `90/100`; the remaining gap is the
    resume.
  - Job audit `40/100` → fix flow → `100/100`.
  - Job posting flow: 8 steps, review, save, re-audit `100/100`.
  - Proposal flow: `demo-job-1`, bid, days, cover letter, save.
  - Hindi audit renders Devanagari; light mode shows the corrected warning
    colours; a 390 px viewport keeps 48 px chips and a contained panel.
  - Sign-out clears the log and history; signing in as another demo account
    shows the "different account" message and the new role chips.

---

# Mobile layout audit — 2026-11-23

Scope: 320 px and 390 px viewports across 14 public pages, in dark and light
mode. The browser run also checked page errors, dialogs, failed requests,
broken images and unresponsive-page timeouts.

## Summary

| # | Page | Bug | Status |
|---|------|-----|--------|
| 1 | `index.html` / `home.html` | The hero CTA row was 456 px wide on a 390 px screen, clipping **Start Your Project** on the left and **Ask the Assistant** on the right | Fixed |
| 2 | `jobs.html` | The search input's intrinsic width pushed the **Search Jobs** button past a 320 px viewport | Fixed |
| 3 | `find-talent.html` | The same search-row overflow appeared at 320 px, clipping the **Search** button | Fixed |

## 1. Home hero CTA row

`.cta-group` was `display: flex` with a 20 px gap and no wrapping. The three
buttons need 456 px, so at 390 px the group started at `left: -33` and ended at
`right: 423`, and `document.documentElement.scrollWidth` was 423. The row now
uses `flex-wrap: wrap` and `justify-content: center`, so the buttons stack and
centre on narrow screens. Measured at 390 px: the group is 328 px wide,
`left: 31`, `right: 359`, and `scrollWidth` equals `innerWidth` (390).

## 2. Jobs search row

The input had `flex: 1` but no `min-width: 0`, so its placeholder's minimum
content width kept the flex row wider than the container. The button was
clipped at 320 px. The input now has `min-width: 0` and the button has
`flex-shrink: 0`; the input truncates and the button stays fully visible.
Measured at 390 px: the wrapper is 343 px wide and the button ends at 358.

## 3. Find-talent search row

The same pattern in `.search-talent-box` overflowed by 42 px at 320 px, with
the **Search** button ending at `right: 362`. The input now has
`min-width: 0` and the button `flex-shrink: 0`. Measured at 320 px:
`scrollWidth` equals `innerWidth` (320).

## Verification

- `npm run test:a11y` passes and now fails if any of the three rules is
  removed.
- Headless Chromium at 390 px and 320 px: `index.html`, `jobs.html` and
  `find-talent.html` all report `scrollWidth === innerWidth`.
- The same run covered the other public pages: no page errors, dialogs, failed
  requests, broken images or unresponsive-page timeouts.
- Screenshots confirm the stacked hero CTAs and the fully visible search
  buttons.

## 2026-11-23 — File transfer and light-mode follow-up

| Severity | Area | Bug | Status |
| --- | --- | --- | --- |
| High | File transfer | The upload scanner called an external `scanFile` endpoint that returned HTTP 402, and `file_transfers` has no scan columns, so the download path waited forever for a `clean` verdict | Fixed: browser safety scan with a local verdict |
| High | File transfer | The download handler called an undefined `scan()` and `sanitizeFileName()` was scoped inside `mount()`, so opening a project with a file threw a page error and froze the panel | Fixed: module-level download helper and in-browser scan |
| High | Access control | A freelancer lost read access as soon as a contract was completed, so delivered files disappeared; uploads were still allowed on completed work | Fixed: completed contracts are readable and read-only |
| Medium | Storage | The private `job-attachments` bucket had no size or MIME limit, so a caller could bypass the page scanner through the Storage API | Fixed: 25 MB limit and MIME allow-list in the schema and migration |
| Medium | Light theme | `.step-num` inherited dark body text on the blue step circle (2.89:1 contrast) and became unreadable | Fixed: white text in light mode |
| Low | Docs | There was no user-facing explanation of what the scanner does and does not guarantee | Fixed: `docs/FILE-SAFETY.md` |

Verified with a two-account local flow: client uploads a brief, hired
freelancer downloads it and sends a reply, client downloads the reply, and the
files remain readable after the contract is completed. `npm test` now covers
the same authorization rules in the local engine.

## 2026-11-24 — Counters, portal loading and the missing engagement steps

| Severity | Area | Bug | Status |
| --- | --- | --- | --- |
| Medium | Homepage / About / Contact | The count-up script zeroed every `.counter-num` on load, so a crawler, a fetch tool or a screenshot read "0 Live Projects" while the markup said 4 | Fixed: no load-time zeroing; the animation starts from zero only when the counter enters the viewport |
| Medium | Homepage / About / Contact | `new IntersectionObserver(...)` ran unguarded, so a browser without it threw and took the rest of the inline script (back-to-top, newsletter) down with it | Fixed: behind an `IntersectionObserver` feature check |
| Medium | Marketplace portal | `try/catch` covered a failed request but not one that never settles, so a stalled PostgREST call left "Loading your projects, proposals and contracts…" on screen indefinitely | Fixed: `withPortalTimeout()` renders the retry card after 20 s |
| Medium | Proposals | A client could only hire or reject, and a freelancer could only wait; there was no shortlist step and no way to withdraw a bid | Fixed: `set_proposal_status()` RPC plus **Shortlist**, **Decline** and **Withdraw** |
| High | Contracts | Nothing recorded what was delivered, so "completed" meant only that someone pressed a button, and there was no way to review the other party | Fixed: `contract_milestones`, a delivery/accept state machine, and one review per party on a completed contract |

### 1. Stat counters

The markup carried `data-target="4"` with the real figure as its text, and the
first audit pass fixed the `0` that used to sit in the HTML. The script still
ran `counters.forEach(c => { c.textContent = '0'; ... })` on every load
though, so anything that executed the script and then stopped — a JS-capable
crawler, a fetch tool, a screenshot, a tab that never scrolled — read 0. The
zeroing is gone: the figure stays in the DOM and the count-up starts from zero
only once a counter is actually on screen. Verified in Chromium: the hero reads
4 / 100% before, during and after the animation, and the animation still runs
when the counter scrolls into view.

`scripts/check-content.mjs` now fails the build if `counters.forEach(...)`
writes `'0'` again, and it was checked against the previous revision of
`index.html` to confirm it catches the old code.

### 2. Portal loading state

`initDashboard()` caught a rejected request but awaited it with no deadline. A
request that never settles therefore left the placeholder in place with
`aria-busy="true"`. `withPortalTimeout()` races the activity load against a
20-second timer and renders the existing retry card on timeout; the late
response still paints if it arrives. The guest sign-in prompt, the
`isBackendNotProvisioned()` setup message, the empty states and the
`<noscript>` fallback were already in place.

### 3. Proposal review and milestones

Walked end to end in Chromium against the offline engine as **Apex Global
Logistics** (client) and **Aditya Sharma** (freelancer): submit a proposal on
`demo-job-1`, shortlist it, hire, add a milestone, mark it delivered, accept
it, complete the contract, submit a review. Each step re-rendered after a
reload. The rules are enforced in SQL (`validate_milestone_mutation()`,
`set_proposal_status()`, the reviews INSERT policy, the unique index on
`(contract_id, reviewer_id)`) and mirrored in `marketplace-local.js`, which
`npm run test:local` now covers with 94 cases.

### Verification

```
npm test
  a11y check passed: 20 pages verified.
  security check passed: 110 files verified.
  schema check passed: 64 client reference(s) resolved against 30 schema object(s).
  local engine check passed: 94 authorization case(s) verified.
  content check passed: 20 pages verified.
```

---

## 2026-11-24 (second pass) — live deployment gap, lost enquiries, milestone freeze

Scope: the deployed Supabase project (`evdpmombgymthzqegqwr`) behind
`gahonsh-blip.github.io`, the contact and chat enquiry paths, and the
milestone → completion → review lifecycle. Method: probe every PostgREST
object the client uses against the live project, then walk the marketplace
flows in headless Chromium against the offline engine with the live project
blocked at the network layer.

| # | Severity | Area | Bug | Status |
|---|----------|------|-----|--------|
| 1 | Critical | Leads | The live project has no `contact_messages` table, so every contact-form enquiry failed and was lost | Fixed (Formspree fallback) |
| 2 | High | Security | `chat-widget.js` hardcoded a stale publishable key that the project rejects with `401 Invalid API key` | Fixed |
| 3 | High | State | A contract could be completed with a milestone still open; milestones freeze on completion, so the row could never be resolved | Fixed |
| 4 | High | Deployment | Nine objects the client calls were missing from the live project and no check could see it | Fixed (`npm run check:live`) |
| 5 | Low | Copy | The chat said "the enquiry is in the dashboard" even when only the email fallback ran | Fixed |

### 1. Enquiries were lost on the live site (Critical)

`contact.html` posted to `{project}/rest/v1/contact_messages`. The live project
answers that path with `PGRST205 — Could not find the table`, so the form
showed "Could not send your message just now. Please email … or WhatsApp us
instead." and the enquiry never reached the owner. The chat assistant's quote
flow failed the same way (it shows a graceful message, but the lead was still
lost).

The form now writes to the dashboard first and posts the same JSON to the
documented Formspree endpoint (`https://formspree.io/f/xzdqnoez`) second. It
redirects to `thank-you.html` when either path succeeds and only shows the
error when both fail. `chat-widget.js` follows the same order and reports which
path was used. Verified in Chromium with `window.fetch` stubbed to reproduce
each of the three outcomes: dashboard only, dashboard → email, both failing.

### 2. Stale publishable key in the chat widget (High)

`submitLead()` fell back to
`sb_publishable_Fe8rUHg-7tN3RpxhjPijw_fX4c786Z` when
`window.GAHONSH_CONFIG.SUPABASE_ANON_KEY` was unset. The project answers that
key with `401 {"message":"Invalid API key"}`, and the correct key is
`sb_publishable_2r2qEViIYoChRsXGFvpGqg__PeH8GFy` in `supabase-config.js`. The
fallback is removed — the widget reads the config only — and
`npm run test:security` now fails when any file other than
`supabase-config.js` contains a publishable key or a project URL.

### 3. Completing a contract froze an open milestone (High)

Milestone rows are only writable while the contract is `active`
(`validate_milestone_mutation()`), and the offline engine mirrors that. The
client could still press **Mark complete** with a `pending` row, and the card
then read "COMPLETED · 1 of 2 accepted" with no way to accept or remove the
remaining row. **Mark complete** now lists the open milestones and refuses;
accepting or removing them first completes normally. A deployment without the
`contract_milestones` table returns `[]` and is not blocked.

### 4. The deployed project was behind the committed schema (High)

`npm run test:schema` compares the client with `docs/marketplace-schema.sql`,
so every test passed while the live project was missing:

| Object | Live response | Effect |
|---|---|---|
| `contact_messages` | `PGRST205` | Contact form and chat leads lost |
| `contract_milestones` | `PGRST205` | Milestone panel shows the setup message |
| `admin_profiles` | `PGRST205` | Owner console cannot read contact email |
| `admin_overview` | `PGRST202` | Owner KPIs empty |
| `set_proposal_status` | `PGRST202` | Shortlist / decline unavailable |
| `get_my_record`, `get_worker_record`, `get_client_record` | `PGRST202` | Records tab unavailable |
| `complete_contract` | `PGRST202` | Client sign-off unavailable |

`proposals` and `contracts` answer `401` because RLS blocks the anonymous
role, which is correct. The new `npm run check:live` probes each object and
lists what is missing; `docs/SETUP.md` documents re-running the idempotent
schema script and verifying with that command.

### 5. Chat success copy claimed the wrong destination (Low)

`finishQuote()` always said "the enquiry is in the dashboard". With the email
fallback the row is not in the dashboard, so the copy now depends on the path
that succeeded.

### Verification

```
npm test
  a11y check passed: 20 pages verified.
  security check passed: 111 files verified.
  schema check passed: 64 client reference(s) resolved against 30 schema object(s).
  local engine check passed: 94 authorization case(s) verified.
  content check passed: 20 pages verified.
```

Browser flows (headless Chromium, offline engine, `*supabase.co*` blocked):
contact form all three delivery paths; chat quote flow with the dashboard
write failing; milestone add → deliver → accept → complete → review as both
parties; completion refused with an open milestone and allowed after removing
it.

---

## 2026-11-24 (third pass) — phone layout, probe storm, sign-up validation

Scope: every public page rendered in headless Chromium at 390×844 and 320×568
with the live project blocked, plus the auth and proposal flows. Method: a CDP
harness that loads each page, measures `document.documentElement.scrollWidth`
against the viewport, walks the DOM for elements that widen it, audits text
contrast in both themes, and drives the marketplace forms; `npm test` for the
static contract.

| # | Severity | Area | Bug | Status |
|---|----------|------|-----|--------|
| 1 | High | Mobile layout | `jobs.html` scrolled 45 px sideways at 320 px: a grid child's `min-width: auto` let a job card widen the single column to 347 px | Fixed |
| 2 | Medium | Mobile layout | `marketplace-dashboard.html` tab strip was 404 px wide at 390 px, cutting off `My Record` | Fixed |
| 3 | Medium | Performance / console | An unreachable project was probed five times per page load and logged five identical warnings | Fixed |
| 4 | Medium | Auth | The offline engine accepted a 3-character password and a malformed email that Supabase Auth refuses | Fixed |
| 5 | Info | A11y | Light-mode text contrast, jobs/talent search, proposal submit and duplicate guard, chat launcher | Verified, no defect |

### 1. The jobs page scrolled sideways on a phone (High)

`jobs.html` is a two-column grid. Below 900 px it collapses to one column, but a
grid item's automatic minimum is `min-content`, not zero, so the column was
sized by its widest child. `.job-card-header` is a flex row holding the title
and a `white-space: nowrap` budget badge; together they could not shrink below
293 px, and the card's 26 px padding made the card 347 px inside a 320 px
viewport. The filter sidebar then inherited that width and the page gained
45 px of horizontal scroll — the one thing the repository rules say must not
happen at 320 px.

Fixed with `minmax(0, 1fr)` for the collapsed column, `min-width: 0` on the
grid children, and a 600 px block that wraps the card header and footer and
lets the budget badge break. Measured: `scrollWidth` 365 → 312 at 320 px.

### 2. The portal tab strip pushed the last tab off-screen (Medium)

`.portal-tabs` was `display: flex` with no `flex-wrap`, so the three buttons
kept their intrinsic width and the row measured 404 px inside 390 px and 400 px
inside 320 px. `My Record` sat outside the viewport on both sizes. The strip now
wraps, the buttons carry `min-width: 0`, and below 480 px they use tighter
padding. Measured: 404 → 382 at 390 px, 400 → 312 at 320 px.

Both layout fixes are guarded by `npm run test:a11y`, which fails if the
`min-width: 0` rule, the 600 px card rules or the tab wrap go missing.

### 3. One unreachable database was probed five times (Medium)

`remoteReachable()` cached its answer for 30 s but not the request that produced
it. A page load starts several services at once, so each caller entered the
function before the first `fetch` resolved, opened its own
`/auth/v1/health` request, and logged its own "Supabase project unreachable"
warning — four or five per page. The in-flight promise is now shared, so the
probe runs once and the warning is logged once. Measured: 5 warnings per page →
1 on every page tested.

### 4. The offline engine accepted credentials Supabase would refuse (Medium)

`marketplace-local.js` `Auth.signUp()` checked only that the password was
non-empty and never validated the email, so `signUp('qa@example.com', '123')`
created an account. Supabase Auth rejects that password before the account
exists, so the demo would work offline and fail the moment a project was
configured — and a weak password would be in the user's head by then. The
engine now requires a plausible email and at least six characters, matching the
`minlength="6"` already on the sign-up input. `npm run test:local` covers the
short password, the malformed email and the accepted case (94 → 97 cases).

### 5. Checked and found correct (Info)

- **Light mode.** Text contrast was audited on 13 pages in both themes, skipping
  gradient surfaces (a gradient reports a transparent `background-color`, which
  made bright gradient buttons look like dark-on-dark). No text fell below 3:1.
- **Job search and filters.** `jobs.html` filters by keyword and category
  correctly, and shows the empty state for a keyword that matches nothing.
- **Proposal flow.** A bid submits, survives a reload, and the page then hides
  the form, shows *Your Proposal* and refuses a second bid with a clear message.
- **Talent search, chat launcher, auth modal.** Search filters, the widget
  opens, a wrong password is refused with "Incorrect password".

### Verification

```
npm test
  a11y check passed: 20 pages verified.
  security check passed: 111 files verified.
  schema check passed: 64 client reference(s) resolved against 30 schema object(s).
  local engine check passed: 97 authorization case(s) verified.
  content check passed: 20 pages verified.
```

Browser sweep (headless Chromium, `*supabase.co*` blocked): 19 pages at
390×844 and 320×568 — every page now reports `scrollWidth` equal to the
viewport, and exactly one fallback warning per page.

---

# Live Project Audit

Date: 2026-11-24
Scope: the **deployed** project (`https://evdpmombgymthzqegqwr.supabase.co`)
and the live site behaviour against it, rather than the committed files.

Method: `npm run check:live`, an authenticated probe of the deployed REST API
as a disposable client account (now `npm run check:live-security`), a real
sign-in and job-post through the browser UI against the live project, and a
request-by-request comparison of every embedded PostgREST select.

Two of these bugs could not be seen from the repository: every committed file
and every static suite was correct, and the site was still broken.

## Summary

| # | Severity | Area | Bug | Status |
|---|----------|------|-----|--------|
| 1 | Critical | Production config | `GAHONSH_PRODUCTION_URL` was a reserved placeholder (`https://offline-probe.invalid`), so the deployed site never talked to the real project | Fixed |
| 2 | Critical | Database (live) | A signed-in client could set `role: "admin"` and `is_verified: true` on their own profile — the immutability trigger was not attached in the live project | Fix shipped, needs one SQL run |
| 3 | High | PostgREST embeds | `client:profiles(...)` was ambiguous, so the jobs feed, the job details page and saved jobs all failed with PGRST201 | Fixed |
| 4 | High | PostgREST embeds | The invitation queries embedded `profiles` twice with no FK hint, so both invitation tabs failed with PGRST201 | Fixed |
| 5 | High | Database (live) | `admin_profiles`, `admin_overview()` and `contact_messages` missing, and `profiles.email` / `phone_number` dropped, which is why the view and RPC could not be created | Fix shipped, needs one SQL run |
| 6 | Medium | Owner dashboard | The KPI row showed eight zeros when `admin_overview()` was missing, reading as "no activity" instead of "not migrated" | Fixed |

## 1. The deployed site pointed at a placeholder project (Critical)

`supabase-config.js` carried

```js
var GAHONSH_PRODUCTION_URL = "https://offline-probe.invalid";
```

`isSupabaseConfigured()` compares the stored URL with that constant, and `.invalid`
is reserved and never resolves. On the live site every request failed at the
network layer, so `withFallback()` served the marketplace from
`marketplace-local.js`: the site looked like it worked, on a per-browser store.
Two consequences:

- Any account created on the live site existed only in that browser's
  `localStorage`; signing in from another device or browser failed, and the
  production project appeared to have no users.
- The real project was never exercised, which is how bugs 2, 3, 4 and 5
  survived several releases.

Fixed by pointing the constant at the real project. The offline engine is
still reachable: it stays in the fallback path for genuine network failures,
which is what it was written for.

## 2. A client could promote themselves to admin (Critical)

RLS lets a member update their own profile row, so the column rules live in
`trg_protect_profile_fields`. On the live project:

```
PATCH /rest/v1/profiles?id=eq.<me>   {"role":"admin"}     -> 200
PATCH /rest/v1/profiles?id=neq.<me>  {"is_verified":true}  -> 403
```

The second request shows RLS itself is correct. The first shows the trigger
was missing: the write was accepted and the row came back with `role: admin`.
`npm run test:local` covered this case in the offline engine and
`npm run test:security` asserted the SQL text, but nothing checked the
deployed database.

`supabase/migrations/20261129000000_restore_profile_pii_columns.sql` attaches
the trigger and restores the columns; `npm run check:live-security` now fails
the build when a project accepts the promotion. The trigger function also reads
the row through `to_jsonb(OLD/NEW)` instead of `NEW.email`, because the live
project has no `email` column yet and `NEW.email` would have raised
`record "new" has no field "email"` on every profile update — a trigger that
blocks all writes is not a safe fallback.

## 3–4. Ambiguous embedded relations broke the core pages (High)

`jobs` reaches `profiles` twice: directly through `jobs.client_id`, and through
`saved_jobs`, which PostgREST treats as a junction table. `client:profiles(...)`
therefore returned

```
300 PGRST201  Could not embed because more than one relationship was found
```

`getJobById()` wraps that as a thrown error, so `job-details.html` rendered
*Project unavailable* for a job that had just been created by the same user and
was readable at `/rest/v1/jobs?id=eq.<id>` (200). `getOpenJobs()` failed the
same way, so a posted job never appeared in the feed either.

`invitations` reaches `profiles` through both `client_id` and `freelancer_id`,
so `client:profiles` and `freelancer:profiles` were ambiguous too, breaking
both invitation lists. `contracts` had already been written with the hint
(`!contracts_client_id_fkey`), which is what made the omission visible.

Fixed with explicit hints on every embed of `profiles`
(`!jobs_client_id_fkey`, `!invitations_client_id_fkey`,
`!invitations_freelancer_id_fkey`, `!proposals_freelancer_id_fkey`).
`npm run test:schema` now walks the schema's foreign keys, treats a table with
two FKs to the same target — or a junction table linking the pair — as an
ambiguous embed, and fails when the select has no hint. It reproduces the
original bug when the hint is removed.

## 5. Live objects missing (High)

```
MISSING table admin_profiles      PGRST205
MISSING table contact_messages    PGRST205
MISSING rpc   admin_overview      PGRST202
MISSING column profiles.email / profiles.phone_number
```

`docs/marketplace-schema.sql` never adds a column to an existing table, and the
live project had lost `email` and `phone_number` from `profiles`. The
`admin_profiles` view and `admin_overview()` are built on `profiles.email`, so
re-running the schema failed at the view — and the Supabase SQL editor runs the
script as one transaction, so the whole repair would have rolled back. The
schema now restores both columns with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`,
backfills email from `auth.users`, and adds the unique index.

The contact form degrades gracefully: the missing table makes the write fail and
the enquiry goes to the Formspree fallback, so leads still arrive.

## Verification

```
npm test
  a11y check passed: 21 pages verified.
  security check passed: 113 files verified.
  schema check passed: 92 client reference(s) resolved against 40 schema object(s).
  local engine check passed: 142 authorization case(s) verified.
  content check passed: 21 pages verified.

npm run check:live
  MISSING table admin_profiles / contact_messages, rpc admin_overview   (needs the SQL run)

npm run check:live-security   (before the SQL run)
  FAIL  a client cannot promote themselves to admin — role change was accepted
  FAIL  a member cannot verify themselves — is_verified change was accepted
  PASS  a client can post a job / delete their own job
  PASS  a client cannot post a job for someone else
  PASS  a member cannot post into their own notification list
  PASS  a member cannot save themselves as talent
  WARN  admin_profiles, admin_overview(), contact_messages, profiles.email
```

Browser, signed in to the live project from the local preview: sign-in,
session persistence across pages, posting a job (`post-job.html` →
`job-details.html`), the feed listing it, the details page, the client record
panel, the invitation tab and the project files panel all work. The temporary
job was deleted afterwards (`204`).

---

# Light-mode contrast and dead-end states — 2026-11-24

Scope: the deployed `main` after PR #20 (site pointed at the live Supabase
project). Focus: what a real visitor sees that the static checks cannot — text
that disappears when the light theme is on, and pages that keep showing
placeholders after their data lookup fails.

Method: a dependency-free CDP driver over headless Chromium
(`chromium --headless --remote-debugging-port`), no added npm dependencies.
Each page was loaded at 390×844 and 1280×900 in both themes while collecting
console errors, uncaught exceptions, 4xx/5xx responses, broken images, the
document `scrollWidth` against the viewport, and a WCAG contrast pass over
every visible text node. A second pass injected the components that only
render when the database has rows (status pills, tier badges, proposal
feedback) and measured their computed colours, because an empty marketplace
never renders them.

## Findings

| # | Severity | Area | Bug | Fixed value |
|---|----------|------|-----|-------------|
| 18 | Medium | Light-mode contrast | `find-talent.html` availability pill: `#34d399` "Available now" at **1.92:1**, `#fbbf24` "Busy" at **1.67:1** on a white card | 5.48:1 / 7.09:1 |
| 19 | Medium | Light-mode contrast | `job-details.html` proposal feedback: the success box (`#a7f3d0`) at **1.23:1** and the error box (`#fca5a5`) at **1.81:1** — a freelancer cannot tell an accepted bid from a rejected one | 5.24:1 / 6.18:1 |
| 20 | Medium | Light-mode contrast | `catalog.html` premium tier pill and `job-details.html` Shortlist button, both `#fbbf24` at **1.60:1** | 6.78:1 |
| 21 | Low | Light-mode contrast | `find-talent.html` decline/withdraw hover turns the label `#f87171` (2.8:1) on a light surface | `#b91c1c` |
| 22 | Low | Light-mode contrast | `marketplace-dashboard.html` Accepted/Completed chips at 3.6:1, under the 4.5:1 needed for small text | 5.24:1 |
| 23 | High | Dead-end state | `job-details.html` with no id left "Budget: Loading…", "Category", "0 Proposals" in the badge row, a client card claiming **"Identity Verified"** for an account that does not exist, "Loading client record…" and an empty "Skills & Expertise Needed" section | Only the real explanation remains |
| 24 | Info | Deep link | `#chat` only opens the assistant on a full page load; a same-document hash change does not re-run the widget. Expected browser behaviour, not a bug | Documented |

## 18-22. Accent colours that vanish in light mode (Medium)

The site has two themes and one accent palette. `theme.css` lightens the
surfaces, so a hue picked against an ink card keeps its value but loses its
contrast: `#34d399` on white is 1.92:1, `#fbbf24` is 1.67:1, `#a7f3d0` is
1.23:1. None of these components appeared in the first sweep because they only
render once the database has rows, which is exactly the state a new
marketplace is in: the bug waits for the first real customer.

Every accent now has a `body.light-mode` override in `theme.css` that darkens
the same hue instead of dropping the colour, so the state is still obvious:

```css
body.light-mode .availability-pill.is-available { color: #047857; }
body.light-mode .proposal-success-box { color: #047857; }
body.light-mode .proposal-error-box { color: #b91c1c; }
```

Measured after the change: 5.24-7.09:1 in light mode, unchanged in dark mode.

## 23. "Project unavailable" still claimed a verified client (High)

`assets/js/job-details-flow.js` hid the proposal section on a failed lookup and
returned, leaving everything else as authored: the badge row still read
"Budget: Loading…" and "0 Proposals", and the sidebar rendered a client named
"Unknown" with an "Identity Verified" shield, "Member of Gahonsh", a spinning
"Loading client record…" line and a "View client record" button.

The verification badge is a trust claim, so showing it for a nonexistent
account is worse than a cosmetic defect. The failure path now hides the badge
row, the client card and the empty skills block, so the page states one fact
and stops.

## Regression guard

`npm run test:a11y` gained a fifth section: any of the palette accents used as
a literal `color:` in a page stylesheet must have a `body.light-mode` override,
in `theme.css` or in the page's own style block. It flagged the
decline/withdraw hover that the manual sweep had missed, and it fails if any of
these overrides is removed.

## Verification

```
npm test
  a11y check passed: 21 pages verified.        (now includes the light-mode accent rule)
  security check passed: 113 files verified.
  schema check passed: 92 client reference(s) resolved against 40 schema object(s).
  local engine check passed: 142 authorization case(s) verified.
  content check passed: 21 pages verified.
```

Headless Chromium, 15 pages at 390×844 dark, 390×844 light and 1280×900 dark:
no console errors, no uncaught exceptions, no failed requests, no broken
images, `scrollWidth` never exceeds the viewport, and no text below 3:1.
Component probes for the pills, badges, feedback boxes and buttons: all
≥5.2:1 in light mode and ≥7.3:1 in dark mode.

Browser, local preview: `job-details.html` without an id now shows only
"Project unavailable" and its explanation; the assistant opens from `?chat=1`
and answers the "What I can do" prompt with the task list.

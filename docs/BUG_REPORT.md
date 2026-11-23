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

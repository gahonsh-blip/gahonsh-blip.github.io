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

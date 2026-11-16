# PageSpeed Insights Remediation Report

Date: 2026-11-16
Scope: PageSpeed Insights / Lighthouse findings and a full accessibility sweep
of every page in this repository (`https://gahonsh-blip.github.io/`).

## 1. Where the original report came from

The report supplied for this task was captured against
`gahonsh-finance.gahonsh.workers.dev` — a **different project**, the
Cloudflare Worker finance portal. That report is handled in its own
repository (`gahonsh-blip/gahonsh-finance`, PR #312, merged). It is not this
static GitHub Pages site, so none of those URLs, files (`js/api.js`,
`css/style.css`, `d3.min.js`, `/admin/`) or server headers exist here.

The findings that *do* generalise to this repository were reproduced with a
local Lighthouse run and fixed here:

- low-contrast text (contrast failures)
- unlabelled form controls (`select-name`)
- missing accessible names on icon-only links/buttons (`link-name`,
  `button-name`)
- missing `frame-title`
- missing `<main>` landmark (`landmark-one-main`)
- heading order skips (`heading-order`)
- browser console errors (`errors-in-console`)

## 2. Method

Lighthouse 13.x (Chromium, mobile emulation, slow-4G throttling) was run
against every `.html` page served from `http://localhost:14000`. Results were
re-checked after each change until all indexable pages reported
Accessibility 100 and Best Practices 100.

A dependency-free regression check (`npm run test:a11y`) was added so these
fixes cannot silently regress.

## 3. Fixes applied

### 3.1 Browser console errors (`errors-in-console`)

`supabase-client.js` probed Supabase reachability with a **keyless**
`GET /rest/v1/` request. Supabase answers that with `401`, which the browser
logs as a console error even though the project is healthy. The probe now
calls the CORS-enabled `GET /auth/v1/health` endpoint with the public
publishable key and treats `res.ok` as the reachability signal. No more
console noise; the local-fallback behaviour is unchanged.

### 3.2 Colour contrast

- `find-talent.html` `.btn-hire-talent` and the `post-job.html` button in
  `marketplace-dashboard.html` used white text on `#0077ff` (4.13:1). Solid
  blue buttons now use `#0062cc` (5.80:1). The `--accent-blue` token itself is
  untouched because it is also used as a *text* colour on dark backgrounds,
  where `#0077ff` already passes.
- `privacy-policy.html`, `terms.html` and `thank-you.html` rendered footer
  links with the browser default `#0000ee` (2.14:1 on the dark background)
  because no `footer`/`.footer-links` rule existed. Explicit, compliant styles
  were added.

### 3.3 Accessible names (`link-name`, `button-name`, `select-name`)

- Theme toggle (`script.js`): the accessible name now contains the visible
  text (`Switch to Light theme` / `Switch to Dark theme`) to satisfy WCAG
  2.5.3 "Label in Name", and the icon is `aria-hidden`.
- Icon-only links (floating WhatsApp, back-to-top, footer socials) and the
  newsletter submit button now carry `aria-label`s.
- `admin.html` `#roleFilter` and `dashboard.html` `#linkTargetSelect` gained
  `aria-label`s; the icon-only modal close buttons in `dashboard.html` too.

### 3.4 Landmarks and frames

- A single `<main>` landmark now wraps the primary content of every page
  (`landmark-one-main`).
- `contact.html` Google Maps `<iframe>` and `dashboard.html` `#editorFrame`
  now have `title` attributes (`frame-title`).

### 3.5 Heading order and metadata

- `find-talent.html` empty-state heading corrected from `h3` to `h2`.
- `admin.html` and `dashboard.html` gained `<meta name="description">`.
- Pages missing a favicon link now reference `assets/logo.png`, removing the
  `/favicon.ico` 404.

## 4. Intentional, non-actionable Lighthouse flags

| Page | Audit | Why it stays |
| --- | --- | --- |
| `admin.html`, `dashboard.html` | `is-crawlable` | These are private, `noindex, nofollow` pages. Being unindexable is correct. |
| `thank-you.html` | `is-crawlable` | Post-submission page, deliberately `noindex`. |
| `googleb9deb43124fcee02.html` | several | Google Search Console verification file. It must remain byte-exact; any edit invalidates verification. |

## 5. Verification

Final local Lighthouse sweep (mobile):

| Page | Perf | A11y | Best Practices | SEO |
| --- | --- | --- | --- | --- |
| about.html | 95 | 100 | 100 | 100 |
| contact.html | 88 | 100 | 100 | 100 |
| find-talent.html | 79 | 100 | 100 | 100 |
| index.html | 79 | 100 | 100 | 100 |
| job-details.html | 87 | 100 | 100 | 100 |
| jobs.html | 96 | 100 | 100 | 100 |
| marketplace-dashboard.html | 93 | 100 | 100 | 100 |
| portfolio.html | 89 | 100 | 100 | 100 |
| post-job.html | 78 | 100 | 100 | 100 |
| pricing.html | 92 | 100 | 100 | 100 |
| privacy-policy.html | 97 | 100 | 100 | 100 |
| services.html | 91 | 100 | 100 | 100 |
| terms.html | 97 | 100 | 100 | 100 |
| thank-you.html | 99 | 100 | 100 | — (noindex) |
| admin.html | 91 | 100 | 100 | — (noindex) |
| dashboard.html | 95 | 100 | 100 | — (noindex) |

`npm run test:a11y` verifies 19 pages and passes.

## 6. Follow-ups (not blocking)

- Performance is throttled-mobile and already "good"; the largest remaining
  cost is Font Awesome and web-font download. Self-hosting or subsetting the
  icon font would lift the mid-70s scores on the heaviest pages.
- Lighthouse reports no CSP/HSTS because GitHub Pages does not let us set
  response headers. That needs a custom domain behind a proxy/CDN.

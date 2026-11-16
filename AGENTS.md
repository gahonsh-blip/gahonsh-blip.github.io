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
6. **Preserve Demo Fallback Capability.** `marketplace-local.js` is the offline data engine; `supabase-client.js` must keep preferring a reachable Supabase project and degrade to that local engine when the project is unreachable. Pages gate on `window.isMarketplaceReady()`, never on raw `isSupabaseConfigured()`, so the marketplace stays fully testable before live credentials exist.

## Code Conventions

- **HTML:** Semantic sections with unique element IDs where required. CSS custom properties defined in each page's `:root` (`--bg-dark`, `--accent-cyan`, `--text-main`, etc.).
- **CSS:** Shared light-mode overrides and mobile touch-target rules in `theme.css`; page-specific styles in `<style>` blocks.
- **JS:** Plain ES6 functions, modules, and clear comments.
- **Mobile Usability:** Maintain at least 48px minimum touch targets for all interactive mobile buttons, links, and drawer close controls.

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
  (`admin.html`, `dasbord.html`, `dashboard.html`, `home.html`, `thank-you.html`)
  stay `noindex` and out of the sitemap.
- **Meta.** Each indexable page needs a unique `<title>`, a unique
  `<meta name="description">` (roughly 70-160 characters) and a
  `<link rel="canonical">` pointing at its own URL.
- **External links.** Any `target="_blank"` anchor must carry
  `rel="noopener noreferrer"`.
- **Known limitation.** The `www.` host does not resolve (`www.gahonsh-blip.github.io`
  returns no response). A redirect cannot be added on GitHub Pages without a
  custom domain, so link only to the apex `https://gahonsh-blip.github.io/`.

## Testing & Verification

- **Local Preview:** Run `npm run dev` (Node.js) or `python3 -m http.server 8000` (Python).
- **Automated checks:** `npm test` runs both suites.
  - `npm run test:a11y` — static accessibility contract across all pages.
  - `npm run test:security` — flags inline-handler interpolation, unescaped
    `innerHTML` sinks, and hardcoded studio passcodes. Run it after touching any
    rendering code.
- **Core Checks:**
  - Agency pages: Service flip cards, portfolio filters, FAQ accordions, Formspree form submission, WhatsApp deep links.
  - Marketplace pages: Job search & filters (`jobs.html`), proposal submission & hiring (`job-details.html`), job creation (`post-job.html`), talent directory (`find-talent.html`), portal tabs (`marketplace-dashboard.html`).
  - Auth & Theme: Sign in/out modal, role switching, light/dark mode persistence in `localStorage`.

## Owner Studio Editor (local only)

`dashboard.html` is a private visual editor served by `server.js`. Its write
APIs (`/api/save-page`, `/api/upload-file`, `/api/pages-list`) require the
`STUDIO_PASS` passcode, sent as the `x-studio-pass` header and checked in
constant time. The passcode is never stored in the page or committed: the page
verifies it against `/api/verify` and keeps it in `sessionStorage` for the tab.
If `STUDIO_PASS` is unset the server generates a random one and prints it on
startup. Never reintroduce a hardcoded passcode — `npm run test:security`
fails the build if one appears.

## Security Notes

- User- and DB-supplied values must never reach `innerHTML` unescaped. Escape
  with `escapeHtml()`/`escHtml()`, or set the value with `textContent`.
- Never place interpolated values inside inline `onclick`/`onchange`
  attributes — HTML entity decoding happens before the JS parser, so escaping
  is not enough. Use `data-*` attributes with event delegation instead.
- Numeric fields (budgets, bids, amounts) must be coerced with `Number(...)`
  before interpolation; PostgREST returns them as strings.


## External Services & Endpoints

- **Supabase Cloud:** Client-side integration via `supabase-client.js` & `auth.js`
- **Formspree Endpoint:** `https://formspree.io/f/xzdqnoez`
- **WhatsApp Support:** `+91 88251 83628` (`wa.me/918825183628`)
- **Official Email:** `gahonsh@gmail.com`
- **Google Maps Embed:** `https://maps.app.goo.gl/bPxXtFfKWn3NzwhJ7`
- **Font Awesome:** Version 6.4.0 via cdnjs

See [ARCHITECTURE.md](ARCHITECTURE.md), [docs/SETUP.md](docs/SETUP.md), and [docs/DATABASE.md](docs/DATABASE.md) for full technical references.

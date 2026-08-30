# AGENTS.md

Repository guide for AI agents and human contributors working on the
**Gahonsh Freelancing & Marketplace** GitHub Pages repository.

## Project Type & Runtime

- **Type:** Agency Website & Freelance Marketplace.
- **Frontend Runtime:** Vanilla HTML5 / CSS3 / JavaScript (ES6+), zero heavy build bundlers required.
- **Backend & Database:** [Supabase](https://supabase.com) (PostgreSQL 15+, Auth, Row-Level Security, Triggers, RPC) with built-in `MockDataEngine` client-side fallback for instant zero-config testing.
- **Hosting:** Hosted directly on **GitHub Pages** (`https://gahonsh-blip.github.io/`) from the `main` branch.
- **Preview Server:** Node.js static preview server (`server.js`) on Port 3000.

## Non-Negotiable Rules

1. **Never break a page.** Every HTML file is a standalone page with dedicated layout styling and scripts. Any structural change to shared headers/footers must be applied across all active pages.
2. **Keep paths relative.** Links and assets use relative paths (`index.html`, `assets/logo.png`, `theme.css`). Do not introduce absolute local paths.
3. **No secrets in code.** Never commit database service-role secret keys, admin passwords, or personal credentials. The public Supabase `anon` key, Formspree endpoint, and WhatsApp number are public client-side contact points.
4. **Preserve SEO & Metadata assets.** `sitemap.xml`, `robots.txt`, `metadata.json`, Open Graph meta tags, Google verification file (`googleb9deb43124fcee02.html`), and JSON-LD structured data must remain intact and updated when URLs change.
5. **Enforce Row Level Security (RLS).** Any new tables in `docs/marketplace-schema.sql` must enforce RLS and validate user identity (`auth.uid()`).
6. **Preserve Demo Fallback Capability.** `supabase-client.js` and `auth.js` must maintain fallback functionality so the marketplace remains fully testable even before live Supabase credentials are provided.

## Code Conventions

- **HTML:** Semantic sections with unique element IDs where required. CSS custom properties defined in each page's `:root` (`--bg-dark`, `--accent-cyan`, `--text-main`, etc.).
- **CSS:** Shared light-mode overrides and mobile touch-target rules in `theme.css`; page-specific styles in `<style>` blocks.
- **JS:** Plain ES6 functions, modules, and clear comments.
- **Mobile Usability:** Maintain at least 48px minimum touch targets for all interactive mobile buttons, links, and drawer close controls.

## Testing & Verification

- **Local Preview:** Run `npm run dev` (Node.js) or `python3 -m http.server 8000` (Python).
- **Core Checks:**
  - Agency pages: Service flip cards, portfolio filters, FAQ accordions, Formspree form submission, WhatsApp deep links.
  - Marketplace pages: Job search & filters (`jobs.html`), proposal submission & hiring (`job-details.html`), job creation (`post-job.html`), talent directory (`find-talent.html`), portal tabs (`marketplace-dashboard.html`).
  - Auth & Theme: Sign in/out modal, role switching, light/dark mode persistence in `localStorage`.

## External Services & Endpoints

- **Supabase Cloud:** Client-side integration via `supabase-client.js` & `auth.js`
- **Formspree Endpoint:** `https://formspree.io/f/xzdqnoez`
- **WhatsApp Support:** `+91 88251 83628` (`wa.me/918825183628`)
- **Official Email:** `gahonsh@gmail.com`
- **Google Maps Embed:** `https://maps.app.goo.gl/bPxXtFfKWn3NzwhJ7`
- **Font Awesome:** Version 6.4.0 via cdnjs

See [ARCHITECTURE.md](ARCHITECTURE.md), [docs/SETUP.md](docs/SETUP.md), and [docs/DATABASE.md](docs/DATABASE.md) for full technical references.

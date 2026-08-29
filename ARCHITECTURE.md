# Architecture

Technical reference for the **Gahonsh Freelancing** website
(`gahonsh-blip/gahonsh-blip.github.io`).

- **Kind:** static website (GitHub Pages).
- **Runtime:** vanilla HTML/CSS/JS in the browser. **No application server,
  no API layer, no database, no authentication** are present in this
  repository. Every claim below is verified against the current code
  unless marked *Needs Verification*.

---

## 1. System Overview / Data-Flow

```
 Browser
   │  GET https://gahonsh-blip.github.io/<page>.html
   ▼
GitHub Pages (serves files from main branch root)
   │
   ├─ static HTML/CSS/JS  → rendered client-side
   │
   ├─ GET https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css
   │
   ├─ Contact form POST  → https://formspree.io/f/xzdqnoez  (external)
   │                        ├─ hidden _next=thank-you.html (redirect handled client-side)
   │                        └─ form data stored at Formspree  *Needs Verification (Formspree account storage)
   │
   ├─ Google Maps iframe  → https://www.google.com/maps/embed?pb=...
   │
   └─ WhatsApp deep link  → https://wa.me/918825183628?text=...  (opens WhatsApp app)
```

The site has exactly **one outbound data submission**: the contact form →
Formspree. The newsletter box does **not** submit data — it opens WhatsApp
with a pre-filled message containing the typed email (client-side only).

### Page graph

```
home.html ──(meta refresh)──▶ index.html (Home) ◀── root of site
   │
   ├──▶ about.html
   ├──▶ services.html   (#excel, #pdf, #web anchors)
   ├──▶ portfolio.html
   ├──▶ pricing.html
   ├──▶ contact.html ──▶ thank-you.html  (after successful form POST)
   │        │
   │        └──▶ privacy-policy.html / terms.html  (footer links)
   └──▶ privacy-policy.html / terms.html  (footer links)
```

---

## 2. Folder Structure

```
gahonsh-blip.github.io/
├── index.html              Home (1120 lines; hero, why-choose, projects, process,
│                           testimonials, FAQ, newsletter, mobile menu)
├── about.html              About + trust/mission/process/testimonials/CTA
├── services.html           Six flip-card services + comparison table + FAQ + CTA
├── portfolio.html          Filterable projects (excel/pdf/web) + sample downloads
├── pricing.html            Three plans + features matrix + WhatsApp CTAs
├── contact.html            Inquiry form (Formspree) + map + WhatsApp + promise box
├── thank-you.html          Form success page (particle animation, logo, return btn)
├── terms.html              Terms & Conditions (static legal copy)
├── privacy-policy.html     Privacy Policy (static legal copy)
├── home.html               Redirect stub → index.html (meta refresh 0)
├── script.js               1,974 B — injects the Light/Dark toggle button (loaded by all main pages)
├── theme.js                601 B — persists body.light-mode in localStorage
├── theme.css               342 B / 13 lines — light-mode CSS variable overrides
├── style.css               3,825 B / 139 lines — animation utilities (.reveal, .hover-lift, ...)
│                           ⚠ not loaded by any active page (legacy)
├── server.js               Node.js static server for local and cloud container preview
├── package.json            Dependencies and preview scripts (`npm run dev`)
├── metadata.json           Platform application metadata
├── .env.example            Environment configuration declaration
├── assets/
│   ├── logo.jpeg           Brand logo (used as <img> on thank-you.html)
│   └── logo.png            Favicon PNG (generated from logo.jpeg — fixes page favicons)
├── images/                 Images used for social/share previews and legacy assets
│                           (og-image.jpg now referenced by index.html; the rest are legacy)
├── robots.txt              Allow crawling + sitemap declaration
├── sitemap.xml             9 URLs, lastmod 2026-07-01
├── googleb9deb43124fcee02.html  Google Search Console file-verification
├── FullWebsiteCode.zip     Archived copy of an older site version (tracked)
├── _tmp_unzip/             Unpacked copies of that older version (tracked)
├── .gitignore              Ignores only `Archive/`
└── README.md / AGENTS.md / ARCHITECTURE.md / docs/   (documentation)
```

---

## 3. Frontend

### 3.1 Pages and their roles

| Page               | Role                                                              |
| ------------------ | ----------------------------------------------------------------- |
| `index.html`       | Landing page. Hero with animated counters (`data-target`), CTA, trust badges, "Why Choose", featured deployments, 4-step process, testimonials, FAQ accordion, newsletter, footer. |
| `about.html`       | Brand story, trust promises, process, mission/vision, feedback, CTA. |
| `services.html`    | Flip cards for 6 services (each `<div class="flip-card" id="...">`), features comparison table, FAQ, CTAs to contact/WhatsApp. |
| `portfolio.html`   | Filter buttons (`.btn-filter[data-filter]`) + project cards (`.project-card[data-category]`), download links to `assets/projects/*`, live-site links. |
| `pricing.html`     | 3 pricing cards (Starter / Professional / Business) + comparison matrix + security notice. |
| `contact.html`     | Form `#project-contact-form` → Formspree; map iframe; WhatsApp CTA; response guarantee; data promise. Includes scroll-reveal animation classes defined inline. |
| `thank-you.html`   | Success page: particle animation, logo, return button. |
| `terms.html` / `privacy-policy.html` | Legal pages; load `theme.js` only. |

### 3.2 Shared front-end components

There is **no component system**; shared UI is copy-pasted per page:

- **Header** — fixed/sticky nav, brand logo, desktop dropdown under
  "Services", mobile slide-in menu (`#menu-overlay`, `#mobile-menu-container`,
  toggled by `#mobile-menu-open-btn` / `#mobile-menu-close-btn`).
- **Footer** — services/resources/legal/newsletter columns + social icon
  links. Newsletters use `#newsletter-email` + `#newsletter-submit-btn`.
- **Floating buttons** — WhatsApp float (`wa.me/918825183628`) and
  back-to-top (`#btn-top`, `.show` class past 400px scroll).
- **Theme toggle** — created at runtime by `script.js`, positioned
  fixed top-left; toggles `body.light-mode`.
- **FAQ accordion** — `.faq-question` click toggles `.faq-answer` display
  and `fa-plus`/`fa-minus` icons.
- **Stat counters** — `.counter-num[data-target]` animated via
  IntersectionObserver (threshold 0.6).

### 3.3 JavaScript files

| File        | Responsibility                                                        |
| ----------- | --------------------------------------------------------------------- |
| `script.js` | Creates and appends the light/dark mode button; hover states; toggles `body.light-mode`. |
| `theme.js`  | Reads `localStorage.theme` on load, applies `light-mode`; MutationObserver persists the current theme on every class change. |
| inline `<script>` per page | Page-specific logic (menu, counters, FAQ, scroll-reveal, portfolio filter, newsletter, particles on thank-you). |

### 3.4 CSS files

| File        | Responsibility                                                        |
| ----------- | --------------------------------------------------------------------- |
| inline `<style>` in each page | Full page design, based on a `:root` custom-property palette (`--bg-dark`, `--accent-cyan`, `--accent-blue`, `--border-color`, `--text-main`, `--text-slate`). |
| `theme.css` | `body.light-mode` overrides for the CSS variables and a few surfaces (footer, contact card, info block). |
| `style.css` | Animation utilities (`.reveal`, `.reveal-*`, `.hover-lift`, `.hover-scale`, `.counter-num`, `.section-line`, `.img-zoom`, `.pulse-once`, `.page-load`). ⚠ Only referenced by `about-full.txt` (archive copy) — **not** referenced by any active page. The `.reveal` classes used by `contact.html` are defined inline in that page. |

---

## 4. External Services / Integrations

| Service        | Usage                                                                    | Location in code                 |
| -------------- | ------------------------------------------------------------------------ | -------------------------------- |
| **GitHub Pages** | Hosting/deployment (from `main` root)                                   | repo-level; `home.html` canonical |
| **Formspree**  | Contact-form endpoint `https://formspree.io/f/xzdqnoez`, method POST, hidden `_next=thank-you.html` | `contact.html` (form `action`)    |
| **Google Maps**| Embed iframe (`https://www.google.com/maps/embed?pb=...`) + "Open in Google Maps" link (`maps.app.goo.gl/bPxXtFfKWn3NzwhJ7`) | `contact.html` |
| **WhatsApp**   | `wa.me/918825183628` deep links for quotes, plan selection, newsletter  | `index.html`, `contact.html`, `pricing.html`, `services.html`, `portfolio.html` |
| **Font Awesome** | Icons via cdnjs (6.4.0) `all.min.css`                                  | `<head>` of index/about/services/portfolio/pricing/contact/thank-you |
| **Google Search Console** | File-based site verification `googleb9deb43124fcee02.html`            | repo root |
| **Social**      | LinkedIn, Instagram, YouTube, Facebook, X (footer icons; also in index JSON-LD `sameAs`) | page footers + `index.html` |

No analytics/telemetry scripts were found in any page.

---

## 5. Database

**There is no database in this repository.** All page content is static
HTML. Form submissions are stored and managed externally by Formspree
(retention/security details *Needs Verification* from the Formspree
account). See [docs/DATABASE.md](docs/DATABASE.md) for the data-storage
summary.

## 6. Authentication

**None.** The site is public, read-only content. The contact form and
WhatsApp links are open endpoints; no logins, sessions, tokens, or roles
exist anywhere in the code.

---

## 7. Deployment

### Current mechanism

- Hosted at `https://gahonsh-blip.github.io/` (repository follows the
  `<owner>.github.io` naming pattern for user-site Pages).
- No `.github/workflows/`, no `.github/` config, and no `CNAME`,
  `package.json`, or build tooling exist.
- Sitemap `lastmod` values use `2026-07-01`; legal pages say
  "Last Updated: June 2026".
- Contained in the single git commit currently in the local clone (shallow,
  grafted history).

> *Needs Verification:* the actual GitHub Pages source setting (branch/folder)
> and any DNS/custom-domain configuration are GitHub account settings —
> they are not represented in this repository.

### Deploying a change

1. Edit files on a feature branch; open a PR to `main`.
2. GitHub Pages serves `main` directly (once configured to the branch
   root). No build output or artifact generation is needed.
3. After merge, verify the live site at the canonical URL.

Since Pages serves the repo as-is, **every commit to `main` is a
production deploy** — review carefully.

---

## 8. Known Gaps and Anomalies (verified in code)

1. **Favicon (fixed):** every page references `assets/logo.png`; the PNG
   was generated from `assets/logo.jpeg` so favicons now resolve.
2. **Broken portfolio downloads:** `portfolio.html` links to 8 files under
   `assets/projects/` (`finance-dashboard-sample.xlsx`,
   `loan-calculator-sample.xlsx`, `inventory-tracker-sample.xlsx`,
   `attendance-manager-sample.xlsx`, `company-profile-sample.pdf`,
   `corporate-catalog-sample.pdf`, `service-brochure-sample.pdf`,
   `resume-design-sample.pdf`) — the `assets/projects/` directory does not
   exist.
3. **Orphaned legacy assets:** most of the `images/` folder (5 of 6) and
   the `*-full.txt` sources are tracked but not referenced by any active
   page. `images/og-image.jpg` **is** used by the Open Graph/Twitter tags
   added to `index.html`.
4. **Zero automation:** no build, tests, linting, or CI. Manual QA is the
   norm (see `AGENTS.md`).
5. **Google verification file** contains the correct file-verification
   content string `google-site-verification: googleb9deb43124fcee02.html`.
   *Needs Verification:* confirm Google Search Console still accepts it.
6. **`home.html`** is a legacy redirect stub retained for old links.
7. Cost figures in hero/service copy (100+ projects, 98%, 80% latency
   savings, etc.) are marketing copy, *not* backed by any code or data —
   treat as content claims.
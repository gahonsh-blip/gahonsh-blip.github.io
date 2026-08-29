# Gahonsh Freelancing Website

Static marketing website for **GAHONSH FREELANCING**, a digital solutions
provider offering Excel automation, PDF/PPT design, web development, and AI
workflow solutions worldwide. The site is served as a **GitHub Pages**
project (repository named `gahonsh-blip.github.io`).

> **Current state (Aug 2026):** the repository contains only the static
> front-end. There is **no backend, database, build system, or runtime
> dependencies** in this repository. All interactivity is client-side.

## Features

- **Home (`index.html`)** — hero section with animated stat counters,
  "Why Choose Gahonsh" grid, featured deployments, working process,
  testimonials, FAQ accordion, and newsletter capture.
- **About (`about.html`)** — company story, trust promises, process,
  mission/vision, sample client feedback, and CTA.
- **Services (`services.html`)** — six flip-card service tiles
  (Excel Automation, PDF Design, Presentation Design, Website Assistance,
  AI Content, Branding), a features comparison table, FAQ, and CTA.
- **Portfolio (`portfolio.html`)** — filterable project gallery
  (Excel / PDF / Web) with client-side filtering and sample downloads.
- **Pricing (`pricing.html`)** — three tiers (Starter / Professional /
  Business) with a features comparison matrix and WhatsApp CTAs.
- **Contact (`contact.html`)** — project inquiry form (submitted to
  Formspree), embedded Google Map, instant WhatsApp chat, and data-promise
  section.
- **Thank-you (`thank-you.html`)** — post-submission success page with a
  particle animation.
- **Legal** — `terms.html` and `privacy-policy.html`.
- **Global UX features** — dark/light mode toggle (persisted in
  `localStorage`), floating WhatsApp button, back-to-top button, mobile
  slide-in navigation, scroll-reveal animations (contact page).
- **SEO** — `robots.txt`, `sitemap.xml`, per-page meta description, and
  JSON-LD structured data (Organization, WebSite, FAQ).

## Tech Stack

| Layer      | Technology                                                                 |
| ---------- | -------------------------------------------------------------------------- |
| Language   | HTML5, vanilla CSS3, vanilla JavaScript (no framework)                     |
| Fonts/icons| Font Awesome 6.4.0 via cdnjs CDN                                            |
| Hosting    | GitHub Pages (built from the `main` branch, repo root)                      |
| Forms      | [Formspree](https://formspree.io) — HTML `action` endpoint (`/f/xzdqnoez`) |
| Maps       | Google Maps embed iframe + link                                             |
| Messaging  | WhatsApp `wa.me` deep links                                                 |

**Runtime dependencies:** none to install. The site works by opening the
HTML files directly or serving the folder with any static file server.

## Repository Layout

```
.
├── index.html          Home page
├── about.html          About page
├── services.html       Services page
├── portfolio.html      Portfolio page
├── pricing.html        Pricing page
├── contact.html        Contact/quote form page
├── thank-you.html      Form-submission success page
├── terms.html          Terms & Conditions (static)
├── privacy-policy.html Privacy Policy (static)
├── home.html           Old redirect stub → index.html
├── script.js           Light/dark mode toggle button (injected on all main pages)
├── theme.js            Theme persistence (localStorage)
├── theme.css           Light-mode CSS overrides
├── style.css           Animation utility classes (loaded only by legacy pages)
├── assets/logo.jpeg    Logo image (used on thank-you page)
├── images/             Legacy image assets referenced by older page versions
├── robots.txt          Search-engine crawling rules
├── sitemap.xml         Site sitemap
├── googleb9deb43124fcee02.html  Google Search Console verification file
├── FullWebsiteCode.zip Archived copy of the older static site
└── _tmp_unzip/         Unpacked archive of the older static site
```

## Setup

No build step or package manager is required.

### Option 1 — Preview locally

```bash
# any static file server works; Python example:
python3 -m http.server 8000
# then open http://localhost:8000
```

### Option 2 — Deploy to GitHub Pages

1. Push changes to the `main` branch of a repository named
   `<user>.github.io` (this repository already matches the pattern).
2. In *Settings → Pages*, set the source to **Deploy from a branch** →
   `main` / root (`/`). *Needs Verification:* confirm the current Pages
   configuration in the repository settings; no `.github/workflows` file
   exists in the repo.
3. The site is served at `https://<user>.github.io/`.

## Usage

The site is fully static and self-contained:

- **Contact form** submits to the Formspree endpoint configured in
  `contact.html`; on success the user is redirected to `thank-you.html`
  via the hidden `_next` field.
- **Newsletter box** (footer on index/contact pages) is client-side only:
  it opens a WhatsApp chat with the entered email prefilled in the message.
- **WhatsApp** links (`wa.me/918825183628`) open pre-filled chats used for
  quotes, project consultations, and plan selection.
- **Theme toggle** — the light/dark button injected by `script.js` toggles
  `body.light-mode`; `theme.js` saves the choice in `localStorage`.
- **Portfolio filters** — buttons filter `.project-card` elements by their
  `data-category` attribute (`excel` | `pdf` | `web`).

## Development

- **Editing content:** all copy is inline in each HTML file. There is no
  templating engine.
- **Styling:** each page embeds its own `<style>` block; only the
  light-mode overrides live in `theme.css`. `style.css` contains animation
  utility classes but is currently not loaded by any active page.
- **Behavior:** page-specific JavaScript is inline `<script>` at the bottom
  of each page; `script.js` and `theme.js` are shared globals.

See [ARCHITECTURE.md](ARCHITECTURE.md) for a detailed technical breakdown,
[CONTRIBUTING.md](CONTRIBUTING.md) for contribution workflow, and
[docs/SETUP.md](docs/SETUP.md) for environment and deployment instructions.

## Known Gaps (noted during audit)

- ~~Favicon references~~ — **fixed**: `assets/logo.png` was generated from
  `assets/logo.jpeg` and all pages resolve their favicon correctly.
- `portfolio.html` download links under `assets/projects/` point to
  files (`*.xlsx`, `*.pdf`) that are not present in the repository —
  these buttons will 404 until the sample files are uploaded.
- `images/` and the `*-full.txt` files are legacy source versions that are
  not referenced by any active page (except `images/og-image.jpg`, now
  used by the Open Graph/Twitter share tags in `index.html`).

## License

No `LICENSE` file is present in the repository. The rights of the website
content remain with GAHONSH FREELANCING. See `terms.html` for published
terms.
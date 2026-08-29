# Contributing

Thanks for helping with the **Gahonsh Freelancing** website. This is a
small static site, but it is **live on GitHub Pages**, so every change to
`main` is a production deploy. Please follow the guidelines below.

## Getting Started

1. Clone the repository.
2. Serve locally for development:
   ```bash
   python3 -m http.server 8000
   ```
   Open `http://localhost:8000` and navigate to the page you are changing.
   There is no build step, so you can also open the HTML files directly.

## Making Changes

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-change
   ```
2. Keep changes **scoped and minimal**. Because pages are standalone,
   shared UI (header, footer, theme logic) must be replicated consistently
   across pages — make sure you update *all* pages that share the pattern.
3. Update affected documentation when behavior or structure changes
   (`README.md`, `ARCHITECTURE.md`, `AGENTS.md`, `docs/`).

> Do not regenerate or edit `FullWebsiteCode.zip` / `_tmp_unzip/` — live
> edits belong in the actual HTML/CSS/JS files.

## Commit Guidelines

- Use plain-English, imperative messages: `fix: ...`, `feat: ...`,
  `chore: ...`, `docs: ...`.
- Do not commit temporary files, editor junk, or personal data.
- The only gitignored path is `Archive/`; the zip and `_tmp_unzip/` are
  tracked intentionally.

## Testing (manual, since there is no CI)

For every change, verify in a browser:

- The affected page(s) at desktop and mobile widths (hamburger menu).
- The shared nav and footer render correctly on all main pages.
- Any touched behavior:
  - Light/dark toggle (`script.js` + `theme.js` + `theme.css`)
  - FAQ accordion, stat counters, portfolio filters, scroll-reveal
  - WhatsApp deep links and the contact form POST to Formspree
  - Newsletter opens WhatsApp with the entered email
- Optionally validate HTML at <https://validator.w3.org>.

If a change adds behavior that can be tested automatically, you *may*
propose a minimal test setup — but do not add a build/test framework
without maintainer approval first.

## Pull Requests

1. Push your branch and open a PR to `main`.
2. Describe what changed and why, and note any manual QA performed.
3. Reference any affected documentation or known gaps you touched.
4. Do **not** merge your own PR without review. Because Pages publishes
   `main` directly, merges should be deliberate.

## Maintaining the Site

- When adding/removing/renaming pages, update in the same PR:
  `sitemap.xml`, `robots.txt` (if needed), `home.html`, all navigation and
  footer blocks, and this repo's docs.
- When changing titles or URLs, keep the canonical URLs and JSON-LD
  structured data in sync.
- Never introduce credentials or API keys (see `SECURITY.md`).
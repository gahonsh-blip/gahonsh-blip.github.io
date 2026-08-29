# AGENTS.md

Repository guide for AI agents and human contributors working on the
**Gahonsh Freelancing** GitHub Pages static site.

## Project Type

- **Static website only.** Vanilla HTML5/CSS3/JS, no framework, no build
  step, no package manager, no backend, no database.
- Hosted on **GitHub Pages**. Content is served directly from the `main`
  branch repository root.
- Any change to files in `main` becomes live on deploy. Treat every edit
  as **production-facing**.

## Non-Negotiable Rules

1. **Never break a page.** Every page is a standalone self-contained HTML
   file with its own inline `<style>` and `<script>` blocks. Validating a
   change requires opening the affected page(s) in a browser.
2. **Keep paths relative.** Links use relative paths (`index.html`,
   `assets/logo.jpeg`, `images/hero.jpg`). Do not introduce absolute local
   paths.
3. **No secrets in code.** There are no credentials to add. Do not add API
   keys, tokens, or personal data anywhere in the repo. The Formspree
   endpoint and WhatsApp number are intentionally public business
   contact-points; keep them that way and never treat them as secrets to
   hide or rotate.
4. **Do not regenerate/overwrite the archive.** `FullWebsiteCode.zip` and
   `_tmp_unzip/` are retained as a historical snapshot of an older site
   version. Code fixes belong in the live files, not in the archive.
5. **Preserve SEO assets.** `sitemap.xml`, `robots.txt`, the Google
   verification file, canonical URLs, and JSON-LD structured data must be
   updated together whenever URLs or page titles change.
6. **No templating shortcuts.** Pages are hand-maintained. When a change
   affects shared UI (header/footer/scripts), it must be applied to every
   page that shares it — there is no partial or shared template.

## Code Conventions

- **HTML:** semantic sections, inline styles use CSS custom properties
  defined in each page's `:root` (`--bg-dark`, `--accent-cyan`,
  `--text-main`, etc.).
- **CSS:** shared light-mode overrides in `theme.css`; per-page styles are
  inline. `style.css` is a legacy animation-utility stylesheet and is not
  loaded by any active page.
- **JS:** plain functions/`const`, no imports. `script.js` injects the
  light/dark toggle button; `theme.js` persists the choice in
  `localStorage` (`light`/`dark`).
- **Comments:** existing inline scripts mix English and Hinglish comments.
  New comments should be concise English.
- **Indentation:** 4 spaces for HTML/JS inline blocks.

## Testing

There is **no automated test infrastructure** (no CI, no `package.json`).
Manual verification is the standard:

- Serve locally: `python3 -m http.server 8000`.
- Check the affected page(s) plus at least `index.html` for nav/footer
  consistency.
- Verify mobile navigation (hamburger overlay) at narrow widths.
- If you touch shared behavior, verify: theme toggle, back-to-top,
  WhatsApp links, portfolio filters, FAQ accordion, and stat counters on
  the pages where they appear.
- HTML validation (e.g., [validator.w3.org](https://validator.w3.org)) is
  recommended for structural edits.

Do **not** add a build/test framework without explicit user approval.

## Security Guidelines

- Zero backend means zero server-side injection surface. The main risks
  are **in-page**:
  - Never insert unescaped user-controlled content into the HTML.
  - The contact form must keep POSTing to the existing Formspree endpoint;
    do not add a custom action or inline handlers that send data elsewhere.
  - Newsletter input is only used to build a WhatsApp URL; keep it
    validated client-side and `encodeURIComponent`-escaped.
  - Do not add external scripts/CDNs without evaluating supply-chain risk.
    Font Awesome (cdnjs) and Google Maps embed are the current external
    integrations; document any new one.
  - No entry point in this static site should ever hold a credential.
- If a future dynamic backend is introduced, follow OWASP Top 10 practices
  and do not weaken the current no-credentials posture.

## Git Workflow

- Branch and open a pull request for any non-trivial change. Do not push
  directly to `main` for features.
- Keep commits focused and message them in plain English (e.g.,
  `fix: correct favicon reference on all pages`).
- Before committing, confirm no stray files: the zip archive and
  `_tmp_unzip/` are tracked intentionally; `Archive/` is the only
  git-ignored path.
- Do not commit editor junk, screenshots of working states, or temporary
  files. Do not `git push` unless explicitly asked.
- If it declares a license change, update the missing `LICENSE` only after
  the owner confirms the intended license — there is no LICENSE file today.

## Architecture Constraints

- **Pages & anchors:** navigation links target `index.html`, `about.html`,
  `services.html` (+ `#excel`, `#pdf`, `#web` anchors), `portfolio.html`,
  `pricing.html`, `contact.html`. The footer links to `privacy-policy.html`
  and `terms.html`. Do not rename pages without updating `sitemap.xml`,
  `home.html`, and every navigation/footer across all pages.
- **Contact form flow:** `contact.html` → Formspree POST (hidden `_next` =
  `thank-you.html`) → success page. Preserve this flow.
- **Portfolio data:** `.project-card[data-category]` + `.btn-filter`
  buttons drive the client-side filter. Download links reference
  `assets/projects/<file>` (files currently absent — flagged gap).
- **Theme system:** `script.js` toggles `body.light-mode`; `theme.css`
  overrides the CSS variables; `theme.js` persists across pages. Keep the
  three files coherent when changing theming.
- **External services (all public):**
  - Formspree endpoint: `https://formspree.io/f/xzdqnoez`
  - WhatsApp: `wa.me/918825183628`
  - Email: `gahonsh@gmail.com`
  - Google Maps embed + `maps.app.goo.gl/bPxXtFfKWn3NzwhJ7`
  - Font Awesome 6.4.0 via cdnjs
  - Social: LinkedIn, Instagram, YouTube, Facebook, X (URLs in page
    footers and index JSON-LD)

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical reference and
[docs/SETUP.md](docs/SETUP.md) for environment/deployment steps.
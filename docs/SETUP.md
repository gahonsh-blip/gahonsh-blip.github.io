# Setup Guide

How to run, preview, and deploy the **Gahonsh Freelancing** static website.

## Requirements

- Any static-file web server (the site has **zero dependencies**, no
  Node, no build step). A Python 3 installation is the easiest path.
- A GitHub account for publishing (the site runs on GitHub Pages).

## 1. Local Preview
 
### Option A: Using Node.js (Recommended)

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

### Option B: Using Python or Direct Static Server

```bash
# from the repository root
python3 -m http.server 8000
```

Open <http://localhost:8000>. Alternatively, double-click any `.html`
file — pages work from `file://` because no absolute local paths are used
(the only external assets are CDN links and the Google Maps/Formspree
endpoints, which load over the network).

> The site's title, SEO, and JSON-LD data use the production URL
> `https://gahonsh-blip.github.io/`. Canonical URLs will differ when
> previewing locally; this is expected.

## 2. Configuration

There is **no configuration file** in this repo. The few "settings" live
in the HTML:

| Setting                        | Where                                             |
| ------------------------------ | ------------------------------------------------- |
| Contact form endpoint          | `contact.html`, form `action="https://formspree.io/f/xzdqnoez"` |
| Form redirect target           | `contact.html`, hidden input `name="_next" value="thank-you.html"` |
| WhatsApp number                | `wa.me/918825183628` links across all pages       |
| Contact email                  | `mailto:gahonsh@gmail.com` links                  |
| Map embed + link               | `contact.html` (Google Maps iframe / `maps.app.goo.gl/bPxXtFfKWn3NzwhJ7`) |
| Google site verification       | `googleb9deb43124fcee02.html` in the repo root    |
| Sitemap / robots               | `sitemap.xml`, `robots.txt`                       |

If a form endpoint or phone number should ever change, it must be replaced
in **every page** that references it (nav/footer/CTA blocks are duplicated
per page — see `ARCHITECTURE.md`).

## 3. Deploying to GitHub Pages

1. Make sure the repo is named `<your-github-username>.github.io` so Pages
   serves it as a user site.
2. Push to `main`.
3. In the GitHub repo **Settings → Pages**, choose **Deploy from a branch**
   and select branch `main`, folder `/` (root). *Needs Verification:*
   confirm the current Pages source setting — no workflow file or settings
   exist in the repo to reflect it.
4. The site publishes to `https://<your-github-username>.github.io/`
   (here: `https://gahonsh-blip.github.io/`).

Because pages are served directly from the branch root, there is no build
artifact and no release step.

## 4. Post-Deploy Checklist

- [ ] Home loads; nav links work on desktop and mobile (hamburger menu).
- [ ] Contact form POSTs and redirects to `thank-you.html`.
- [ ] WhatsApp `wa.me` links open with the correct pre-filled text.
- [ ] Light/dark toggle persists across pages (check `localStorage`).
- [ ] `sitemap.xml`, `robots.txt`, Google verification file are reachable.
- [ ] If you fixed them: favicon (`assets/logo.png`) and portfolio sample
      downloads (`assets/projects/*`) resolve without 404.

## 5. Troubleshooting

| Symptom                                  | Likely cause                                             |
| ---------------------------------------- | -------------------------------------------------------- |
| Favicon 404 / missing logo icon          | `assets/logo.png` deleted or stale (it is generated from `logo.jpeg`)   |
| Portfolio "download" buttons return 404  | Files under `assets/projects/` are not in the repo       |
| Form doesn't redirect                    | Formspree endpoint ID changed in `contact.html`          |
| Theme resets per page                    | `localStorage` blocked/cleared; `theme.js` must run on every page |
| Old redirect page shows                   | `home.html` is a legacy stub redirecting to `/`          |

## 6. Editor / Dev Tooling Notes

- No linters, formatters, or test runners are configured.
- Each HTML file is self-contained; edit copy directly in the file.
- The only shared JS (`script.js`, `theme.js`) injects/owns the theme
  toggle — removing it from a page disables theming there.
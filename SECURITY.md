# Security Policy

## Supported

The latest commit on `main` is the supported version. GitHub Pages serves
the repository directly, so this is also the deployed production version.

## Reporting a Vulnerability

This is a public static marketing website. There is no software
vulnerability-disclosure program configured for this repository.

If you believe you have found a security issue, report it privately to the
site owner rather than opening a public issue:

- Email: **gahonsh@gmail.com** (as listed publicly on the site)
- Please include: the page/URL affected, a description of the issue, and
  steps to reproduce. Do not include personal or client data.

## Security Posture

### What this site does not have

- **No backend server, no API, no database** — there is no server-side
  code, injection surface, or stored data in this repository.
- **No authentication.** The site is intentionally public, read-only
  content.
- **No secrets stored in the repository.** Never add API keys, tokens,
  passwords, or customer data to any file. The Formspree endpoint ID
  (`/f/xzdqnoez`) and the WhatsApp number
  (`wa.me/918825183628`) are **public business contact points**, not
  credentials — do not treat them as secret material.

### What the site does with user data

- **Contact form** (`contact.html`) sends name/email/service/budget/message
  to the external **Formspree** service over HTTPS. Privacy (retention,
  access, deletion) is governed by the Formspree account configuration —
  see [docs/DATABASE.md](docs/DATABASE.md).
- **Newsletter** box does not transmit anything; it opens WhatsApp with the
  typed email embedded in the message text.

### Rules for contributors

- Never log, echo, or commit personal identifiers beyond what the site's
  public forms intentionally collect.
- Never add third-party scripts/CDNs without evaluating supply-chain risk;
  the only external scripts are Font Awesome (cdnjs), the Google Maps
  embed, and the Formspree form action.
- Keep all user input client-side validated and URL-encoded
  (`encodeURIComponent`) wherever it flows into generated links.
- Do not weaken the current no-credentials posture if dynamic features are
  added later. Follow OWASP Top 10 practices for any future backend.

## Known Open Items (not vulnerabilities, but follow-ups)

- ~~Favicon~~ — fixed: `assets/logo.png` generated and committed.
- Portfolio download links reference unavailable `assets/projects/` files.
- `images/` and `*-full.txt` are largely orphaned legacy assets
  (`images/og-image.jpg` is now used for share previews).
- There is no `.github/` config, CSP header, or custom-domain file. GitHub
  Pages does not allow custom response headers.
# Database & Data Storage

## Summary

**This repository contains no database.**

The website is 100% static HTML/CSS/JS. There is:

- No database engine, schema, migrations, ORM, or connection code.
- No data-access layer, caching layer, or local storage beyond the browser
  `localStorage` used by the theme.

## Where user data actually goes

| Data                        | Path                                                            | Storage owner                       |
| --------------------------- | --------------------------------------------------------------- | ----------------------------------- |
| Contact-form submissions    | Browser → Formspree (`POST https://formspree.io/f/xzdqnoez`)    | Formspree (external SaaS)           |
| Newsletter email            | Not stored; used to compose a WhatsApp `wa.me` text parameter   | Transient — lives only in the message |
| Theme preference            | `localStorage` key `"theme"` (`"light"` / `"dark"`)             | Visitor's browser                   |
| WhatsApp chat content       | Handled inside the WhatsApp app                                 | WhatsApp / Meta                     |

`theme.js` writes `localStorage.setItem("theme", ...)`; `theme.js` also
reads it on page load **(data flow verified in code)**.

## Notes on the Formspree data

- Formspree is a third-party sender/form service. Data submitted through
  it is stored and processed under Formspree's terms on the account it is
  attached to.
- Retention, export/deletion, and GDPR/DPA details are *Needs Verification
  for this document* — they are account-level settings, not represented in
  this repository.
- The site's published `privacy-policy.html` informs users that submitted
  details (name/brand, business email, project specifications/layout
  files) are used only for quoting and project execution and are not sold
  or shared with third-party tracking networks.

## If a real database is ever introduced

Any future backend that stores customer data must, at minimum:
1. Add a documented schema in this file (or a dedicated `docs/DATABASE-<system>.md`).
2. Follow the security rules in `SECURITY.md` and `AGENTS.md`.
3. Ensure `privacy-policy.html` and contact-flow docs (`docs/API.md`)
   describe the new storage to users.
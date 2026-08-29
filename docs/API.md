# API / Integration Reference

This repository is a **static front-end only**. `docs/API.md` therefore
documents the *external* endpoints the site talks to from the browser,
plus the data each one receives. There is no in-house API server.

## 1. Contact Form → Formspree

| Field     | Value                                   |
| --------- | --------------------------------------- |
| Endpoint  | `https://formspree.io/f/xzdqnoez`       |
| Method    | `POST`                                  |
| EncType   | default `application/x-www-form-urlencoded` (HTML form) |
| Security  | HTTPS from browser to Formspree         |
| Handler   | `contact.html` → `<form id="project-contact-form">` |

### Payload fields

| Field name    | Source element       | Type      | Purpose                         |
| ------------- | -------------------- | --------- | ------------------------------- |
| `_next`       | hidden input         | string    | Redirect target after submit (`thank-you.html`) |
| `name`        | `#client-name`       | text      | Contact name / company           |
| `email`       | `#client-email`      | email     | Business email                   |
| `service`     | `#client-service`    | select    | Chosen service category          |
| `budget`      | `#client-budget`     | select    | Estimated budget range (INR)     |
| `message`     | `#client-message`    | textarea  | Project description              |

### Behavior

- On submit the browser POSTs the form; Formspree handles the message and
  the browser follows `_next` to `thank-you.html`.
- There is **no client-side AJAX** and no custom success handler in the
  code.
- Formspree account-side delivery (email forwarding, storage, GDPR
  handling) is *Needs Verification* — it lives in the Formspree account,
  not in this repository.

## 2. WhatsApp Deep Links

Every CTA is a plain link, `https://wa.me/<number>?text=<url-encoded string>`:

- Number: `918825183628`
- Used by: pricing (per-plan quotes), services (per-service quotes),
  contact (project consultation), index/contact footer (newsletter), and
  the floating WhatsApp button.

### Pre-filled messages

| Context          | `text` parameter                        |
| ---------------- | --------------------------------------- |
| Newsletter       | `Hello Gahonsh, I would like to subscribe my email <email> to your newsletter pipeline.` (built client-side with `encodeURIComponent`) |
| Starter plan     | `Hello Gahonsh, I want to get a custom quote for the Starter Plan.` |
| Professional     | `Hello Gahonsh, I am interested in the Professional Plan milestones.` |
| Business         | `Hello Gahonsh, I want to discuss the Enterprise Business Plan parameters.` |
| Excel service    | `Hello Gahonsh, I am interested in Excel Automation services.` |
| General consult  | `Hello Gahonsh, I want to start a project consultation.` |

No API key is needed; these are consumer deep links.

## 3. Google Maps

- **Embed:** `<iframe src="https://www.google.com/maps/embed?pb=...">` in
  `contact.html` — renders an interactive map (coordinates around
  Jharkhand, India; exact region *Needs Verification* from the iframe's
  `pb` parameter).
- **Link:** `https://maps.app.goo.gl/bPxXtFfKWn3NzwhJ7` ("Open in Google
  Maps").
- No API key is present; the embed uses Google's public iframe endpoint.

## 4. Font Awesome (CDN)

- `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css`
- Loaded in `<head>` of `index.html`, `about.html`, `services.html`,
  `portfolio.html`, `pricing.html`, `contact.html`, `thank-you.html`.
- Loaded by `terms.html` and `privacy-policy.html` since the footer
  WhatsApp link (with `fa-brands fa-whatsapp` icon) was added there.

## 5. Structured Data (JSON-LD)

Schema.org JSON-LD blocks embedded in the pages (no external call):

- **`index.html`**: `@graph` with `Organization` (including `sameAs`
  social URLs), `WebSite`, and `FAQPage` (2 Q&As).
- **`portfolio.html`, `thank-you.html`, `terms.html`,
  `privacy-policy.html`**: small `Organization` blocks with name/url/logo.

## 6. No Internal API

There is no REST/GraphQL endpoint, no function, and no server in this
repository. If a backend is added later, document its endpoints here and in
`ARCHITECTURE.md`, and keep the "no secrets in the client" rule
(`SECURITY.md`).
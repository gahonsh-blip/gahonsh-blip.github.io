# Contributing to Gahonsh Freelancing & Marketplace

Thank you for contributing to **Gahonsh Freelancing & Marketplace**. This repository powers the official website and freelance platform hosted on GitHub Pages. Every change merged to `main` is immediately production-facing.

---

## 1. Getting Started & Local Development

### Option A: Node.js Dev Server (Recommended)
```bash
npm install
npm run dev
```
Open **http://localhost:3000** in your browser.

### Option B: Python Static Server
```bash
python3 -m http.server 8000
```
Open **http://localhost:8000** in your browser.

---

## 2. Contribution Workflow

1. Create a feature branch:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Keep edits focused and self-contained. Since pages are standalone HTML files, ensure shared components (headers, footers, auth modals, theme classes) are consistently updated across all pages.
3. If introducing changes to database interactions, update `docs/marketplace-schema.sql`, `supabase-client.js`, and `docs/DATABASE.md`.
4. Update affected documentation (`README.md`, `ARCHITECTURE.md`, `docs/API.md`).

---

## 3. Manual Testing Checklist

Before submitting a Pull Request, verify the following in a browser:

- **Marketing Pages:**
  - `index.html`, `about.html`, `services.html`, `portfolio.html`, `pricing.html`, `contact.html`.
  - Service flip cards, portfolio filter buttons, FAQ accordions, and stat counter animations.
  - Formspree form submission on `contact.html` redirecting to `thank-you.html`.
  - WhatsApp deep links opening with correctly encoded query parameters.
- **Marketplace Pages:**
  - `jobs.html`: Search, category filtering, and proposal counter badges.
  - `job-details.html`: Proposal submission form validation, client proposal view, "Accept & Hire" contract trigger.
  - `post-job.html`: Job creation form validation, skill tags, dynamic submission.
  - `find-talent.html`: Verified talent directory, hourly rates, and hire buttons.
  - `marketplace-dashboard.html`: Client and Freelancer tabs, active contracts, and status pills.
- **Cross-Cutting Systems:**
  - **Auth & Profiles (`auth.js`):** Sign in, sign up, role toggle (Client / Freelancer), profile updates.
  - **Theme Engine (`theme.js`, `theme.css`):** Light and Dark mode switching and persistence across reloads.
  - **Mobile Navigation:** Touch targets meet minimum 48px height, smooth slide-in drawer, and accessible close buttons on mobile viewports.

---

## 4. Code & Security Rules

- **Zero Secrets:** Never commit API keys, service role secret keys, passwords, or personal credentials.
- **Row-Level Security:** Ensure any database changes in `docs/marketplace-schema.sql` include corresponding PostgreSQL RLS policies.
- **Input Sanitization:** Sanitize user-provided strings before rendering dynamic HTML elements to prevent XSS vulnerabilities.
- **Semantic Commit Messages:** Use clear imperative commit messages (e.g. `feat: add category filter to jobs feed`, `fix: correct mobile close button alignment`).

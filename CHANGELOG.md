# Changelog

All notable changes to the **Gahonsh Freelancing & Marketplace** repository. Format based on [Keep a Changelog](https://keepachangelog.com/).

---

## [1.2.0] - 2026-08-30

### Added
- **Upwork-Style Freelance Marketplace Modules:**
  - `jobs.html` — Comprehensive job feed with multi-criteria filtering, search, and proposal counters.
  - `job-details.html` — Detailed job requirements, client trust profile, proposal bidding form, and contract hiring workflow.
  - `post-job.html` — Intuitive job creation wizard for clients with budget, duration, and dynamic skill tags.
  - `find-talent.html` — Verified talent directory with skill clouds, hourly rates, and hiring actions.
  - `marketplace-dashboard.html` — Dual-role dashboard for clients (jobs, proposals, contracts) and freelancers (bids, active projects, stats).
- **Authentication & Database System (`auth.js`, `supabase-client.js`, `supabase-config.js`):**
  - Supabase Auth integration with role selection (`Client` or `Freelancer`).
  - Dynamic user profile management, avatar badges, and toast notification system.
  - `MockDataEngine` providing complete interactive fallback testing when Supabase credentials are not yet configured.
  - PostgreSQL schema definition (`docs/marketplace-schema.sql`) with Row-Level Security (RLS), triggers, and atomic contract creation RPC.
- **Enhanced Mobile Navigation & Accessibility:**
  - 48px minimum touch targets across all mobile navigation links and auth buttons.
  - Ergonomic 48×48px circular close buttons with smooth tap animations and high-contrast styling in `theme.css`.

### Changed
- Comprehensive synchronization of all repository documentation (`README.md`, `AGENTS.md`, `ARCHITECTURE.md`, `SECURITY.md`, `CONTRIBUTING.md`, `docs/API.md`, `docs/DATABASE.md`, `docs/SETUP.md`).
- Unified light/dark theme persistence across all marketing and marketplace pages.

---

## [1.1.0] - 2026-08-29

### Added
- Animated stat counters and scroll-reveal interactions on `contact.html` and `index.html`.
- Open Graph and Twitter Card share metadata with `images/og-image.jpg`.
- Generated favicon asset `assets/logo.png` from `assets/logo.jpeg`.

### Fixed
- Replaced non-functioning theme button on `index.html` with unified `script.js` theme injector.
- Resolved typographic quote anomalies in `contact.html` budget options.
- Added missing WhatsApp footer links and Font Awesome stylesheet to `terms.html` and `privacy-policy.html`.

---

## [1.0.0] - Initial Release

- Core agency website with `index.html`, `about.html`, `services.html`, `portfolio.html`, `pricing.html`, `contact.html`, and `thank-you.html`.
- Static Formspree contact form integration and WhatsApp inquiry deep links.

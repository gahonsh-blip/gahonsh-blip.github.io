# Changelog

All notable changes to the **Gahonsh Freelancing & Marketplace** repository. Format based on [Keep a Changelog](https://keepachangelog.com/).

---

## [Unreleased]

### Added
- **In-Site File Transfer (send / receive):**
  - `assets/js/file-transfer.js` — shared panel that lets a client and a freelancer exchange files on a project without leaving the website. Built with DOM APIs (`textContent`), so a crafted file name cannot become markup. Blocks OS-executable extensions and files over 25 MB, and caps a selection at 10 files.
  - `window.GahonshDB.Files` service in both `supabase-client.js` (Supabase Storage + the `file_transfers` table) and `marketplace-local.js` (IndexedDB blobs for offline mode), so upload, list, download and remove work in every mode.
  - `file_transfers` table plus `can_access_job_files()` / `can_upload_job_files()` helpers, RLS policies, and a private `job-attachments` Storage bucket with matching object policies in `docs/marketplace-schema.sql`.
  - Panel mounted on `job-details.html` for project participants and on the active-contract cards in `marketplace-dashboard.html`.

### Changed
- `withFallback()` in `supabase-client.js` now degrades to the local engine **only** when the Supabase project is unreachable, or when a live request fails at the network layer. Previously the `Files` service also fell back when a *reachable* project had not yet been migrated (missing table or bucket); that silently routed file metadata to the per-browser local engine and split the user's identity, so a signed-in user was told to sign in and an "uploaded" file never reached the other party. A reachable-but-unmigrated project now surfaces the deployment gap instead.
- The file-transfer panel shows a clear setup message when the deployment has not been migrated yet, instead of leaking a raw `PGRST205` / `Bucket not found` error.

### Fixed
- **File permissions now match the SQL policies in the offline engine.** `marketplace-local.js` previously treated any freelancer with a live proposal as a full participant, so a bidder could list and delete the client's files. It now mirrors `can_access_job_files()` (owner, hired freelancer, admin) for view/download, `can_upload_job_files()` (the above plus a live bidder) for upload, and uploader-or-admin for delete.
- The `job-attachments` Storage read policy now also allows the object owner (`owner = auth.uid()`), so a bidder can download a sample they uploaded before being hired. This mirrors the `uploaded_by = auth.uid()` clause already present on the metadata read policy.
- Selecting more than 10 files at once silently dropped the extras; the panel now reports how many were not sent.

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

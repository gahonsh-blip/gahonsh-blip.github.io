# Changelog

All notable changes to the **Gahonsh Freelancing & Marketplace** repository. Format based on [Keep a Changelog](https://keepachangelog.com/).

---

## [Unreleased]

### Added
- **Guided chat assistant tasks.** The site-wide assistant (`chat-widget.js`) can now run real tasks step by step instead of only answering questions. It asks for the required fields, shows a review summary, and then calls the same service the page form uses:
  - **Post a job** (client): title, category, scope, pricing model, fixed budget or hourly range, duration, experience level and optional skills → `Jobs.createJob()`.
  - **Build / update a profile** (worker or client): full name, professional title, location, skills and hourly rate (worker only) and bio → `Profiles.updateMyProfile()`.
  - **Upload a resume** (worker): opens the profile editor at the Resume / CV (PDF) section.
  - **Submit a proposal** (worker): job link/ID, bid, delivery days and cover letter → `Proposals.submitProposal()`.
  - Sign-in and role checks gate every write; the bot opens the normal auth modal and offers a **Continue** action. Every user value is escaped before rendering, and the offline fallback works because the bot calls `GahonshDB`.
  - A new **What I can do** help intent lists the capabilities and limits (no payments, no account approval), with quick-action chips for each task.
  - `docs/CHAT-ASSISTANT.md` documents the capability table, commands, safety rules and browser test steps; `AGENTS.md` records the maintenance contract.
- **Freelancer resume / CV uploads (PDF):**
  - `Profiles.uploadResume()`, `getResume()` and `removeResume()` in both `supabase-client.js` (private `resumes` Storage bucket plus short-lived signed URLs) and `marketplace-local.js` (IndexedDB blobs), so the feature works online and in the offline fallback.
  - The profile editor (`auth.js`) now shows a freelancer-only "Resume / CV (PDF)" section with Upload, View and Remove, a 5 MB cap and PDF validation.
  - `find-talent.html` shows a Resume button on profiles that have one and opens the PDF in an in-page viewer with download and new-tab fallbacks; `job-details.html` proposal cards expose the same button so a client can review a CV before hiring.
  - Schema: `profiles.resume_name`, `resume_size_bytes`, `resume_updated_at`; `public_profiles.has_resume`; a private `resumes` bucket with owner-only writes and authenticated reads. Migration: `supabase/migrations/20261123000000_add_freelancer_resumes.sql`.
  - `npm run test:local` now covers 8 resume authorization cases (anonymous view, client upload, non-PDF, upload, listing, client view, owner remove, removed resume).
- **In-Site File Transfer (send / receive):**
  - `assets/js/file-transfer.js` — shared panel that lets a client and a freelancer exchange files on a project without leaving the website. Built with DOM APIs (`textContent`), so a crafted file name cannot become markup. Blocks OS-executable extensions and files over 25 MB, and caps a selection at 10 files.
  - `window.GahonshDB.Files` service in both `supabase-client.js` (Supabase Storage + the `file_transfers` table) and `marketplace-local.js` (IndexedDB blobs for offline mode), so upload, list, download and remove work in every mode.
  - `file_transfers` table plus `can_access_job_files()` / `can_upload_job_files()` helpers, RLS policies, and a private `job-attachments` Storage bucket with matching object policies in `docs/marketplace-schema.sql`.
  - Panel mounted on `job-details.html` for project participants and on the contract cards in `marketplace-dashboard.html`.
- **`scripts/check-local-engine.mjs`** (`npm run test:local`, part of `npm test`) — reproduces the offline-engine authorization divergences below against `marketplace-local.js` in a `node:vm` sandbox, so a regression fails the build instead of only showing up when Supabase is unreachable.

### Changed
- The file-transfer panel on a contract card in `marketplace-dashboard.html` now offers upload only where the policy accepts it — the client always, a freelancer only while the contract is `active`. It previously mounted with `canUpload: true` for every contract, so a freelancer on a completed or cancelled engagement saw an upload box that the policy refused.
- `withFallback()` in `supabase-client.js` now degrades to the local engine **only** when the Supabase project is unreachable, or when a live request fails at the network layer. Previously the `Files` service also fell back when a *reachable* project had not yet been migrated (missing table or bucket); that silently routed file metadata to the per-browser local engine and split the user's identity, so a signed-in user was told to sign in and an "uploaded" file never reached the other party. A reachable-but-unmigrated project now surfaces the deployment gap instead.
- The file-transfer panel shows a clear setup message when the deployment has not been migrated yet, instead of leaking a raw `PGRST205` / `Bucket not found` error.

### Fixed
- **The chat panel covered the sign-in and profile modals on small screens.** `#gc-root` used `z-index: 2147483000`, while the auth and profile modals use `99999`, so the bottom sheet sat on top of the form it had just opened. It now uses `99998`, below both modals, and the assistant closes cleanly into the normal sign-in flow.
- **Saving a page from the Owner Studio baked runtime widgets into the HTML.** The editor serialized the live iframe DOM, so every save captured what the site's scripts had injected at runtime — the auth modal and its styles, the chat panel (`#gc-root`), the theme toggle, the nav Sign In button, `gs-hide` scroll-reveal classes and even a `light-mode` body class. The file grew by ~23 KB per save, and the chat panel could be injected twice on the next load. The preview now sets `window.__GAHONSH_STUDIO_PREVIEW__` before the page's scripts run, and `script.js`, `auth.js`, `chat-widget.js` and `marketplace-trust.js` skip their DOM injection while it is set. A new `cleanForSave()` strips any leftover injected node plus the preview flag, scroll-reveal classes and the `light-mode` class before serializing, for both Save and Download.
- **The editor preview threw `Identifier 'menuOpenBtn' has already been declared` after a save.** Re-rendering reused the iframe's `Window` via `document.open()`/`write()`, which keeps top-level `const`/`let` bindings, so the page's inline scripts aborted on the second render. `renderEditablePage()` now replaces the iframe element on each render to get a fresh JS realm.
- **The Owner Studio API could overwrite non-page files.** `/api/save-page` accepted `.js`, `.css`, `.json` and `.xml` at the repo root, so `filename: "server.js"` replaced the server; `/api/upload-file` accepted any folder, so a caller could write into `.git/hooks`. Saving is now limited to `.html`/`.htm` at the repo root, and uploads are limited to `images`, `assets/projects`, `assets/media` and `assets/files` with a resolved-path containment check. Verified: `server.js` save → 403, `../../tmp` upload → 403, normal page save/upload → 200.
- **The editor claimed changes were "LIVE" when they were only written to local disk.** Saving does not publish to GitHub Pages; the file has to be committed and pushed. The button now reads "सेव करें (Save)" with a "Local save · publish = git push" hint, the toast and server response say the change was saved locally and must be pushed to publish, and "लाइव पेज" became "प्रीव्यू (Preview)".
- **`find-talent.html` could hang the browser tab until Chrome killed it.** `marketplace-trust.js` ran a `MutationObserver` over `document.body` that called `paintRatings()`, and `paintRatings()` rewrote each node's `textContent`. Assigning `textContent` always replaces the text node, so the observer saw its own write as a fresh change and re-entered `paintRatings()` forever — a CPU-pegged tab ("Page unresponsive" / "Aw, Snap!"). The painter now writes only when the value actually changes and carries a re-entrancy guard, so a render pass can never trigger itself.
- **Talent cards no longer collapse to just a star rating.** The same `data-rating-uid` attribute sat on both the card and its `.mt-rating` placeholder, and `paintRatings()` selected every match — so it overwrote the whole card (name, bio, skills) with the rating text. The selector is now scoped to `.mt-rating[data-rating-uid]`.
- **Invisible text in light mode on several pages.** Hardcoded near-black panels (`#070c19`, `#02050c`, dark gradients) kept their dark background while theme variables flipped the text to dark ink, so headings, table headers and banner copy disappeared. `theme.css` now gives those surfaces a light background (or light-safe text colour) in light mode: services flip cards and comparison table, pricing comparison table and conversion banner, about trust section, portfolio stat cards, the legal-page top bar, the thank-you return button and footer links, the post-job sign-in notice, and the talent rating badge. (Found with a headless contrast audit across every page, including below-the-fold scroll-reveal content.)
- **Three tables the client already queries were missing from the schema.** `marketplace-trust.js` reads `worker_ratings` and writes `reviews`, and `messages.html` reads/writes `messages`, but `docs/marketplace-schema.sql` never created them — every review and contract-message request 404'd on a migrated project. Added the `reviews` and `messages` tables, the `worker_ratings` aggregate view, RLS, participant-only policies, indexes, and the `worker_ratings` grant for anonymous visitors. `npm run test:schema` passes again.
- `messages.html` requested `/favicon.ico` and logged a 404; it now links the shared `assets/logo.png` icon.
- **The offline engine now enforces the same access rules as the SQL policies.** `marketplace-local.js` is the fallback the whole site runs on when no Supabase project is reachable, and six of its rules had drifted from `docs/marketplace-schema.sql` — none were exploitable through the UI today, but each is a rule that holds in SQL and silently breaks offline:
  - `Contracts.acceptProposalAndHire()` accepted a **withdrawn, rejected or already-accepted** proposal, while the `accept_proposal_and_create_contract()` RPC refuses those states. A withdrawn bid could be turned into a live contract.
  - `Proposals.withdrawProposal()` had **no owner check**, so any signed-in user could withdraw another freelancer's proposal; the UPDATE policy requires `freelancer_id = auth.uid()`. It now also refuses to withdraw a proposal that is no longer live.
  - `Proposals.getProposalsForJob()` returned **every** proposal to any caller, so one bidder could read a competitor's cover letter and bid. It now mirrors the SELECT policy: the job owner and admins see all, everyone else sees only their own.
  - `Contracts.getContractForJob()` returned the contract — including the agreed amount — to **anyone**, including users who were not a party. It now returns nothing unless the caller is the client, the freelancer or an admin.
  - `Jobs.updateJobStatus()` had **no authorization and no state machine**, so any user could set any job to any status. It now requires the owner or an admin and enforces the same transitions as `validate_job_mutation()`.
- **A rejected bidder is no longer offered an upload box they cannot use.** `assets/js/job-details-flow.js` mounted the file-transfer panel with `canUpload: true` for any freelancer who held a proposal record, including one whose bid had been *rejected* after the client hired someone else. The upload was then refused by the policy, so the control looked broken. The panel now derives the flag from `userMayUploadFiles()`, a mirror of `can_upload_job_files()` (owner, admin, hired freelancer, or a proposal still `submitted`/`shortlisted`/`accepted`), so a rejected bidder keeps read access but sees no upload control.
- **Admins can remove any file again.** The remote path in `supabase-client.js` (`Files.decorate`) computed `can_remove` as "uploader only" and ignored the admin role, while the local engine and the SQL `DELETE` policy both allow an admin. An admin therefore saw no Remove control even though the database would have accepted the delete. `decorate` now reads the caller's `profiles.role` and mirrors uploader-or-admin.
- **File permissions now match the SQL policies in the offline engine.** `marketplace-local.js` previously treated any freelancer with a live proposal as a full participant, so a bidder could list and delete the client's files. It now mirrors `can_access_job_files()` (owner, hired freelancer, admin) for view/download, `can_upload_job_files()` (the above plus a live bidder) for upload, and uploader-or-admin for delete.
- The `job-attachments` Storage read policy now also allows the object owner (`owner = auth.uid()`), so a bidder can download a sample they uploaded before being hired. This mirrors the `uploaded_by = auth.uid()` clause already present on the metadata read policy.
- Selecting more than 10 files at once silently dropped the extras; the panel now reports how many were not sent.
- **Stored-XSS vector removed from the bundled Finance portal (`finance/`).** Ten of its pages rendered API-supplied ids, file names, phone numbers and flag keys straight into inline `onclick`/`onchange` attributes. HTML entity decoding happens before the JS parser, so escaping a value inside an inline handler does not make it safe — a crafted record could run script in an admin's session. Every such handler is now a `data-*` attribute read by a delegated `click`/`change` listener, matching the rule already enforced for the marketplace pages. `finance/site/js/client-page.js` builds the KYC review rows as DOM nodes (`textContent`) instead of string-built HTML, and `finance/admin/js/admin-shell.js` sets the empty/error state colour via `style` rather than interpolating it into `innerHTML`. `npm run test:security` now passes across the whole repository (was 38 failures, all in `finance/`).

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

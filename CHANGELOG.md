# Changelog

All notable changes to this repository. Format based on
[Keep a Changelog](https://keepachangelog.com/).

The local clone is a shallow, grafted copy whose history contains a single
commit (`65ecbc5`). Entries before that commit cannot be reconstructed
from available history.

## [Unreleased]

### Added

- Initial repository documentation audit & complete reference files: `README.md`, `AGENTS.md`,
  `ARCHITECTURE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, `.env.example`,
  and `docs/` (`SETUP.md`, `API.md`, `DATABASE.md`).
- Node.js preview server configuration (`server.js`, `package.json`, `metadata.json`) for zero-configuration container and local runs.
- `assets/logo.png` favicon generated from `assets/logo.jpeg` (fixes 404 on
  every page).
- Open Graph and Twitter Card share-preview tags in `index.html` using
  `images/og-image.jpg`.

### Fixed

- Removed the broken hardcoded Light/Dark button in `index.html` (called a
  non-existent `changeMode()` and showed mojibake); only the working button
  injected by `script.js` remains.
- Replaced stray typographic-quote characters in the `contact.html` budget
  dropdown options with clean `-` separators.
- Added missing `fa-brands fa-whatsapp` footer link (and Font Awesome CSS)
  to `terms.html` and `privacy-policy.html` for parity with the other
  pages.

## [2026-08-29] — 65ecbc5

### Changed

- Enhanced `contact.html` with animation effects (scroll-reveal classes,
  animated stat counters, hover-lift panels).

### Notes

- The repository is a static GitHub Pages site. There is no versioned
  release process; every commit to `main` is a production deploy.
- Assets referenced but currently missing (favicon `assets/logo.png`,
  portfolio samples under `assets/projects/`) are tracked as known gaps in
  `ARCHITECTURE.md` — they are **not** listed as "removed" because they are
  simply absent from the repository.
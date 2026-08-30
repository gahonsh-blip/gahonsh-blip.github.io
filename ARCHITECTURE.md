# Architecture & System Design

Technical reference for the **Gahonsh Freelancing Website & Upwork-Style Marketplace** (`gahonsh-blip/gahonsh-blip.github.io`).

- **Architecture:** Hybrid Static Client + Cloud Backend ([Supabase](https://supabase.com)) + Client-Side Fallback Engine.
- **Hosting:** GitHub Pages (production root) / Node.js static preview container (Port 3000).
- **Backend & Database:** Supabase (PostgreSQL 15+, Supabase Auth, Row-Level Security, Database Triggers, Atomic RPC).
- **Security:** Public `anon` key only; strictly enforced Row Level Security (RLS) on all database tables.

---

## 1. System Topology & Data-Flow

```
                               ┌────────────────────────────────────────────────────────┐
                               │                    Visitor's Browser                   │
                               └──────────────┬──────────────────────────┬──────────────┘
                                              │                          │
                      Static Assets (HTML/CSS/JS)                        │ User Actions (Auth / Jobs / Proposals)
                                              ▼                          ▼
                         ┌───────────────────────────┐         ┌───────────────────────────┐
                         │       GitHub Pages /      │         │   Supabase Cloud Engine   │
                         │      Node.js Server       │         │   (or MockDataEngine)     │
                         └───────────────────────────┘         └─────────────┬─────────────┘
                                                                             │
                                              ┌──────────────────────────────┴──────────────────────────────┐
                                              ▼                                                             ▼
                                 ┌─────────────────────────┐                                   ┌─────────────────────────┐
                                 │      Supabase Auth      │                                   │     PostgreSQL + RLS    │
                                 │ (JWT, Client/Freelancer)│                                   │ (Profiles, Jobs, Bids)  │
                                 └─────────────────────────┘                                   └─────────────────────────┘
```

---

## 2. Directory & File Structure

```
gahonsh-blip.github.io/
├── index.html                  Agency landing page & marketplace discovery entry
├── jobs.html                   Marketplace job search & filterable feed
├── job-details.html            Detailed project scope, client trust card & proposal bidding
├── post-job.html               Interactive job creation form for clients
├── find-talent.html            Verified freelancer directory & skill filters
├── marketplace-dashboard.html  Client & Freelancer dashboard (Proposals, Contracts, Jobs)
├── about.html                  Company story, trust values, operational workflow
├── services.html               Interactive 3D flip cards for 6 core services + comparison table
├── portfolio.html              Filterable project showcase (Excel, PDF, Web)
├── pricing.html                Transparent pricing tiers, feature matrix & custom calculators
├── contact.html                Contact form (Formspree), WhatsApp CTAs, embedded map
├── thank-you.html              Submission success confirmation page
├── terms.html                  Terms & conditions
├── privacy-policy.html         Privacy policy
├── home.html                   Legacy redirect stub to index.html
├── auth.js                     Authentication manager, Sign In/Up modal & role switcher
├── supabase-client.js          Database client wrapper & interactive mock fallback engine
├── supabase-config.js          Supabase connection parameters & localStorage manager
├── theme.js                    Dark/Light mode theme state manager
├── theme.css                   Shared light-mode overrides & mobile UX touch targets
├── script.js                   Theme toggle button injector
├── server.js                   Node.js static preview server (Port 3000)
├── package.json                Dev server scripts & dependencies
├── metadata.json               Platform metadata & configuration
├── .env.example                Environment variable declarations
├── assets/                     Brand assets (logo.png, logo.jpeg, favicon)
├── images/                     Social media share preview assets (og-image.jpg)
├── docs/
│   ├── marketplace-schema.sql  PostgreSQL schema, RLS policies, triggers, RPC
│   ├── SETUP.md                Comprehensive setup & deployment guide
│   ├── DATABASE.md             Database architecture & entity relationships
│   └── API.md                  API endpoints & integration specifications
└── README.md / AGENTS.md / ARCHITECTURE.md / SECURITY.md / CHANGELOG.md / CONTRIBUTING.md
```

---

## 3. Frontend Architecture

### 3.1 Marketing & Agency Pages

| Page | Key Capabilities |
| :--- | :--- |
| `index.html` | Hero with animated stat counters (`IntersectionObserver`), service preview, trust badges, customer reviews, interactive FAQ, newsletter pipeline. |
| `about.html` | Agency history, mission/vision, standard operating procedures, leadership principles. |
| `services.html` | 6 interactive flip-card services (Excel Automation, PDF Layouts, Web Apps, AI Workflows, Presentation Systems, Digital Branding) + comparison matrix. |
| `portfolio.html` | Client-side filterable project cards (`.btn-filter[data-filter]` & `.project-card[data-category]`). |
| `pricing.html` | Tiered pricing cards (Starter, Professional, Enterprise) + SLA commitments + WhatsApp quotes. |
| `contact.html` | Direct Formspree form POST, interactive Google Maps iframe, WhatsApp quick links. |

### 3.2 Marketplace Pages

| Page | Key Capabilities |
| :--- | :--- |
| `jobs.html` | Full-text search, category filtering (Excel, Web, PDF, AI, Graphic Design), budget range filters, experience level badges, pagination, proposal counters. |
| `job-details.html` | Client credibility card, budget specifications, required skill cloud, proposal submission form (bid price, delivery days, cover letter), received proposals list (for job owners), "Accept & Hire" contract creation. |
| `post-job.html` | Client job creator with validation, budget type (Fixed / Hourly), duration selection, dynamic skill tagging, live database/mock persistence. |
| `find-talent.html` | Directory of verified freelancers with skill tags, rating stars, hourly rates, portfolio links, direct inquiry buttons. |
| `marketplace-dashboard.html` | Dual-view portal: **Client View** (Posted Jobs, Received Proposals, Active Contracts) and **Freelancer View** (Active Bids, Ongoing Contracts, Completed Milestones). |

---

## 4. Core State Engines

### 4.1 Authentication Engine (`auth.js`)
- Manages user session state (`client` or `freelancer` role).
- Injects standard modal UI for Sign In, Sign Up, and Profile Customization.
- Automatically handles dynamic navigation pills, avatar display, and mobile navigation auth buttons.
- Connects to Supabase Auth when configured; gracefully falls back to local demo authentication.

### 4.2 Database & Fallback Layer (`supabase-client.js`)
- Wraps Supabase JavaScript client methods.
- Incorporates `MockDataEngine` providing complete offline/demo persistence across sessions using `localStorage` and seed datasets.
- Provides seamless transition from demo mode to live Supabase cloud database with zero code modification.

### 4.3 Theme Engine (`theme.js`, `theme.css`, `script.js`)
- Persists user theme preference (`"light"` / `"dark"`) in `localStorage`.
- Injects floating theme toggle button with smooth micro-interactions.
- `theme.css` enforces high contrast, WCAG 2.1 compliance, and 48px minimum touch-target ergonomics for mobile navigation.

---

## 5. Security & Access Control

- **Public Anon Key Only:** The front-end only uses the public Supabase `anon` key. The `service_role` secret key is never embedded.
- **Row-Level Security (RLS):** Every PostgreSQL table has RLS policies enforcing strict ownership validation (`auth.uid() = user_id`).
- **Atomic Operations:** Critical business logic like contract generation from accepted proposals is encapsulated in PostgreSQL RPC functions (`accept_proposal_and_create_contract`).
- **Sanitized Inputs:** All form submissions and URL parameters are sanitized and encoded (`encodeURIComponent`).

---

## 6. Deployment Workflow

1. **GitHub Pages (Primary Live Deployment):**
   - Push code to `main` branch.
   - Hosted at `https://gahonsh-blip.github.io/`.
   - Zero build step required.
2. **Local / Container Preview:**
   - Run `npm run dev` to launch `server.js` on port 3000.

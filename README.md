# Gahonsh Freelancing & Marketplace

Modern agency website & freelance marketplace for **GAHONSH FREELANCING**, delivering specialized digital solutions in Excel automation, PDF/PPT engineering, full-stack web software, Python/AI workflows, and connecting clients with verified freelance specialists worldwide.

The platform is designed with a lightweight zero-build client-side architecture that runs seamlessly on **GitHub Pages** (`https://gahonsh-blip.github.io/`) and connects securely with **Supabase** for user authentication, job postings, proposal submissions, contracts, and role-based access control (RLS).

---

## 🌟 Key Features

### 1. Agency & Marketing Website
- **Home (`index.html`)** — Hero showcase, live stat counters, service pillars, marketplace discovery CTA, customer testimonials, and interactive FAQ.
- **About (`about.html`)** — Company story, trust promises, standard operating procedures, mission/vision.
- **Services (`services.html`)** — 6 interactive flip-card service suites (Excel Automation, Web Development, PDF Layouts, Presentation Systems, AI Automations, Digital Branding).
- **Portfolio (`portfolio.html`)** — Filterable showcase with category tabs (Excel, PDF, Web) and asset downloads.
- **Pricing (`pricing.html`)** — Transparent fixed & hourly tier options with feature matrices.
- **Contact (`contact.html`)** — Direct Formspree inquiry form, embedded Google Maps, instant WhatsApp deep links.
- **Global Theme Engine (`theme.js`, `theme.css`)** — Seamless Dark/Light mode toggle with persistence across all pages.

### 2. Upwork-Style Freelance Marketplace
- **Find Work & Job Feed (`jobs.html`)** — Comprehensive search, multi-filter navigation (Category, Experience level, Job type), live proposal counters, and direct project exploration.
- **Project Details & Bidding (`job-details.html`)** — Detailed scope requirements, required skills cloud, client credibility card, and proposal submission form with real-time bid validation.
- **Post a Job (`post-job.html`)** — Intuitive project creation interface for clients with custom skill tagging, budget limits, duration estimates, and instant publication.
- **Find Verified Talent (`find-talent.html`)** — Directory of verified freelance engineers and specialists with skill clouds, hourly rates, and direct outreach.
- **Marketplace Dashboard (`marketplace-dashboard.html`)** — Dynamic portal displaying posted jobs & received proposals (for Clients) and submitted proposals & contracts (for Freelancers).
- **Client & Freelancer Authentication (`auth.js`, `supabase-client.js`)** — Secure authentication modal (Sign In / Sign Up with Client or Freelancer role selection), dynamic navigation badges, profile management, and toast notifications.

---

## 🏗️ Architecture & Security Model

| Component | Implementation |
| :--- | :--- |
| **Frontend Runtime** | Vanilla HTML5, CSS3 Custom Properties, Modern JavaScript (ES6+) |
| **Styling & Theme** | Native CSS Variables + `theme.css` with dedicated Dark/Light Mode palettes |
| **Authentication & DB** | [Supabase](https://supabase.com) (Auth + PostgreSQL database + Storage) |
| **Security & Privacy** | Row-Level Security (RLS) enforced across all tables; strictly public anon key only |
| **Demo Fallback** | Instant interactive demo mode when database credentials are not yet configured |
| **Forms & Inquiries** | [Formspree](https://formspree.io) endpoint + Direct WhatsApp link generation |

---

## 🚀 Getting Started

### Local Preview (Node.js)
```bash
npm install
npm run dev
```
Open **http://localhost:3000** in your browser.

### Local Preview (Python / Static Server)
```bash
python3 -m http.server 8000
```
Open **http://localhost:8000** in your browser.

---

## 🗄️ Supabase Production Setup

To enable persistent database storage and real user authentication for the marketplace:

1. Create a free project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor** in your Supabase dashboard and run the complete schema script located at:
   ```
   docs/marketplace-schema.sql
   ```
3. Copy your project's **API URL** and **Anon Key** from *Project Settings → API*.
4. Open the website, click the **"Connect Supabase"** badge or configure via `supabase-config.js` / localStorage modal to activate live cloud synchronization.

---

## 📁 Repository Structure

```
.
├── index.html                  Agency Home & Marketplace Entry
├── jobs.html                   Job Marketplace Feed & Search
├── job-details.html            Project Details & Proposal Submission
├── post-job.html               Job Posting Interface for Clients
├── find-talent.html            Verified Freelancer Directory
├── marketplace-dashboard.html  Client & Freelancer Portal
├── about.html                  About Company Page
├── services.html               Services Flip Cards & FAQ
├── portfolio.html              Filterable Work Portfolio
├── pricing.html                Pricing Tiers Matrix
├── contact.html                Contact Form & WhatsApp Inquiries
├── thank-you.html              Submission Success Page
├── terms.html                  Terms & Conditions
├── privacy-policy.html         Privacy Policy
├── auth.js                     Authentication State & Modal Engine
├── supabase-client.js          Database Client & Service Layer
├── supabase-config.js          Supabase Connection Configuration
├── theme.js                    Dark/Light Mode Persistence
├── theme.css                   Shared Light-Mode Overrides
├── script.js                   Theme Button Injector
├── docs/
│   ├── marketplace-schema.sql  PostgreSQL Schema + RLS + Triggers
│   ├── SETUP.md                Comprehensive Setup Guide
│   ├── DATABASE.md             Database Architecture & RLS Documentation
│   └── API.md                  API & Integration Reference
└── package.json                Dev Server & Build Scripts
```

---

## 🛡️ License & Contact

Developed for **Gahonsh Freelancing**.  
Official Support: `gahonsh@gmail.com` | WhatsApp: `+91 88251 83628`

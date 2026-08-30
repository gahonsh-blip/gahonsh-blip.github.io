# API & Integration Reference

This document outlines all external APIs, backend services, and client-side data access layers utilized by **Gahonsh Freelancing & Marketplace**.

---

## 1. Supabase Cloud API (`supabase-client.js` & `auth.js`)

The application integrates with Supabase via the client-side JavaScript SDK (`@supabase/supabase-js`) and PostgREST endpoints.

### Authentication API (`auth.js`)

| Operation | SDK Method | Description |
| :--- | :--- | :--- |
| **User Sign Up** | `supabase.auth.signUp({ email, password, options: { data: { full_name, role } } })` | Registers user with email & password, triggers `handle_new_user()` to populate `public.profiles`. |
| **User Sign In** | `supabase.auth.signInWithPassword({ email, password })` | Authenticates existing user and establishes active JWT session. |
| **User Sign Out** | `supabase.auth.signOut()` | Clears active session and triggers UI auth state update. |
| **Get Active Session** | `supabase.auth.getSession()` / `getUser()` | Retrieves currently logged-in user profile and role. |

### Marketplace Service API (`supabase-client.js`)

| Function | Endpoint / Table | Description |
| :--- | :--- | :--- |
| `getJobs(filters)` | `SELECT * FROM jobs` | Retrieves open jobs with keyword search, category, budget, and sort filters. |
| `getJobById(id)` | `SELECT *, profiles(...) FROM jobs` | Retrieves specific job details along with client verification metadata. |
| `createJob(jobData)` | `INSERT INTO jobs (...)` | Creates a new job posting for authenticated clients. |
| `getProposals(jobId)` | `SELECT *, profiles(...) FROM proposals` | Retrieves proposals submitted for a specific job (Client only) or by a freelancer. |
| `submitProposal(data)` | `INSERT INTO proposals (...)` | Submits a proposal with bid amount, delivery days, and cover letter. |
| `acceptProposal(proposalId, jobId)` | `rpc('accept_proposal_and_create_contract', ...)` | Executes atomic transaction to hire freelancer and generate an active contract. |
| `getContracts(userId)` | `SELECT * FROM contracts` | Fetches active and past contracts for the authenticated user. |
| `getTalents(filters)` | `SELECT * FROM public_profiles` | Retrieves verified freelancer profiles with skill and rate filtering. |
| `getProfile(userId)` | `SELECT * FROM profiles WHERE id = ...` | Retrieves user profile data. |
| `updateProfile(userId, data)` | `UPDATE profiles SET ... WHERE id = ...` | Updates full name, title, hourly rate, bio, and skills array. |

---

## 2. Contact Form → Formspree

| Attribute | Specification |
| :--- | :--- |
| **Endpoint** | `https://formspree.io/f/xzdqnoez` |
| **Method** | `POST` |
| **Encoding** | `application/x-www-form-urlencoded` |
| **Handler** | `contact.html` → `<form id="project-contact-form">` |
| **Redirect Target** | `thank-you.html` (via hidden `<input name="_next" value="thank-you.html">`) |

### Submitted Payload Fields

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `name` | `text` | Client / company representative name |
| `email` | `email` | Client business email |
| `service` | `select` | Selected service pillar (Excel Automation, Web Dev, PDF, AI Workflows, etc.) |
| `budget` | `select` | Estimated budget tier (INR) |
| `message` | `textarea` | Detailed scope / project description |

---

## 3. WhatsApp Deep Links

All instant inquiry CTAs utilize direct URL-encoded WhatsApp deep links:
- **Phone Number:** `+91 88251 83628` (`wa.me/918825183628`)
- **Format:** `https://wa.me/918825183628?text=<encoded-string>`

### Context-Specific Messages

| Context | Generated Message |
| :--- | :--- |
| **Newsletter** | `Hello Gahonsh, I would like to subscribe my email <email> to your newsletter pipeline.` |
| **Starter Plan** | `Hello Gahonsh, I want to get a custom quote for the Starter Plan.` |
| **Professional Plan** | `Hello Gahonsh, I am interested in the Professional Plan milestones.` |
| **Enterprise Plan** | `Hello Gahonsh, I want to discuss the Enterprise Business Plan parameters.` |
| **Excel Service** | `Hello Gahonsh, I am interested in Excel Automation services.` |
| **Web Service** | `Hello Gahonsh, I am interested in Custom Full-Stack Web Development.` |
| **General Consultation** | `Hello Gahonsh, I want to start a project consultation.` |

---

## 4. Google Maps Embed

- **Location:** `contact.html`
- **Embed Source:** Standard public Google Maps iframe (`https://www.google.com/maps/embed?pb=...`)
- **Direct Navigation Link:** `https://maps.app.goo.gl/bPxXtFfKWn3NzwhJ7`

---

## 5. Font Awesome CDN

- **Resource:** `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css`
- Loaded across all pages for consistent iconography.

---

## 6. Structured Data (JSON-LD)

- **`index.html`**: Schema.org `@graph` with `Organization`, `WebSite`, and `FAQPage` entities.
- **`portfolio.html`, `pricing.html`, `services.html`, `contact.html`**: `Organization` metadata.

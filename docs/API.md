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
| `updateJob(jobId, updates)` | `UPDATE jobs SET ... WHERE id = ...` | Edits an open or in-progress job. The owner or an admin only; `id`, `client_id`, counters, `status` and timestamps are stripped; closed jobs are read-only. |
| `getProposals(jobId)` | `SELECT *, profiles(...) FROM proposals` | Retrieves proposals submitted for a specific job (Client only) or by a freelancer. |
| `submitProposal(data)` | `INSERT INTO proposals (...)` | Submits a proposal with bid amount, delivery days, and cover letter. |
| `acceptProposal(proposalId, jobId)` | `rpc('accept_proposal_and_create_contract', ...)` | Executes atomic transaction to hire freelancer and generate an active contract. |
| `setStatus(proposalId, status)` | `rpc('set_proposal_status', ...)` | The client's review of a live bid: `shortlisted`, `submitted` (back to the pile) or `rejected`. The RPC checks that the caller owns the job and that it is still `open`; hiring is not here, `acceptProposal()` is the only path that creates a contract. |
| `withdrawProposal(proposalId)` | `UPDATE proposals SET status = 'withdrawn'` | The freelancer withdraws their own bid while it is `submitted` or `shortlisted`. |
| `getContracts(userId)` | `SELECT * FROM contracts` | Fetches active and past contracts for the authenticated user. |
| `getTalents(filters)` | `SELECT * FROM public_profiles` | Retrieves verified freelancer profiles with skill and rate filtering. |
| `getPublicProfile(userId)` | `SELECT * FROM public_profiles WHERE id = ...` | Retrieves a public talent profile. Email, phone number and password material are never part of this view. |
| `getMyProfile()` | `SELECT ... FROM profiles WHERE id = auth.uid()` | Retrieves the signed-in user's own profile. |
| `updateMyProfile(data)` | `UPDATE profiles SET ... WHERE id = auth.uid()` | Updates only the allow-listed profile fields: `full_name`, `avatar_url`, `location`, `bio`, `title`, `hourly_rate`, `skills`, `phone_number`. `id`, `email`, `role` and `is_verified` are ignored, so a crafted payload cannot edit another profile or escalate a role. |

Public profile reads use `public_profiles`. The private `profiles` table grants only the safe directory columns to `anon`/`authenticated`; email and phone number are not granted. The admin page reads email through the `admin_profiles` view, which returns rows only when `public.is_admin()` is true.

### Contract Milestone API (`window.GahonshDB.Milestones`)

A written delivery plan the two parties keep on the contract. **Nothing here
moves money.** `delivered` is the freelancer saying the work is ready and
`accepted` is the client confirming they checked it; payment still happens
directly between the two of them, as `terms.html` §6 states.

| Function | Endpoint / Table | Description |
| :--- | :--- | :--- |
| `list(contractId)` | `SELECT * FROM contract_milestones WHERE contract_id = ...` | Returns the milestones in `position` order. Readable by both parties and admins. |
| `add({ contractId, title, amount, dueDate })` | `INSERT INTO contract_milestones` | Adds a milestone with a 3–140 character title, an optional non-negative amount, an optional due date, and the next `position`. Both parties may add while the contract is active. |
| `setStatus(milestoneId, status)` | `UPDATE contract_milestones SET status = ...` | One of `pending`, `delivered`, `accepted`. `validate_milestone_mutation()` decides who may make each move: the freelancer marks `delivered`, the client marks `accepted` (only from `delivered`) or sends a delivered milestone back to `pending`. |
| `remove(milestoneId)` | `DELETE FROM contract_milestones` | Deletes a milestone. Both parties may remove their own plan items while the contract is active; only the client may delete an `accepted` one. |

**Rules the database enforces.** A new milestone always starts `pending`; only
the client or the freelancer on that contract may add one; nothing leaves
`accepted`; milestones freeze once the contract is no longer `active`. Reviews
work the same way: `sync_review_contract()` derives `job_id` from the contract
and trims the comment, a unique index allows one review per reviewer per
contract, and the INSERT policy requires a `completed` contract with the
reviewee being the other party. The offline engine mirrors every rule and
`npm run test:local` asserts them.

---

### File Transfer API (`window.GahonshDB.Files`)

The in-site send/receive system. A client and a freelancer exchange files on a
project without leaving the website. The same interface is served by Supabase
Storage plus the `file_transfers` table when a project is reachable, and by the
browser-local IndexedDB engine when it is not, so the panel works in every mode.

| Function | Endpoint / Table | Description |
| :--- | :--- | :--- |
| `upload({ jobId, proposalId, scope, file })` | `storage.upload('<job_id>/<uuid>-<name>')` + `INSERT INTO file_transfers` | Stores the bytes in the private `job-attachments` bucket and records metadata. `scope` is `job` or `proposal`. |
| `listForJob(jobId)` | `SELECT * FROM file_transfers WHERE job_id = ... AND scope = 'job'` | Lists a project's files, decorated with `uploader.full_name` and `can_remove`. |
| `listForProposal(proposalId)` | `SELECT * FROM file_transfers WHERE proposal_id = ...` | Lists files attached to a single proposal. |
| `getDownload(id)` | `storage.download(storage_path)` | Streams the bytes back to the browser; returns `{ blob, fileName, mimeType }`. |
| `remove(id)` | `DELETE FROM file_transfers` + `storage.remove(...)` | Deletes the metadata row and the stored object. Only the uploader or an admin may do this. |

**Access rule.** Reads are limited to the project owner, the freelancer on an
active contract for that project, admins, and the uploader themselves. A
freelancer who has only *proposed* cannot read the client's files before being
hired. Writes are additionally open to a freelancer holding a live proposal on
the project, so samples and briefs can be attached early. Deletes are restricted
to the uploader or an admin. The rule is enforced in the database by
`can_access_job_files()` / `can_upload_job_files()` (used by both the
`file_transfers` policies and the storage-object policies, with the storage read
policy also allowing the object owner), and mirrored in `marketplace-local.js`
so the offline engine behaves the same way.

**UI component.** `assets/js/file-transfer.js` exposes
`window.GahonshFileTransfer.mount({ containerId, jobId, proposalId, scope, title, subtitle, canUpload })`.
It renders the upload control and file list with DOM APIs (`textContent`), never
`innerHTML`, so a crafted file name cannot become markup. It blocks
OS-executable extensions and files over 25 MB, and allows up to 10 files per
selection. It is mounted on `job-details.html` and on the active-contract cards
in `marketplace-dashboard.html`.

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

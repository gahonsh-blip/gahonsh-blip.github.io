# Database & Storage Architecture

## 1. Overview

Gahonsh Freelancing uses a **hybrid client-side cloud architecture**:
1. **Supabase (PostgreSQL + Auth + Storage)** — Production cloud database for real-time authentication, user profiles, job postings, proposals, contracts, reviews, and Row-Level Security (RLS).
2. **Interactive Demo Mode (Fallback Engine)** — Built-in `MockDataEngine` in `supabase-client.js` storing state in `localStorage` and memory when live Supabase credentials are not yet configured, allowing instant full-featured testing.
3. **Formspree** — External SaaS endpoint for static agency contact-form inquiries (`contact.html`).
4. **Browser `localStorage`** — Client-side preferences (`theme`: `"light"` | `"dark"`, `gahonsh_supabase_url`, `gahonsh_supabase_key`).

---

## 2. Supabase PostgreSQL Schema

The production database schema is defined in `docs/marketplace-schema.sql`.

### Tables & Data Entities

| Table | Primary Key | Foreign Keys | Purpose |
| :--- | :--- | :--- | :--- |
| `profiles` | `id` (`UUID` → `auth.users`) | `auth.users(id)` | User accounts, display names, roles (`client` or `freelancer`), titles, hourly rates, skills (`TEXT[]`), bio, ratings, and resume metadata (`resume_name`, `resume_size_bytes`, `resume_updated_at`). The PDF itself lives in the private `resumes` Storage bucket at `<user id>/resume.pdf`. |
| `jobs` | `id` (`UUID`) | `client_id` → `profiles(id)` | Client job postings with category, budget type (`fixed`/`hourly`), budget min/max, duration, experience level, status (`open`, `in_progress`, `completed`, `cancelled`), proposal counters. |
| `proposals` | `id` (`UUID`) | `job_id` → `jobs(id)`, `freelancer_id` → `profiles(id)` | Freelancer bids containing bid amount ($), estimated delivery days, cover letter, status (`submitted`, `shortlisted`, `accepted`, `rejected`). |
| `contracts` | `id` (`UUID`) | `job_id` → `jobs(id)`, `proposal_id` → `proposals(id)`, `client_id` → `profiles(id)`, `freelancer_id` → `profiles(id)` | Active working agreements with agreed amount, start date, completion date, and status (`active`, `completed`, `disputed`, `cancelled`). |
| `file_transfers` | `id` (`UUID`) | `job_id` → `jobs(id)`, `proposal_id` → `proposals(id)`, `uploaded_by` → `profiles(id)` | In-site file send/receive metadata: `file_name`, `storage_path`, `file_type`, `file_size_bytes`, `scope` (`job` or `proposal`), `created_at`. The bytes live in the private `job-attachments` Storage bucket under `<job_id>/<uuid>-<name>`. |
| `contact_messages` | `id` (`UUID`) | — | Public lead intake written by `contact.html` and `chat-widget.js`: `name`, `email`, `service`, `budget`, `message`, `source`, `is_handled`, `created_at`. Visitors may insert only; the owner reads and marks handled from `admin.html`. |
| `reviews` | `id` (`UUID`) | `contract_id` → `contracts(id)`, `job_id` → `jobs(id)`, `reviewer_id` / `reviewee_id` → `profiles(id)` | Star reviews written from `marketplace-trust.js`: `rating` (1–5), `comment`, `created_at`. Read publicly, written only by a contract participant, immutable once stored. |
| `messages` | `id` (`UUID`) | `contract_id` → `contracts(id)`, `sender_id` / `recipient_id` → `profiles(id)` | Private contract chat used by `messages.html`: `body`, `created_at`. Only the two parties of the contract (or an admin) may read or send. |

### Public Views

- `public_profiles` — Exposes safe, non-sensitive profile information (`id`, `full_name`, `avatar_url`, `role`, `title`, `hourly_rate`, `skills`, `bio`, `rating`, `total_reviews`, `created_at`) for public marketplace talent discovery, plus resume metadata (`resume_name`, `resume_size_bytes`, `resume_updated_at`, `has_resume`). The storage path is never exposed.
- `worker_ratings` — Aggregates `reviews` into `reviewee_id`, `avg_rating`, `review_count` for the talent directory. It runs with the view owner's privileges so anonymous visitors can read the aggregate while the base `reviews` rows stay participant-protected.

---

## 3. Row-Level Security (RLS) Policies

All tables have Row Level Security enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`):

- **Profiles**:
  - `SELECT`: Public can read all profiles.
  - `INSERT` / `UPDATE`: Users can only create or update their own profile (`auth.uid() = id`).
- **Jobs**:
  - `SELECT`: Public can view `open` jobs; clients can view all their own posted jobs.
  - `INSERT`: Authenticated users with role `client` can create jobs.
  - `UPDATE` / `DELETE`: Clients can only modify/delete their own open jobs.
- **Proposals**:
  - `SELECT`: Freelancers can view their own proposals; Job owners (Clients) can view proposals submitted to their jobs.
  - `INSERT`: Authenticated freelancers can submit proposals (`auth.uid() = freelancer_id`).
  - `UPDATE`: Proposal owners can update/withdraw proposals before acceptance.
- **Contracts**:
  - `SELECT` / `UPDATE`: Only the participating Client and Freelancer (`auth.uid() IN (client_id, freelancer_id)`) can access contract details.
- **File transfers** (`file_transfers` plus the `job-attachments` Storage objects):
  - `SELECT`: A participant on the project — its owner, the freelancer on an active contract, an admin, or the uploader themselves — may read the row and download the object. A freelancer who has only *proposed* is deliberately excluded, so a bidder cannot read the client's files before being hired. `can_access_job_files(job_id)` encodes the rule and is reused by the Storage read policy, which checks the folder's first path segment against the same rule and additionally allows the object owner (`owner = auth.uid()`) to fetch back their own upload.
  - `INSERT`: `can_upload_job_files(job_id)` restricts writes to the same participants plus a freelancer with a live proposal, so samples and briefs can be attached before a contract exists, and `uploaded_by` must equal `auth.uid()`. The Storage insert policy additionally requires `owner = auth.uid()`.
  - `DELETE`: Only the uploader or an admin (`uploaded_by = auth.uid() OR is_admin()`); the Storage delete policy matches (`owner = auth.uid() OR is_admin()`).
- **Contact messages**:
  - `INSERT`: Anyone (anonymous visitors included) may submit a lead.
  - `SELECT` / `UPDATE` / `DELETE`: Owner only (`public.is_admin()`). Leads can never be read back with the public key.
- **Reviews**:
  - `SELECT`: Public (anonymous included) so star ratings and comments can be shown on profiles.
  - `INSERT`: Authenticated users only, and only as themselves (`reviewer_id = auth.uid()`, never self-review). A review attached to a contract must come from that contract's client or freelancer.
  - `DELETE`: Owner only (`public.is_admin()`). Reviews are immutable once written.
- **Messages**:
  - `SELECT` / `INSERT`: Only the sender or recipient of a message, or an admin, may read or send. A message attached to a contract must come from one of that contract's two parties, and `sender_id` must equal `auth.uid()`.
- **Resumes** (`resumes` Storage objects):
  - `SELECT`: Any authenticated user (clients reviewing talent) may read a resume; anonymous visitors cannot.
  - `INSERT` / `UPDATE`: Only the owner, and only inside their own folder (`(storage.foldername(name))[1] = auth.uid()::text`), so one user cannot overwrite another's CV.
  - `DELETE`: Only the owner.
  - `public_profiles` exposes only the display name and size; the bytes are fetched through a short-lived signed URL created by `Profiles.getResume()`.

---

## 4. Triggers & Stored Procedures (RPC)

1. **`on_auth_user_created` (Trigger)**: Automatically creates a record in `public.profiles` with the chosen role (`client` or `freelancer`) whenever a new user signs up via Supabase Auth.
2. **`on_proposal_count_change` (Trigger)**: Automatically increments or decrements `jobs.proposals_count` when proposals are inserted or deleted.
3. **`accept_proposal_and_create_contract` (RPC Function)**: Executes an atomic database transaction that:
   - Verifies the calling user is the job owner.
   - Marks the selected proposal as `accepted`.
   - Marks all other competing proposals for that job as `rejected`.
   - Updates the job status to `in_progress`.
   - Inserts a new row in `contracts` with agreed parameters.
4. **`provision_admin_user(target_user_id)` (RPC Function)**: Promotes a user to `admin` and marks them verified. Executable by `service_role` only, and the only supported way to create the first owner. The `protect_profile_immutable_fields` trigger allows this path because it also accepts callers whose PostgREST role is `service_role`, which is required while no admin exists yet.
5. **`admin_overview()` (RPC Function)**: Returns the owner KPI counters (`workers`, `clients`, `verified_workers`, `open_jobs`, `proposals`, `active_contracts`, `contract_value`) as JSONB for `admin.html`. Raises `42501` for anyone who is not the owner.

---

## 5. Client-Side Data Layer (`supabase-client.js`)

The front-end integrates with Supabase using standard ES6 / CDN client initialization:
- When valid credentials are present in `supabase-config.js` or `localStorage`, calls route directly to Supabase REST / PostgREST endpoints.
- When credentials are not yet configured, the system automatically falls back to `MockDataEngine`, offering complete interactive mock data (jobs, freelancers, proposal submission, contract creation, role switching) without crashing or failing.

---

## 6. External Data Sinks

| Destination | Purpose | Storage / Retention |
| :--- | :--- | :--- |
| **Formspree** (`https://formspree.io/f/xzdqnoez`) | Agency inquiries (`contact.html`) | Managed in Formspree account; redirected to `thank-you.html`. |
| **WhatsApp Deep Links** (`wa.me/918825183628`) | Quotes, consultations, newsletter subscribe | Transient (opens in WhatsApp client). |

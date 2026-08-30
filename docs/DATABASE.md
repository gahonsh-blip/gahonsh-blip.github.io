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
| `profiles` | `id` (`UUID` → `auth.users`) | `auth.users(id)` | User accounts, display names, roles (`client` or `freelancer`), titles, hourly rates, skills (`TEXT[]`), bio, ratings. |
| `jobs` | `id` (`UUID`) | `client_id` → `profiles(id)` | Client job postings with category, budget type (`fixed`/`hourly`), budget min/max, duration, experience level, status (`open`, `in_progress`, `completed`, `cancelled`), proposal counters. |
| `proposals` | `id` (`UUID`) | `job_id` → `jobs(id)`, `freelancer_id` → `profiles(id)` | Freelancer bids containing bid amount ($), estimated delivery days, cover letter, status (`submitted`, `shortlisted`, `accepted`, `rejected`). |
| `contracts` | `id` (`UUID`) | `job_id` → `jobs(id)`, `proposal_id` → `proposals(id)`, `client_id` → `profiles(id)`, `freelancer_id` → `profiles(id)` | Active working agreements with agreed amount, start date, completion date, and status (`active`, `completed`, `disputed`, `cancelled`). |
| `reviews` | `id` (`UUID`) | `contract_id` → `contracts(id)`, `reviewer_id` → `profiles(id)`, `reviewee_id` → `profiles(id)` | 1-5 star ratings and written feedback left after contract completion. |

### Public Views

- `public_profiles` — Exposes safe, non-sensitive profile information (`id`, `full_name`, `avatar_url`, `role`, `title`, `hourly_rate`, `skills`, `bio`, `rating`, `total_reviews`, `created_at`) for public marketplace talent discovery.

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
- **Reviews**:
  - `SELECT`: Publicly readable.
  - `INSERT`: Only contract participants can submit a review.

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

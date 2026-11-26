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
| `profiles` | `id` (`UUID` → `auth.users`) | `auth.users(id)` | User accounts, display names, roles (`client` or `freelancer`), titles, hourly rates, skills (`TEXT[]`), bio, ratings, and resume metadata (`resume_name`, `resume_size_bytes`, `resume_updated_at`), and a self-declared `availability` (`available`, `busy`, `unavailable`) that the talent directory shows and filters on. The PDF itself lives in the private `resumes` Storage bucket at `<user id>/resume.pdf`. |
| `jobs` | `id` (`UUID`) | `client_id` → `profiles(id)` | Client job postings with category, budget type (`fixed`/`hourly`), budget min/max, duration, experience level, status (`open`, `in_progress`, `completed`, `cancelled`), proposal counters. |
| `proposals` | `id` (`UUID`) | `job_id` → `jobs(id)`, `freelancer_id` → `profiles(id)` | Freelancer bids containing bid amount ($), estimated delivery days, cover letter, status (`submitted`, `shortlisted`, `accepted`, `rejected`). |
| `contracts` | `id` (`UUID`) | `job_id` → `jobs(id)`, `proposal_id` → `proposals(id)`, `client_id` → `profiles(id)`, `freelancer_id` → `profiles(id)` | Active working agreements with agreed amount, start date, completion date, and status (`active`, `completed`, `disputed`, `cancelled`). |
| `file_transfers` | `id` (`UUID`) | `job_id` → `jobs(id)`, `proposal_id` → `proposals(id)`, `uploaded_by` → `profiles(id)` | In-site file send/receive metadata: `file_name`, `storage_path`, `file_type`, `file_size_bytes`, `scope` (`job` or `proposal`), `created_at`. The bytes live in the private `job-attachments` Storage bucket under `<job_id>/<uuid>-<name>`. |
| `contact_messages` | `id` (`UUID`) | — | Public lead intake written by `contact.html` and `chat-widget.js`: `name`, `email`, `service`, `budget`, `message`, `source`, `is_handled`, `created_at`. Visitors may insert only; the owner reads and marks handled from `admin.html`. |
| `contract_milestones` | `id` (`UUID`) | `contract_id` → `contracts(id)`, `created_by` → `profiles(id)` | The written delivery plan on a contract: `title` (3–140 characters), `amount` (optional, ≥ 0), `due_date`, `position`, `status` (`pending`, `delivered`, `accepted`). A record of what was agreed, **not** an escrow: no funds are held or released here. `validate_milestone_mutation()` forces a new row to `pending`, limits each status move to the right party, makes `accepted` final and freezes the rows once the contract leaves `active`. |
| `reviews` | `id` (`UUID`) | `contract_id` → `contracts(id)`, `job_id` → `jobs(id)`, `reviewer_id` / `reviewee_id` → `profiles(id)` | Star reviews written from `marketplace-trust.js` and the contract cards: `rating` (1–5), `comment`, `created_at`. The INSERT policy allows one review per reviewer per completed contract, with the reviewee being the other party; `sync_review_contract()` derives `job_id` and trims the comment. Immutable once stored. |
| `messages` | `id` (`UUID`) | `contract_id` → `contracts(id)`, `sender_id` / `recipient_id` → `profiles(id)` | Private contract chat used by `messages.html`: `body`, `created_at`. Only the two parties of the contract (or an admin) may read or send. |
| `saved_jobs` | (`freelancer_id`, `job_id`) | `freelancer_id` → `profiles(id)`, `job_id` → `jobs(id)` | A freelancer's private job shortlist, written from `jobs.html`. One row per pair; only the owner reads or writes. |
| `saved_talent` | (`client_id`, `freelancer_id`) | `client_id` / `freelancer_id` → `profiles(id)` | A client's private talent shortlist, written from `find-talent.html`. A `CHECK` stops a member saving themselves; only the owner reads or writes. |
| `invitations` | `id` (`UUID`) | `job_id` → `jobs(id)`, `client_id` / `freelancer_id` → `profiles(id)` | A client asking one freelancer to look at one open job: `message` (≤ 1000 characters), `status` (`invited`, `accepted`, `declined`, `withdrawn`), `responded_at`. Unique per job and freelancer. Accepting records interest only — the freelancer still submits a proposal. |
| `service_packages` | `id` (`UUID`) | `freelancer_id` → `profiles(id)` | The Project Catalog: a fixed-price tier a freelancer publishes (`title`, `description`, `category`, `tier` basic/standard/premium, `price` > 0, `delivery_days`, `revisions`, `skills`, `is_active`). Prices are the freelancer's own quote; the platform holds no funds. |
| `notifications` | `id` (`UUID`) | `user_id` → `profiles(id)` | In-app alerts shown in the portal: `type`, `title` (≤ 140 characters), `body`, `link` (a portal hash such as `#invitations`), `is_read`. Rows are written by `SECURITY DEFINER` triggers only, so a member cannot post one into another member's list; the owner may read, mark read or delete. |

### Public Views

- `public_profiles` — Exposes safe, non-sensitive profile information (`id`, `full_name`, `avatar_url`, `role`, `location`, `bio`, `title`, `hourly_rate`, `skills`, `is_verified`, `created_at`) for public marketplace talent discovery, plus resume metadata (`resume_name`, `resume_size_bytes`, `resume_updated_at`, `has_resume`). `email`, `phone_number` and the storage path are never exposed.
- `admin_profiles` — Owner-only directory (`id`, `full_name`, `email`, `role`, `is_verified`, `location`, `title`, `hourly_rate`, `created_at`). The view is granted to `authenticated`, but its `WHERE public.is_admin()` clause returns zero rows for everyone else, so the admin page can show contact email without granting it to the public roles.
- `worker_ratings` — Aggregates `reviews` into `reviewee_id`, `avg_rating`, `review_count` for the talent directory. It runs with the view owner's privileges so anonymous visitors can read the aggregate while the base `reviews` rows stay participant-protected.

---

## 3. Row-Level Security (RLS) Policies

All tables have Row Level Security enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`):

- **Profiles**:
  - `SELECT`: The public directory reads the `public_profiles` view. A direct table read is limited by column grants to the safe directory fields (`id`, `full_name`, `avatar_url`, `role`, `location`, `bio`, `title`, `hourly_rate`, `skills`, `is_verified`, `created_at`, `updated_at`, plus resume metadata). `email` and `phone_number` are never granted to `anon` or `authenticated`; the admin reads email through the `admin_profiles` view, which returns rows only when `public.is_admin()` is true.
  - `INSERT` / `UPDATE`: Users can only create or update their own profile (`auth.uid() = id`). The `protect_profile_immutable_fields` trigger blocks self-service changes to `role`, `email` and `is_verified`, and the client `updateMyProfile()` allow-lists editable fields.
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
  - `SELECT`: A participant on the project — its owner, the freelancer on an active or completed contract, an admin, or the uploader themselves — may read the row and download the object. A freelancer who has only *proposed* is deliberately excluded, so a bidder cannot read the client's files before being hired. Completed work stays readable as a project record. `can_access_job_files(job_id)` encodes the rule and is reused by the Storage read policy, which checks the folder's first path segment against the same rule and additionally allows the object owner (`owner = auth.uid()`) to fetch back their own upload.
  - `INSERT`: `can_upload_job_files(job_id)` restricts writes to the project owner, an admin, the freelancer on an active contract, or a freelancer with a live proposal, so samples and briefs can be attached before a contract exists. A completed contract is read-only, and `uploaded_by` must equal `auth.uid()`. The Storage insert policy additionally requires `owner = auth.uid()`.
  - The private bucket also has a 25 MB object limit and a MIME allow-list. This is the server-side gate behind the browser safety scan; see [FILE-SAFETY.md](FILE-SAFETY.md).
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
  - `public_profiles` exposes only safe profile fields plus the resume display name/size; `email`, `phone_number` and the storage path are never exposed. The bytes are fetched through a short-lived signed URL created by `Profiles.getResume()`.

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
6. **`set_proposal_status(target_proposal_id, new_status)` (RPC Function)**: The client's review of a live bid — `shortlisted`, `submitted` or `rejected`. Raises unless the caller owns the job and the job is still `open`; `accepted` is refused because hiring must go through `accept_proposal_and_create_contract()`.
7. **`validate_milestone_mutation()` (Trigger)**: Keeps the milestone state machine honest on insert, update and delete. A new row is forced to `pending` and may only be added by the client or the freelancer; the freelancer alone may mark `delivered`; the client alone may mark `accepted`, and only from `delivered`; an accepted milestone cannot be reopened, and only the client may delete one; nothing changes once the contract leaves `active`.
8. **`sync_review_contract()` (Trigger)**: Derives `job_id` from the contract and trims the comment to 1000 characters, so a review can never point at a job outside its own contract. A unique index on `(contract_id, reviewer_id)` keeps the public average honest.

---

## 5. Client-Side Data Layer (`supabase-client.js`)

The front-end integrates with Supabase using standard ES6 / CDN client initialization:
- When valid credentials are present in `supabase-config.js` or `localStorage`, calls route directly to Supabase REST / PostgREST endpoints.
- When credentials are not yet configured, the system automatically falls back to `MockDataEngine`, offering complete interactive mock data (jobs, freelancers, proposal submission, contract creation, role switching) without crashing or failing.

---

## 6. External Data Sinks

| Destination | Purpose | Storage / Retention |
| :--- | :--- | :--- |
| **Formspree** (`https://formspree.io/f/xzdqnoez`) | Fallback delivery for contact-form and chat enquiries when `contact_messages` cannot be written | Managed in Formspree account. |
| **WhatsApp Deep Links** (`wa.me/918825183628`) | Quotes, consultations, newsletter subscribe | Transient (opens in WhatsApp client). |

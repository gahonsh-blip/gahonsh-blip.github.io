# Gahonsh Freelancing & Marketplace Setup Guide

Step-by-step instructions to run, configure, and deploy the **Gahonsh Freelancing Website & Upwork-Style Marketplace**.

---

## 1. Local Development & Preview

The site is built with vanilla HTML5, CSS3, and JavaScript, requiring zero complex build dependencies.

### Option A: Using Node.js (Recommended)
```bash
npm install
npm run dev
```
Open **http://localhost:3000** in your browser.

### Option B: Using Python Static Server
```bash
python3 -m http.server 8000
```
Open **http://localhost:8000** in your browser.

---

## 2. Supabase Integration Setup

The marketplace features client-side Supabase integration with Row Level Security (RLS). Follow these steps to configure live authentication and cloud persistence:

### Step 1: Create a Supabase Project
1. Log in to [supabase.com](https://supabase.com) and click **"New Project"**.
2. Give your project a name (e.g. `gahonsh-marketplace`) and set a secure database password.
3. Select your preferred region.

### Step 2: Run the Database Schema
1. In your Supabase project dashboard, navigate to the **SQL Editor** tab on the left sidebar.
2. Click **"New query"**.
3. Open the file `docs/marketplace-schema.sql` from this repository and copy its entire content into the SQL Editor.
4. Click **"Run"**.
   - This creates all necessary tables: `profiles`, `jobs`, `proposals`, `contracts`, `contact_messages`, and the `public_profiles` view.
   - It configures Row Level Security (RLS) policies ensuring users can only edit their own data, and that contact leads can only be read by the owner.
   - It sets up database triggers for automatic profile creation upon signup and proposal count synchronizations.
   - It defines atomic RPC procedures like `accept_proposal_and_create_contract`, plus `admin_overview` and `provision_admin_user`.
   - It creates the private `resumes` Storage bucket and its policies, so freelancers can attach a PDF CV that signed-in clients can view from the talent directory.

> **Upgrading an existing project?** Re-running the full schema does not add
> columns to an existing table. Apply
> `supabase/migrations/20261123000000_add_freelancer_resumes.sql` in the SQL
> Editor (or with `supabase db push`) to add the resume fields, the `resumes`
> bucket and its policies.
>
> Then apply
> `supabase/migrations/20261124000000_harden_profiles_read_access.sql`. It
> revokes table-level `SELECT` on `profiles`, grants only the safe directory
> columns, and creates the admin-only `admin_profiles` view used by
> `admin.html` to show contact email. The admin page falls back to the safe
> columns until the view exists, but the People list will not show email.
>
> Finally apply
> `supabase/migrations/20261125000000_worker_client_records.sql` to add the
> public worker/client record RPCs, the private own-record RPC, and the
> `complete_contract` client sign-off. See [RECORDS.md](RECORDS.md).
>
> Then apply
> `supabase/migrations/20261126000000_harden_file_transfers.sql`. It keeps
> project files readable to a freelancer after a contract is completed, limits
> uploads to active work, and adds the 25 MB / MIME allow-list to the private
> `job-attachments` bucket. See [FILE-SAFETY.md](FILE-SAFETY.md).
>
> Then apply
> `supabase/migrations/20261127000000_add_milestones_and_review_rules.sql` for
> contract milestones and post-completion reviews.
>
> Then apply
> `supabase/migrations/20261202000000_add_verification_and_timesheets.sql`. It
> adds the verification request queue behind the verified badge, hourly
> timesheets for hourly contracts, and the completion-based success score on
> `worker_ratings`. Without it the profile editor says verification is not set
> up, the admin page shows no queue, and the portal hides the hours panel on
> hourly contracts. See [DATABASE.md](DATABASE.md) and
> [UPWORK-GAP.md](UPWORK-GAP.md).

### Step 2a: Apply the schema to a project that already exists

A project created before a feature answers PostgREST with `PGRST205` (missing
table or view) or `PGRST202` (missing function). The pages degrade to a setup
message rather than a blank screen, but the feature stays off until the objects
exist. Find out exactly what is missing:

```bash
npm run check:live
```

It reads the project URL and publishable key from `supabase-config.js` and
probes every table, view and function the client reaches. Exit code `0` means
nothing is missing; `1` prints each missing object with its PostgREST code;
`2` means the project was unreachable, which is a network or key problem rather
than a schema one.

**The short path (recommended).** `docs/marketplace-schema.sql` is idempotent —
`create table if not exists`, `create or replace function`, policies dropped and
recreated — so pasting the whole file into the Supabase SQL editor is safe on a
project that already has most of it. Do that once, then re-run
`npm run check:live` until it reports `0 missing`.

**The incremental path.** If you would rather apply only what is missing, run
the migrations in this order and stop when `check:live` is clean:

| Migration | Adds |
|---|---|
| `20261123000000_add_freelancer_resumes.sql` | `resumes` bucket, resume columns on `profiles` |
| `20261124000000_harden_profiles_read_access.sql` | column-level grants on `profiles` |
| `20261125000000_worker_client_records.sql` | `get_worker_record`, `get_client_record`, `get_my_record`, `complete_contract` |
| `20261126000000_harden_file_transfers.sql` | `job-attachments` limits, post-completion reads |
| `20261127000000_add_milestones_and_review_rules.sql` | `contract_milestones`, review rules |
| `20261129000000_restore_profile_pii_columns.sql` | restores PII columns behind the grants |
| `20261201000000_add_email_outbox.sql` | `email_outbox`, queue and claim functions |
| `20261202000000_add_verification_and_timesheets.sql` | `verification_requests`, `contract_timesheets`, `decide_verification`, the success score on `worker_ratings` |

**Before you run it.** Take a backup first: Dashboard → Database → Backups →
*Create backup* (or `pg_dump` with the connection string). The schema only adds
objects and replaces functions, so a rollback is rarely needed, but a backup
turns "rarely" into "never a problem".

**Verify by hand** if you prefer the SQL editor to the script. Each of these
returns one row when the object exists:

```sql
select to_regclass('public.verification_requests')   as verification_requests,
       to_regclass('public.contract_timesheets')     as contract_timesheets,
       to_regclass('public.contact_messages')        as contact_messages,
       to_regclass('public.admin_profiles')          as admin_profiles,
       to_regprocedure('public.decide_verification(uuid, boolean, text)') as decide_verification;
```

**What each page shows until the objects exist**

| Missing object | What the user sees |
|---|---|
| `verification_requests` | The profile editor's Verification block says verification is not set up on the site and hides the request button |
| `decide_verification` | The admin page shows its deploy warning naming "verification requests"; the tab stays empty |
| `contract_timesheets` | The hours panel on an hourly contract names the migration file to run instead of rendering an empty list |
| `contact_messages` | The contact form still delivers through Formspree; the dashboard has no record of the enquiry |
| `admin_profiles` | The member list still renders, without email addresses, and the deploy warning says so |
| `admin_overview` | The KPI row shows its setup message instead of figures |

None of these is silent: each path classifies the error with
`isBackendNotProvisioned()` and shows a message rather than an empty card.

**Do not** point the site at a half-migrated project and expect the offline
engine to cover the gap. It deliberately does not — see rule 6 in `AGENTS.md`.

### Step 2b: Create the Owner Account

`admin.html` is owner-only and the site ships no owner credentials, so create
one before you need the dashboard:

1. Open the site and sign up normally with the email you want to own the site.
   Every new signup becomes a `freelancer` or `client` — never an admin.
2. In the Supabase Dashboard, go to **SQL Editor → New query** and promote that
   account with your `service_role` privileges. Replace the email:
   ```sql
   SELECT public.provision_admin_user(id)
   FROM public.profiles
   WHERE email = 'you@example.com';
   ```
   Run this in the SQL Editor only. Never expose the `service_role` key on the
   frontend. The `provision_admin_user` function is granted to `service_role`
   alone, which is what allows the first owner to be created while no admin
   exists yet.
3. Open `admin.html` and sign in with that email and password.

### Step 2c: Verify the deployed project

A reachable project can still be behind the client. The live site answered
`contact_messages`, `contract_milestones` and `admin_overview` with
`PGRST205` / `PGRST202` while every committed file was correct, so contact
enquiries, milestones and the owner KPIs failed at runtime.

```bash
npm run check:live
```

The script reads the URL and publishable key from `supabase-config.js`
(override with `SUPABASE_URL` / `SUPABASE_ANON_KEY`) and probes every table,
view and function the client reaches through PostgREST. It exits non-zero and
lists the missing objects. `HTTP 401` on a table means the object exists and
RLS blocks the anonymous role, which is expected for `proposals` and
`contracts`.

If anything is missing, re-run `docs/marketplace-schema.sql` in the SQL
Editor: it is idempotent (guarded enums, `IF NOT EXISTS` tables and indexes,
`DROP POLICY IF EXISTS` before every `CREATE POLICY`). Then re-run
`npm run check:live` until it passes.

### Step 2d: Repair a project that drifted (profile columns + immutability)

`npm run check:live` cannot see the rules that only apply to a signed-in
member. On 2026-11-24 the project answered `PATCH /rest/v1/profiles` with
`{"role":"admin"}` for an ordinary client: the profile-immutability trigger
was not attached, and `profiles` had lost its `email` and `phone_number`
columns, which is also why `admin_profiles` and `admin_overview()` could not
be created.

Run these two files in the SQL Editor, in this order:

1. `supabase/migrations/20261129000000_restore_profile_pii_columns.sql`
   — restores `profiles.email` and `profiles.phone_number`, backfills email
   from `auth.users`, and re-attaches `trg_protect_profile_fields`. It is
   safe to run on its own, so the escalation closes even if the schema file is
   applied later.
2. `docs/marketplace-schema.sql`
   — creates what is still missing (`admin_profiles`, `admin_overview()`,
   `contact_messages`), re-applies the safe column grants that keep
   `email` / `phone_number` private, and re-creates `handle_new_user` so new
   sign-ups store their email.

Then verify both layers:

```bash
npm run check:live
AUDIT_EMAIL=audit@yourdomain.com AUDIT_PASSWORD='…' npm run check:live-security
```

`check:live-security` signs in as a disposable test account and asserts the
rules the schema claims: a client cannot promote themselves to admin, cannot
verify themselves, cannot post a notification into their own list, cannot
save themselves as talent, cannot post a job for someone else, and can still
create and delete their own job. It writes one temporary job and deletes it
before exiting. Use a **non-admin** account, otherwise the escalation probes
pass trivially.

> If `check:live` reports `profiles.email` as missing, the drift repair has not
> been applied yet. Do not "fix" it by granting `email` to `anon` or
> `authenticated`: the admin page and `admin_profiles` are the supported path.

### Step 3: Configure Frontend Credentials
1. In the Supabase Dashboard, go to **Project Settings → API**.
2. Copy your **Project URL** and **anon (public)** key.
   > ⚠️ **CRITICAL SECURITY NOTE:** Never expose your `service_role` secret key on the frontend or commit it to GitHub. Only use the `anon` public key.
3. You can configure the credentials in either of two ways:
   - **Method A (Interactive UI):** Open the website in your browser and click the **"Connect Supabase"** badge or user menu, then enter your URL and anon key into the configuration modal. The values are safely stored in browser `localStorage`.
   - **Method B (File Configuration):** Update `supabase-config.js` with your project URL and anon key:
     ```javascript
     const SUPABASE_CONFIG = {
         URL: 'https://your-project-id.supabase.co',
         ANON_KEY: 'your-anon-public-key-here'
     };
     ```

---

### Step 4: Automatic email (optional, recommended)

A proposal, a hire or a contract update already writes an in-app notification.
This step also emails it to the member. It is optional: without it the portal
still works and nothing pretends to have been sent.

**How it fits together**

```
notifications INSERT
   -> trigger notifications_email_outbox   (supabase/migrations/20261201000000_add_email_outbox.sql)
   -> email_outbox row (status = queued)
   -> pg_cron, every minute -> POST /functions/v1/send-email
   -> Resend API -> inbox, then status = sent
```

The Resend key never enters this repository or the browser: it lives in the
Edge Function's environment. The browser has no grant on `email_outbox`.

**1. Create a Resend account and verify a sending domain.** Add the DNS records
Resend shows you. The `from` address must be on a domain you verified, or Resend
rejects the send.

**2. Deploy the function** from the repository root:

```bash
supabase login
supabase link --project-ref <project-ref>
supabase functions deploy send-email --no-verify-jwt
```

`--no-verify-jwt` is deliberate: the caller is `pg_cron`, which has no user
token. The function refuses to run unless the request carries the shared secret,
so it is not an open relay.

**3. Set the function secrets:**

```bash
supabase secrets set \
  RESEND_API_KEY=re_xxxxxxxxxxxxxxxx \
  EMAIL_DRAIN_SECRET=$(openssl rand -hex 24) \
  EMAIL_FROM="Gahonsh <notifications@gahonsh.com>"
```

**4. Give the database the URL and the same secret**, in the SQL editor:

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-email', 'email_function_url');
select vault.create_secret('<the same EMAIL_DRAIN_SECRET>', 'email_function_secret');
```

**5. Enable the scheduler and re-run the migration** so the cron job is created:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

Then run `supabase/migrations/20261201000000_add_email_outbox.sql` once. It
prints `Email drain not scheduled: ...` if a step above is missing — that
message is the setup telling you what is still absent, not a crash.

**6. Test it.** Insert a notification for your own account and watch the queue:

```sql
select id, to_email, status, attempts, last_error, sent_at
from public.email_outbox order by created_at desc limit 5;
```

A row goes `queued` -> `sending` -> `sent` within about a minute. If it stays
`queued`, the cron job or the secret is missing; if it turns `failed`, read
`last_error` — Resend's message is copied there (an unverified `from` domain is
the usual cause).

**Turning it off per member.** The profile editor has an "Email me about
proposals, hires and contract updates" checkbox, stored in
`profiles.email_notifications`. The trigger skips the queue when it is off; the
in-app notification is unaffected.

**Do not** put a Resend key in `supabase-config.js`, in a page, or in a
migration. `npm run test:email` fails the build if a key-shaped string or an
`email_outbox` query appears in a browser script.

---

## 3. Marketplace Core Flows Checklist

Once Supabase is connected, verify the primary user flows:

1. **Client Signup & Job Posting:**
   - Sign up with role **"Client (Hire Talent)"**.
   - Navigate to **"Post a Job"** (`post-job.html`).
   - Fill in title, category, budget, duration, description, and required skills, then submit.
   - The job will appear instantly in the **Jobs Feed** (`jobs.html`) and in your **Portal** (`marketplace-dashboard.html`).

2. **Freelancer Signup & Proposal Submission:**
   - Sign up or switch account with role **"Freelancer (Find Work)"**.
   - Navigate to **"Find Work"** (`jobs.html`), select a job to view details (`job-details.html`).
   - Fill out bid amount ($), delivery days, and cover letter, then click **"Send Proposal to Client"**.
   - The proposal count will increment automatically and appear in the freelancer's portal.

3. **Client Proposal Review & Contract Creation:**
   - Log back in as the Client who posted the job and navigate to the job's details page.
   - Review the received proposals and click **"Accept & Hire"**.
   - An active contract is atomically generated via the database RPC function.

4. **Profile Customization & Light/Dark Theme:**
   - Click **"Edit Profile"** in the navigation or dashboard to update full name, headline title, hourly rate, skills, and bio.
   - Toggle the theme button (top-right or bottom-right) to verify dark and light styling persistence.

---

## 4. Deploying to GitHub Pages

1. Push all code to the `main` branch of your repository (`gahonsh-blip.github.io`).
2. Go to repository **Settings → Pages**.
3. Under **Build and deployment**, select:
   - **Source:** Deploy from a branch
   - **Branch:** `main` / `root` (`/`)
4. GitHub Pages will build and deploy the site to `https://<your-github-username>.github.io/`.

---

## 5. Troubleshooting & Support

| Issue | Resolution |
| :--- | :--- |
| **"Connect Supabase to persist..." notification** | Supabase credentials are not yet configured. The app is running in interactive demo mode. Provide your URL and anon key in the setup modal. |
| **Cannot post job or submit proposal** | Ensure you are logged in. The authentication modal will open automatically when attempting an action as a guest. |
| **Row Level Security (RLS) error** | Verify you have executed the complete `docs/marketplace-schema.sql` in your Supabase SQL editor. |
| **"File transfer is not enabled on this deployment yet"** | The live Supabase project has not been migrated with the latest schema, so the `file_transfers` table and/or the private `job-attachments` Storage bucket are missing. Re-run the full `docs/marketplace-schema.sql` in the SQL editor. File transfer is intentionally not simulated in the browser against a live project, because a local-only copy could never reach the other party. |
| **"Records need a database update"** | The live Supabase project does not have the record RPCs yet. Apply `supabase/migrations/20261125000000_worker_client_records.sql` in the SQL editor, then refresh. See [RECORDS.md](RECORDS.md). |
| **A file upload is rejected by Storage** | The bucket MIME allow-list or 25 MB limit may not match the file. Check the extension against `docs/FILE-SAFETY.md`. Apply `supabase/migrations/20261126000000_harden_file_transfers.sql` to align the bucket with the page. |
| **Project files are readable without signing in** | An old setup script left a public `job-attachments` bucket policy. Apply `supabase/migrations/20261126000000_harden_file_transfers.sql`; it makes the bucket private and drops the legacy public read/upload policies. Do not run `sql/combined-marketplace.sql`; it is deprecated. |
| **A file is blocked by the safety scan** | The browser scanner found an executable signature, a dangerous double extension, EICAR, PDF active content, or an executable/macro inside a ZIP/Office file. The panel shows the reason. Ask the sender for a clean copy. |
| **Theme resets on refresh** | Ensure your browser allows `localStorage` access for persisting user preferences. |

For technical inquiries or business consultation, contact `gahonsh@gmail.com` or connect via WhatsApp at `+91 88251 83628`.

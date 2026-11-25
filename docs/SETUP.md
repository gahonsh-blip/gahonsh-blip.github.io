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

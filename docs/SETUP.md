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
   - This creates all necessary tables: `profiles`, `jobs`, `proposals`, `contracts`, `reviews`, and views `public_profiles`.
   - It configures Row Level Security (RLS) policies ensuring users can only edit their own data.
   - It sets up database triggers for automatic profile creation upon signup and proposal count synchronizations.
   - It defines atomic RPC procedures like `accept_proposal_and_create_contract`.

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
| **Theme resets on refresh** | Ensure your browser allows `localStorage` access for persisting user preferences. |

For technical inquiries or business consultation, contact `gahonsh@gmail.com` or connect via WhatsApp at `+91 88251 83628`.

-- ============================================================================
-- GAHONSH FREELANCING MARKETPLACE - PRODUCTION-READY DATABASE SCHEMA
-- Phase 1 Foundation: Profiles, Public Profiles Directory, Jobs, Proposals,
-- Contracts, Attachments, Row Level Security, Triggers & Atomic RPCs.
-- ============================================================================
-- HOW TO USE:
-- 1. Open your Supabase Project Dashboard (https://supabase.com/dashboard)
-- 2. Navigate to SQL Editor -> New Query
-- 3. Paste this complete file and click "RUN"
-- 4. In the Gahonsh Freelancing app header, click "Connect Database" and enter
--    your Project URL and Anon Public Key.
-- ============================================================================

-- Enable required UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. ENUMS (Safe idempotent creation)
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('client', 'freelancer', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE job_type AS ENUM ('fixed', 'hourly');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE job_experience_level AS ENUM ('entry', 'intermediate', 'expert');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('draft', 'open', 'in_progress', 'completed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE proposal_status AS ENUM ('submitted', 'shortlisted', 'accepted', 'rejected', 'withdrawn');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE contract_status AS ENUM ('active', 'completed', 'cancelled', 'disputed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE milestone_status AS ENUM ('pending', 'delivered', 'accepted');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE invitation_status AS ENUM ('invited', 'accepted', 'declined', 'withdrawn');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------------
-- 2. PROFILES TABLE (STRICTLY PRIVATE - STORES AUTH & PROFILE STATE)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL CHECK (char_length(TRIM(full_name)) >= 2),
    avatar_url TEXT,
    role user_role NOT NULL DEFAULT 'freelancer',
    phone_number TEXT,
    location TEXT,
    bio TEXT,
    title TEXT,
    hourly_rate NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (hourly_rate >= 0),
    skills TEXT[] NOT NULL DEFAULT '{}',
    -- Resume metadata only. The PDF itself lives in the private `resumes`
    -- storage bucket at `<user id>/resume.pdf`; the public view never exposes
    -- the storage path.
    resume_name TEXT,
    resume_size_bytes BIGINT CHECK (resume_size_bytes IS NULL OR resume_size_bytes >= 0),
    resume_updated_at TIMESTAMPTZ,
    -- Availability lets a client see who can start now before inviting them.
    -- It is a self-declared status, not a booking system.
    availability TEXT NOT NULL DEFAULT 'available'
        CHECK (availability IN ('available', 'busy', 'unavailable')),
    availability_note TEXT CHECK (availability_note IS NULL OR char_length(availability_note) <= 120),
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Existing projects created before availability existed: add the columns
-- without touching the rows.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS availability TEXT NOT NULL DEFAULT 'available';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS availability_note TEXT;

-- Repair a project whose `profiles` lost the private contact columns. Both
-- `admin_profiles` and `admin_overview()` read `profiles.email`, so their
-- creation below would fail and roll the whole script back without this.
-- On a fresh install these statements are no-ops.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_number TEXT;

UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.id
  AND p.email IS NULL
  AND u.email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_key ON public.profiles (email);

-- ----------------------------------------------------------------------------
-- 3. PUBLIC PROFILES VIEW (SAFE PUBLIC DIRECTORY - EXCLUDES EMAIL & PHONE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT 
    id,
    full_name,
    avatar_url,
    role,
    location,
    bio,
    title,
    hourly_rate,
    skills,
    is_verified,
    created_at,
    resume_name,
    resume_size_bytes,
    resume_updated_at,
    (resume_name IS NOT NULL) AS has_resume,
    availability,
    availability_note
FROM public.profiles;

-- Grant public read access to the safe directory view
GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- Privacy hardening: `profiles` is a private table. Revoke the default
-- table-level SELECT and grant only the public directory columns. Email and
-- phone_number are never granted to anon/authenticated; the admin reads them
-- through the admin_profiles view, which returns rows only for is_admin().
REVOKE SELECT ON public.profiles FROM anon, authenticated;

GRANT SELECT (
    id, full_name, avatar_url, role, location, bio, title, hourly_rate,
    skills, is_verified, created_at, updated_at, availability, availability_note
) ON public.profiles TO anon, authenticated;

-- The resume display name/size are part of the owner's editable profile.
-- This grant keeps them readable after the column-privilege hardening
-- migration revokes table-level SELECT on `profiles`.
GRANT SELECT (resume_name, resume_size_bytes, resume_updated_at)
ON public.profiles TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3b. CONTACT MESSAGES TABLE (PUBLIC LEAD INTAKE - WRITE-ONLY FOR ANON)
-- ----------------------------------------------------------------------------
-- Written by contact.html and chat-widget.js with the public publishable key.
-- Anonymous visitors may INSERT a lead but can never read it back; only the
-- owner (admin) can SELECT, mark handled or delete. Without this table the
-- contact form and website chat lead capture fail with a 404 from PostgREST.
CREATE TABLE IF NOT EXISTS public.contact_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    service TEXT,
    budget TEXT,
    message TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'contact-page',
    is_handled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS contact_messages_created_at_idx
    ON public.contact_messages (created_at DESC);

-- RLS is enabled and policies are declared in section 11, after is_admin().

-- ----------------------------------------------------------------------------
-- 4. JOBS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    title TEXT NOT NULL CHECK (char_length(TRIM(title)) BETWEEN 5 AND 150),
    description TEXT NOT NULL CHECK (char_length(TRIM(description)) >= 20),
    category TEXT NOT NULL,
    required_skills TEXT[] NOT NULL DEFAULT '{}',
    job_type job_type NOT NULL DEFAULT 'fixed',
    budget_min NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (budget_min >= 0),
    budget_max NUMERIC(10, 2) CHECK (budget_max IS NULL OR budget_max >= budget_min),
    hourly_rate_min NUMERIC(10, 2) CHECK (hourly_rate_min IS NULL OR hourly_rate_min >= 0),
    hourly_rate_max NUMERIC(10, 2) CHECK (hourly_rate_max IS NULL OR hourly_rate_max >= hourly_rate_min),
    experience_level job_experience_level NOT NULL DEFAULT 'intermediate',
    estimated_duration TEXT,
    status job_status NOT NULL DEFAULT 'open',
    proposals_count INT NOT NULL DEFAULT 0 CHECK (proposals_count >= 0),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- ----------------------------------------------------------------------------
-- 5. JOB ATTACHMENTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT,
    file_size_bytes BIGINT CHECK (file_size_bytes > 0),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- ----------------------------------------------------------------------------
-- 6. PROPOSALS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proposals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    freelancer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    cover_letter TEXT NOT NULL CHECK (char_length(TRIM(cover_letter)) >= 20),
    bid_amount NUMERIC(10, 2) NOT NULL CHECK (bid_amount > 0),
    delivery_time_days INT NOT NULL CHECK (delivery_time_days > 0),
    attachment_urls TEXT[] NOT NULL DEFAULT '{}',
    status proposal_status NOT NULL DEFAULT 'submitted',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    CONSTRAINT uq_job_freelancer UNIQUE (job_id, freelancer_id)
);

-- Partial Unique Index: Ensures only ONE proposal can be in 'accepted' status per job
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_accepted_proposal_per_job 
ON public.proposals (job_id) 
WHERE (status = 'accepted');

-- ----------------------------------------------------------------------------
-- 6b. FILE TRANSFERS TABLE (IN-SITE SEND / RECEIVE)
-- ----------------------------------------------------------------------------
-- Metadata for every file a client and a freelancer exchange inside the site.
-- The bytes themselves live in Supabase Storage (the `job-attachments` bucket,
-- under a folder per project); this table holds the searchable record and is
-- what RLS gates. `scope = 'proposal'` files belong to a proposal,
-- `scope = 'job'` files belong to the project workspace and stay visible to
-- the client and the hired freelancer for the life of the contract.
CREATE TABLE IF NOT EXISTS public.file_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
    uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_type TEXT,
    file_size_bytes BIGINT NOT NULL DEFAULT 0 CHECK (file_size_bytes >= 0),
    scope TEXT NOT NULL DEFAULT 'job' CHECK (scope IN ('job', 'proposal')),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS file_transfers_job_idx
    ON public.file_transfers (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS file_transfers_proposal_idx
    ON public.file_transfers (proposal_id);

-- ----------------------------------------------------------------------------
-- 7. CONTRACTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE RESTRICT,
    proposal_id UUID NOT NULL UNIQUE REFERENCES public.proposals(id) ON DELETE RESTRICT,
    client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    freelancer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    agreed_amount NUMERIC(10, 2) NOT NULL CHECK (agreed_amount > 0),
    status contract_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- ----------------------------------------------------------------------------
-- 7b. REVIEWS, WORKER RATINGS & CONTRACT MESSAGES
-- ----------------------------------------------------------------------------
-- One review per completed engagement. `rating` is 1-5 stars; the talent
-- directory reads the aggregate `worker_ratings` view rather than the rows.
CREATE TABLE IF NOT EXISTS public.reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
    job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
    reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reviewee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS reviews_reviewee_idx
    ON public.reviews (reviewee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_contract_idx
    ON public.reviews (contract_id);

-- Public star-rating aggregate consumed by marketplace-trust.js. It runs with
-- the view owner's privileges (security_invoker off) so anonymous visitors can
-- read the aggregate while the base reviews table stays row-protected.
CREATE OR REPLACE VIEW public.worker_ratings AS
SELECT
    reviewee_id,
    ROUND(AVG(rating)::numeric, 2) AS avg_rating,
    COUNT(*)::int AS review_count
FROM public.reviews
GROUP BY reviewee_id;

GRANT SELECT ON public.worker_ratings TO anon, authenticated;

-- Private contract messages between the two parties of a contract.
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (char_length(body) > 0),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS messages_contract_idx
    ON public.messages (contract_id, created_at);
CREATE INDEX IF NOT EXISTS messages_recipient_idx
    ON public.messages (recipient_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 7c. CONTRACT MILESTONES (MANUAL CHECKLIST)
-- ----------------------------------------------------------------------------
-- A written plan the client and the freelancer keep together: what will be
-- delivered, in what order, for how much of the agreed price, and by when.
-- It is a checklist, not an escrow: the platform never holds funds, so
-- `accepted` means the client signed the deliverable off, not that money
-- moved. The freelancer marks a milestone `delivered`; the client marks it
-- `accepted`. Both rules live in validate_milestone_mutation() below.
CREATE TABLE IF NOT EXISTS public.contract_milestones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(TRIM(title)) BETWEEN 3 AND 140),
    amount NUMERIC(10, 2) CHECK (amount IS NULL OR amount >= 0),
    due_date DATE,
    position INT NOT NULL DEFAULT 0 CHECK (position >= 0),
    status milestone_status NOT NULL DEFAULT 'pending',
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    delivered_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS contract_milestones_contract_idx
    ON public.contract_milestones (contract_id, position, created_at);

-- ----------------------------------------------------------------------------
-- 7d. DISCOVERY: SAVED JOBS, SAVED TALENT AND DIRECT INVITATIONS
-- ----------------------------------------------------------------------------
-- Saved jobs and saved talent are private shortlists: one row per owner and
-- target, readable only by that owner. They carry no copy of the job or the
-- profile, so an edit or a delete upstream is reflected immediately.
CREATE TABLE IF NOT EXISTS public.saved_jobs (
    freelancer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    PRIMARY KEY (freelancer_id, job_id)
);

CREATE TABLE IF NOT EXISTS public.saved_talent (
    client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    freelancer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    PRIMARY KEY (client_id, freelancer_id),
    CONSTRAINT saved_talent_no_self CHECK (client_id <> freelancer_id)
);

-- A client may ask one freelancer to look at one job. The freelancer answers
-- accepted or declined; the client may withdraw before that. Accepting an
-- invitation does not create a proposal — the freelancer still writes their
-- own bid — it only records that they were asked.
CREATE TABLE IF NOT EXISTS public.invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    freelancer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    message TEXT CHECK (message IS NULL OR char_length(message) <= 1000),
    status invitation_status NOT NULL DEFAULT 'invited',
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    CONSTRAINT uq_invitation_job_freelancer UNIQUE (job_id, freelancer_id),
    CONSTRAINT invitations_no_self CHECK (client_id <> freelancer_id)
);

CREATE INDEX IF NOT EXISTS invitations_freelancer_idx
    ON public.invitations (freelancer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS invitations_job_idx
    ON public.invitations (job_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 7e. PROJECT CATALOG (FIXED-PRICE SERVICE PACKAGES)
-- ----------------------------------------------------------------------------
-- A freelancer publishes up to three tiers of one service. Prices are what the
-- freelancer quotes; the platform takes no commission and moves no money, so
-- ordering a package opens a normal job brief the client and the freelancer
-- agree on in writing.
CREATE TABLE IF NOT EXISTS public.service_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    freelancer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(TRIM(title)) BETWEEN 5 AND 120),
    description TEXT NOT NULL CHECK (char_length(TRIM(description)) >= 20),
    category TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'basic' CHECK (tier IN ('basic', 'standard', 'premium')),
    price NUMERIC(10, 2) NOT NULL CHECK (price > 0),
    delivery_days INT NOT NULL DEFAULT 7 CHECK (delivery_days BETWEEN 1 AND 180),
    revisions INT NOT NULL DEFAULT 1 CHECK (revisions BETWEEN 0 AND 50),
    skills TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS service_packages_active_idx
    ON public.service_packages (is_active, category, tier);
CREATE INDEX IF NOT EXISTS service_packages_owner_idx
    ON public.service_packages (freelancer_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 7f. NOTIFICATIONS
-- ----------------------------------------------------------------------------
-- In-app notifications only. Rows are written by the SECURITY DEFINER triggers
-- below, never by a browser, so a member cannot post a notification to another
-- member. A member reads and dismisses their own rows.
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'info',
    title TEXT NOT NULL CHECK (char_length(TRIM(title)) BETWEEN 1 AND 140),
    body TEXT,
    link TEXT,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS notifications_user_idx
    ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx
    ON public.notifications (user_id, is_read);

-- ----------------------------------------------------------------------------
-- 8. HELPER FUNCTIONS & TRIGGERS
-- ----------------------------------------------------------------------------

-- Check if current authenticated user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Admin-only profile directory. The view is owned by the schema owner, so it
-- can read the private email column, but the WHERE clause is evaluated with
-- the caller's auth.uid(). A non-admin authenticated user gets zero rows, and
-- an anonymous caller has no grant at all.
CREATE OR REPLACE VIEW public.admin_profiles AS
SELECT id, full_name, email, role, is_verified, location, title,
       hourly_rate, created_at
FROM public.profiles
WHERE public.is_admin();

GRANT SELECT ON public.admin_profiles TO authenticated;

-- True when the current user may read files on a project: the client who owns
-- it, a freelancer with an active contract on it, or an admin. Declared after
-- is_admin() because it calls it, and used by the file_transfers policies.
-- Takes the project id as TEXT so a malformed storage path segment can never
-- raise a cast error inside a policy (it simply fails to match).
CREATE OR REPLACE FUNCTION public.can_access_job_files(target_job_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    IF auth.uid() IS NULL OR target_job_id IS NULL THEN
        RETURN FALSE;
    END IF;
    IF public.is_admin() THEN
        RETURN TRUE;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM public.jobs
        WHERE jobs.id::TEXT = target_job_id AND jobs.client_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM public.contracts
        WHERE contracts.job_id::TEXT = target_job_id
          AND contracts.freelancer_id = auth.uid()
          AND contracts.status IN ('active', 'completed')
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- True when the current user may add files to a project: the project owner,
-- an admin, the freelancer on an active contract, or a freelancer with a live
-- proposal (so samples and briefs can be attached before a contract exists).
-- A completed contract is read-only and cannot be used to add new files.
CREATE OR REPLACE FUNCTION public.can_upload_job_files(target_job_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    IF auth.uid() IS NULL OR target_job_id IS NULL THEN
        RETURN FALSE;
    END IF;
    IF public.is_admin() THEN
        RETURN TRUE;
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.jobs
        WHERE jobs.id::TEXT = target_job_id AND jobs.client_id = auth.uid()
    ) THEN
        RETURN TRUE;
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.contracts
        WHERE contracts.job_id::TEXT = target_job_id
          AND contracts.freelancer_id = auth.uid()
          AND contracts.status = 'active'
    ) THEN
        RETURN TRUE;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM public.proposals
        WHERE proposals.job_id::TEXT = target_job_id
          AND proposals.freelancer_id = auth.uid()
          AND proposals.status IN ('submitted', 'shortlisted')
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Safe new user signup trigger: strictly defaults to client or freelancer (never admin)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    assigned_role user_role;
    raw_role TEXT;
BEGIN
    raw_role := NEW.raw_user_meta_data->>'role';
    IF raw_role = 'client' THEN
        assigned_role := 'client'::user_role;
    ELSE
        assigned_role := 'freelancer'::user_role;
    END IF;

    INSERT INTO public.profiles (id, email, full_name, role, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''), 'Member'),
        assigned_role,
        NEW.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        avatar_url = EXCLUDED.avatar_url,
        updated_at = TIMEZONE('utc', NOW());

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Protect profile immutables (prevents self privilege escalation).
-- The row is read through `to_jsonb` so the trigger still works on a
-- project that has not restored the `email` column yet: `NEW.email` would
-- raise "record NEW has no field email" and break every profile update.
CREATE OR REPLACE FUNCTION public.protect_profile_immutable_fields()
RETURNS TRIGGER AS $$
DECLARE
    old_row JSONB := to_jsonb(OLD);
    new_row JSONB := to_jsonb(NEW);
BEGIN
    IF (new_row->>'role' IS DISTINCT FROM old_row->>'role' OR
        new_row->>'is_verified' IS DISTINCT FROM old_row->>'is_verified' OR
        new_row->>'email' IS DISTINCT FROM old_row->>'email') THEN
        -- Only the owner, or trusted server-side code, may touch these fields.
        -- is_admin() covers a signed-in owner. current_user cannot be used
        -- here because a SECURITY DEFINER function runs as its owner, so the
        -- invoker's role is read from the role GUC that PostgREST sets. This is
        -- what lets provision_admin_user() create the very first owner, when no
        -- admin exists yet and is_admin() is still false.
        IF NOT public.is_admin()
           AND current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
            RAISE EXCEPTION 'Unauthorized: Direct modification of role, email, or verification status is prohibited.';
        END IF;
    END IF;
    NEW.updated_at := TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_protect_profile_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_fields
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE PROCEDURE public.protect_profile_immutable_fields();

-- State machine validation for jobs
CREATE OR REPLACE FUNCTION public.validate_job_mutation()
RETURNS TRIGGER AS $$
BEGIN
    NEW.client_id := OLD.client_id;
    NEW.proposals_count := OLD.proposals_count;
    NEW.updated_at := TIMEZONE('utc', NOW());

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF OLD.status = 'draft' AND NEW.status NOT IN ('open', 'cancelled') THEN
            RAISE EXCEPTION 'Draft jobs can only be published or cancelled.';
        ELSIF OLD.status = 'open' AND NEW.status NOT IN ('in_progress', 'cancelled') THEN
            RAISE EXCEPTION 'Open jobs can only move to in_progress or cancelled.';
        ELSIF OLD.status = 'in_progress' AND NEW.status NOT IN ('completed', 'cancelled') THEN
            RAISE EXCEPTION 'Active jobs can only be marked as completed or cancelled.';
        ELSIF OLD.status IN ('completed', 'cancelled') AND NOT public.is_admin() THEN
            RAISE EXCEPTION 'Closed jobs cannot be modified.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_validate_job_mutation ON public.jobs;
CREATE TRIGGER trg_validate_job_mutation
    BEFORE UPDATE ON public.jobs
    FOR EACH ROW EXECUTE PROCEDURE public.validate_job_mutation();

-- Maintain proposals count on job
CREATE OR REPLACE FUNCTION public.sync_job_proposals_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.jobs SET proposals_count = proposals_count + 1 WHERE id = NEW.job_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.jobs SET proposals_count = GREATEST(proposals_count - 1, 0) WHERE id = OLD.job_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_sync_job_proposals_count ON public.proposals;
CREATE TRIGGER trg_sync_job_proposals_count
    AFTER INSERT OR DELETE ON public.proposals
    FOR EACH ROW EXECUTE PROCEDURE public.sync_job_proposals_count();

-- Milestone state machine. The RLS policies decide who may touch a milestone
-- row at all; this trigger decides who may move it where:
--   pending  -> delivered   (the freelancer, once the work is ready)
--   delivered -> accepted   (the client, once they have checked it)
--   delivered -> pending    (the freelancer, reopening before acceptance)
-- Accepted milestones are final, and nothing may change on a closed contract.
CREATE OR REPLACE FUNCTION public.validate_milestone_mutation()
RETURNS TRIGGER AS $$
DECLARE
    v_client UUID;
    v_freelancer UUID;
    v_status contract_status;
    v_actor UUID := auth.uid();
BEGIN
    SELECT client_id, freelancer_id, status
    INTO v_client, v_freelancer, v_status
    FROM public.contracts
    WHERE id = COALESCE(NEW.contract_id, OLD.contract_id);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contract not found.';
    END IF;

    IF v_status <> 'active' AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Milestones can only change while the contract is active.';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF v_actor IS NOT NULL AND v_actor <> v_client AND v_actor <> v_freelancer
           AND NOT public.is_admin() THEN
            RAISE EXCEPTION 'Only the client or the freelancer can add milestones.';
        END IF;
        NEW.status := 'pending';
        NEW.delivered_at := NULL;
        NEW.accepted_at := NULL;
        NEW.created_at := TIMEZONE('utc', NOW());
        NEW.updated_at := NEW.created_at;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        -- An accepted milestone is the client's record of signed-off work, so
        -- only the client (or an admin) may delete it.
        IF OLD.status = 'accepted'
           AND auth.uid() IS NOT NULL
           AND auth.uid() <> v_client
           AND NOT public.is_admin() THEN
            RAISE EXCEPTION 'Only the client can remove an accepted milestone.';
        END IF;
        RETURN OLD;
    END IF;

    NEW.contract_id := OLD.contract_id;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := TIMEZONE('utc', NOW());

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status = 'delivered' THEN
            IF v_actor IS NOT NULL AND v_actor <> v_freelancer AND NOT public.is_admin() THEN
                RAISE EXCEPTION 'Only the freelancer can mark a milestone delivered.';
            END IF;
            IF OLD.status = 'accepted' THEN
                RAISE EXCEPTION 'An accepted milestone cannot be delivered again.';
            END IF;
            NEW.delivered_at := TIMEZONE('utc', NOW());
        ELSIF NEW.status = 'accepted' THEN
            IF v_actor IS NOT NULL AND v_actor <> v_client AND NOT public.is_admin() THEN
                RAISE EXCEPTION 'Only the client can accept a milestone.';
            END IF;
            IF OLD.status <> 'delivered' THEN
                RAISE EXCEPTION 'A milestone must be delivered before it can be accepted.';
            END IF;
            NEW.accepted_at := TIMEZONE('utc', NOW());
        ELSE
            IF OLD.status = 'accepted' AND NOT public.is_admin() THEN
                RAISE EXCEPTION 'An accepted milestone can no longer be reopened.';
            END IF;
            NEW.delivered_at := NULL;
            NEW.accepted_at := NULL;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_validate_milestone_mutation ON public.contract_milestones;
CREATE TRIGGER trg_validate_milestone_mutation
    BEFORE INSERT OR UPDATE OR DELETE ON public.contract_milestones
    FOR EACH ROW EXECUTE PROCEDURE public.validate_milestone_mutation();

-- A review always belongs to the contract it was written for, and the comment
-- is trimmed and capped. Together with the INSERT policy below, that means a
-- review can never point at a job or a member outside its own contract.
CREATE OR REPLACE FUNCTION public.sync_review_contract()
RETURNS TRIGGER AS $$
BEGIN
    SELECT job_id INTO NEW.job_id
    FROM public.contracts
    WHERE id = NEW.contract_id;

    NEW.comment := NULLIF(LEFT(TRIM(COALESCE(NEW.comment, '')), 1000), '');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_sync_review_contract ON public.reviews;
CREATE TRIGGER trg_sync_review_contract
    BEFORE INSERT ON public.reviews
    FOR EACH ROW EXECUTE PROCEDURE public.sync_review_contract();

-- One review per contract per reviewer. Without this a member could post the
-- same five stars ten times and move the public average.
CREATE UNIQUE INDEX IF NOT EXISTS uq_review_per_contract_reviewer
    ON public.reviews (contract_id, reviewer_id)
    WHERE contract_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 8b. NOTIFICATION WRITERS AND INVITATION RULES
-- ----------------------------------------------------------------------------
-- `notify_user` is SECURITY DEFINER because a browser must never be able to
-- insert a notification for somebody else: the notification policies below
-- grant SELECT/UPDATE/DELETE only. It is revoked from every client role and
-- called from the triggers underneath.
CREATE OR REPLACE FUNCTION public.notify_user(
    target_user UUID,
    n_type TEXT,
    n_title TEXT,
    n_body TEXT DEFAULT NULL,
    n_link TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    IF target_user IS NULL THEN
        RETURN;
    END IF;
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
        target_user,
        COALESCE(NULLIF(TRIM(n_type), ''), 'info'),
        LEFT(COALESCE(NULLIF(TRIM(n_title), ''), 'Marketplace update'), 140),
        NULLIF(LEFT(TRIM(COALESCE(n_body, '')), 1000), ''),
        NULLIF(TRIM(COALESCE(n_link, '')), '')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.notify_user(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

-- A new bid tells the client. A status change tells the freelancer, except for
-- the transition the freelancer caused themselves (withdrawing).
CREATE OR REPLACE FUNCTION public.notify_on_proposal_change()
RETURNS TRIGGER AS $$
DECLARE
    v_client UUID;
    v_title TEXT;
BEGIN
    SELECT client_id, title INTO v_client, v_title
    FROM public.jobs WHERE id = NEW.job_id;

    IF TG_OP = 'INSERT' THEN
        PERFORM public.notify_user(
            v_client,
            'proposal',
            'New proposal on "' || COALESCE(v_title, 'your project') || '"',
            'A freelancer submitted a bid. Review it in your portal.',
            'marketplace-dashboard.html#primary'
        );
        RETURN NEW;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'withdrawn' THEN
        PERFORM public.notify_user(
            NEW.freelancer_id,
            'proposal-status',
            'Your proposal is now ' || NEW.status,
            'The client updated your bid on "' || COALESCE(v_title, 'a project') || '".',
            'marketplace-dashboard.html#primary'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_notify_on_proposal_change ON public.proposals;
CREATE TRIGGER trg_notify_on_proposal_change
    AFTER INSERT OR UPDATE ON public.proposals
    FOR EACH ROW EXECUTE PROCEDURE public.notify_on_proposal_change();

-- An invitation tells the freelancer; an answer tells the client.
CREATE OR REPLACE FUNCTION public.notify_on_invitation_change()
RETURNS TRIGGER AS $$
DECLARE
    v_title TEXT;
BEGIN
    SELECT title INTO v_title FROM public.jobs WHERE id = NEW.job_id;

    IF TG_OP = 'INSERT' THEN
        PERFORM public.notify_user(
            NEW.freelancer_id,
            'invitation',
            'You were invited to "' || COALESCE(v_title, 'a project') || '"',
            'A client would like you to look at their project and send a proposal.',
            'marketplace-dashboard.html#invitations'
        );
        RETURN NEW;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('accepted', 'declined') THEN
        PERFORM public.notify_user(
            NEW.client_id,
            'invitation-reply',
            'Invitation ' || NEW.status,
            'A freelancer ' || NEW.status || ' your invitation for "' || COALESCE(v_title, 'a project') || '".',
            'marketplace-dashboard.html#invitations'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_notify_on_invitation_change ON public.invitations;
CREATE TRIGGER trg_notify_on_invitation_change
    AFTER INSERT OR UPDATE ON public.invitations
    FOR EACH ROW EXECUTE PROCEDURE public.notify_on_invitation_change();

-- Invitation answers are one-way: the freelancer accepts or declines while it
-- is still `invited`, the client may withdraw while it is still `invited`, and
-- nothing else moves. The invitation's job, client and freelancer are frozen.
CREATE OR REPLACE FUNCTION public.validate_invitation_mutation()
RETURNS TRIGGER AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_job_client UUID;
    v_job_status job_status;
    v_role user_role;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT client_id, status INTO v_job_client, v_job_status
        FROM public.jobs WHERE id = NEW.job_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Job not found.';
        END IF;

        IF v_actor IS NOT NULL AND v_actor <> v_job_client AND NOT public.is_admin() THEN
            RAISE EXCEPTION 'Only the client who owns this project can send an invitation.';
        END IF;

        NEW.client_id := v_job_client;

        IF v_job_status <> 'open' THEN
            RAISE EXCEPTION 'Invitations can only be sent for an open project.';
        END IF;

        SELECT role INTO v_role FROM public.profiles WHERE id = NEW.freelancer_id;
        IF v_role IS NULL THEN
            RAISE EXCEPTION 'Freelancer not found.';
        END IF;
        IF v_role NOT IN ('freelancer', 'admin') THEN
            RAISE EXCEPTION 'Invitations can only be sent to a freelancer.';
        END IF;

        NEW.status := 'invited';
        NEW.responded_at := NULL;
        NEW.created_at := TIMEZONE('utc', NOW());
        RETURN NEW;
    END IF;

    -- Immutable identity of the invitation.
    NEW.job_id := OLD.job_id;
    NEW.client_id := OLD.client_id;
    NEW.freelancer_id := OLD.freelancer_id;
    NEW.created_at := OLD.created_at;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF OLD.status <> 'invited' THEN
            RAISE EXCEPTION 'This invitation has already been answered.';
        END IF;

        IF NEW.status IN ('accepted', 'declined') THEN
            IF v_actor IS NOT NULL AND v_actor <> OLD.freelancer_id AND NOT public.is_admin() THEN
                RAISE EXCEPTION 'Only the invited freelancer can answer this invitation.';
            END IF;
        ELSIF NEW.status = 'withdrawn' THEN
            IF v_actor IS NOT NULL AND v_actor <> OLD.client_id AND NOT public.is_admin() THEN
                RAISE EXCEPTION 'Only the client can withdraw this invitation.';
            END IF;
        ELSE
            RAISE EXCEPTION 'An invitation can only be accepted, declined or withdrawn.';
        END IF;

        NEW.responded_at := TIMEZONE('utc', NOW());
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_validate_invitation_mutation ON public.invitations;
CREATE TRIGGER trg_validate_invitation_mutation
    BEFORE INSERT OR UPDATE ON public.invitations
    FOR EACH ROW EXECUTE PROCEDURE public.validate_invitation_mutation();

-- Catalog rows keep their owner and their timestamps; price, delivery and
-- revision limits are already CHECK constraints on the table.
CREATE OR REPLACE FUNCTION public.touch_service_package()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        NEW.freelancer_id := OLD.freelancer_id;
        NEW.created_at := OLD.created_at;
        NEW.updated_at := TIMEZONE('utc', NOW());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_touch_service_package ON public.service_packages;
CREATE TRIGGER trg_touch_service_package
    BEFORE INSERT OR UPDATE ON public.service_packages
    FOR EACH ROW EXECUTE PROCEDURE public.touch_service_package();

-- ----------------------------------------------------------------------------
-- 9. TRANSACTIONAL RPC: ATOMIC PROPOSAL ACCEPTANCE & CONTRACT CREATION
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_proposal_and_create_contract(target_proposal_id UUID)
RETURNS UUID AS $$
DECLARE
    v_job_id UUID;
    v_client_id UUID;
    v_freelancer_id UUID;
    v_bid_amount NUMERIC(10, 2);
    v_job_status job_status;
    v_proposal_status proposal_status;
    v_contract_id UUID;
BEGIN
    -- 1. Row lock on proposal to prevent concurrent race conditions
    SELECT job_id, freelancer_id, bid_amount, status
    INTO v_job_id, v_freelancer_id, v_bid_amount, v_proposal_status
    FROM public.proposals
    WHERE id = target_proposal_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Proposal not found.';
    END IF;

    -- 2. Row lock on parent job
    SELECT client_id, status
    INTO v_client_id, v_job_status
    FROM public.jobs
    WHERE id = v_job_id
    FOR UPDATE;

    -- 3. Authorization check
    IF v_client_id != auth.uid() AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only the client who posted the job can accept proposals.';
    END IF;

    -- 4. State validation
    IF v_job_status != 'open' THEN
        RAISE EXCEPTION 'Job is not open for hiring (Current status: %).', v_job_status;
    END IF;

    IF v_proposal_status IN ('accepted', 'withdrawn', 'rejected') THEN
        RAISE EXCEPTION 'Proposal cannot be accepted in its current state (%).', v_proposal_status;
    END IF;

    -- 5. Mark accepted
    UPDATE public.proposals
    SET status = 'accepted', updated_at = TIMEZONE('utc', NOW())
    WHERE id = target_proposal_id;

    -- 6. Automatically reject other active proposals for this job
    UPDATE public.proposals
    SET status = 'rejected', updated_at = TIMEZONE('utc', NOW())
    WHERE job_id = v_job_id AND id != target_proposal_id AND status != 'withdrawn';

    -- 7. Move job to in_progress
    UPDATE public.jobs
    SET status = 'in_progress', updated_at = TIMEZONE('utc', NOW())
    WHERE id = v_job_id;

    -- 8. Create contract atomically
    INSERT INTO public.contracts (job_id, proposal_id, client_id, freelancer_id, agreed_amount, status)
    VALUES (v_job_id, target_proposal_id, v_client_id, v_freelancer_id, v_bid_amount, 'active')
    RETURNING id INTO v_contract_id;

    RETURN v_contract_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- 9a. PROPOSAL REVIEW (SHORTLIST / DECLINE) — CLIENT ONLY
-- ----------------------------------------------------------------------------
-- Hiring goes through accept_proposal_and_create_contract() above, which is
-- the only path that creates a contract. This function covers the two cheaper
-- decisions a client makes while a job is still open: shortlist a bid so the
-- freelancer knows it is in the running, or decline it so they can move on.
CREATE OR REPLACE FUNCTION public.set_proposal_status(
    target_proposal_id UUID,
    new_status proposal_status
)
RETURNS UUID AS $$
DECLARE
    v_job_id UUID;
    v_client_id UUID;
    v_job_status job_status;
    v_proposal_status proposal_status;
BEGIN
    IF new_status NOT IN ('submitted', 'shortlisted', 'rejected') THEN
        RAISE EXCEPTION 'Only shortlisted, submitted or rejected can be set here. Accept the proposal to hire.';
    END IF;

    SELECT job_id, status INTO v_job_id, v_proposal_status
    FROM public.proposals
    WHERE id = target_proposal_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Proposal not found.';
    END IF;

    SELECT client_id, status INTO v_client_id, v_job_status
    FROM public.jobs
    WHERE id = v_job_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Job not found.';
    END IF;

    IF v_client_id <> auth.uid() AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only the client who posted the job can review proposals.';
    END IF;

    IF v_job_status <> 'open' THEN
        RAISE EXCEPTION 'Proposals can only be reviewed while the job is open.';
    END IF;

    IF v_proposal_status IN ('accepted', 'withdrawn') THEN
        RAISE EXCEPTION 'This proposal can no longer be changed (%).', v_proposal_status;
    END IF;

    UPDATE public.proposals
    SET status = new_status, updated_at = TIMEZONE('utc', NOW())
    WHERE id = target_proposal_id;

    RETURN target_proposal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.set_proposal_status(UUID, proposal_status) TO authenticated;

-- ----------------------------------------------------------------------------
-- 9b. WORKER & CLIENT RECORDS
-- ----------------------------------------------------------------------------
-- Public worker record: completed/active counts, ratings and recent completed
-- job titles. Earnings and client identities stay private. Clients use this
-- before hiring; the worker's own dashboard adds the private earnings view.
CREATE OR REPLACE FUNCTION public.get_worker_record(p_worker_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_profile JSONB;
    v_summary JSONB;
    v_recent JSONB;
    v_avg_rating NUMERIC;
    v_review_count BIGINT;
BEGIN
    SELECT jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url,
        'title', p.title,
        'skills', p.skills,
        'is_verified', p.is_verified,
        'member_since', p.created_at
    ) INTO v_profile
    FROM public.public_profiles p
    WHERE p.id = p_worker_id;

    IF v_profile IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(avg_rating, 0), COALESCE(review_count, 0)
    INTO v_avg_rating, v_review_count
    FROM public.worker_ratings
    WHERE reviewee_id = p_worker_id;

    IF NOT FOUND THEN
        v_avg_rating := 0;
        v_review_count := 0;
    END IF;

    SELECT jsonb_build_object(
        'completed_jobs', COUNT(*) FILTER (WHERE c.status = 'completed' OR j.status = 'completed'),
        'active_jobs', COUNT(*) FILTER (WHERE c.status = 'active' AND j.status = 'in_progress'),
        'clients_served', COUNT(DISTINCT c.client_id) FILTER (WHERE c.status = 'completed' OR j.status = 'completed'),
        'avg_rating', v_avg_rating,
        'review_count', v_review_count,
        'first_completed_at', MIN(CASE WHEN c.status = 'completed' OR j.status = 'completed' THEN COALESCE(c.updated_at, j.updated_at) END),
        'last_completed_at', MAX(CASE WHEN c.status = 'completed' OR j.status = 'completed' THEN COALESCE(c.updated_at, j.updated_at) END)
    ) INTO v_summary
    FROM public.contracts c
    JOIN public.jobs j ON j.id = c.job_id
    WHERE c.freelancer_id = p_worker_id;

    SELECT COALESCE(jsonb_agg(item ORDER BY completed_at DESC), '[]'::jsonb)
    INTO v_recent
    FROM (
        SELECT jsonb_build_object(
            'job_id', j.id,
            'title', j.title,
            'category', j.category,
            'completed_at', COALESCE(c.updated_at, j.updated_at)
        ) AS item,
        COALESCE(c.updated_at, j.updated_at) AS completed_at
        FROM public.contracts c
        JOIN public.jobs j ON j.id = c.job_id
        WHERE c.freelancer_id = p_worker_id
          AND (c.status = 'completed' OR j.status = 'completed')
        ORDER BY COALESCE(c.updated_at, j.updated_at) DESC
        LIMIT 10
    ) recent;

    RETURN jsonb_build_object('profile', v_profile, 'summary', v_summary, 'recent', v_recent);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_worker_record(UUID) TO anon, authenticated;

-- Public client record: how many projects the client posted, how many were
-- hired and how many completed. No spend, budgets or freelancer names.
CREATE OR REPLACE FUNCTION public.get_client_record(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_profile JSONB;
    v_summary JSONB;
BEGIN
    SELECT jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url,
        'member_since', p.created_at
    ) INTO v_profile
    FROM public.public_profiles p
    WHERE p.id = p_client_id;

    IF v_profile IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT jsonb_build_object(
        'jobs_posted', COUNT(*) FILTER (WHERE j.status <> 'draft'),
        'open_jobs', COUNT(*) FILTER (WHERE j.status = 'open'),
        'in_progress_jobs', COUNT(*) FILTER (WHERE j.status = 'in_progress'),
        'completed_jobs', COUNT(*) FILTER (WHERE j.status = 'completed'),
        'cancelled_jobs', COUNT(*) FILTER (WHERE j.status = 'cancelled'),
        'hires', (SELECT COUNT(*) FROM public.contracts c WHERE c.client_id = p_client_id)
    ) INTO v_summary
    FROM public.jobs j
    WHERE j.client_id = p_client_id;

    RETURN jsonb_build_object('profile', v_profile, 'summary', v_summary);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_record(UUID) TO anon, authenticated;

-- The signed-in user's full record. Worker earnings and the client's own
-- project/hire history are private and never returned by the public functions.
CREATE OR REPLACE FUNCTION public.get_my_record()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_profile JSONB;
    v_worker JSONB;
    v_worker_private JSONB;
    v_client_summary JSONB;
    v_recent_jobs JSONB;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Please sign in to view your record.';
    END IF;

    SELECT jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'role', p.role,
        'title', p.title,
        'avatar_url', p.avatar_url,
        'member_since', p.created_at
    ) INTO v_profile
    FROM public.public_profiles p
    WHERE p.id = v_uid;

    v_worker := public.get_worker_record(v_uid);

    SELECT jsonb_build_object(
        'total_earned', COALESCE(SUM(c.agreed_amount) FILTER (WHERE c.status = 'completed' OR j.status = 'completed'), 0),
        'recent', COALESCE((
            SELECT jsonb_agg(item ORDER BY completed_at DESC)
            FROM (
                SELECT jsonb_build_object(
                    'job_id', j2.id,
                    'title', j2.title,
                    'category', j2.category,
                    'amount', c2.agreed_amount,
                    'completed_at', COALESCE(c2.updated_at, j2.updated_at)
                ) AS item,
                COALESCE(c2.updated_at, j2.updated_at) AS completed_at
                FROM public.contracts c2
                JOIN public.jobs j2 ON j2.id = c2.job_id
                WHERE c2.freelancer_id = v_uid
                  AND (c2.status = 'completed' OR j2.status = 'completed')
                ORDER BY COALESCE(c2.updated_at, j2.updated_at) DESC
                LIMIT 10
            ) r
        ), '[]'::jsonb)
    ) INTO v_worker_private
    FROM public.contracts c
    JOIN public.jobs j ON j.id = c.job_id
    WHERE c.freelancer_id = v_uid;

    IF v_worker IS NOT NULL THEN
        v_worker := v_worker || jsonb_build_object(
            'earnings', COALESCE((v_worker_private->>'total_earned')::NUMERIC, 0),
            'recent', COALESCE(v_worker_private->'recent', '[]'::jsonb)
        );
    END IF;

    SELECT jsonb_build_object(
        'jobs_posted', COUNT(*) FILTER (WHERE j.status <> 'draft'),
        'open_jobs', COUNT(*) FILTER (WHERE j.status = 'open'),
        'in_progress_jobs', COUNT(*) FILTER (WHERE j.status = 'in_progress'),
        'completed_jobs', COUNT(*) FILTER (WHERE j.status = 'completed'),
        'cancelled_jobs', COUNT(*) FILTER (WHERE j.status = 'cancelled'),
        'hires', (SELECT COUNT(*) FROM public.contracts c WHERE c.client_id = v_uid),
        'total_spent', COALESCE((SELECT SUM(c.agreed_amount) FROM public.contracts c WHERE c.client_id = v_uid AND c.status = 'completed'), 0),
        'active_contracts', (SELECT COUNT(*) FROM public.contracts c WHERE c.client_id = v_uid AND c.status = 'active')
    ) INTO v_client_summary
    FROM public.jobs j
    WHERE j.client_id = v_uid;

    SELECT COALESCE(jsonb_agg(item ORDER BY created_at DESC), '[]'::jsonb)
    INTO v_recent_jobs
    FROM (
        SELECT jsonb_build_object(
            'job_id', j.id,
            'title', j.title,
            'status', j.status,
            'created_at', j.created_at,
            'budget_min', j.budget_min,
            'budget_max', j.budget_max,
            'contract_status', c.status,
            'contract_amount', c.agreed_amount,
            'hired_freelancer', CASE WHEN f.id IS NULL THEN NULL ELSE jsonb_build_object('id', f.id, 'full_name', f.full_name) END
        ) AS item,
        j.created_at
        FROM public.jobs j
        LEFT JOIN public.contracts c ON c.job_id = j.id AND c.client_id = v_uid
        LEFT JOIN public.public_profiles f ON f.id = c.freelancer_id
        WHERE j.client_id = v_uid
        ORDER BY j.created_at DESC
        LIMIT 20
    ) recent;

    RETURN jsonb_build_object(
        'profile', v_profile,
        'worker', v_worker,
        'client', jsonb_build_object('summary', v_client_summary, 'recent_jobs', v_recent_jobs)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_record() TO authenticated;

-- Client sign-off. Completing the contract closes the job and moves both
-- records forward atomically. Only the client (or an admin) may call it.
CREATE OR REPLACE FUNCTION public.complete_contract(p_contract_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_contract public.contracts%ROWTYPE;
    v_job_status job_status;
BEGIN
    SELECT * INTO v_contract
    FROM public.contracts
    WHERE id = p_contract_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contract not found.';
    END IF;

    IF v_contract.client_id <> auth.uid() AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only the client can complete this contract.';
    END IF;

    IF v_contract.status <> 'active' THEN
        RAISE EXCEPTION 'Only active contracts can be completed.';
    END IF;

    SELECT status INTO v_job_status
    FROM public.jobs
    WHERE id = v_contract.job_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Job not found.';
    END IF;

    IF v_job_status <> 'in_progress' THEN
        RAISE EXCEPTION 'Job is not in progress.';
    END IF;

    UPDATE public.contracts
    SET status = 'completed', updated_at = TIMEZONE('utc', NOW())
    WHERE id = p_contract_id;

    UPDATE public.jobs
    SET status = 'completed', updated_at = TIMEZONE('utc', NOW())
    WHERE id = v_contract.job_id;

    RETURN p_contract_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_contract(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 9a. CONTRACT CANCELLATION AND DISPUTES
-- ----------------------------------------------------------------------------
-- Either party can stop an engagement that is not going ahead, and either party
-- can put one under review. Both are recorded on the contract so the portal and
-- the record agree; neither moves money, because payments are direct.
CREATE OR REPLACE FUNCTION public.cancel_contract(p_contract_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_contract public.contracts%ROWTYPE;
BEGIN
    SELECT * INTO v_contract
    FROM public.contracts
    WHERE id = p_contract_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contract not found.';
    END IF;

    IF v_contract.client_id <> auth.uid()
       AND v_contract.freelancer_id <> auth.uid()
       AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only the client or the freelancer can cancel this contract.';
    END IF;

    IF v_contract.status <> 'active' THEN
        RAISE EXCEPTION 'Only active contracts can be cancelled.';
    END IF;

    UPDATE public.contracts
    SET status = 'cancelled', updated_at = TIMEZONE('utc', NOW())
    WHERE id = p_contract_id;

    UPDATE public.jobs
    SET status = 'cancelled', updated_at = TIMEZONE('utc', NOW())
    WHERE id = v_contract.job_id
      AND status = 'in_progress';

    RETURN p_contract_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_contract(UUID) TO authenticated;

-- A dispute freezes the contract record without ending the engagement: the job
-- stays in progress so neither side is forced to continue as if nothing happened.
CREATE OR REPLACE FUNCTION public.raise_contract_dispute(p_contract_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_contract public.contracts%ROWTYPE;
BEGIN
    SELECT * INTO v_contract
    FROM public.contracts
    WHERE id = p_contract_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contract not found.';
    END IF;

    IF v_contract.client_id <> auth.uid()
       AND v_contract.freelancer_id <> auth.uid()
       AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only the client or the freelancer can dispute this contract.';
    END IF;

    IF v_contract.status <> 'active' THEN
        RAISE EXCEPTION 'Only active contracts can be disputed.';
    END IF;

    UPDATE public.contracts
    SET status = 'disputed', updated_at = TIMEZONE('utc', NOW())
    WHERE id = p_contract_id;

    RETURN p_contract_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raise_contract_dispute(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 10. ADMIN PROVISIONING (RESTRICTED EXECUTION)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_admin_user(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.profiles
    SET role = 'admin'::user_role, is_verified = TRUE, updated_at = TIMEZONE('utc', NOW())
    WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.provision_admin_user(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provision_admin_user(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_admin_user(UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- 10b. ADMIN OVERVIEW RPC (OWNER KPI COUNTERS)
-- ----------------------------------------------------------------------------
-- admin.html calls this on load to fill its KPI tiles. Aggregates in the
-- database so the dashboard does not have to pull every row, and refuses to
-- run for anyone who is not the owner.
CREATE OR REPLACE FUNCTION public.admin_overview()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: admin_overview is owner-only.' USING ERRCODE = '42501';
    END IF;

    SELECT jsonb_build_object(
        'workers',          (SELECT COUNT(*) FROM public.profiles WHERE role = 'freelancer'),
        'clients',          (SELECT COUNT(*) FROM public.profiles WHERE role = 'client'),
        'verified_workers', (SELECT COUNT(*) FROM public.profiles WHERE role = 'freelancer' AND is_verified),
        'open_jobs',        (SELECT COUNT(*) FROM public.jobs WHERE status = 'open'),
        'proposals',        (SELECT COUNT(*) FROM public.proposals),
        'active_contracts', (SELECT COUNT(*) FROM public.contracts WHERE status = 'active'),
        'contract_value',   (SELECT COALESCE(SUM(agreed_amount), 0) FROM public.contracts)
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.admin_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_overview() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_overview() TO authenticated;

-- ----------------------------------------------------------------------------
-- 11. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_talent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Profiles: public directory read for non-sensitive data, owner/admin update.
-- This row policy is paired with the column grants above: `email` and
-- `phone_number` are not granted to anon/authenticated, so a direct table
-- read can only see the safe directory columns. The public directory uses
-- `public_profiles`; the admin uses `admin_profiles` for email.
DROP POLICY IF EXISTS "Public can view basic profiles" ON public.profiles;
CREATE POLICY "Public can view basic profiles" 
ON public.profiles FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Users can update own profile only" ON public.profiles;
CREATE POLICY "Users can update own profile only" 
ON public.profiles FOR UPDATE 
TO authenticated 
USING (auth.uid() = id OR public.is_admin())
WITH CHECK (auth.uid() = id OR public.is_admin());

-- Jobs RLS
DROP POLICY IF EXISTS "Viewable jobs policy" ON public.jobs;
CREATE POLICY "Viewable jobs policy" 
ON public.jobs FOR SELECT 
USING (
    status IN ('open', 'in_progress', 'completed')
    OR (auth.uid() = client_id)
    OR public.is_admin()
);

DROP POLICY IF EXISTS "Clients can create jobs" ON public.jobs;
CREATE POLICY "Clients can create jobs" 
ON public.jobs FOR INSERT 
TO authenticated 
WITH CHECK (
    auth.uid() = client_id AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'client' OR role = 'admin'))
);

DROP POLICY IF EXISTS "Clients can update own jobs" ON public.jobs;
CREATE POLICY "Clients can update own jobs" 
ON public.jobs FOR UPDATE 
TO authenticated 
USING (auth.uid() = client_id OR public.is_admin())
WITH CHECK (auth.uid() = client_id OR public.is_admin());

DROP POLICY IF EXISTS "Clients can delete own draft or open jobs" ON public.jobs;
CREATE POLICY "Clients can delete own draft or open jobs" 
ON public.jobs FOR DELETE 
TO authenticated 
USING (
    (auth.uid() = client_id AND status IN ('draft', 'open'))
    OR public.is_admin()
);

-- Job Attachments RLS
DROP POLICY IF EXISTS "View attachments policy" ON public.job_attachments;
CREATE POLICY "View attachments policy" 
ON public.job_attachments FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.jobs 
        WHERE jobs.id = job_attachments.job_id 
        AND (
            jobs.status IN ('open', 'in_progress', 'completed')
            OR jobs.client_id = auth.uid()
            OR public.is_admin()
        )
    )
);

DROP POLICY IF EXISTS "Job owners can upload attachments" ON public.job_attachments;
CREATE POLICY "Job owners can upload attachments" 
ON public.job_attachments FOR INSERT 
TO authenticated 
WITH CHECK (
    auth.uid() = uploaded_by AND
    EXISTS (
        SELECT 1 FROM public.jobs 
        WHERE jobs.id = job_attachments.job_id 
        AND (jobs.client_id = auth.uid() OR public.is_admin())
    )
);

DROP POLICY IF EXISTS "Job owners can delete attachments" ON public.job_attachments;
CREATE POLICY "Job owners can delete attachments" 
ON public.job_attachments FOR DELETE 
TO authenticated 
USING (
    auth.uid() = uploaded_by OR 
    EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = job_attachments.job_id AND jobs.client_id = auth.uid()) OR
    public.is_admin()
);

-- File Transfers RLS (in-site send / receive)
-- A participant sees a file when they uploaded it, own the project, hold the
-- active contract on it, or are an admin. Uploads are allowed to the project
-- owner, an active-contract freelancer or a freelancer with a live proposal;
-- only the uploader (or an admin) may remove a row, and storage objects are
-- gated by the matching policies in section 12.
DROP POLICY IF EXISTS "Participants can view project files" ON public.file_transfers;
CREATE POLICY "Participants can view project files"
ON public.file_transfers FOR SELECT
TO authenticated
USING (uploaded_by = auth.uid() OR public.can_access_job_files(job_id::TEXT));

DROP POLICY IF EXISTS "Participants can upload project files" ON public.file_transfers;
CREATE POLICY "Participants can upload project files"
ON public.file_transfers FOR INSERT
TO authenticated
WITH CHECK (uploaded_by = auth.uid() AND public.can_upload_job_files(job_id::TEXT));

DROP POLICY IF EXISTS "Uploaders can remove their files" ON public.file_transfers;
CREATE POLICY "Uploaders can remove their files"
ON public.file_transfers FOR DELETE
TO authenticated
USING (uploaded_by = auth.uid() OR public.is_admin());

-- Proposals RLS
DROP POLICY IF EXISTS "Proposals viewable by submitter, client, or admin" ON public.proposals;
CREATE POLICY "Proposals viewable by submitter, client, or admin" 
ON public.proposals FOR SELECT 
TO authenticated 
USING (
    freelancer_id = auth.uid() 
    OR EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = proposals.job_id AND jobs.client_id = auth.uid())
    OR public.is_admin()
);

DROP POLICY IF EXISTS "Freelancers can submit proposal to open jobs" ON public.proposals;
CREATE POLICY "Freelancers can submit proposal to open jobs" 
ON public.proposals FOR INSERT 
TO authenticated 
WITH CHECK (
    auth.uid() = freelancer_id AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'freelancer' OR role = 'admin')) AND
    EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = proposals.job_id AND jobs.status = 'open')
);

DROP POLICY IF EXISTS "Freelancers can update or withdraw own proposal" ON public.proposals;
CREATE POLICY "Freelancers can update or withdraw own proposal" 
ON public.proposals FOR UPDATE 
TO authenticated 
USING (
    (freelancer_id = auth.uid() AND status IN ('submitted', 'shortlisted'))
    OR public.is_admin()
)
WITH CHECK (
    (freelancer_id = auth.uid() AND status IN ('submitted', 'shortlisted', 'withdrawn'))
    OR public.is_admin()
);

-- Contracts RLS
DROP POLICY IF EXISTS "Contracts viewable by involved parties or admin" ON public.contracts;
CREATE POLICY "Contracts viewable by involved parties or admin" 
ON public.contracts FOR SELECT 
TO authenticated 
USING (
    client_id = auth.uid() OR 
    freelancer_id = auth.uid() OR 
    public.is_admin()
);

DROP POLICY IF EXISTS "No direct client insert on contracts" ON public.contracts;
CREATE POLICY "No direct client insert on contracts" 
ON public.contracts FOR INSERT 
TO authenticated 
WITH CHECK (public.is_admin());

-- Contact messages: write-only for visitors, owner-only to read or manage.
DROP POLICY IF EXISTS "Anyone can submit a contact message" ON public.contact_messages;
CREATE POLICY "Anyone can submit a contact message"
ON public.contact_messages FOR INSERT
TO anon, authenticated
WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Only admin can read contact messages" ON public.contact_messages;
CREATE POLICY "Only admin can read contact messages"
ON public.contact_messages FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Only admin can update contact messages" ON public.contact_messages;
CREATE POLICY "Only admin can update contact messages"
ON public.contact_messages FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Only admin can delete contact messages" ON public.contact_messages;
CREATE POLICY "Only admin can delete contact messages"
ON public.contact_messages FOR DELETE
TO authenticated
USING (public.is_admin());

-- Reviews: public to read, participant-only to write, immutable once written.
DROP POLICY IF EXISTS "Reviews are public" ON public.reviews;
CREATE POLICY "Reviews are public"
ON public.reviews FOR SELECT
TO anon, authenticated
USING (TRUE);

-- A review is only possible after a completed contract, only about the other
-- party to that contract, and only once. The earlier policy accepted a review
-- with no contract at all, for any member, which let anyone inflate or sink a
-- rating that the talent directory publishes.
DROP POLICY IF EXISTS "Participants can review a contract" ON public.reviews;
DROP POLICY IF EXISTS "Participants can review a completed contract" ON public.reviews;
CREATE POLICY "Participants can review a completed contract"
ON public.reviews FOR INSERT
TO authenticated
WITH CHECK (
    reviewer_id = auth.uid()
    AND contract_id IS NOT NULL
    AND reviewer_id <> reviewee_id
    AND EXISTS (
        SELECT 1 FROM public.contracts c
        WHERE c.id = reviews.contract_id
          AND c.status = 'completed'
          AND (
              (c.client_id = auth.uid() AND c.freelancer_id = reviews.reviewee_id)
              OR (c.freelancer_id = auth.uid() AND c.client_id = reviews.reviewee_id)
          )
    )
);

DROP POLICY IF EXISTS "Admins can delete reviews" ON public.reviews;
CREATE POLICY "Admins can delete reviews"
ON public.reviews FOR DELETE
TO authenticated
USING (public.is_admin());

-- Contract milestones: the client and the freelancer share one checklist.
-- The policy decides who may touch a row; validate_milestone_mutation()
-- decides which status moves each of them may make.
DROP POLICY IF EXISTS "Contract parties can read milestones" ON public.contract_milestones;
CREATE POLICY "Contract parties can read milestones"
ON public.contract_milestones FOR SELECT
TO authenticated
USING (
    public.is_admin()
    OR EXISTS (
        SELECT 1 FROM public.contracts c
        WHERE c.id = contract_milestones.contract_id
          AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "Contract parties can add milestones" ON public.contract_milestones;
CREATE POLICY "Contract parties can add milestones"
ON public.contract_milestones FOR INSERT
TO authenticated
WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.contracts c
        WHERE c.id = contract_milestones.contract_id
          AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "Contract parties can update milestones" ON public.contract_milestones;
CREATE POLICY "Contract parties can update milestones"
ON public.contract_milestones FOR UPDATE
TO authenticated
USING (
    public.is_admin()
    OR EXISTS (
        SELECT 1 FROM public.contracts c
        WHERE c.id = contract_milestones.contract_id
          AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
    )
)
WITH CHECK (
    public.is_admin()
    OR EXISTS (
        SELECT 1 FROM public.contracts c
        WHERE c.id = contract_milestones.contract_id
          AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "Contract parties can remove milestones" ON public.contract_milestones;
CREATE POLICY "Contract parties can remove milestones"
ON public.contract_milestones FOR DELETE
TO authenticated
USING (
    public.is_admin()
    OR EXISTS (
        SELECT 1 FROM public.contracts c
        WHERE c.id = contract_milestones.contract_id
          AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
    )
);

-- Contract messages: only the two parties (or an admin) may read or send.
DROP POLICY IF EXISTS "Contract parties can read messages" ON public.messages;
CREATE POLICY "Contract parties can read messages"
ON public.messages FOR SELECT
TO authenticated
USING (
    sender_id = auth.uid()
    OR recipient_id = auth.uid()
    OR public.is_admin()
);

DROP POLICY IF EXISTS "Contract parties can send messages" ON public.messages;
CREATE POLICY "Contract parties can send messages"
ON public.messages FOR INSERT
TO authenticated
WITH CHECK (
    sender_id = auth.uid()
    AND (
        contract_id IS NULL
        OR contract_id IN (
            SELECT id FROM public.contracts
            WHERE client_id = auth.uid() OR freelancer_id = auth.uid()
        )
    )
);

-- Saved jobs: the freelancer's own shortlist, invisible to everyone else.
DROP POLICY IF EXISTS "Members manage their saved jobs" ON public.saved_jobs;
CREATE POLICY "Members manage their saved jobs"
ON public.saved_jobs FOR ALL
TO authenticated
USING (freelancer_id = auth.uid() OR public.is_admin())
WITH CHECK (freelancer_id = auth.uid());

-- Saved talent: the client's own shortlist. The CHECK on the table stops a
-- member saving themselves, so the row always names two different people.
DROP POLICY IF EXISTS "Clients manage their saved talent" ON public.saved_talent;
CREATE POLICY "Clients manage their saved talent"
ON public.saved_talent FOR ALL
TO authenticated
USING (client_id = auth.uid() OR public.is_admin())
WITH CHECK (client_id = auth.uid());

-- Invitations: both parties see the row, only the job owner may create one
-- (also enforced by validate_invitation_mutation), and only the invited
-- freelancer or the owning client may change its answer.
DROP POLICY IF EXISTS "Invitation parties can read invitations" ON public.invitations;
CREATE POLICY "Invitation parties can read invitations"
ON public.invitations FOR SELECT
TO authenticated
USING (client_id = auth.uid() OR freelancer_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Clients can send invitations" ON public.invitations;
CREATE POLICY "Clients can send invitations"
ON public.invitations FOR INSERT
TO authenticated
WITH CHECK (
    client_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.jobs j
        WHERE j.id = invitations.job_id AND j.client_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Parties can answer an invitation" ON public.invitations;
CREATE POLICY "Parties can answer an invitation"
ON public.invitations FOR UPDATE
TO authenticated
USING (client_id = auth.uid() OR freelancer_id = auth.uid() OR public.is_admin())
WITH CHECK (client_id = auth.uid() OR freelancer_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Clients can delete their invitation" ON public.invitations;
CREATE POLICY "Clients can delete their invitation"
ON public.invitations FOR DELETE
TO authenticated
USING (client_id = auth.uid() OR public.is_admin());

-- Project Catalog: an active package is public so a visitor can browse and a
-- signed-out reader can see prices. Only the owning freelancer may write.
DROP POLICY IF EXISTS "Active packages are public" ON public.service_packages;
CREATE POLICY "Active packages are public"
ON public.service_packages FOR SELECT
TO anon, authenticated
USING (is_active = TRUE OR freelancer_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Freelancers manage their own packages" ON public.service_packages;
CREATE POLICY "Freelancers manage their own packages"
ON public.service_packages FOR ALL
TO authenticated
USING (freelancer_id = auth.uid() OR public.is_admin())
WITH CHECK (
    freelancer_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('freelancer', 'admin')
    )
);

-- Notifications: read, mark read and dismiss your own. There is deliberately
-- no INSERT policy — only notify_user() (SECURITY DEFINER) writes a row, so a
-- member cannot push a notification into somebody else's list.
DROP POLICY IF EXISTS "Members read their notifications" ON public.notifications;
CREATE POLICY "Members read their notifications"
ON public.notifications FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Members update their notifications" ON public.notifications;
CREATE POLICY "Members update their notifications"
ON public.notifications FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Members delete their notifications" ON public.notifications;
CREATE POLICY "Members delete their notifications"
ON public.notifications FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 12. STORAGE BUCKET FOR IN-SITE FILE TRANSFER
-- ----------------------------------------------------------------------------
-- Objects live under a folder per project (`<job_id>/<uuid>-<name>`). The
-- bucket is private: reading and writing require an authenticated participant,
-- and the path's first segment is checked against the same participant rule
-- used for the file_transfers table, so a client can only reach their own
-- projects' files and a freelancer only the projects they hold a contract on.
-- The bucket-level size and MIME allow-list are a second gate behind the
-- browser scanner; it stops a caller who bypasses the page from storing an
-- executable or an oversized object through the Storage API.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'job-attachments',
    'job-attachments',
    FALSE,
    26214400,
    ARRAY[
        'application/pdf',
        'image/png', 'image/jpeg', 'image/gif', 'image/webp',
        'application/zip',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.oasis.opendocument.text',
        'application/vnd.oasis.opendocument.spreadsheet',
        'application/vnd.oasis.opendocument.presentation',
        'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
        'text/plain', 'text/markdown', 'text/csv', 'text/tab-separated-values',
        'application/json', 'application/xml', 'text/xml', 'text/yaml', 'application/x-yaml'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Earlier setup scripts created a public read policy and an unrestricted
-- authenticated upload policy. Remove them before installing the participant
-- policies; leaving the public policy behind would make every project file
-- readable by anyone who knows its path.
DROP POLICY IF EXISTS "Public read job attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload job attachments" ON storage.objects;

-- Reads: any authenticated user who is a participant on the folder's project,
-- or the uploader themselves (mirrors the `uploaded_by = auth.uid()` clause on
-- the metadata policy, so a bidder can always fetch back what they uploaded).
DROP POLICY IF EXISTS "Project participants can read files" ON storage.objects;
CREATE POLICY "Project participants can read files"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'job-attachments'
    AND (public.can_access_job_files((storage.foldername(name))[1]) OR owner = auth.uid())
);

-- Uploads: a participant may add files to their own project's folder.
DROP POLICY IF EXISTS "Project participants can upload files" ON storage.objects;
CREATE POLICY "Project participants can upload files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'job-attachments'
    AND owner = auth.uid()
    AND public.can_upload_job_files((storage.foldername(name))[1])
);

-- Removals: the uploader or an admin may delete an object.
DROP POLICY IF EXISTS "Uploaders can delete their files" ON storage.objects;
CREATE POLICY "Uploaders can delete their files"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'job-attachments'
    AND (owner = auth.uid() OR public.is_admin())
);

-- ----------------------------------------------------------------------------
-- 13. STORAGE BUCKET FOR FREELANCER RESUMES
-- ----------------------------------------------------------------------------
-- Each freelancer owns one object at `<user id>/resume.pdf` (uploaded with
-- upsert). The bucket is private: any authenticated user may read a resume
-- (clients reviewing talent), while writes are limited to the owner's folder.
-- The public_profiles view exposes only the display name and size.
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', FALSE)
ON CONFLICT (id) DO UPDATE SET public = FALSE;

DROP POLICY IF EXISTS "Authenticated users can read resumes" ON storage.objects;
CREATE POLICY "Authenticated users can read resumes"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'resumes');

DROP POLICY IF EXISTS "Freelancers can upload their own resume" ON storage.objects;
CREATE POLICY "Freelancers can upload their own resume"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'resumes'
    AND owner = auth.uid()
    AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Freelancers can replace their own resume" ON storage.objects;
CREATE POLICY "Freelancers can replace their own resume"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'resumes'
    AND owner = auth.uid()
    AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
    bucket_id = 'resumes'
    AND owner = auth.uid()
    AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Freelancers can delete their own resume" ON storage.objects;
CREATE POLICY "Freelancers can delete their own resume"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'resumes'
    AND owner = auth.uid()
);


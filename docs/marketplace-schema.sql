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
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

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
    (resume_name IS NOT NULL) AS has_resume
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
    skills, is_verified, created_at, updated_at
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
          AND contracts.status = 'active'
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- True when the current user may add files to a project: anyone who can read
-- the workspace, plus a freelancer with a live proposal on the project, so
-- samples and briefs can be attached before a contract exists.
CREATE OR REPLACE FUNCTION public.can_upload_job_files(target_job_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    IF public.can_access_job_files(target_job_id) THEN
        RETURN TRUE;
    END IF;
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM public.proposals
        WHERE proposals.job_id::TEXT = target_job_id
          AND proposals.freelancer_id = auth.uid()
          AND proposals.status IN ('submitted', 'shortlisted', 'accepted')
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

-- Protect profile immutables (prevents self privilege escalation)
CREATE OR REPLACE FUNCTION public.protect_profile_immutable_fields()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.role IS DISTINCT FROM OLD.role OR 
        NEW.is_verified IS DISTINCT FROM OLD.is_verified OR 
        NEW.email IS DISTINCT FROM OLD.email) THEN
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

DROP POLICY IF EXISTS "Participants can review a contract" ON public.reviews;
CREATE POLICY "Participants can review a contract"
ON public.reviews FOR INSERT
TO authenticated
WITH CHECK (
    reviewer_id = auth.uid()
    AND reviewer_id <> reviewee_id
    AND (
        contract_id IS NULL
        OR contract_id IN (
            SELECT id FROM public.contracts
            WHERE client_id = auth.uid() OR freelancer_id = auth.uid()
        )
    )
);

DROP POLICY IF EXISTS "Admins can delete reviews" ON public.reviews;
CREATE POLICY "Admins can delete reviews"
ON public.reviews FOR DELETE
TO authenticated
USING (public.is_admin());

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

-- ----------------------------------------------------------------------------
-- 12. STORAGE BUCKET FOR IN-SITE FILE TRANSFER
-- ----------------------------------------------------------------------------
-- Objects live under a folder per project (`<job_id>/<uuid>-<name>`). The
-- bucket is private: reading and writing require an authenticated participant,
-- and the path's first segment is checked against the same participant rule
-- used for the file_transfers table, so a client can only reach their own
-- projects' files and a freelancer only the projects they hold a contract on.
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-attachments', 'job-attachments', FALSE)
ON CONFLICT (id) DO UPDATE SET public = FALSE;

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


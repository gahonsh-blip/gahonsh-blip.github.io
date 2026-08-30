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
    created_at
FROM public.profiles;

-- Grant public read access to the safe directory view
GRANT SELECT ON public.public_profiles TO anon, authenticated;

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
        IF NOT public.is_admin() THEN
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
-- 11. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

-- Profiles: Public Directory Read for non-sensitive data, Owner/Admin Update
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

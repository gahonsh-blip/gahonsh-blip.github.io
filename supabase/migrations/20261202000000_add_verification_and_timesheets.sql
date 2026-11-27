-- ============================================================================
-- Verification requests, hourly timesheets and a success score.
--
-- Apply once to an existing Supabase project; fresh installs get the same
-- objects from docs/marketplace-schema.sql section 14. Everything here is
-- idempotent.
--
--  1. `verification_requests` — a member asks, an admin decides on evidence
--     seen out of band. No ID number or scan is stored. Approving flips
--     profiles.is_verified and notifies the member.
--  2. `contract_timesheets` — one row per worked day of an hourly contract,
--     logged by the freelancer and approved or rejected by the client. It is a
--     record of work, not a bill: no money moves through it.
--  3. `worker_ratings` gains completion counts, a completion rate and a single
--     0-100 success score beside the average rating.
-- ============================================================================
-- Two things a buyer looks for before paying a stranger: proof that the person
-- is who they say, and a record of the hours worked. Both are built here as
-- records with a trail, and neither moves money.

DO $$ BEGIN
    CREATE TYPE verification_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE timesheet_status AS ENUM ('submitted', 'approved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Verification requests ---------------------------------------------------
-- A person asks; an admin decides on evidence seen out of band — a video call,
-- business documents, a portfolio walk-through or a client reference. Only the
-- *kind* of evidence and a short reference are stored. No document number, scan
-- or ID image is ever written here, so this table cannot become a copy of
-- anyone's identity papers.
CREATE TABLE IF NOT EXISTS public.verification_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    method TEXT NOT NULL CHECK (method IN ('video_call', 'business_documents', 'portfolio_review', 'client_reference')),
    reference TEXT CHECK (reference IS NULL OR char_length(reference) <= 200),
    note TEXT CHECK (note IS NULL OR char_length(note) <= 1000),
    status verification_status NOT NULL DEFAULT 'pending',
    decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    decision_note TEXT CHECK (decision_note IS NULL OR char_length(decision_note) <= 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    decided_at TIMESTAMPTZ
);

-- One open request at a time; a decided request is history and the member may
-- ask again with better evidence.
CREATE UNIQUE INDEX IF NOT EXISTS verification_requests_open_idx
    ON public.verification_requests (user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS verification_requests_status_idx
    ON public.verification_requests (status, created_at);

ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.validate_verification_mutation()
RETURNS TRIGGER AS $$
DECLARE
    v_actor UUID := auth.uid();
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF v_actor IS NOT NULL AND NEW.user_id <> v_actor AND NOT public.is_admin() THEN
            RAISE EXCEPTION 'You can only request verification for your own profile.';
        END IF;
        -- A member cannot approve themselves: the request always starts open.
        NEW.status := 'pending';
        NEW.decided_by := NULL;
        NEW.decided_at := NULL;
        NEW.created_at := TIMEZONE('utc', NOW());
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        -- The member may withdraw their own open request; a decided one is a
        -- record, so only an admin may remove it.
        IF NOT public.is_admin() AND v_actor IS NOT NULL
           AND (OLD.user_id <> v_actor OR OLD.status <> 'pending') THEN
            RAISE EXCEPTION 'Only an open request of your own can be withdrawn.';
        END IF;
        RETURN OLD;
    END IF;

    IF NOT public.is_admin()
       AND current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Only an admin can decide a verification request.';
    END IF;

    NEW.user_id := OLD.user_id;
    NEW.method := OLD.method;
    NEW.created_at := OLD.created_at;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_validate_verification_mutation ON public.verification_requests;
CREATE TRIGGER trg_validate_verification_mutation
    BEFORE INSERT OR UPDATE OR DELETE ON public.verification_requests
    FOR EACH ROW EXECUTE PROCEDURE public.validate_verification_mutation();

DROP POLICY IF EXISTS "Verification is readable by its owner and admins" ON public.verification_requests;
CREATE POLICY "Verification is readable by its owner and admins"
ON public.verification_requests FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Members request verification for themselves" ON public.verification_requests;
CREATE POLICY "Members request verification for themselves"
ON public.verification_requests FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- No UPDATE policy: decisions go through decide_verification(), so an admin
-- decision and the profile flip happen in one transaction.
DROP POLICY IF EXISTS "Members withdraw their own open request" ON public.verification_requests;
CREATE POLICY "Members withdraw their own open request"
ON public.verification_requests FOR DELETE
TO authenticated
USING ((user_id = auth.uid() AND status = 'pending') OR public.is_admin());

REVOKE ALL ON public.verification_requests FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.verification_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.decide_verification(
    p_id UUID,
    p_approve BOOLEAN,
    p_note TEXT DEFAULT NULL
)
RETURNS public.verification_requests AS $$
DECLARE
    v_request public.verification_requests;
    v_note TEXT := NULLIF(LEFT(TRIM(COALESCE(p_note, '')), 1000), '');
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only an admin can decide a verification request.';
    END IF;

    SELECT * INTO v_request
    FROM public.verification_requests
    WHERE id = p_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Verification request not found.';
    END IF;
    IF v_request.status <> 'pending' THEN
        RAISE EXCEPTION 'This request has already been decided.';
    END IF;
    IF NOT p_approve AND v_note IS NULL THEN
        RAISE EXCEPTION 'Say why the request was declined so the member can fix it.';
    END IF;

    UPDATE public.verification_requests
    SET status = (CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END)::verification_status,
        decided_by = auth.uid(),
        decided_at = TIMEZONE('utc', NOW()),
        decision_note = v_note
    WHERE id = p_id
    RETURNING * INTO v_request;

    IF p_approve THEN
        UPDATE public.profiles
        SET is_verified = TRUE, updated_at = TIMEZONE('utc', NOW())
        WHERE id = v_request.user_id;
    END IF;

    PERFORM public.notify_user(
        v_request.user_id,
        'verification',
        CASE WHEN p_approve THEN 'Your profile is verified' ELSE 'Verification could not be confirmed' END,
        CASE WHEN p_approve
             THEN 'The verified badge now shows on your profile and in the talent directory.'
             ELSE COALESCE(v_note, 'Submit a new request with different evidence when you are ready.')
        END,
        '/marketplace-dashboard.html'
    );

    RETURN v_request;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.decide_verification(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_verification(UUID, BOOLEAN, TEXT) TO authenticated;

-- 2. Hourly timesheets -------------------------------------------------------
-- A freelancer logs the hours for one day of an hourly contract; the client
-- approves or rejects each day. Approved hours are a record of work done, not a
-- bill and not a payout — no money moves through this table.
CREATE TABLE IF NOT EXISTS public.contract_timesheets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    freelancer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    work_date DATE NOT NULL,
    hours NUMERIC(4, 2) NOT NULL CHECK (hours > 0 AND hours <= 24),
    note TEXT CHECK (note IS NULL OR char_length(note) <= 280),
    status timesheet_status NOT NULL DEFAULT 'submitted',
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

-- One row per working day keeps the record easy to read and impossible to
-- double-log. A wrong entry is withdrawn while it is still submitted.
CREATE UNIQUE INDEX IF NOT EXISTS contract_timesheets_day_idx
    ON public.contract_timesheets (contract_id, work_date);
CREATE INDEX IF NOT EXISTS contract_timesheets_contract_idx
    ON public.contract_timesheets (contract_id, work_date DESC);

ALTER TABLE public.contract_timesheets ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.validate_timesheet_mutation()
RETURNS TRIGGER AS $$
DECLARE
    v_client UUID;
    v_freelancer UUID;
    v_status contract_status;
    v_job_type job_type;
    v_actor UUID := auth.uid();
BEGIN
    SELECT c.client_id, c.freelancer_id, c.status, j.job_type
    INTO v_client, v_freelancer, v_status, v_job_type
    FROM public.contracts c
    JOIN public.jobs j ON j.id = c.job_id
    WHERE c.id = COALESCE(NEW.contract_id, OLD.contract_id);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contract not found.';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF v_job_type <> 'hourly' THEN
            RAISE EXCEPTION 'Timesheets are only for hourly contracts.';
        END IF;
        IF v_status <> 'active' AND NOT public.is_admin() THEN
            RAISE EXCEPTION 'Hours can only be logged while the contract is active.';
        END IF;
        IF v_actor IS NOT NULL AND v_actor <> v_freelancer AND NOT public.is_admin() THEN
            RAISE EXCEPTION 'Only the freelancer can log hours.';
        END IF;
        IF NEW.work_date > CURRENT_DATE THEN
            RAISE EXCEPTION 'Hours cannot be logged for a future date.';
        END IF;
        NEW.freelancer_id := v_freelancer;
        NEW.status := 'submitted';
        NEW.reviewed_by := NULL;
        NEW.reviewed_at := NULL;
        NEW.created_at := TIMEZONE('utc', NOW());
        NEW.updated_at := NEW.created_at;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'approved' AND v_actor IS NOT NULL AND NOT public.is_admin() THEN
            RAISE EXCEPTION 'Approved hours cannot be deleted.';
        END IF;
        IF v_actor IS NOT NULL AND v_actor <> v_freelancer AND v_actor <> v_client AND NOT public.is_admin() THEN
            RAISE EXCEPTION 'Only the contract parties can remove an entry.';
        END IF;
        RETURN OLD;
    END IF;

    -- Everything that describes the work is fixed once submitted; only the
    -- decision may change.
    NEW.contract_id := OLD.contract_id;
    NEW.freelancer_id := OLD.freelancer_id;
    NEW.work_date := OLD.work_date;
    NEW.hours := OLD.hours;
    NEW.note := OLD.note;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := TIMEZONE('utc', NOW());

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF v_actor IS NOT NULL AND v_actor <> v_client AND NOT public.is_admin() THEN
            RAISE EXCEPTION 'Only the client can review hours.';
        END IF;
        IF OLD.status <> 'submitted' THEN
            RAISE EXCEPTION 'This entry has already been reviewed.';
        END IF;
        NEW.reviewed_by := COALESCE(v_actor, OLD.freelancer_id);
        NEW.reviewed_at := TIMEZONE('utc', NOW());
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_validate_timesheet_mutation ON public.contract_timesheets;
CREATE TRIGGER trg_validate_timesheet_mutation
    BEFORE INSERT OR UPDATE OR DELETE ON public.contract_timesheets
    FOR EACH ROW EXECUTE PROCEDURE public.validate_timesheet_mutation();

DROP POLICY IF EXISTS "Contract parties read their timesheets" ON public.contract_timesheets;
CREATE POLICY "Contract parties read their timesheets"
ON public.contract_timesheets FOR SELECT
TO authenticated
USING (
    public.is_admin()
    OR EXISTS (
        SELECT 1 FROM public.contracts c
        WHERE c.id = contract_timesheets.contract_id
          AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "Freelancers log their own hours" ON public.contract_timesheets;
CREATE POLICY "Freelancers log their own hours"
ON public.contract_timesheets FOR INSERT
TO authenticated
WITH CHECK (freelancer_id = auth.uid());

DROP POLICY IF EXISTS "Clients review the hours on their contracts" ON public.contract_timesheets;
CREATE POLICY "Clients review the hours on their contracts"
ON public.contract_timesheets FOR UPDATE
TO authenticated
USING (
    public.is_admin()
    OR EXISTS (
        SELECT 1 FROM public.contracts c
        WHERE c.id = contract_timesheets.contract_id AND c.client_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "A submitted day can be withdrawn" ON public.contract_timesheets;
CREATE POLICY "A submitted day can be withdrawn"
ON public.contract_timesheets FOR DELETE
TO authenticated
USING (
    public.is_admin()
    OR (freelancer_id = auth.uid() AND status = 'submitted')
);

REVOKE ALL ON public.contract_timesheets FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_timesheets TO authenticated;

-- 3. Ratings view: completion data and a success score ----------------------
CREATE OR REPLACE VIEW public.worker_ratings AS
WITH contract_stats AS (
    SELECT
        c.freelancer_id AS reviewee_id,
        COUNT(*) FILTER (WHERE c.status = 'completed')::int AS completed_contracts,
        COUNT(*) FILTER (WHERE c.status = 'cancelled')::int AS cancelled_contracts
    FROM public.contracts c
    GROUP BY c.freelancer_id
),
review_stats AS (
    SELECT
        reviewee_id,
        ROUND(AVG(rating)::numeric, 2) AS avg_rating,
        COUNT(*)::int AS review_count
    FROM public.reviews
    GROUP BY reviewee_id
)
SELECT
    COALESCE(r.reviewee_id, c.reviewee_id) AS reviewee_id,
    r.avg_rating,
    COALESCE(r.review_count, 0) AS review_count,
    COALESCE(c.completed_contracts, 0) AS completed_contracts,
    COALESCE(c.cancelled_contracts, 0) AS cancelled_contracts,
    CASE
        WHEN COALESCE(c.completed_contracts, 0) + COALESCE(c.cancelled_contracts, 0) = 0 THEN NULL
        ELSE ROUND(100.0 * c.completed_contracts
                   / (c.completed_contracts + c.cancelled_contracts))::int
    END AS completion_rate,
    CASE
        WHEN COALESCE(c.completed_contracts, 0) + COALESCE(c.cancelled_contracts, 0) = 0
             AND COALESCE(r.review_count, 0) = 0 THEN NULL
        WHEN COALESCE(r.review_count, 0) = 0
            THEN ROUND(100.0 * c.completed_contracts
                       / NULLIF(c.completed_contracts + c.cancelled_contracts, 0))::int
        WHEN COALESCE(c.completed_contracts, 0) + COALESCE(c.cancelled_contracts, 0) = 0
            THEN ROUND(r.avg_rating * 20)::int
        ELSE ROUND(
            0.6 * (100.0 * c.completed_contracts / (c.completed_contracts + c.cancelled_contracts))
            + 0.4 * (r.avg_rating * 20)
        )::int
    END AS success_score
FROM review_stats r
FULL OUTER JOIN contract_stats c ON c.reviewee_id = r.reviewee_id;

GRANT SELECT ON public.worker_ratings TO anon, authenticated;

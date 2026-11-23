-- Worker and client records: public summaries, private own record, and
-- client sign-off. Apply after the base marketplace schema.
BEGIN;
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
COMMIT;

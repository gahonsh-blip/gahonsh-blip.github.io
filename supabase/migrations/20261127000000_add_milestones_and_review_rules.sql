-- ============================================================================
-- Contract milestones, proposal shortlisting, and stricter review rules.
--
-- Apply this once to an existing Supabase project (fresh installs get the same
-- objects from docs/marketplace-schema.sql). Everything here is idempotent.
--
--  1. `contract_milestones` — a manual checklist the two parties of a contract
--     keep together. It is not an escrow: no funds move through this table.
--  2. `set_proposal_status()` — lets the client shortlist or decline a bid
--     while the job is open. Hiring still goes through
--     accept_proposal_and_create_contract().
--  3. Reviews may only be written about the other party of a *completed*
--     contract, once per contract. Before this, a review could be inserted with
--     no contract at all for any member, which moved the public average that
--     the talent directory shows.
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE milestone_status AS ENUM ('pending', 'delivered', 'accepted');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

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

ALTER TABLE public.contract_milestones ENABLE ROW LEVEL SECURITY;

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

CREATE UNIQUE INDEX IF NOT EXISTS uq_review_per_contract_reviewer
    ON public.reviews (contract_id, reviewer_id)
    WHERE contract_id IS NOT NULL;

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

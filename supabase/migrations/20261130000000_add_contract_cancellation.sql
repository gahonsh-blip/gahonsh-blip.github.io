-- Contract cancellation and disputes.
--
-- contract_status already has 'cancelled' and 'disputed', but nothing in the
-- client could reach either state: complete_contract() was the only transition
-- exposed. An engagement that stopped going ahead therefore stayed 'active'
-- forever, and the job stayed 'in_progress' with it.
--
-- Both functions record the outcome on the contract. Neither moves money:
-- payments are direct between the client and the freelancer.

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

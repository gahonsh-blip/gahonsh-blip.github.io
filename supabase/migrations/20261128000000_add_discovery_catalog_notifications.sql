-- ============================================================================
-- Discovery, Project Catalog and notifications (Phase 1 marketplace build).
--
-- Apply this once to an existing Supabase project. Fresh installs get the same
-- objects from docs/marketplace-schema.sql. Everything here is idempotent.
--
--  1. `profiles.availability` — a self-declared status ("available", "busy",
--     "unavailable") that the talent directory shows and filters on.
--  2. `saved_jobs` / `saved_talent` — private shortlists, one owner only.
--  3. `invitations` — a client asks one freelancer to look at one open job;
--     the freelancer accepts or declines, the client may withdraw. Accepting
--     records interest; it does not create a proposal.
--  4. `service_packages` — the Project Catalog: fixed-price service tiers a
--     freelancer publishes. Prices are the freelancer's quote; no money moves.
--  5. `notifications` — in-app alerts written only by SECURITY DEFINER
--     triggers, so a member cannot post one into another member's list.
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE invitation_status AS ENUM ('invited', 'accepted', 'declined', 'withdrawn');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Availability on the private profile and on the public directory view.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS availability TEXT NOT NULL DEFAULT 'available';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS availability_note TEXT;

DO $$ BEGIN
    ALTER TABLE public.profiles
        ADD CONSTRAINT profiles_availability_check
        CHECK (availability IN ('available', 'busy', 'unavailable'));
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE OR REPLACE VIEW public.public_profiles AS
SELECT
    id, full_name, avatar_url, role, location, bio, title, hourly_rate, skills,
    is_verified, created_at, resume_name, resume_size_bytes, resume_updated_at,
    (resume_name IS NOT NULL) AS has_resume,
    availability, availability_note
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

GRANT SELECT (availability, availability_note) ON public.profiles TO anon, authenticated;

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
            'marketplace-dashboard.html'
        );
        RETURN NEW;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'withdrawn' THEN
        PERFORM public.notify_user(
            NEW.freelancer_id,
            'proposal-status',
            'Your proposal is now ' || NEW.status,
            'The client updated your bid on "' || COALESCE(v_title, 'a project') || '".',
            'marketplace-dashboard.html'
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
            'marketplace-dashboard.html'
        );
        RETURN NEW;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('accepted', 'declined') THEN
        PERFORM public.notify_user(
            NEW.client_id,
            'invitation-reply',
            'Invitation ' || NEW.status,
            'A freelancer ' || NEW.status || ' your invitation for "' || COALESCE(v_title, 'a project') || '".',
            'marketplace-dashboard.html'
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


ALTER TABLE public.saved_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_talent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

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


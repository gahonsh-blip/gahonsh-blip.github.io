-- ============================================================================
-- Automatic email for marketplace notifications.
--
-- WHY THIS EXISTS
-- A proposal wrote an in-app `notifications` row and nothing else. A client who
-- did not open the portal learned about a bid only when they happened to look,
-- and the studio inbox got a Formspree alert while the client got nothing.
--
-- HOW IT WORKS
--   1. `notify_user()` already funnels every notification through one INSERT.
--      A trigger on `notifications` copies each new row into `email_outbox`,
--      addressed to the member's private `profiles.email`.
--   2. `supabase/functions/send-email` drains the outbox through Resend. The
--      API key lives in the function's environment, never in this repository
--      and never in the browser.
--   3. A `pg_cron` job calls that function once a minute, if pg_cron, pg_net
--      and the two Vault secrets exist. Without them nothing is sent and
--      nothing breaks: the rows stay `queued` and the portal still works.
--
-- The trigger never blocks a notification. Any failure inside it is swallowed,
-- because a missing email address must not cost the member the in-app row.
--
-- SETUP (see docs/SETUP.md, "Automatic email")
--   supabase secrets set RESEND_API_KEY=... EMAIL_DRAIN_SECRET=... EMAIL_FROM=...
--   supabase functions deploy send-email --no-verify-jwt
--   insert into vault.secrets (name, secret) values
--     ('email_function_url', 'https://<project>.supabase.co/functions/v1/send-email'),
--     ('email_function_secret', '<the same EMAIL_DRAIN_SECRET>');
--   then re-run this file so the cron job is scheduled.
-- ============================================================================

-- 1. Consent flag ------------------------------------------------------------
-- A member can turn the email off and keep the in-app notification.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN NOT NULL DEFAULT TRUE;

GRANT SELECT (email_notifications) ON public.profiles TO authenticated;
GRANT UPDATE (email_notifications) ON public.profiles TO authenticated;

-- 2. The outbox --------------------------------------------------------------
-- Service-role only: RLS is on and no policy grants a browser a row. A member
-- must not be able to read another member's address or draft a message.
CREATE TABLE IF NOT EXISTS public.email_outbox (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    notification_id UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 200),
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
    link TEXT,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'skipped')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    provider_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    claimed_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ
);

ALTER TABLE public.email_outbox
    ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- One email per notification, enforced. A retried trigger cannot send twice.
CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_notification_key
    ON public.email_outbox (notification_id)
    WHERE notification_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_outbox_status_idx
    ON public.email_outbox (status, created_at);
CREATE INDEX IF NOT EXISTS email_outbox_user_idx
    ON public.email_outbox (user_id, created_at DESC);

ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_outbox FROM anon, authenticated;

-- 3. Queue one email per notification ---------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_notification_email()
RETURNS TRIGGER AS $$
DECLARE
    v_email TEXT;
    v_opt_in BOOLEAN;
    v_site TEXT := 'https://gahonsh-blip.github.io/';
    v_link TEXT;
BEGIN
    BEGIN
        SELECT NULLIF(TRIM(p.email), ''), COALESCE(p.email_notifications, TRUE)
        INTO v_email, v_opt_in
        FROM public.profiles p
        WHERE p.id = NEW.user_id;

        -- No address, or the member turned email off: the in-app row stands.
        IF v_email IS NULL OR v_opt_in IS NOT TRUE THEN
            RETURN NEW;
        END IF;

        v_link := CASE
            WHEN NEW.link IS NULL OR TRIM(NEW.link) = '' THEN NULL
            WHEN NEW.link ~* '^https?://' THEN NEW.link
            ELSE v_site || LTRIM(NEW.link, '/')
        END;

        INSERT INTO public.email_outbox (
            notification_id, user_id, to_email, subject, body, link
        ) VALUES (
            NEW.id,
            NEW.user_id,
            v_email,
            LEFT(NEW.title, 200),
            LEFT(
                COALESCE(NULLIF(TRIM(NEW.body), ''), NEW.title)
                || E'\n\n'
                || COALESCE(v_link, v_site),
                4000
            ),
            v_link
        )
        ON CONFLICT (notification_id) WHERE notification_id IS NOT NULL DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        -- Never let the email path cost the member their notification.
        NULL;
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.enqueue_notification_email() FROM PUBLIC;

DROP TRIGGER IF EXISTS notifications_email_outbox ON public.notifications;
CREATE TRIGGER notifications_email_outbox
    AFTER INSERT ON public.notifications
    FOR EACH ROW EXECUTE FUNCTION public.enqueue_notification_email();

-- 4. Claim / settle helpers for the sender ----------------------------------
-- The Edge Function runs with the service role, but these keep the batch
-- atomic: two overlapping runs cannot send the same row twice.
CREATE OR REPLACE FUNCTION public.claim_email_batch(p_limit INTEGER DEFAULT 20)
RETURNS SETOF public.email_outbox AS $$
BEGIN
    RETURN QUERY
    WITH picked AS (
        SELECT o.id
        FROM public.email_outbox o
        -- A row left in 'sending' means the sender died mid-flight (a crash,
        -- a timeout, a redeploy). Without this the email is lost silently, so
        -- a claim older than ten minutes is taken back.
        WHERE (o.status = 'queued'
               OR (o.status = 'sending'
                   AND COALESCE(o.claimed_at, o.created_at) < TIMEZONE('utc', NOW()) - INTERVAL '10 minutes'))
          AND o.attempts < 5
        ORDER BY o.created_at
        LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.email_outbox o
    SET status = 'sending',
        attempts = o.attempts + 1,
        claimed_at = TIMEZONE('utc', NOW())
    FROM picked
    WHERE o.id = picked.id
    RETURNING o.*;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.settle_email(
    p_id UUID,
    p_ok BOOLEAN,
    p_provider_id TEXT DEFAULT NULL,
    p_error TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    UPDATE public.email_outbox
    SET status = CASE
            WHEN p_ok THEN 'sent'
            WHEN attempts >= 5 THEN 'failed'
            ELSE 'queued'
        END,
        sent_at = CASE WHEN p_ok THEN TIMEZONE('utc', NOW()) ELSE sent_at END,
        provider_id = COALESCE(p_provider_id, provider_id),
        last_error = CASE WHEN p_ok THEN NULL ELSE LEFT(COALESCE(p_error, 'unknown error'), 500) END
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.claim_email_batch(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_email(UUID, BOOLEAN, TEXT, TEXT) FROM PUBLIC;

-- 5. Drain every minute ------------------------------------------------------
-- Skipped quietly when pg_cron, pg_net or the Vault secrets are absent, so a
-- project that has not configured email keeps working.
DO $$
DECLARE
    v_url TEXT;
    v_secret TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
       OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
        RAISE NOTICE 'Email drain not scheduled: enable pg_cron and pg_net first.';
        RETURN;
    END IF;

    SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'email_function_url';
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'email_function_secret';

    IF v_url IS NULL OR v_secret IS NULL THEN
        RAISE NOTICE 'Email drain not scheduled: add email_function_url and email_function_secret to Vault.';
        RETURN;
    END IF;

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gahonsh-email-drain') THEN
        PERFORM cron.unschedule('gahonsh-email-drain');
    END IF;

    PERFORM cron.schedule(
        'gahonsh-email-drain',
        '* * * * *',
        format(
            $job$SELECT net.http_post(
                url := %L,
                headers := jsonb_build_object('Content-Type', 'application/json', 'x-email-secret', %L),
                body := '{}'::jsonb,
                timeout_milliseconds := 20000
            );$job$,
            v_url,
            v_secret
        )
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Email drain not scheduled: %', SQLERRM;
END $$;

-- ============================================================================
-- Restore the private profile columns and the profile immutability trigger.
--
-- WHY THIS EXISTS
-- The live project (evdpmombgymthzqegqwr) drifted from the committed schema:
--
--   * `public.profiles` lost its `email` and `phone_number` columns, so the
--     `admin_profiles` view and the `admin_overview()` RPC could not be
--     created. `docs/marketplace-schema.sql` builds both on `profiles.email`,
--     so at the time this file was written, re-running the schema failed at the
--     view and rolled the whole script back.
--
--     That has since been fixed at the source: the schema now runs
--     `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for both columns, backfills
--     them and re-attaches the trigger before it creates the views, so it
--     repairs a drifted project on its own (`npm run check:sql` case 5 proves
--     it). This file remains the narrow fix for a project where the full schema
--     is deliberately not being applied yet — not a required first step.
--   * `protect_profile_immutable_fields` (the trigger that stops a member
--     writing `role`, `email` or `is_verified` on their own row) was not
--     attached. A signed-in client could PATCH `/rest/v1/profiles` with
--     `{"role":"admin"}` and the row was updated — verified against the live
--     project on 2026-11-24. That is a privilege escalation.
--
-- ORDER OF OPERATIONS
--   1. Run this file (optional, and harmless first).
--   2. Run `docs/marketplace-schema.sql` once. It is idempotent, repairs the
--      columns itself, and creates `admin_profiles`, `admin_overview()`,
--      `contact_messages` and re-applies the column grants that keep
--      `email`/`phone_number` private.
--   3. Verify: `npm run check:live`, then
--      `AUDIT_EMAIL=… AUDIT_PASSWORD=… npm run check:live-security`.
--
-- The trigger is written against `to_jsonb(NEW)` rather than `NEW.email` so it
-- works in both shapes: a project that has the PII columns and one that does
-- not yet. Apply it first, then the rest of the schema can land whenever.
-- ============================================================================

-- 1. Private columns ---------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- Backfill from Auth so the admin view has something to show for accounts
-- created while the columns were missing.
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.id
  AND p.email IS NULL
  AND u.email IS NOT NULL;

-- `profiles.email` is declared NOT NULL UNIQUE in the fresh-install schema.
-- A nullable column cannot take NOT NULL retroactively (an account created by
-- phone only has no email), but the uniqueness guarantee still holds.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_key ON public.profiles (email);

-- 2. Profile immutability ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_immutable_fields()
RETURNS TRIGGER AS $$
DECLARE
    old_row JSONB := to_jsonb(OLD);
    new_row JSONB := to_jsonb(NEW);
BEGIN
    IF (new_row->>'role' IS DISTINCT FROM old_row->>'role' OR
        new_row->>'email' IS DISTINCT FROM old_row->>'email' OR
        new_row->>'is_verified' IS DISTINCT FROM old_row->>'is_verified') THEN
        -- Only an existing admin, or trusted server-side code, may touch these.
        -- `current_user` cannot be used here because a SECURITY DEFINER
        -- function runs as its owner, so the caller's role is read from the
        -- role GUC that PostgREST sets. That is what lets
        -- provision_admin_user() create the very first owner, when no admin
        -- exists yet and is_admin() is still false.
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

-- 3. Verification (run these after the schema file; each must return false) ---
-- select has_column_privilege('anon', 'public.profiles', 'email', 'select');
-- select has_column_privilege('authenticated', 'public.profiles', 'email', 'select');
-- select has_column_privilege('authenticated', 'public.profiles', 'phone_number', 'select');
-- select tgname from pg_trigger where tgrelid = 'public.profiles'::regclass and not tgisinternal;

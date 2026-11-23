-- ============================================================================
-- Harden profile read access
-- ----------------------------------------------------------------------------
-- WHY:
--   `profiles` is the private account table. It contains `email` and
--   `phone_number`, but the table-level SELECT grant could expose those columns
--   to every visitor with the public key. The public directory must only see
--   the safe columns from `public_profiles`.
--
-- WHAT:
--   - Revoke unrestricted table-level SELECT from `anon` / `authenticated`.
--   - Grant only the public directory columns on `profiles`, so a direct
--     table read (including the PostgREST embeds used by jobs, proposals and
--     contracts) can never return `email` or `phone_number`.
--   - Add `admin_profiles`, an admin-gated view that returns email only when
--     `public.is_admin()` is true. A non-admin gets zero rows; anon has no
--     grant.
--
-- SAFETY:
--   - The public directory keeps using `public_profiles`, which is owned by the
--     schema owner and exposes only safe columns.
--   - The owner/admin UPDATE policy is unchanged; `updateMyProfile()` now
--     allow-lists editable fields in the client as well.
--   - Idempotent: safe to run more than once.
-- ============================================================================

BEGIN;

REVOKE SELECT ON public.profiles FROM anon, authenticated;

GRANT SELECT (
    id, full_name, avatar_url, role, location, bio, title, hourly_rate,
    skills, is_verified, created_at, updated_at
) ON public.profiles TO anon, authenticated;

GRANT SELECT (resume_name, resume_size_bytes, resume_updated_at)
ON public.profiles TO anon, authenticated;

CREATE OR REPLACE VIEW public.admin_profiles AS
SELECT id, full_name, email, role, is_verified, location, title,
       hourly_rate, created_at
FROM public.profiles
WHERE public.is_admin();

GRANT SELECT ON public.admin_profiles TO authenticated;

-- Keep the public directory readable after the table-level revoke.
GRANT SELECT ON public.public_profiles TO anon, authenticated;

COMMIT;

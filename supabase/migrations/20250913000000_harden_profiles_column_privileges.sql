-- ============================================================================
-- Harden public.profiles column privileges
-- ----------------------------------------------------------------------------
-- WHY:
--   The `profiles` table previously granted SELECT on ALL columns (including
--   `email` and `phone_number`) to `anon` and `authenticated`, while the RLS
--   read policy was `USING (true)`. That exposed private contact data on top of
--   a *public* database.
--
-- WHAT:
--   - Revoke unrestricted table-level SELECT from `anon` / `authenticated`.
--   - Grant column-level SELECT only for the public profile fields used by the
--     marketplace (and the `public_profiles` view).
--   - `email` and `phone_number` remain readable only to `service_role`
--     (server-side / RPC contexts).
--
-- SAFETY:
--   - No RLS policy is weakened; the public row-read policy is unchanged.
--   - The existing `public_profiles` view (postgres-owned, RLS-bypassing)
--     continues to expose only public columns, so talent directory lookups
--     keep working.
--   - Frontend embeds now select explicit safe columns (see supabase-client.js).
-- ============================================================================

BEGIN;

REVOKE SELECT ON public.profiles FROM anon, authenticated;

GRANT SELECT (
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
    updated_at
) ON public.profiles TO anon, authenticated;

-- Align the column set granted on the public view too (defensive: the view
-- only exposes safe columns, but this keeps grants consistent if the view is
-- ever re-created with the owner defaulting to a restricted schema).
GRANT SELECT ON public.public_profiles TO anon, authenticated;

COMMIT;
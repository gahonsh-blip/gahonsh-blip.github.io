-- ============================================================================
-- Freelancer resumes (PDF)
-- ----------------------------------------------------------------------------
-- WHY:
--   Talent profiles had no way to attach a resume, so a client browsing the
--   directory could not review a freelancer's CV before hiring.
--
-- WHAT:
--   - Adds resume metadata to `profiles` and `public_profiles` (name, size,
--     timestamp, and a computed `has_resume`). The public view never exposes a
--     storage path.
--   - Creates the private `resumes` bucket. Each freelancer owns one object at
--     `<user id>/resume.pdf` (uploaded with upsert). Any authenticated user may
--     read a resume; only the owner may write in their own folder.
--   - Re-grants the resume columns on `profiles` so `getMyProfile()` keeps
--     working after `20250913000000_harden_profiles_column_privileges.sql`.
--
-- SAFETY:
--   - Idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`).
--   - No existing policy is weakened; the resume bucket is private.
-- ============================================================================

BEGIN;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS resume_name TEXT,
    ADD COLUMN IF NOT EXISTS resume_size_bytes BIGINT,
    ADD COLUMN IF NOT EXISTS resume_updated_at TIMESTAMPTZ;

ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_resume_size_bytes_check;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_resume_size_bytes_check
    CHECK (resume_size_bytes IS NULL OR resume_size_bytes >= 0);

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
    created_at,
    resume_name,
    resume_size_bytes,
    resume_updated_at,
    (resume_name IS NOT NULL) AS has_resume
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;
GRANT SELECT (resume_name, resume_size_bytes, resume_updated_at)
ON public.profiles TO anon, authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', FALSE)
ON CONFLICT (id) DO UPDATE SET public = FALSE;

DROP POLICY IF EXISTS "Authenticated users can read resumes" ON storage.objects;
CREATE POLICY "Authenticated users can read resumes"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'resumes');

DROP POLICY IF EXISTS "Freelancers can upload their own resume" ON storage.objects;
CREATE POLICY "Freelancers can upload their own resume"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'resumes'
    AND owner = auth.uid()
    AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Freelancers can replace their own resume" ON storage.objects;
CREATE POLICY "Freelancers can replace their own resume"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'resumes'
    AND owner = auth.uid()
    AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
    bucket_id = 'resumes'
    AND owner = auth.uid()
    AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Freelancers can delete their own resume" ON storage.objects;
CREATE POLICY "Freelancers can delete their own resume"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'resumes'
    AND owner = auth.uid()
);

COMMIT;

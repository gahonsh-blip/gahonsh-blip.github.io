-- Harden in-site file transfer.
--
-- 1. A freelancer keeps read access to project files after the contract is
--    completed, so the delivered work stays downloadable as a project record.
--    Uploads are still limited to the project owner, an active contract and a
--    live proposal.
-- 2. The private `job-attachments` bucket gets a 25 MB limit and a MIME
--    allow-list, matching the browser scanner and the page's extension list.
--    This closes the gap where a caller could bypass the page and upload an
--    executable through the Storage API.
-- 3. Legacy public read/upload policies from old setup scripts are removed.
--    Leaving them in place would expose every project file by URL.
--
-- Apply after 20261125000000_worker_client_records.sql.

CREATE OR REPLACE FUNCTION public.can_access_job_files(target_job_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    IF auth.uid() IS NULL OR target_job_id IS NULL THEN
        RETURN FALSE;
    END IF;
    IF public.is_admin() THEN
        RETURN TRUE;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM public.jobs
        WHERE jobs.id::TEXT = target_job_id AND jobs.client_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM public.contracts
        WHERE contracts.job_id::TEXT = target_job_id
          AND contracts.freelancer_id = auth.uid()
          AND contracts.status IN ('active', 'completed')
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.can_upload_job_files(target_job_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    IF auth.uid() IS NULL OR target_job_id IS NULL THEN
        RETURN FALSE;
    END IF;
    IF public.is_admin() THEN
        RETURN TRUE;
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.jobs
        WHERE jobs.id::TEXT = target_job_id AND jobs.client_id = auth.uid()
    ) THEN
        RETURN TRUE;
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.contracts
        WHERE contracts.job_id::TEXT = target_job_id
          AND contracts.freelancer_id = auth.uid()
          AND contracts.status = 'active'
    ) THEN
        RETURN TRUE;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM public.proposals
        WHERE proposals.job_id::TEXT = target_job_id
          AND proposals.freelancer_id = auth.uid()
          AND proposals.status IN ('submitted', 'shortlisted')
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'job-attachments',
    'job-attachments',
    FALSE,
    26214400,
    ARRAY[
        'application/pdf',
        'image/png', 'image/jpeg', 'image/gif', 'image/webp',
        'application/zip',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.oasis.opendocument.text',
        'application/vnd.oasis.opendocument.spreadsheet',
        'application/vnd.oasis.opendocument.presentation',
        'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
        'text/plain', 'text/markdown', 'text/csv', 'text/tab-separated-values',
        'application/json', 'application/xml', 'text/xml', 'text/yaml', 'application/x-yaml'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Legacy setup scripts left a public read policy and an unrestricted upload
-- policy on this bucket. Drop them so the participant policies are the only
-- path to a project file.
DROP POLICY IF EXISTS "Public read job attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload job attachments" ON storage.objects;

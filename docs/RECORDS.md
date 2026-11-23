# Worker and Client Records

Records give a worker a public work history and give a signed-in member a
private earnings or spend history. The feature reads summaries from Supabase;
it does not upload record files.

## What is shown

| Viewer | Worker record | Client record |
| --- | --- | --- |
| Anyone | Name, role, verified badge, completed jobs, active jobs, clients served, rating, recent completed project titles and dates | Name, projects posted, hires, completed projects, open projects |
| Signed-in owner | The same public summary plus private total earnings and per-project amounts | The same public summary plus private total spend and contract amounts |

Public records never include earnings, budgets, spend, client identities, or
freelancer names on the client side.

## Database setup

The record functions are part of `docs/marketplace-schema.sql`. If the live
project was created before the record feature, apply the standalone migration
once in the Supabase SQL Editor:

```text
supabase/migrations/20261125000000_worker_client_records.sql
```

The migration creates or replaces:

- `public.get_worker_record(uuid)`
- `public.get_client_record(uuid)`
- `public.get_my_record()`
- `public.complete_contract(uuid)`

It assumes the base marketplace schema (including `worker_ratings`) is already
applied. After applying it, refresh the site. Until then, the Record button and
the portal Records tab show a setup message instead of failing silently.

## Local export

Both the public record modal and the portal Records tab can download the
record as JSON or CSV. The file is built in the browser with a `Blob` and saved
with a download link. Nothing is sent to the website, Supabase Storage, or a
third party.

## Verification

```bash
npm run test:schema
npm run test:local
npm test
```

The local engine tests complete a contract and assert that the public worker
summary is updated while the owner sees earnings and spend.

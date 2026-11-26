# Security & Privacy Model

This page describes who may read or change a marketplace profile, and where
private data is allowed to travel. It covers the Supabase backend and the
browser-local fallback.

## Principles

1. **Own-row writes.** A signed-in user can update only their own profile. The
   SQL policy is `auth.uid() = id OR public.is_admin()`, and the client
   `updateMyProfile()` always scopes the update to the signed-in user.
2. **Public data through a view.** The directory reads `public_profiles`, which
   exposes only public fields. The private `profiles` table grants only those
   safe columns to `anon`/`authenticated`.
3. **Private fields stay private.** `email` and `phone_number` are never
   granted to the public roles. The owner reads email through the
   `admin_profiles` view, which returns rows only when `public.is_admin()` is
   true.
4. **No password material.** Supabase Auth stores passwords outside
   `public.profiles`. The offline engine stores a per-user salt and a SHA-256
   hash only; the public profile allow-list removes both.
5. **Allow-list, not black-list.** Profile updates copy a fixed list of fields.
   A new column or an alias such as `_email` cannot become writable by
   accident.

## Data classification

| Field | Visibility |
| :--- | :--- |
| `id`, `full_name`, `avatar_url`, `role`, `location`, `bio`, `title`, `hourly_rate`, `skills`, `is_verified`, `created_at` | Public directory (`public_profiles`) |
| `resume_name`, `resume_size_bytes`, `resume_updated_at`, `has_resume` | Public directory metadata. The PDF bytes stay in the private `resumes` bucket and need a signed URL. |
| `email` | Admin only, through `admin_profiles`; the signed-in user also sees their own email from Supabase Auth. |
| `phone_number` | Not granted to public roles. |
| Password salt/hash | Supabase Auth internal; offline engine internal, never returned. |
| `role`, `is_verified` | Admin only. The `protect_profile_immutable_fields` trigger blocks self-service changes. |

## Access matrix

| Actor | Own profile | Another profile | Email / phone | Password material |
| :--- | :--- | :--- | :--- | :--- |
| Anonymous | — | `public_profiles` only | — | — |
| Signed-in user | Read/write allow-listed fields | `public_profiles` only | Own email from Auth; phone not returned | — |
| Admin | Read/write | Read safe fields + email via `admin_profiles` | Email yes; phone no | — |

`profiles` has no `INSERT` or `DELETE` policy. Rows are created by the
`handle_new_user` trigger, and deleting an auth user cascades to the profile.

## Write path

```text
profile editor / chat assistant
        │
        ▼
Profiles.updateMyProfile(data)
        │  allow-list: full_name, avatar_url, location, bio, title,
        │             hourly_rate, skills, phone_number
        │  ignored: id, email, role, is_verified, _salt, _hash, _email
        ▼
UPDATE profiles ... WHERE id = auth.uid()      -- RLS: own row or admin
        │
        ▼
protect_profile_immutable_fields trigger       -- blocks role/email/is_verified
```

## Deploy the migration

Existing Supabase projects need
`supabase/migrations/20261124000000_harden_profiles_read_access.sql`. It is
idempotent and does four things:

1. Revokes table-level `SELECT` on `profiles` from `anon` / `authenticated`.
2. Grants only the safe directory columns (plus resume metadata).
3. Creates `admin_profiles` gated by `public.is_admin()`.
4. Re-grants `public_profiles`.

After applying it, reload the PostgREST schema cache if the new view is not
visible immediately:

```sql
NOTIFY pgrst, 'reload schema';
```

### Verify

```sql
-- Both should be false.
select has_column_privilege('anon', 'public.profiles', 'email', 'select');
select has_column_privilege('authenticated', 'public.profiles', 'email', 'select');

-- Returns rows only when the caller is an admin.
select * from public.admin_profiles;
```

The admin page falls back to the safe columns plus `session.user.email` if the
view is missing, so it keeps working while the migration is pending, but email
will be blank until the view exists.

## Offline fallback

`marketplace-local.js` mirrors the same rules in the browser. `publicProfile()`
is an allow-list that matches `public_profiles`; `updateMyProfile()` ignores
identity and privilege fields and validates the editable values. The local
store is per-browser and is not a trust boundary: a user with developer tools
can change their own browser's data, but cannot reach another person's browser.
Supabase RLS is the boundary that protects real accounts.

### The immutability trigger is the escalation guard

`trg_protect_profile_fields` (function `protect_profile_immutable_fields`) is
what stops a member writing `role`, `email` or `is_verified` on their own row.
RLS alone does not stop it: the UPDATE policy allows a member to update their
own profile, so the column rules have to live in the trigger.

It is attached in `docs/marketplace-schema.sql` and repaired by
`supabase/migrations/20261129000000_restore_profile_pii_columns.sql`. The
function reads the row through `to_jsonb(OLD/NEW)` rather than `NEW.email`, so
it keeps working on a project that has not restored the `email` column yet —
`NEW.email` would raise "record NEW has no field email" and break every
profile update instead of protecting it.

Check it against the deployed project, not just the file:

```bash
AUDIT_EMAIL=audit@yourdomain.com AUDIT_PASSWORD='…' npm run check:live-security
```

`FAIL a client cannot promote themselves to admin` means the trigger is not
attached in that project, whatever the committed SQL says.

## Regression tests

- `npm run check:live-security` — signs in to the deployed project as a
  disposable test account and asserts the rules above. It is opt-in because it
  needs a confirmed account.
- `npm run test:local` — 28 cases, including cross-profile update attempts,
  privilege escalation, private-field leaks, and invalid profile values.
- `npm run test:security` — asserts the schema revokes table-level `SELECT`,
  the safe grant excludes `email`/`phone_number`, `public_profiles` excludes
  them, and `admin_profiles` exists and is gated by `is_admin()`.
- `npm run test:schema` — every client table/view/RPC reference resolves to an
  object in `docs/marketplace-schema.sql`.

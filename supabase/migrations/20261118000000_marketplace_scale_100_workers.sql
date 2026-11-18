-- GAHONSH marketplace: capacity + trust layer for 100+ workers
-- APPLIED to project evdpmombgymthzqegqwr on 2026-11-18 (tables: reviews, messages, worker_ratings).
-- Real column names used: jobs.client_id, proposals.freelancer_id, contracts.job_id.

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references public.contracts(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (contract_id, reviewer_id)
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references public.contracts(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.reviews enable row level security;
alter table public.messages enable row level security;
drop policy if exists reviews_read_all on public.reviews;
create policy reviews_read_all on public.reviews for select using (true);
drop policy if exists reviews_insert_own on public.reviews;
create policy reviews_insert_own on public.reviews for insert to authenticated
  with check (reviewer_id = auth.uid() and reviewer_id <> reviewee_id);
drop policy if exists messages_read_own on public.messages;
create policy messages_read_own on public.messages for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());
drop policy if exists messages_insert_own on public.messages;
create policy messages_insert_own on public.messages for insert to authenticated
  with check (sender_id = auth.uid());
create index if not exists jobs_created_at_idx on public.jobs (created_at desc);
create index if not exists jobs_status_created_idx on public.jobs (status, created_at desc);
create index if not exists jobs_client_idx on public.jobs (client_id);
create index if not exists proposals_job_idx on public.proposals (job_id);
create index if not exists proposals_worker_idx on public.proposals (freelancer_id);
create index if not exists contracts_job_idx on public.contracts (job_id);
create index if not exists reviews_reviewee_idx on public.reviews (reviewee_id);
create index if not exists messages_contract_idx on public.messages (contract_id, created_at desc);
create index if not exists messages_recipient_idx on public.messages (recipient_id, read_at);
create or replace view public.worker_ratings as
select reviewee_id, round(avg(rating)::numeric,2) as avg_rating, count(*) as review_count
from public.reviews group by reviewee_id;
grant select on public.worker_ratings to anon, authenticated;

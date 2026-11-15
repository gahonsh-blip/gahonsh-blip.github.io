-- ============================================================================
-- GAHONSH MARKETPLACE — website enquiries + admin read access
-- ============================================================================

create table if not exists public.contact_messages (
    id uuid primary key default uuid_generate_v4(),
    name text not null check (char_length(trim(name)) >= 2),
    email text not null check (position('@' in email) > 1),
    company text,
    service text,
    message text not null check (char_length(trim(message)) >= 5),
    budget text,
    source text default 'website',
    is_handled boolean not null default false,
    created_at timestamptz not null default timezone('utc', now())
);

alter table public.contact_messages enable row level security;

drop policy if exists "Anyone can send an enquiry" on public.contact_messages;
create policy "Anyone can send an enquiry"
    on public.contact_messages
    for insert
    to anon, authenticated
    with check (true);

drop policy if exists "Only the owner can read enquiries" on public.contact_messages;
create policy "Only the owner can read enquiries"
    on public.contact_messages
    for select
    to authenticated
    using (public.is_admin());

drop policy if exists "Only the owner can update enquiries" on public.contact_messages;
create policy "Only the owner can update enquiries"
    on public.contact_messages
    for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

grant insert on public.contact_messages to anon, authenticated;
grant select, update on public.contact_messages to authenticated;

-- Email the owner for every new enquiry
create or replace function public.notify_new_enquiry()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault, pg_temp
as $$
declare
    v_url text := 'https://superagent-9fe3eb93.base44.app/functions/marketplaceNotify';
    v_secret text;
begin
    select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'marketplace_hook_secret'
    limit 1;

    if v_secret is null then
        return NEW;
    end if;

    perform net.http_post(
        url := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', v_secret),
        body := jsonb_build_object(
            'type', 'contact',
            'data', jsonb_build_object(
                'name', NEW.name,
                'email', NEW.email,
                'company', NEW.company,
                'service', NEW.service,
                'message', NEW.message
            )
        ),
        timeout_milliseconds := 8000
    );

    return NEW;
end;
$$;

drop trigger if exists trg_notify_new_enquiry on public.contact_messages;
create trigger trg_notify_new_enquiry
    after insert on public.contact_messages
    for each row execute function public.notify_new_enquiry();

-- ============================================================================
-- GAHONSH MARKETPLACE — owner notifications, admin access, activity hooks
-- Safe to re-run.
-- ============================================================================

-- 1. pg_net for outbound HTTP from the database
create extension if not exists pg_net with schema extensions;

-- 2. Admin can read every profile row (email included) — needed by the owner dashboard
drop policy if exists "Public can view basic profiles" on public.profiles;
drop policy if exists "Self or admin can view full profile" on public.profiles;
create policy "Self or admin can view full profile"
    on public.profiles
    for select
    using (auth.uid() = id or public.is_admin());

grant select on public.profiles to authenticated;

-- 3. Admin dashboard helper: platform-wide counters in one call
create or replace function public.admin_overview()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    result jsonb;
begin
    if not public.is_admin() then
        raise exception 'Unauthorized';
    end if;

    select jsonb_build_object(
        'users', (select count(*) from public.profiles),
        'clients', (select count(*) from public.profiles where role = 'client'),
        'workers', (select count(*) from public.profiles where role = 'freelancer'),
        'verified_workers', (select count(*) from public.profiles where role = 'freelancer' and is_verified),
        'jobs', (select count(*) from public.jobs),
        'open_jobs', (select count(*) from public.jobs where status = 'open'),
        'proposals', (select count(*) from public.proposals),
        'contracts', (select count(*) from public.contracts),
        'active_contracts', (select count(*) from public.contracts where status = 'active'),
        'contract_value', (select coalesce(sum(agreed_amount), 0) from public.contracts),
        'open_budget', (select coalesce(sum(budget_min), 0) from public.jobs where status = 'open')
    ) into result;

    return result;
end;
$$;

revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

-- 4. Activity hook: every meaningful event emails the owner
create or replace function public.notify_owner_activity()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault, pg_temp
as $$
declare
    v_url text := 'https://superagent-9fe3eb93.base44.app/functions/marketplaceNotify';
    v_secret text;
    v_payload jsonb;
begin
    select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'marketplace_hook_secret'
    limit 1;

    if v_secret is null then
        return NEW;
    end if;

    if TG_TABLE_NAME = 'profiles' then
        v_payload := jsonb_build_object(
            'type', 'signup',
            'data', jsonb_build_object(
                'full_name', NEW.full_name,
                'email', NEW.email,
                'role', NEW.role,
                'location', NEW.location
            )
        );
    elsif TG_TABLE_NAME = 'jobs' then
        v_payload := jsonb_build_object(
            'type', 'job',
            'data', jsonb_build_object(
                'title', NEW.title,
                'budget_min', NEW.budget_min,
                'category', NEW.category,
                'experience_level', NEW.experience_level,
                'estimated_duration', NEW.estimated_duration,
                'description', left(NEW.description, 700),
                'client_name', (select full_name from public.profiles where id = NEW.client_id)
            )
        );
    elsif TG_TABLE_NAME = 'proposals' then
        v_payload := jsonb_build_object(
            'type', 'proposal',
            'data', jsonb_build_object(
                'freelancer_name', (select full_name from public.profiles where id = NEW.freelancer_id),
                'bid_amount', NEW.bid_amount,
                'delivery_time_days', NEW.delivery_time_days,
                'cover_letter', left(NEW.cover_letter, 700),
                'job_title', (select title from public.jobs where id = NEW.job_id)
            )
        );
    elsif TG_TABLE_NAME = 'contracts' then
        v_payload := jsonb_build_object(
            'type', 'hire',
            'data', jsonb_build_object(
                'freelancer_name', (select full_name from public.profiles where id = NEW.freelancer_id),
                'client_name', (select full_name from public.profiles where id = NEW.client_id),
                'job_title', (select title from public.jobs where id = NEW.job_id),
                'agreed_amount', NEW.agreed_amount
            )
        );
    else
        return NEW;
    end if;

    perform net.http_post(
        url := v_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-hook-secret', v_secret
        ),
        body := v_payload,
        timeout_milliseconds := 8000
    );

    return NEW;
end;
$$;

drop trigger if exists trg_notify_new_profile on public.profiles;
create trigger trg_notify_new_profile
    after insert on public.profiles
    for each row execute function public.notify_owner_activity();

drop trigger if exists trg_notify_new_job on public.jobs;
create trigger trg_notify_new_job
    after insert on public.jobs
    for each row execute function public.notify_owner_activity();

drop trigger if exists trg_notify_new_proposal on public.proposals;
create trigger trg_notify_new_proposal
    after insert on public.proposals
    for each row execute function public.notify_owner_activity();

drop trigger if exists trg_notify_new_contract on public.contracts;
create trigger trg_notify_new_contract
    after insert on public.contracts
    for each row execute function public.notify_owner_activity();

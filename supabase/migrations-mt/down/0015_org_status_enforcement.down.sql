-- 0015 down · current_tenant() zurück auf Definition aus 0003 (ohne Status-Check),
-- is_org_suspended() und notes entfernen.

create or replace function public.current_tenant()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid()
$$;

revoke all on function public.current_tenant() from public;
grant execute on function public.current_tenant() to authenticated, service_role;

drop function if exists public.is_org_suspended();

alter table public.organizations drop column if exists notes;

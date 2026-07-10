-- ============================================================================
-- 0017 · Onboarding-Wizard (Plan: docs/onboarding-plan.md)
-- 1. organizations.onboarding_completed_at: steuert den Redirect-Guard in
--    (main)/layout.tsx. NULL = Wizard aussteht. Bestandsmandanten werden
--    beim Rollout auf now() vorbelegt, damit niemand überraschend in den
--    Wizard geschickt wird.
-- 2. payroll_settings.reserve_months: Rücklage-Puffer in Monatsbudgets
--    (bisher nur clientseitig in localStorage, siehe RuecklagenRechner.tsx).
-- 3. complete_onboarding(): security-definer RPC, analog zu provision_tenant
--    (0010) — organizations hat bewusst KEINE User-Update-Policy (0016),
--    daher kein direktes UPDATE aus der API-Route möglich.
-- Idempotent.
-- ============================================================================

alter table public.organizations
  add column if not exists onboarding_completed_at timestamptz;

alter table public.payroll_settings
  add column if not exists reserve_months numeric not null default 2;

-- Bestandsmandanten: kein Wizard-Zwang nachträglich aufzwingen.
update public.organizations
  set onboarding_completed_at = now()
  where onboarding_completed_at is null;

create or replace function public.complete_onboarding()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant
  from public.profiles
  where id = auth.uid() and role = 'admin';

  if v_tenant is null then
    raise exception 'not an admin';
  end if;

  update public.organizations
  set onboarding_completed_at = now()
  where id = v_tenant;
end $$;

revoke all on function public.complete_onboarding() from public;
grant execute on function public.complete_onboarding() to authenticated;

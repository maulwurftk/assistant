-- ============================================================================
-- 0015 · Mandanten-Sperre: org.status wird durchgesetzt (Plan: docs/mandanten-verwaltung-plan.md)
-- 1. current_tenant() liefert null, wenn die Org nicht 'active' ist →
--    Default-Deny greift in ALLEN RLS-Policies (inkl. p_self_read!).
-- 2. is_org_suspended() erlaubt dem Layout, „gesperrt" von „kein Profil /
--    unprovisioniert" zu unterscheiden (Redirect /gesperrt statt /registrieren).
-- 3. organizations.notes: Freitext für Superadmin (Sperr-Grund, Kontakt).
-- Idempotent. Signatur von current_tenant() unverändert — keine Policy anfassen.
-- ============================================================================

-- 1 · current_tenant() mit Status-Check (ersetzt Definition aus 0003)
create or replace function public.current_tenant()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.tenant_id
  from public.profiles p
  join public.organizations o on o.id = p.tenant_id
  where p.id = auth.uid()
    and o.status = 'active'
$$;

revoke all on function public.current_tenant() from public;
grant execute on function public.current_tenant() to authenticated, service_role;

-- 2 · is_org_suspended(): true, wenn der eingeloggte User ein Profil hat,
--    dessen Org NICHT active ist. security definer, weil der User selbst
--    weder profiles noch organizations lesen kann, sobald gesperrt.
create or replace function public.is_org_suspended()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.organizations o on o.id = p.tenant_id
    where p.id = auth.uid()
      and o.status <> 'active'
  )
$$;

revoke all on function public.is_org_suspended() from public;
grant execute on function public.is_org_suspended() to authenticated, service_role;

-- 3 · Notizfeld für Superadmin (nur via Service-Role beschreibbar — organizations
--    hat für User ohnehin nur die Read-Policy auf den eigenen Mandanten).
alter table public.organizations add column if not exists notes text;

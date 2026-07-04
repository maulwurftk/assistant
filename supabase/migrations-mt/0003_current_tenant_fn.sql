-- ============================================================================
-- 0003 · current_tenant() — zentrale Tenant-Auflösung (Architektur §2.1, v1)
-- security definer: umgeht RLS auf profiles → keine Policy-Rekursion.
-- set search_path: gegen Search-Path-Hijacking.
-- stable + Aufruf als (select current_tenant()) in Policies → 1× pro Statement.
-- Späterer Wechsel auf JWT-Claim: gleiche Signatur, Einzeiler-Tausch.
-- ============================================================================

create or replace function public.current_tenant()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid()
$$;

-- Nur authentifizierte Rollen brauchen sie; execute-Rechte explizit halten.
revoke all on function public.current_tenant() from public;
grant execute on function public.current_tenant() to authenticated, service_role;

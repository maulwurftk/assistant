-- ============================================================================
-- 0005 · Backfill Karas-Org — ⚠️ NUR PROD (Betriebsplan §1)
-- Auf Staging stattdessen: staging/0005_backfill_staging_orgs.sql
-- Legt die Karas-Organisation an und hängt ALLE Bestandszeilen daran.
-- Muss VOR 0006 (NOT NULL) und VOR 0008/0009 (RLS) laufen (Architektur §6).
-- Idempotent: befüllt nur Zeilen mit tenant_id IS NULL.
-- ============================================================================

do $$
declare
  v_org uuid;
begin
  -- Schutz: nicht versehentlich auf Staging ausführen
  if exists (select 1 from public.organizations where slug in ('demo-org-a','demo-org-b')) then
    raise exception 'Staging-Orgs gefunden — dieses Skript ist NUR für Prod. Abbruch.';
  end if;

  insert into public.organizations (name, slug)
  values ('Karas', 'karas')
  on conflict (slug) do nothing;

  select id into v_org from public.organizations where slug = 'karas';

  update public.profiles                 set tenant_id = v_org where tenant_id is null;
  update public.activities               set tenant_id = v_org where tenant_id is null;
  update public.time_entries             set tenant_id = v_org where tenant_id is null;
  update public.calendar_slots           set tenant_id = v_org where tenant_id is null;
  update public.monthly_reports          set tenant_id = v_org where tenant_id is null;
  update public.notifications            set tenant_id = v_org where tenant_id is null;
  update public.payroll_settings         set tenant_id = v_org where tenant_id is null;
  update public.payroll_runs             set tenant_id = v_org where tenant_id is null;
  update public.account_ledger           set tenant_id = v_org where tenant_id is null;
  update public.push_subscriptions       set tenant_id = v_org where tenant_id is null;
  update public.assistant_unavailability set tenant_id = v_org where tenant_id is null;
end $$;

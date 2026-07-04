-- ============================================================================
-- 0005 (STAGING-Variante) · Zwei Test-Orgs (Betriebsplan §1/§4)
-- ⚠️ NUR STAGING — auf Prod läuft stattdessen 0005_backfill_karas_org.sql.
--
-- Alle vorhandenen Demo-Zeilen (seed-demo.sql) → "Demo Org A".
-- "Demo Org B" wird leer angelegt; ihre User/Fachdaten erzeugt der
-- Cross-Tenant-Test (scripts/ bzw. __tests__) über die Auth-Admin-API —
-- Auth-User lassen sich nicht sauber per SQL anlegen, und ein Aufteilen der
-- bestehenden Demo-Daten auf zwei Orgs würde die Composite-FKs verletzen
-- (Slots von Admin A für Assistentin B wären tenant-übergreifend).
-- Idempotent.
-- ============================================================================

do $$
declare
  v_org_a uuid;
begin
  -- Schutz: nicht versehentlich auf Prod ausführen
  if exists (select 1 from public.organizations where slug = 'karas') then
    raise exception 'Karas-Org gefunden — dieses Skript ist NUR für Staging. Abbruch.';
  end if;
  if exists (select 1 from auth.users where email not like 'demo-%@example.com' and email not like 'test-%@example.com') then
    raise exception 'Nicht-Demo-Auth-User gefunden — das sieht nicht nach Staging aus. Abbruch.';
  end if;

  insert into public.organizations (name, slug) values
    ('Demo Org A', 'demo-org-a'),
    ('Demo Org B', 'demo-org-b')
  on conflict (slug) do nothing;

  select id into v_org_a from public.organizations where slug = 'demo-org-a';

  update public.profiles                 set tenant_id = v_org_a where tenant_id is null;
  update public.activities               set tenant_id = v_org_a where tenant_id is null;
  update public.time_entries             set tenant_id = v_org_a where tenant_id is null;
  update public.calendar_slots           set tenant_id = v_org_a where tenant_id is null;
  update public.monthly_reports          set tenant_id = v_org_a where tenant_id is null;
  update public.notifications            set tenant_id = v_org_a where tenant_id is null;
  update public.payroll_settings         set tenant_id = v_org_a where tenant_id is null;
  update public.payroll_runs             set tenant_id = v_org_a where tenant_id is null;
  update public.account_ledger           set tenant_id = v_org_a where tenant_id is null;
  update public.push_subscriptions       set tenant_id = v_org_a where tenant_id is null;
  update public.assistant_unavailability set tenant_id = v_org_a where tenant_id is null;
end $$;

-- ============================================================================
-- 0006 · Constraints scharf (Architektur §1.2, §1.4, §1.5; §6 Schritt 3)
-- Voraussetzung: Backfill (0005 bzw. staging/0005) ist gelaufen — sonst
-- schlägt SET NOT NULL absichtlich fehl (eingebauter Wächter).
-- Idempotent über pg_constraint-Checks.
-- ============================================================================

-- ── 1) FK tenant_id → organizations (on delete RESTRICT — Löschen nur als
--       bewusster, auditierter Job, nie als Kaskade; Architektur §1.2) ────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','activities','time_entries','calendar_slots','monthly_reports',
    'notifications','payroll_settings','payroll_runs','account_ledger',
    'push_subscriptions','assistant_unavailability'
  ] loop
    if not exists (
      select 1 from pg_constraint
      where conname = t || '_tenant_fk' and conrelid = ('public.' || t)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (tenant_id)
         references public.organizations(id) on delete restrict', t, t || '_tenant_fk');
    end if;
  end loop;
end $$;

-- ── 2) NOT NULL (scheitert laut, wenn der Backfill fehlt — gewollt) ─────────
alter table public.profiles                 alter column tenant_id set not null;
alter table public.activities               alter column tenant_id set not null;
alter table public.time_entries             alter column tenant_id set not null;
alter table public.calendar_slots           alter column tenant_id set not null;
alter table public.monthly_reports          alter column tenant_id set not null;
alter table public.notifications            alter column tenant_id set not null;
alter table public.payroll_settings         alter column tenant_id set not null;
alter table public.payroll_runs             alter column tenant_id set not null;
alter table public.account_ledger           alter column tenant_id set not null;
alter table public.push_subscriptions       alter column tenant_id set not null;
alter table public.assistant_unavailability alter column tenant_id set not null;

-- ── 3) profiles(id, tenant_id) als Kandidatenschlüssel für Composite-FKs ────
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_id_tenant_uk') then
    alter table public.profiles add constraint profiles_id_tenant_uk unique (id, tenant_id);
  end if;
end $$;

-- ── 4) Composite-FKs: tenant-fremde Profil-Referenzen physisch unmöglich
--       (Architektur §1.5). Die bestehenden Einspalten-FKs bleiben und
--       liefern weiterhin die Delete-Semantik (cascade / set null); die
--       Composite-FKs sind bewusst NO ACTION (Default) — bei MATCH SIMPLE
--       greifen sie nicht, wenn die Referenzspalte NULL ist (z. B. nach
--       "on delete set null" auf assigned_to), genau wie gewünscht. ─────────
do $$
declare
  r record;
begin
  for r in select * from (values
    ('time_entries',             'assistant_id'),
    ('calendar_slots',           'assigned_to'),
    ('calendar_slots',           'created_by'),
    ('calendar_slots',           'pending_request_by'),   -- gleiche Klasse wie assigned_to
    ('monthly_reports',          'assistant_id'),
    ('payroll_runs',             'assistant_id'),
    ('notifications',            'user_id'),
    ('push_subscriptions',       'user_id'),
    ('assistant_unavailability', 'assistant_id')
  ) as v(tbl, col) loop
    if not exists (
      select 1 from pg_constraint
      where conname = r.tbl || '_' || r.col || '_tenant_fk'
        and conrelid = ('public.' || r.tbl)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (%I, tenant_id)
         references public.profiles(id, tenant_id)', r.tbl, r.tbl || '_' || r.col || '_tenant_fk', r.col);
    end if;
  end loop;
end $$;

-- ── 5) 🐞 Uniqueness-Fixes (Architektur §1.4) ────────────────────────────────
-- account_ledger.dedup_key: global unique → tenant-lokal
alter table public.account_ledger drop constraint if exists account_ledger_dedup_key_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'account_ledger_tenant_dedup_uk') then
    alter table public.account_ledger add constraint account_ledger_tenant_dedup_uk unique (tenant_id, dedup_key);
  end if;
end $$;

-- payroll_settings: genau eine Zeile PRO Tenant, DB-erzwungen
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'payroll_settings_tenant_uk') then
    alter table public.payroll_settings add constraint payroll_settings_tenant_uk unique (tenant_id);
  end if;
end $$;

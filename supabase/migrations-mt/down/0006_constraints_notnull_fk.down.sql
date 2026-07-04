-- Rollback 0006 (Reihenfolge: erst Composite-FKs, dann Unique, dann NOT NULL/FK)

-- Composite-FKs
alter table public.time_entries             drop constraint if exists time_entries_assistant_id_tenant_fk;
alter table public.calendar_slots           drop constraint if exists calendar_slots_assigned_to_tenant_fk;
alter table public.calendar_slots           drop constraint if exists calendar_slots_created_by_tenant_fk;
alter table public.calendar_slots           drop constraint if exists calendar_slots_pending_request_by_tenant_fk;
alter table public.monthly_reports          drop constraint if exists monthly_reports_assistant_id_tenant_fk;
alter table public.payroll_runs             drop constraint if exists payroll_runs_assistant_id_tenant_fk;
alter table public.notifications            drop constraint if exists notifications_user_id_tenant_fk;
alter table public.push_subscriptions      drop constraint if exists push_subscriptions_user_id_tenant_fk;
alter table public.assistant_unavailability drop constraint if exists assistant_unavailability_assistant_id_tenant_fk;

-- Kandidatenschlüssel
alter table public.profiles drop constraint if exists profiles_id_tenant_uk;

-- Uniqueness-Fixes zurück
alter table public.account_ledger drop constraint if exists account_ledger_tenant_dedup_uk;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'account_ledger_dedup_key_key') then
    alter table public.account_ledger add constraint account_ledger_dedup_key_key unique (dedup_key);
  end if;
end $$;
alter table public.payroll_settings drop constraint if exists payroll_settings_tenant_uk;

-- NOT NULL + tenant-FKs zurück
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','activities','time_entries','calendar_slots','monthly_reports',
    'notifications','payroll_settings','payroll_runs','account_ledger',
    'push_subscriptions','assistant_unavailability'
  ] loop
    execute format('alter table public.%I alter column tenant_id drop not null', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_tenant_fk');
  end loop;
end $$;

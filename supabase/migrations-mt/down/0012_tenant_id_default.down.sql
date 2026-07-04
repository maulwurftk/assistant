-- Rollback 0012
alter table public.profiles                 alter column tenant_id drop default;
alter table public.activities               alter column tenant_id drop default;
alter table public.time_entries             alter column tenant_id drop default;
alter table public.calendar_slots           alter column tenant_id drop default;
alter table public.monthly_reports          alter column tenant_id drop default;
alter table public.notifications            alter column tenant_id drop default;
alter table public.payroll_settings         alter column tenant_id drop default;
alter table public.payroll_runs             alter column tenant_id drop default;
alter table public.account_ledger           alter column tenant_id drop default;
alter table public.push_subscriptions       alter column tenant_id drop default;
alter table public.assistant_unavailability alter column tenant_id drop default;

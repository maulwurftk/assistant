-- Rollback 0002 (setzt voraus: 0006-down ist gelaufen, sonst blockieren Constraints)
alter table public.profiles                 drop column if exists tenant_id;
alter table public.activities               drop column if exists tenant_id;
alter table public.time_entries             drop column if exists tenant_id;
alter table public.calendar_slots           drop column if exists tenant_id;
alter table public.monthly_reports          drop column if exists tenant_id;
alter table public.notifications            drop column if exists tenant_id;
alter table public.payroll_settings         drop column if exists tenant_id;
alter table public.payroll_runs             drop column if exists tenant_id;
alter table public.account_ledger           drop column if exists tenant_id;
alter table public.push_subscriptions       drop column if exists tenant_id;
alter table public.assistant_unavailability drop column if exists tenant_id;

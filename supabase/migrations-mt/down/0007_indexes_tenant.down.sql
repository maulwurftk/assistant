-- Rollback 0007
drop index if exists public.time_entries_tenant_date_idx;
drop index if exists public.calendar_slots_tenant_status_start_idx;
drop index if exists public.monthly_reports_tenant_assistant_ym_idx;
drop index if exists public.notifications_tenant_user_read_idx;
drop index if exists public.payroll_runs_tenant_ym_idx;
drop index if exists public.account_ledger_tenant_date_idx;
drop index if exists public.assistant_unavailability_tenant_assistant_idx;
drop index if exists public.push_subscriptions_tenant_user_idx;
drop index if exists public.profiles_tenant_idx;
drop index if exists public.activities_tenant_idx;

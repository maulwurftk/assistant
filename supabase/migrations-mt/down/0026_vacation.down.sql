-- ============================================================================
-- 0026 · Rollback Urlaub & Abwesenheiten. Idempotent.
-- ============================================================================
drop view  if exists public.leave_balances;
drop table if exists public.vacation_notices;
drop table if exists public.leave_ledger;
drop table if exists public.absences;
drop table if exists public.employment_terms;

alter table public.profiles
  drop column if exists employment_start,
  drop column if exists employment_end;

alter table public.payroll_settings
  drop constraint if exists payroll_settings_vac_region_ck,
  drop constraint if exists payroll_settings_vac_notice_ck,
  drop column if exists vacation_enabled,
  drop column if exists vacation_base_days,
  drop column if exists vacation_holiday_region,
  drop column if exists vacation_carryover_until,
  drop column if exists vacation_reference_weeks,
  drop column if exists vacation_notice_month;

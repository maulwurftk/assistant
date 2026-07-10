-- Down für 0017
drop function if exists public.complete_onboarding();

alter table public.payroll_settings
  drop column if exists reserve_months;

alter table public.organizations
  drop column if exists onboarding_completed_at;

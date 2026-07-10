alter table public.time_entries drop column if exists is_private;
alter table public.payroll_settings drop column if exists private_hours_budget;

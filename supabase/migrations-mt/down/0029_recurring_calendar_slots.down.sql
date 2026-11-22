drop index if exists public.calendar_slots_series_idx;
alter table public.calendar_slots
  drop column if exists series_rule,
  drop column if exists series_id;

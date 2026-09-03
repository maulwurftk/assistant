alter table public.calendar_slots
  drop column if exists confirmed_at,
  drop column if exists confirmed_by,
  drop column if exists actual_start_time,
  drop column if exists actual_end_time,
  drop column if exists activity_id,
  drop column if exists self_reported;

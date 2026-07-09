-- Down für 0016
alter table public.organizations
  drop column if exists google_calendar_ical_url;

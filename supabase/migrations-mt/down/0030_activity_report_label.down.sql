alter table public.activities
  drop column if exists default_description,
  drop column if exists report_label;

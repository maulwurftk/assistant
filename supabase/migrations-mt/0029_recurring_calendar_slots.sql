-- ============================================================================
-- 0029 · Wiederkehrende Termine (Serien mit Ablaufdatum)
-- Eine Serie wird beim Anlegen vollständig in einzelne calendar_slots
-- "ausmaterialisiert" (Ablaufdatum ist Pflicht → endliche Menge). Jeder
-- Termin bleibt ein ganz normaler Slot – Bestätigung, Lohnabrechnung,
-- iCal-Feed, Anfragen usw. funktionieren unverändert.
-- series_id verbindet die Termine einer Serie (für "diesen und alle
-- folgenden" / "alle" beim Bearbeiten und Entfernen), series_rule hält die
-- Regel nur zur Anzeige fest.
-- Keine neuen RLS-Policies nötig (bestehende auf calendar_slots greifen).
-- Additiv & idempotent.
-- ============================================================================

alter table public.calendar_slots
  add column if not exists series_id uuid,
  add column if not exists series_rule jsonb;

comment on column public.calendar_slots.series_id is
  'Gemeinsame ID aller Termine einer Serie (wiederkehrender Termin). NULL = Einzeltermin.';
comment on column public.calendar_slots.series_rule is
  'Wiederholungsregel der Serie zur Anzeige, z.B. {"freq":"weekly","interval":1,"weekdays":[1,3],"until":"2027-03-31"}.';

create index if not exists calendar_slots_series_idx
  on public.calendar_slots (tenant_id, series_id, date)
  where series_id is not null;

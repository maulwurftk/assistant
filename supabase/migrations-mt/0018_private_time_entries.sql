-- ============================================================================
-- 0018 · Private Zeiteinträge (unbezahlt, außerhalb Bezirks-Budget)
-- Assistentin kann Zeiteinträge als "Privat" markieren (z.B. gelegentliche
-- Gefälligkeiten wie Hundesitting). Diese Einträge:
--   - bleiben vollständig innerhalb des Mandanten sichtbar (Kalender/Liste)
--   - fließen NICHT in Lohnberechnung/Minijob ein (unbezahlt, siehe Notiz)
--   - fließen NICHT in Anwesenheitsnachweis/Bericht/Bezirks-Budget ein
--   - zählen stattdessen gegen ein eigenes, optionales Monats-Stundenlimit
-- Keine neuen RLS-Policies nötig — bestehende Policies auf time_entries bzw.
-- payroll_settings (0009) decken die neuen Spalten bereits ab. Idempotent.
-- ============================================================================

alter table public.time_entries
  add column if not exists is_private boolean not null default false;

alter table public.payroll_settings
  add column if not exists private_hours_budget numeric not null default 0;

comment on column public.time_entries.is_private is
  'Privater, unbezahlter Eintrag — ausgeschlossen von Lohnberechnung, Anwesenheitsnachweis und Bezirks-Budget.';
comment on column public.payroll_settings.private_hours_budget is
  'Monatliches Stunden-Limit für private Einträge (0 = kein Limit/keine Anzeige).';

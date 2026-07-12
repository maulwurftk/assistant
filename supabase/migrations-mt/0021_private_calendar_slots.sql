-- ============================================================================
-- 0021 · Private Kalender-Slots
-- Ergänzt is_private auch auf calendar_slots — die Planung läuft primär über
-- den Kalender, nicht über time_entries (0018). Gleiche Semantik: privater
-- Slot bleibt im Kalender sichtbar, fließt aber nicht in Lohnberechnung,
-- Anwesenheitsnachweis, Berichte-Export oder Bezirks-Budget ein.
-- Keine neuen RLS-Policies nötig — bestehende Policies auf calendar_slots
-- (0008) decken die neue Spalte bereits ab. Idempotent.
-- ============================================================================

alter table public.calendar_slots
  add column if not exists is_private boolean not null default false;

comment on column public.calendar_slots.is_private is
  'Privater, unbezahlter Slot — ausgeschlossen von Lohnberechnung, Anwesenheitsnachweis und Bezirks-Budget.';

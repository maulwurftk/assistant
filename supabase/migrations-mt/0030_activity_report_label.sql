-- ============================================================================
-- 0030 · Tätigkeiten mit Berichtskategorie und Vorschlagstext
-- report_label:        erscheint im Tätigkeitsbericht statt des Namens
--                      (z.B. Leistungsart laut Bescheid/Zielvereinbarung).
-- default_description: wird beim Auswählen der Tätigkeit im Kalender in die
--                      Notizen (calendar_slots.description) übernommen.
-- Keine neuen RLS-Policies nötig (bestehende auf activities greifen).
-- Additiv & idempotent.
-- ============================================================================

alter table public.activities
  add column if not exists report_label text,
  add column if not exists default_description text;

comment on column public.activities.report_label is
  'Kategorie für den Tätigkeitsbericht (statt name). NULL = name verwenden.';
comment on column public.activities.default_description is
  'Vorschlagstext, der beim Auswählen der Tätigkeit in die Slot-Notizen übernommen wird.';

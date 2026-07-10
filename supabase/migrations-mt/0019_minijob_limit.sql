-- ============================================================================
-- 0019 · Individuelle Minijobgrenze je Assistentin
-- Bisher gab es nur einen globalen hourly_rate + ein Team-Gesamtbudget
-- (payroll_settings.monthly_budget). Für die Frage "wie viele Stunden/wie
-- viel Budget hat Antonia diesen Monat noch, bevor sie an ihre persönliche
-- Minijobgrenze stößt?" braucht es eine Grenze pro Person, da nicht alle
-- Assistentinnen denselben Vertrag/dieselbe Grenze haben.
-- NULL = keine individuelle Grenze gesetzt (keine Anzeige/kein Warnsystem
-- für diese Person). Keine neuen RLS-Policies nötig — bestehende Policies
-- auf profiles (0009) decken die neue Spalte bereits ab. Idempotent.
-- ============================================================================

alter table public.profiles
  add column if not exists minijob_limit numeric null;

comment on column public.profiles.minijob_limit is
  'Individuelle monatliche Minijobgrenze in € für diese Assistentin. NULL = keine Grenze gesetzt/keine Anzeige.';

-- Mutterschutz/Elternzeit-Status je Profil + eingefrorene Werte für bereits
-- versendete Lohnabrechnungen (payroll_runs).
--
-- Hintergrund: Übersicht und Lohnzettel haben bisher IMMER live aus den
-- aktuellen payroll_settings + dem aktuellen KV-/RV-Pflicht-Flag neu
-- gerechnet – auch für Monate, die schon per E-Mail versendet wurden. Ändert
-- sich später z.B. der KV-Status einer Assistentin, driftet die Anzeige für
-- bereits gemeldete/ausgezahlte Monate unbemerkt vom tatsächlich gemeldeten
-- Betrag weg (siehe Vorfall Lisa Kapfer, Juni 2026: 488€ gemeldet, App zeigte
-- später 529,10€ nach KV-Status-Änderung).

-- 1) Snapshot-Spalten auf payroll_runs: beim Versenden (send-email) werden
--    Brutto/Netto/RV-/KV-Status sowie die komplette Berechnungsgrundlage und
--    die Einsatzliste eingefroren. Überall dort, wo für einen Monat bereits
--    ein payroll_runs-Eintrag existiert, muss die Anzeige diese Werte nehmen
--    statt neu zu rechnen.
alter table public.payroll_runs
  add column if not exists brutto      numeric(10,2),
  add column if not exists netto       numeric(10,2),
  add column if not exists rv_pflicht  boolean,
  add column if not exists kv_pflicht  boolean,
  add column if not exists snapshot    jsonb,
  add column if not exists sent_by     uuid references public.profiles(id) on delete set null;

comment on column public.payroll_runs.snapshot is
  'Eingefrorene Berechnungsgrundlage zum Versandzeitpunkt: { hourlyRate, effectiveBruttoRate, currency, bezirkMode, minijobMode, countryMode, uvRate, rates, atRates, atOptions, atGeringfuegigMode, minijob, atBreakdown, entries }. Wird von Übersicht/Lohnzettel für bereits versendete Monate anstelle der Live-Berechnung verwendet.';

-- 2) Mutterschutz/Elternzeit-Zeitraum je Profil. leave_until = null bedeutet
--    "Ende noch offen". Generisch benannt (nicht nur "maternity"), damit sich
--    später auch Elternzeit/längere Krankheit darüber abbilden lässt.
alter table public.profiles
  add column if not exists leave_reason text,
  add column if not exists leave_from   date,
  add column if not exists leave_until  date;

comment on column public.profiles.leave_reason is
  'Freitext-Grund einer laufenden Abwesenheit, z.B. "Mutterschutz". Null = keine aktive Abwesenheit.';
comment on column public.profiles.leave_from is
  'Erster Tag der Abwesenheit. Ab diesem Datum können ihr keine neuen Kalender-Slots mehr zugewiesen werden.';
comment on column public.profiles.leave_until is
  'Letzter Tag der Abwesenheit, falls bekannt. Null = Ende noch offen (unbefristet gesperrt, bis manuell aufgehoben).';

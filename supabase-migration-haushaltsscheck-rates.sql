-- Korrektur der Minijob-Pauschalbeitragssätze auf das tatsächliche
-- Haushaltsscheck-Verfahren (private Haushalte über die Minijob-Zentrale).
--
-- Hintergrund: mj_kv_ag/mj_rv_ag/mj_u2/mj_insolvenzgeld/mj_rv_an waren mit
-- Sätzen für GEWERBLICHE Minijobs befüllt (13%/15%/0,24%/0,06%/3,60%),
-- nicht mit den Haushaltsscheck-Sätzen (5%/5%/0,22%/0%/13,60%). Zudem fehlte
-- die Umlage 1 (Krankheit/Kur, 0,8%) komplett als eigenes Feld.
-- Ausgelöst durch Abgleich mit dem Abgabenbescheid der Minijob-Zentrale vom
-- 04.07.2026 (Betriebsnummer 80417610).
--
-- Neue Spalte mj_u1 + korrigierte Defaults für künftige Zeilen:
ALTER TABLE public.payroll_settings
  ADD COLUMN IF NOT EXISTS mj_u1 numeric(5,2) NOT NULL DEFAULT 0.80;

ALTER TABLE public.payroll_settings
  ALTER COLUMN mj_kv_ag SET DEFAULT 5.00,
  ALTER COLUMN mj_rv_ag SET DEFAULT 5.00,
  ALTER COLUMN mj_u2 SET DEFAULT 0.22,
  ALTER COLUMN mj_insolvenzgeld SET DEFAULT 0.00,
  ALTER COLUMN mj_rv_an SET DEFAULT 13.60;

-- Bestehende Zeilen mit minijob_mode = true (Haushaltsscheck-Verfahren)
-- auf die korrekten, seit 01.01.2026 gültigen Sätze umstellen. Zeilen mit
-- minijob_mode = false (kein Minijob/Haushaltsscheck) bleiben unangetastet,
-- da die Sätze dort ohnehin nicht angewendet werden.
UPDATE public.payroll_settings
SET
  mj_kv_ag = 5.00,
  mj_rv_ag = 5.00,
  mj_u1 = 0.80,
  mj_u2 = 0.22,
  mj_insolvenzgeld = 0.00,
  mj_rv_an = 13.60
WHERE minijob_mode = true;

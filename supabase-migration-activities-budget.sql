-- Tätigkeiten aus Zielvereinbarung (Bezirk Oberpfalz, gültig 01.03.2026–29.02.2028)
-- Bestehende Tätigkeiten deaktivieren
UPDATE public.activities SET active = false;

-- Neue Tätigkeiten gemäß Zielvereinbarung
INSERT INTO public.activities (name, active, sort_order) VALUES
  ('Pers. Assistenz – Arzttermin',          true, 10),
  ('Pers. Assistenz – Einkauf',             true, 20),
  ('Pers. Assistenz – Freizeitbegleitung',  true, 30),
  ('Elternassistenz – Betreuung Tochter',   true, 40),
  ('Elternassistenz – Aufräumen / Einkauf', true, 50),
  ('Elternassistenz – Freizeit mit Kind',   true, 60);

-- Budget-Felder zu payroll_settings hinzufügen
ALTER TABLE public.payroll_settings
  ADD COLUMN IF NOT EXISTS monthly_budget  numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS account_fee     numeric(10,2) NOT NULL DEFAULT 10.00,
  ADD COLUMN IF NOT EXISTS weekly_hours_target numeric(5,1) NOT NULL DEFAULT 15.0;

-- Stundensatz und Budget setzen (falls Zeile existiert)
UPDATE public.payroll_settings
SET
  hourly_rate         = 20.00,
  monthly_budget      = 1310.00,
  account_fee         = 10.00,
  weekly_hours_target = 15.0,
  minijob_mode        = true
WHERE id = (SELECT id FROM public.payroll_settings LIMIT 1);

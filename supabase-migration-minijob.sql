-- Minijob-Konfiguration in payroll_settings
ALTER TABLE public.payroll_settings
  ADD COLUMN IF NOT EXISTS minijob_mode       boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS uv_rate            numeric(5,2) NOT NULL DEFAULT 1.60,
  ADD COLUMN IF NOT EXISTS employer_name      text         NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS employer_address   text         NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS employer_tax_number text        NOT NULL DEFAULT '';

-- RV-Pflicht pro Assistent (ob Aufstockungsbetrag gezahlt wird)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rv_pflicht boolean NOT NULL DEFAULT true;

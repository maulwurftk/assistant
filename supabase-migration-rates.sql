-- Minijob-Beitragssätze konfigurierbar machen + Master-Toggle für Lohnabrechnung
-- Bisher waren die Sätze im Code hardcoded (MINIJOB_RATES). Jetzt pro Instanz pflegbar.

ALTER TABLE public.payroll_settings
  ADD COLUMN IF NOT EXISTS payroll_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS mj_kv_ag numeric(5,2) NOT NULL DEFAULT 13.00,
  ADD COLUMN IF NOT EXISTS mj_rv_ag numeric(5,2) NOT NULL DEFAULT 15.00,
  ADD COLUMN IF NOT EXISTS mj_pauschsteuer numeric(5,2) NOT NULL DEFAULT 2.00,
  ADD COLUMN IF NOT EXISTS mj_u2 numeric(5,2) NOT NULL DEFAULT 0.24,
  ADD COLUMN IF NOT EXISTS mj_insolvenzgeld numeric(5,2) NOT NULL DEFAULT 0.06,
  ADD COLUMN IF NOT EXISTS mj_rv_an numeric(5,2) NOT NULL DEFAULT 3.60;

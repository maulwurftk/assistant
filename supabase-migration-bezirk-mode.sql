-- Add bezirk_mode column to payroll_settings
-- When true: hourly_rate is the Bezirk's flat rate (incl. all AG costs).
-- The actual employee brutto is back-calculated: brutto = bezirk_rate / (1 + AG_total%)
ALTER TABLE public.payroll_settings
  ADD COLUMN IF NOT EXISTS bezirk_mode boolean NOT NULL DEFAULT false;

-- Zähl-Modus für die Lohnabrechnung: welche Zeiten zählen?
--   'slots'   = nur Kalender-Slots (Standard, empfohlen)
--   'entries' = nur manuelle Zeiteinträge
--   'both'    = Slots + Einträge (Achtung: kann doppelt zählen)

ALTER TABLE public.payroll_settings
  ADD COLUMN IF NOT EXISTS payroll_count_mode text NOT NULL DEFAULT 'slots'
    CHECK (payroll_count_mode IN ('slots', 'entries', 'both'));

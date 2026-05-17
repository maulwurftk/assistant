-- Migration: iCal-Token für Google Kalender Sync
-- Im Supabase SQL Editor ausführen

-- ical_token Spalte zur profiles-Tabelle hinzufügen
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ical_token uuid NOT NULL DEFAULT gen_random_uuid();

-- Index für schnelle Token-Suche
CREATE UNIQUE INDEX IF NOT EXISTS profiles_ical_token_idx ON public.profiles (ical_token);

-- RLS: iCal-Route darf per Token lesen (öffentlich, aber nur mit gültigem Token)
-- Die API-Route nutzt den Service Role Key, also kein extra Policy nötig.

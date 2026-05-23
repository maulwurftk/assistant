-- Assistentenfarben für Kalenderdarstellung
-- Im Supabase SQL Editor ausführen

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS color varchar(7) NOT NULL DEFAULT '#6366f1';

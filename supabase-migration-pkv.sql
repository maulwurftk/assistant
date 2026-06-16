ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS kv_pflicht boolean NOT NULL DEFAULT true;

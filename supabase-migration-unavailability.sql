-- Sperrzeiten: Assistenten können Zeiten eintragen an denen sie nicht verfügbar sind
CREATE TABLE IF NOT EXISTS public.assistant_unavailability (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  assistant_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type          text        NOT NULL CHECK (type IN ('single', 'recurring')),
  -- Einmalig: konkretes Datum
  date          date,
  -- Regelmäßig: Wochentag (0=Mo, 1=Di, 2=Mi, 3=Do, 4=Fr, 5=Sa, 6=So)
  day_of_week   smallint    CHECK (day_of_week BETWEEN 0 AND 6),
  -- Zeitfenster (optional – bei all_day = true ignoriert)
  all_day       boolean     NOT NULL DEFAULT true,
  start_time    time,
  end_time      time,
  -- Gültigkeitszeitraum für regelmäßige Einträge
  valid_from    date,
  valid_until   date,
  -- Bemerkung
  note          text,
  created_at    timestamptz DEFAULT now() NOT NULL
);

-- Row Level Security
ALTER TABLE public.assistant_unavailability ENABLE ROW LEVEL SECURITY;

-- Assistenten: eigene Einträge verwalten
CREATE POLICY "own_entries" ON public.assistant_unavailability
  FOR ALL USING (auth.uid() = assistant_id);

-- Admins: alle lesen
CREATE POLICY "admin_read_all" ON public.assistant_unavailability
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

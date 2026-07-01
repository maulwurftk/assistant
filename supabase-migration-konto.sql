-- Virtuelles Kontobuch (Ledger) für das Bezirk-Konto
-- Jede Buchung muss bestätigt werden (status='confirmed'), bevor sie zählt.

CREATE TABLE IF NOT EXISTS public.account_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_date date NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  category text NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  description text,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto')),
  dedup_key text UNIQUE,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);

CREATE INDEX IF NOT EXISTS account_ledger_date_idx ON public.account_ledger (booking_date);
CREATE INDEX IF NOT EXISTS account_ledger_status_idx ON public.account_ledger (status);

ALTER TABLE public.account_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ledger"
  ON public.account_ledger
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

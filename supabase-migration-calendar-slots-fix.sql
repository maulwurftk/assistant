-- Fix 1: 'pending' Status in calendar_slots erlauben
-- (slot-request/route.ts setzt status='pending' wenn eine Assistentin einen Slot anfragt)
ALTER TABLE public.calendar_slots
  DROP CONSTRAINT IF EXISTS calendar_slots_status_check;

ALTER TABLE public.calendar_slots
  ADD CONSTRAINT calendar_slots_status_check
  CHECK (status IN ('open', 'pending', 'assigned', 'cancelled'));

-- Fix 2: Assistenten dürfen andere Assistenten-Profile lesen
-- (nötig für Kalender-Ansicht: Farben und Namen anderer Assistentinnen)
DROP POLICY IF EXISTS "Assistants see assistant profiles" ON public.profiles;

CREATE POLICY "Assistants see assistant profiles"
  ON public.profiles FOR SELECT
  USING (role = 'assistant' AND active = true);

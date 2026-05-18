-- Slot-Anfrage Workflow
ALTER TABLE calendar_slots
  ADD COLUMN IF NOT EXISTS pending_request_by uuid REFERENCES profiles(id);

-- Notification-Verknüpfung (falls noch nicht vorhanden)
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS related_type text,
  ADD COLUMN IF NOT EXISTS related_id text;

-- 48h-Erinnerung: verhindert Doppel-Benachrichtigungen
ALTER TABLE calendar_slots
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

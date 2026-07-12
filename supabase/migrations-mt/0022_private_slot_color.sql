-- ============================================================================
-- 0022 · Konfigurierbare Farbe für private Kalender-Termine
-- Bisher hartes Grau für is_private-Slots (0019) im Kalender. Jetzt pro
-- Mandant einstellbar über payroll_settings.private_slot_color.
-- Idempotent.
-- ============================================================================

alter table public.payroll_settings
  add column if not exists private_slot_color text not null default '#a855f7';

comment on column public.payroll_settings.private_slot_color is
  'Hex-Farbe für private (unbezahlte) Kalender-Slots im /kalender-View.';

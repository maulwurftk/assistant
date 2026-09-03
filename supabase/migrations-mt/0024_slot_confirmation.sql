-- ============================================================================
-- 0024 · Slot-Bestätigung als einzige Abrechnungsgrundlage
-- Bisher zwei parallele Wahrheiten: calendar_slots (Planung) und time_entries
-- (manuell erfasste Ist-Zeiten + Monatsbericht). Ab jetzt läuft alles über
-- den Kalender: ein zugewiesener Slot wird erst durch Bestätigung (durch die
-- Assistentin, mit ggf. korrigierter Ist-Zeit) abrechnungsrelevant.
-- time_entries bleibt als historisches Archiv bestehen, wird ab diesem
-- Zeitpunkt aber nicht mehr befüllt.
--
-- Backfill: alle bisherigen zugewiesenen Slots gelten rückwirkend als
-- bestätigt (Ist = geplante Zeit), damit sich an bereits abgerechneten
-- Monaten nichts ändert — die Lohnabrechnung nutzte ohnehin schon
-- ausschließlich assigned calendar_slots (payroll_count_mode='slots',
-- Standard/"empfohlen").
-- Idempotent.
-- ============================================================================

alter table public.calendar_slots
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid references public.profiles(id),
  add column if not exists actual_start_time time,
  add column if not exists actual_end_time time,
  add column if not exists activity_id uuid references public.activities(id),
  add column if not exists self_reported boolean not null default false;

comment on column public.calendar_slots.confirmed_at is
  'Zeitpunkt der Ist-Zeit-Bestätigung. NULL = noch nicht bestätigt, zählt nicht zur Lohnabrechnung.';
comment on column public.calendar_slots.confirmed_by is
  'Wer die Ist-Zeit bestätigt hat (i.d.R. die zugewiesene Assistentin, ggf. Admin bei Fremderfassung).';
comment on column public.calendar_slots.actual_start_time is
  'Tatsächliche Startzeit, falls abweichend von start_time. Wird bei Bestätigung gesetzt.';
comment on column public.calendar_slots.actual_end_time is
  'Tatsächliche Endzeit, falls abweichend von end_time. Wird bei Bestätigung gesetzt.';
comment on column public.calendar_slots.activity_id is
  'Tätigkeit für Nachweis/Bericht, analog time_entries.activity_id (0018).';
comment on column public.calendar_slots.self_reported is
  'true = von der Assistentin nachträglich selbst gemeldeter Slot ohne vorherige Admin-Planung. Erfordert Admin-Freigabe (status pending -> assigned via /api/slot-request), ist dabei aber bereits von der Assistentin selbst bestätigt (confirmed_at/confirmed_by bei Erstellung gesetzt).';

-- Backfill: bestehende zugewiesene Slots rückwirkend als bestätigt markieren,
-- damit bereits abgerechnete Monate unverändert bleiben.
update public.calendar_slots
set confirmed_at = created_at,
    confirmed_by = assigned_to,
    actual_start_time = start_time,
    actual_end_time = end_time
where status = 'assigned' and confirmed_at is null;

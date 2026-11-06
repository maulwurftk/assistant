-- Profile aus der Abrechnung ausnehmen (z.B. Test-Benutzer).
-- Ausgenommene Profile erscheinen nicht in Lohnübersicht, Zeitraum-Auswertung
-- und Konto-Vorschlägen. Kalender/Login bleiben unberührt.
alter table public.profiles
  add column if not exists exclude_from_payroll boolean not null default false;

-- Test-Benutzer sofort ausnehmen
update public.profiles
   set exclude_from_payroll = true
 where lower(email) = 'thomas@karas.pro';

-- ============================================================================
-- Assistenten-App · Demo-Daten für die geteilte Test-Instanz
-- ----------------------------------------------------------------------------
-- NUR für die gemeinsame Demo-Instanz (nicht für echte Instanzen!).
-- Erzeugt einen realistisch gefüllten Stand: Admin, 2 Assistenten, Einsätze,
-- Zeiteinträge, ein Monatsbericht, Benachrichtigungen und Konto-Buchungen.
--
-- VORAUSSETZUNG (einmalig vor diesem Skript, in Supabase → Authentication → Users):
--   1. schema.sql wurde bereits eingespielt.
--   2. Lege diese drei Auth-User an (jeweils "Auto Confirm User" aktivieren):
--        demo-admin@example.com        (Passwort z.B. Demo1234!)
--        demo-anna@example.com         (Passwort z.B. Demo1234!)
--        demo-ben@example.com          (Passwort z.B. Demo1234!)
--   3. Danach dieses Skript im SQL-Editor ausführen. Idempotent: mehrfach ok.
--
-- Das Skript verknüpft sich per E-Mail mit den Auth-Usern (kein manuelles
-- UUID-Kopieren nötig). Fehlt ein Auth-User, bricht es mit klarer Meldung ab.
-- ============================================================================

do $$
declare
  v_admin uuid;
  v_anna  uuid;
  v_ben   uuid;
begin
  select id into v_admin from auth.users where email = 'demo-admin@example.com';
  select id into v_anna  from auth.users where email = 'demo-anna@example.com';
  select id into v_ben   from auth.users where email = 'demo-ben@example.com';

  if v_admin is null or v_anna is null or v_ben is null then
    raise exception
      'Fehlende Auth-User. Lege zuerst demo-admin@, demo-anna@, demo-ben@example.com unter Authentication -> Users an (Auto Confirm), dann dieses Skript erneut ausfuehren.';
  end if;

  -- ── Profile (idempotent per upsert auf PK) ────────────────────────────────
  insert into public.profiles (id, email, full_name, role, color) values
    (v_admin, 'demo-admin@example.com', 'Demo Admin',   'admin',     '#6366f1'),
    (v_anna,  'demo-anna@example.com',  'Anna Assistenz','assistant', '#10b981'),
    (v_ben,   'demo-ben@example.com',   'Ben Assistenz', 'assistant', '#f59e0b')
  on conflict (id) do update
    set full_name = excluded.full_name,
        role      = excluded.role,
        color     = excluded.color,
        active    = true;

  -- ── Kalender-Slots (diesen + nächsten Monat, gemischte Status) ────────────
  -- Erst vorhandene Demo-Slots entfernen, damit das Skript wiederholbar bleibt.
  delete from public.calendar_slots where created_by = v_admin;

  insert into public.calendar_slots
    (date, start_time, end_time, title, description, assigned_to, created_by, status)
  values
    (current_date + 1,  '08:00', '12:00', 'Vormittagsassistenz', 'Begleitung Vormittag', v_anna, v_admin, 'assigned'),
    (current_date + 1,  '14:00', '18:00', 'Nachmittagsassistenz','Freizeit/Einkauf',     v_ben,  v_admin, 'assigned'),
    (current_date + 2,  '09:00', '13:00', 'Arztbegleitung',      'Facharzttermin',        v_anna, v_admin, 'assigned'),
    (current_date + 3,  '10:00', '16:00', 'Ganztagsassistenz',   'Ausflug',               null,   v_admin, 'open'),
    (current_date + 5,  '08:00', '12:00', 'Vormittagsassistenz', 'offen zur Übernahme',   null,   v_admin, 'open'),
    (current_date + 7,  '15:00', '19:00', 'Abendassistenz',      'Haushalt',              v_ben,  v_admin, 'assigned');

  -- ── Zeiteinträge (letzte Woche, bestätigt) ────────────────────────────────
  delete from public.time_entries where assistant_id in (v_anna, v_ben);

  insert into public.time_entries
    (assistant_id, date, start_time, end_time, activity_id, description, month_status)
  select v_anna, current_date - 3, '08:00'::time, '12:00'::time,
         (select id from public.activities order by sort_order limit 1),
         'Vormittagseinsatz', 'confirmed'
  union all
  select v_anna, current_date - 2, '09:00'::time, '13:00'::time,
         (select id from public.activities where name = 'Arztbegleitung' limit 1),
         'Arztbegleitung', 'confirmed'
  union all
  select v_ben,  current_date - 3, '14:00'::time, '18:00'::time,
         (select id from public.activities where name = 'Begleitung / Freizeit' limit 1),
         'Nachmittagseinsatz', 'confirmed'
  union all
  select v_ben,  current_date - 1, '15:00'::time, '19:00'::time,
         (select id from public.activities where name = 'Haushalt' limit 1),
         'Haushaltshilfe', 'draft';

  -- ── Monatsbericht (Vormonat, bestätigt) ───────────────────────────────────
  insert into public.monthly_reports (assistant_id, year, month, status, confirmed_at)
  values
    (v_anna,
     extract(year  from (current_date - interval '1 month'))::int,
     extract(month from (current_date - interval '1 month'))::int,
     'confirmed', now() - interval '5 days')
  on conflict (assistant_id, year, month) do nothing;

  -- ── Benachrichtigungen ────────────────────────────────────────────────────
  delete from public.notifications where user_id in (v_admin, v_anna, v_ben)
    and title like '[Demo]%';

  insert into public.notifications (user_id, title, message, type) values
    (v_anna,  '[Demo] Neuer Einsatz zugewiesen', 'Dir wurde ein Vormittagseinsatz zugewiesen.', 'info'),
    (v_ben,   '[Demo] Einsatz-Erinnerung',       'Dein Abendeinsatz ist in 2 Tagen.',           'info'),
    (v_admin, '[Demo] Monatsbericht bestätigt',  'Anna hat ihren Monatsbericht bestätigt.',     'success');

  -- ── Konto-Buchungen (virtuelles Kontobuch) ────────────────────────────────
  delete from public.account_ledger where created_by = v_admin and description like '[Demo]%';

  insert into public.account_ledger
    (booking_date, direction, category, amount, description, status, source, created_by)
  values
    (current_date - 10, 'in',  'Budget',       800.00, '[Demo] Monatsbudget',        'confirmed', 'manual', v_admin),
    (current_date - 8,  'out', 'Lohn',         420.00, '[Demo] Lohn Anna',           'confirmed', 'manual', v_admin),
    (current_date - 6,  'out', 'Lohn',         280.00, '[Demo] Lohn Ben',            'confirmed', 'manual', v_admin),
    (current_date - 2,  'out', 'Kontoführung',  10.00, '[Demo] Kontoführungsgebühr', 'pending',   'manual', v_admin);

  raise notice 'Demo-Daten erfolgreich eingespielt (Admin=%, Anna=%, Ben=%).', v_admin, v_anna, v_ben;
end $$;

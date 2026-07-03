-- ============================================================================
-- Assistenten-App · Komplettes Datenbankschema (Self-Host)
-- ----------------------------------------------------------------------------
-- Einmalig in einem FRISCHEN Supabase-Projekt im SQL-Editor ausführen.
-- Enthält alle Tabellen, Spalten, RLS-Policies, Trigger und Realtime.
-- Idempotent: kann gefahrlos erneut ausgeführt werden.
-- ============================================================================

-- ── Hilfsfunktionen ─────────────────────────────────────────────────────────
create or replace function public.get_my_role()
returns text language sql security definer stable as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Tabellen ────────────────────────────────────────────────────────────────

-- Profile (erweitert auth.users)
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text not null,
  full_name   text not null,
  role        text not null check (role in ('admin', 'assistant')),
  active      boolean not null default true,
  color       varchar(7) not null default '#6366f1',
  ical_token  uuid not null default gen_random_uuid(),
  rv_pflicht  boolean not null default true,
  kv_pflicht  boolean not null default true,
  iban        text,
  created_at  timestamptz not null default now()
);
create unique index if not exists profiles_ical_token_idx on public.profiles (ical_token);

-- Tätigkeiten (konfigurierbares Dropdown)
create table if not exists public.activities (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  active     boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Zeiteinträge
create table if not exists public.time_entries (
  id           uuid primary key default gen_random_uuid(),
  assistant_id uuid not null references public.profiles(id) on delete cascade,
  date         date not null,
  start_time   time not null,
  end_time     time not null,
  activity_id  uuid references public.activities(id) on delete set null,
  description  text,
  month_status text not null default 'draft' check (month_status in ('draft', 'confirmed', 'sent')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Kalender-Slots (Admin plant Einsätze)
create table if not exists public.calendar_slots (
  id                 uuid primary key default gen_random_uuid(),
  date               date not null,
  start_time         time not null,
  end_time           time not null,
  title              text not null,
  description        text,
  assigned_to        uuid references public.profiles(id) on delete set null,
  created_by         uuid not null references public.profiles(id),
  status             text not null default 'open' check (status in ('open', 'pending', 'assigned', 'cancelled')),
  pending_request_by uuid references public.profiles(id),
  reminder_sent_at   timestamptz,
  created_at         timestamptz not null default now()
);

-- Monatsberichte
create table if not exists public.monthly_reports (
  id              uuid primary key default gen_random_uuid(),
  assistant_id    uuid not null references public.profiles(id) on delete cascade,
  year            int not null,
  month           int not null,
  status          text not null default 'pending' check (status in ('pending', 'confirmed', 'sent')),
  confirmed_at    timestamptz,
  sent_at         timestamptz,
  admin_viewed_at timestamptz,
  created_at      timestamptz not null default now(),
  unique(assistant_id, year, month)
);

-- Benachrichtigungen
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  title        text not null,
  message      text not null,
  type         text not null default 'info' check (type in ('info', 'warning', 'success', 'error')),
  read         boolean not null default false,
  related_type text,
  related_id   uuid,
  created_at   timestamptz not null default now()
);

-- Lohn-Einstellungen (eine Zeile)
create table if not exists public.payroll_settings (
  id                  uuid primary key default gen_random_uuid(),
  hourly_rate         numeric(10,2) not null default 15.00,
  currency            text not null default 'EUR',
  payroll_enabled     boolean not null default true,
  payroll_count_mode  text not null default 'slots' check (payroll_count_mode in ('slots', 'entries', 'both')),
  minijob_mode        boolean not null default false,
  bezirk_mode         boolean not null default false,
  uv_rate             numeric(5,2) not null default 1.60,
  employer_name       text not null default '',
  employer_address    text not null default '',
  employer_tax_number text not null default '',
  monthly_budget      numeric(10,2) not null default 0,
  account_fee         numeric(10,2) not null default 10.00,
  weekly_hours_target numeric(5,1) not null default 15.0,
  mj_kv_ag            numeric(5,2) not null default 13.00,
  mj_rv_ag            numeric(5,2) not null default 15.00,
  mj_pauschsteuer     numeric(5,2) not null default 2.00,
  mj_u2               numeric(5,2) not null default 0.24,
  mj_insolvenzgeld    numeric(5,2) not null default 0.06,
  mj_rv_an            numeric(5,2) not null default 3.60,
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.profiles(id) on delete set null
);

-- Dokumentation versendeter Lohnabrechnungen
create table if not exists public.payroll_runs (
  id            uuid primary key default gen_random_uuid(),
  year          int not null,
  month         int not null,
  assistant_id  uuid not null references public.profiles(id) on delete cascade,
  total_minutes int not null,
  hourly_rate   numeric(10,2) not null,
  total_pay     numeric(10,2) not null,
  email_sent_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique(year, month, assistant_id)
);

-- Virtuelles Kontobuch
create table if not exists public.account_ledger (
  id           uuid primary key default gen_random_uuid(),
  booking_date date not null,
  direction    text not null check (direction in ('in', 'out')),
  category     text not null,
  amount       numeric(10,2) not null check (amount >= 0),
  description  text,
  status       text not null default 'confirmed' check (status in ('pending', 'confirmed')),
  source       text not null default 'manual' check (source in ('manual', 'auto')),
  dedup_key    text unique,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists account_ledger_date_idx on public.account_ledger (booking_date);
create index if not exists account_ledger_status_idx on public.account_ledger (status);

-- Push-Subscriptions
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  endpoint     text not null unique,
  subscription jsonb not null,
  created_at   timestamptz not null default now()
);

-- Sperrzeiten / Nicht-Verfügbarkeit
create table if not exists public.assistant_unavailability (
  id           uuid primary key default gen_random_uuid(),
  assistant_id uuid not null references public.profiles(id) on delete cascade,
  type         text not null check (type in ('single', 'recurring')),
  date         date,
  day_of_week  smallint check (day_of_week between 0 and 6),
  all_day      boolean not null default true,
  start_time   time,
  end_time     time,
  valid_from   date,
  valid_until  date,
  note         text,
  created_at   timestamptz not null default now()
);

-- ── Row Level Security aktivieren ───────────────────────────────────────────
alter table public.profiles                enable row level security;
alter table public.activities              enable row level security;
alter table public.time_entries            enable row level security;
alter table public.calendar_slots          enable row level security;
alter table public.monthly_reports         enable row level security;
alter table public.notifications           enable row level security;
alter table public.payroll_settings        enable row level security;
alter table public.payroll_runs            enable row level security;
alter table public.account_ledger          enable row level security;
alter table public.push_subscriptions      enable row level security;
alter table public.assistant_unavailability enable row level security;

-- ── Policies ────────────────────────────────────────────────────────────────
-- profiles
drop policy if exists "Users see own profile" on public.profiles;
create policy "Users see own profile" on public.profiles for select using (auth.uid() = id);
drop policy if exists "Admins see all profiles" on public.profiles;
create policy "Admins see all profiles" on public.profiles for select using (public.get_my_role() = 'admin');
drop policy if exists "Assistants see assistant profiles" on public.profiles;
create policy "Assistants see assistant profiles" on public.profiles for select using (role = 'assistant' and active = true);
drop policy if exists "Service role can insert profiles" on public.profiles;
create policy "Service role can insert profiles" on public.profiles for insert with check (true);
drop policy if exists "Admins can update profiles" on public.profiles;
create policy "Admins can update profiles" on public.profiles for update using (public.get_my_role() = 'admin');

-- activities
drop policy if exists "Anyone authenticated can view activities" on public.activities;
create policy "Anyone authenticated can view activities" on public.activities for select using (auth.uid() is not null);
drop policy if exists "Admins manage activities" on public.activities;
create policy "Admins manage activities" on public.activities for all using (public.get_my_role() = 'admin');

-- time_entries
drop policy if exists "Assistants manage own entries" on public.time_entries;
create policy "Assistants manage own entries" on public.time_entries for all using (assistant_id = auth.uid());
drop policy if exists "Admins view all entries" on public.time_entries;
create policy "Admins view all entries" on public.time_entries for select using (public.get_my_role() = 'admin');

-- calendar_slots
drop policy if exists "All authenticated users view slots" on public.calendar_slots;
create policy "All authenticated users view slots" on public.calendar_slots for select using (auth.uid() is not null);
drop policy if exists "Admins manage calendar slots" on public.calendar_slots;
create policy "Admins manage calendar slots" on public.calendar_slots for all using (public.get_my_role() = 'admin');

-- monthly_reports
drop policy if exists "Assistants view own reports" on public.monthly_reports;
create policy "Assistants view own reports" on public.monthly_reports for select using (assistant_id = auth.uid());
drop policy if exists "Assistants update own reports" on public.monthly_reports;
create policy "Assistants update own reports" on public.monthly_reports for insert with check (assistant_id = auth.uid());
drop policy if exists "Assistants can update own reports" on public.monthly_reports;
create policy "Assistants can update own reports" on public.monthly_reports for update using (assistant_id = auth.uid());
drop policy if exists "Admins manage all reports" on public.monthly_reports;
create policy "Admins manage all reports" on public.monthly_reports for all using (public.get_my_role() = 'admin');

-- notifications
drop policy if exists "Users view own notifications" on public.notifications;
create policy "Users view own notifications" on public.notifications for select using (user_id = auth.uid());
drop policy if exists "Users update own notifications" on public.notifications;
create policy "Users update own notifications" on public.notifications for update using (user_id = auth.uid());
drop policy if exists "Service role inserts notifications" on public.notifications;
create policy "Service role inserts notifications" on public.notifications for insert with check (true);

-- payroll_settings
drop policy if exists "Admins manage payroll settings" on public.payroll_settings;
create policy "Admins manage payroll settings" on public.payroll_settings for all using (public.get_my_role() = 'admin');
drop policy if exists "Authenticated users view payroll settings" on public.payroll_settings;
create policy "Authenticated users view payroll settings" on public.payroll_settings for select using (auth.uid() is not null);

-- payroll_runs
drop policy if exists "Admins manage payroll runs" on public.payroll_runs;
create policy "Admins manage payroll runs" on public.payroll_runs for all using (public.get_my_role() = 'admin');
drop policy if exists "Assistants view own payroll runs" on public.payroll_runs;
create policy "Assistants view own payroll runs" on public.payroll_runs for select using (assistant_id = auth.uid());

-- account_ledger
drop policy if exists "Admins manage ledger" on public.account_ledger;
create policy "Admins manage ledger" on public.account_ledger for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- push_subscriptions
drop policy if exists "Users manage own push subscriptions" on public.push_subscriptions;
create policy "Users manage own push subscriptions" on public.push_subscriptions for all using (user_id = auth.uid());

-- assistant_unavailability
drop policy if exists "own_entries" on public.assistant_unavailability;
create policy "own_entries" on public.assistant_unavailability for all using (auth.uid() = assistant_id);
drop policy if exists "admin_read_all" on public.assistant_unavailability;
create policy "admin_read_all" on public.assistant_unavailability for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- ── Trigger (updated_at) ────────────────────────────────────────────────────
drop trigger if exists time_entries_updated_at on public.time_entries;
create trigger time_entries_updated_at before update on public.time_entries
  for each row execute function public.set_updated_at();
drop trigger if exists payroll_settings_updated_at on public.payroll_settings;
create trigger payroll_settings_updated_at before update on public.payroll_settings
  for each row execute function public.set_updated_at();
drop trigger if exists payroll_runs_updated_at on public.payroll_runs;
create trigger payroll_runs_updated_at before update on public.payroll_runs
  for each row execute function public.set_updated_at();

-- ── Realtime ────────────────────────────────────────────────────────────────
do $$
begin
  begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.calendar_slots; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.monthly_reports; exception when duplicate_object then null; end;
end $$;

-- ── Grunddaten ──────────────────────────────────────────────────────────────
-- Eine Lohn-Einstellungszeile (danach in der App anpassen)
insert into public.payroll_settings (hourly_rate, currency)
select 15.00, 'EUR'
where not exists (select 1 from public.payroll_settings);

-- Start-Tätigkeiten (generisch – in der App anpassbar)
insert into public.activities (name, sort_order) values
  ('Persönliche Assistenz', 1),
  ('Begleitung / Freizeit', 2),
  ('Einkauf / Besorgungen', 3),
  ('Arztbegleitung', 4),
  ('Haushalt', 5),
  ('Sonstiges', 6)
on conflict do nothing;

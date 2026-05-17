-- ============================================================
-- Assistenten-App – Supabase Datenbankschema
-- Dieses SQL in der Supabase SQL-Editor ausführen
-- ============================================================

-- Profiles (erweitert auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text not null,
  role text not null check (role in ('admin', 'assistant')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Tätigkeiten (konfigurierbares Dropdown)
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Zeiteinträge
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  assistant_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  activity_id uuid references public.activities(id) on delete set null,
  description text,
  month_status text not null default 'draft' check (month_status in ('draft', 'confirmed', 'sent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Kalender-Slots (Admin plant Einsätze)
create table if not exists public.calendar_slots (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time time not null,
  end_time time not null,
  title text not null,
  description text,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  status text not null default 'open' check (status in ('open', 'assigned', 'cancelled')),
  created_at timestamptz not null default now()
);

-- Monatsberichte
create table if not exists public.monthly_reports (
  id uuid primary key default gen_random_uuid(),
  assistant_id uuid not null references public.profiles(id) on delete cascade,
  year int not null,
  month int not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'sent')),
  confirmed_at timestamptz,
  sent_at timestamptz,
  admin_viewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(assistant_id, year, month)
);

-- Benachrichtigungen
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'info' check (type in ('info', 'warning', 'success', 'error')),
  read boolean not null default false,
  related_type text,
  related_id uuid,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security aktivieren
-- ============================================================
alter table public.profiles enable row level security;
alter table public.activities enable row level security;
alter table public.time_entries enable row level security;
alter table public.calendar_slots enable row level security;
alter table public.monthly_reports enable row level security;
alter table public.notifications enable row level security;

-- ============================================================
-- Hilfsfunktion: Rolle des aktuellen Benutzers
-- ============================================================
create or replace function public.get_my_role()
returns text
language sql
security definer
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ============================================================
-- Policies: profiles
-- ============================================================
create policy "Users see own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Admins see all profiles"
  on public.profiles for select
  using (public.get_my_role() = 'admin');

create policy "Service role can insert profiles"
  on public.profiles for insert
  with check (true);

create policy "Admins can update profiles"
  on public.profiles for update
  using (public.get_my_role() = 'admin');

-- ============================================================
-- Policies: activities
-- ============================================================
create policy "Anyone authenticated can view activities"
  on public.activities for select
  using (auth.uid() is not null);

create policy "Admins manage activities"
  on public.activities for all
  using (public.get_my_role() = 'admin');

-- ============================================================
-- Policies: time_entries
-- ============================================================
create policy "Assistants manage own entries"
  on public.time_entries for all
  using (assistant_id = auth.uid());

create policy "Admins view all entries"
  on public.time_entries for select
  using (public.get_my_role() = 'admin');

-- ============================================================
-- Policies: calendar_slots
-- ============================================================
create policy "All authenticated users view slots"
  on public.calendar_slots for select
  using (auth.uid() is not null);

create policy "Admins manage calendar slots"
  on public.calendar_slots for all
  using (public.get_my_role() = 'admin');

-- ============================================================
-- Policies: monthly_reports
-- ============================================================
create policy "Assistants view own reports"
  on public.monthly_reports for select
  using (assistant_id = auth.uid());

create policy "Assistants update own reports"
  on public.monthly_reports for insert
  with check (assistant_id = auth.uid());

create policy "Assistants can update own reports"
  on public.monthly_reports for update
  using (assistant_id = auth.uid());

create policy "Admins manage all reports"
  on public.monthly_reports for all
  using (public.get_my_role() = 'admin');

-- ============================================================
-- Policies: notifications
-- ============================================================
create policy "Users view own notifications"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "Users update own notifications"
  on public.notifications for update
  using (user_id = auth.uid());

create policy "Service role inserts notifications"
  on public.notifications for insert
  with check (true);

-- ============================================================
-- Trigger: updated_at für time_entries
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger time_entries_updated_at
  before update on public.time_entries
  for each row execute function public.set_updated_at();

-- ============================================================
-- Realtime aktivieren
-- ============================================================
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.calendar_slots;
alter publication supabase_realtime add table public.monthly_reports;

-- ============================================================
-- Starter-Tätigkeiten (optional)
-- ============================================================
insert into public.activities (name, sort_order) values
  ('Ausflug', 1),
  ('Kinderzimmer aufräumen', 2),
  ('Hausaufgaben begleiten', 3),
  ('Kochen / Mahlzeiten', 4),
  ('Persönliche Pflege', 5),
  ('Arztbegleitung', 6),
  ('Einkaufen', 7),
  ('Freizeit / Spiel', 8),
  ('Transport / Fahrdienst', 9),
  ('Sonstiges', 10)
on conflict do nothing;

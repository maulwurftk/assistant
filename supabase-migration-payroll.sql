-- ============================================================
-- Lohnabrechnung – Supabase Migration
-- Dieses SQL im Supabase SQL-Editor ausführen
-- ============================================================

-- Lohnabrechnung Einstellungen (eine Zeile pro App)
create table if not exists public.payroll_settings (
  id uuid primary key default gen_random_uuid(),
  hourly_rate numeric(10,2) not null default 15.00,
  currency text not null default 'EUR',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.payroll_settings enable row level security;

create policy "Admins manage payroll settings"
  on public.payroll_settings for all
  using (public.get_my_role() = 'admin');

create policy "Authenticated users view payroll settings"
  on public.payroll_settings for select
  using (auth.uid() is not null);

create trigger payroll_settings_updated_at
  before update on public.payroll_settings
  for each row execute function public.set_updated_at();

-- Standard-Stundensatz (einmal eintragen, dann über die App anpassen)
insert into public.payroll_settings (hourly_rate, currency)
values (15.00, 'EUR')
on conflict do nothing;

-- Dokumentation versendeter Lohnabrechnungen
create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  month int not null,
  assistant_id uuid not null references public.profiles(id) on delete cascade,
  total_minutes int not null,
  hourly_rate numeric(10,2) not null,
  total_pay numeric(10,2) not null,
  email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(year, month, assistant_id)
);

alter table public.payroll_runs enable row level security;

create policy "Admins manage payroll runs"
  on public.payroll_runs for all
  using (public.get_my_role() = 'admin');

create policy "Assistants view own payroll runs"
  on public.payroll_runs for select
  using (assistant_id = auth.uid());

create trigger payroll_runs_updated_at
  before update on public.payroll_runs
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 0026 · Urlaub & Abwesenheiten (docs/urlaub-architektur.md)
--
--   employment_terms  — Vertragsbedingungen je Assistentin, zeitversioniert
--                       (Tage/Woche, Wochenstunden, Urlaubsbasis). Keine
--                       schriftlichen Verträge vorhanden → Basis für
--                       Anspruchsberechnung UND NachwG-Nachweis.
--   absences          — Urlaubsanträge/Abwesenheiten inkl. eingefrorenem
--                       Urlaubsentgelt-Snapshot (Referenzprinzip § 11 BUrlG)
--   leave_ledger      — Urlaubskonto als Buchungsjournal (Saldo = Summe)
--   vacation_notices  — Nachweis Hinweispflicht (Voraussetzung für Verfall)
--
-- Muster: tenant_id default current_tenant(), Composite-FKs (0006/0014),
-- RLS enable+force, get_my_role(). Schreibzugriffe laufen über API-Routen
-- (Service-Role + resolveTenant), RLS ist Defense-in-Depth.
-- Idempotent.
-- ============================================================================

-- ── 1) Einstellungen je Mandant ─────────────────────────────────────────────
alter table public.payroll_settings
  add column if not exists vacation_enabled        boolean      not null default false,
  add column if not exists vacation_base_days      numeric(4,1) not null default 20,
  add column if not exists vacation_holiday_region text         not null default 'BY',
  add column if not exists vacation_carryover_until text        not null default '03-31',
  add column if not exists vacation_reference_weeks int         not null default 13,
  add column if not exists vacation_notice_month   int          not null default 10;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'payroll_settings_vac_region_ck') then
    alter table public.payroll_settings add constraint payroll_settings_vac_region_ck
      check (vacation_holiday_region in ('BY','DE','AT'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payroll_settings_vac_notice_ck') then
    alter table public.payroll_settings add constraint payroll_settings_vac_notice_ck
      check (vacation_notice_month between 1 and 12);
  end if;
end $$;

comment on column public.payroll_settings.vacation_enabled is 'Modul Urlaub für diesen Mandanten aktiv.';
comment on column public.payroll_settings.vacation_base_days is 'Jahresurlaub in Arbeitstagen bei 5-Tage-Woche (DE gesetzlich 20, AT 25).';
comment on column public.payroll_settings.vacation_holiday_region is 'Feiertagskalender für die Urlaubstage-Zählung: BY (inkl. Mariä Himmelfahrt), DE (bundeseinheitlich), AT.';
comment on column public.payroll_settings.vacation_carryover_until is 'MM-DD im Folgejahr, bis zu dem Resturlaub genommen werden kann (BUrlG: 03-31).';
comment on column public.payroll_settings.vacation_notice_month is 'Monat, ab dem der Hinweis auf Resturlaub/Verfall automatisch verschickt wird.';

-- ── 2) Ein-/Austritt am Profil ──────────────────────────────────────────────
alter table public.profiles
  add column if not exists employment_start date,
  add column if not exists employment_end   date;

comment on column public.profiles.employment_start is 'Beginn des Arbeitsverhältnisses (Wartezeit/Teilurlaub § 4/5 BUrlG).';
comment on column public.profiles.employment_end   is 'Ende des Arbeitsverhältnisses, falls bekannt (Teilurlaub, Abgeltung).';

-- ── 3) employment_terms ─────────────────────────────────────────────────────
create table if not exists public.employment_terms (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default public.current_tenant()
                references public.organizations(id) on delete restrict,
  assistant_id  uuid not null references public.profiles(id) on delete cascade,
  valid_from    date not null,
  valid_until   date,
  days_per_week numeric(3,1) check (days_per_week is null or (days_per_week > 0 and days_per_week <= 6)),
  weekly_hours  numeric(5,2) check (weekly_hours is null or weekly_hours >= 0),
  base_days     numeric(4,1) check (base_days is null or base_days >= 0),
  extra_days    numeric(4,1) not null default 0 check (extra_days >= 0),
  job_title     text,
  note          text,
  notice_sent_at      timestamptz,
  notice_confirmed_at timestamptz,
  created_at    timestamptz not null default now(),
  constraint employment_terms_range_ck check (valid_until is null or valid_until >= valid_from)
);
comment on column public.employment_terms.days_per_week is 'Arbeitstage/Woche. NULL = unregelmäßig → Jahresarbeitstage-Methode aus bestätigten Diensten.';
comment on column public.employment_terms.weekly_hours  is 'Vereinbarte Wochenarbeitszeit (wichtig wg. § 12 TzBfG: ohne Vereinbarung gelten 20 h).';
comment on column public.employment_terms.base_days     is 'Urlaubsbasis bei 5-Tage-Woche. NULL = Mandanten-Default (payroll_settings.vacation_base_days).';
comment on column public.employment_terms.extra_days    is 'Zusatzurlaub in Arbeitstagen, z. B. Schwerbehinderung (§ 208 SGB IX).';

alter table public.employment_terms enable row level security;
alter table public.employment_terms force row level security;

-- ── 4) absences ─────────────────────────────────────────────────────────────
create table if not exists public.absences (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default public.current_tenant()
                  references public.organizations(id) on delete restrict,
  assistant_id    uuid not null references public.profiles(id) on delete cascade,
  type            text not null check (type in
                   ('vacation','vacation_payout','sick','sick_child','special','unpaid')),
  date_from       date not null,
  date_to         date not null,
  workdays        date[] not null default '{}',
  days            numeric(5,2) not null default 0,
  status          text not null default 'requested'
                   check (status in ('requested','approved','rejected','cancelled')),
  minutes_per_day int,
  paid_minutes    int,
  calc_snapshot   jsonb,
  note            text,
  decision_note   text,
  requested_by    uuid references public.profiles(id) on delete set null,
  decided_by      uuid references public.profiles(id) on delete set null,
  decided_at      timestamptz,
  created_at      timestamptz not null default now(),
  constraint absences_range_ck check (date_to >= date_from),
  constraint absences_id_tenant_uk unique (id, tenant_id)
);
comment on column public.absences.workdays      is 'Konkrete Arbeitstage, die als Urlaub angerechnet werden (Tage, an denen sie lt. Dienstplan gearbeitet hätte).';
comment on column public.absences.minutes_per_day is 'Bezahlte Minuten je Urlaubstag (Ø der letzten 13 Wochen), bei Genehmigung eingefroren.';
comment on column public.absences.calc_snapshot is 'Berechnungsgrundlage: { method, refFrom, refTo, refMinutes, refWorkdays, ledger: [{leave_year, days}] }.';

alter table public.absences enable row level security;
alter table public.absences force row level security;

-- ── 5) leave_ledger ─────────────────────────────────────────────────────────
create table if not exists public.leave_ledger (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default public.current_tenant()
                references public.organizations(id) on delete restrict,
  assistant_id  uuid not null references public.profiles(id) on delete cascade,
  leave_year    int  not null check (leave_year between 2000 and 2100),
  kind          text not null check (kind in
                 ('entitlement','opening_balance','taken','expired','payout','parental_reduction','correction')),
  days          numeric(6,2) not null,
  absence_id    uuid references public.absences(id) on delete set null,
  note          text,
  dedup_key     text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create unique index if not exists leave_ledger_tenant_dedup_uk
  on public.leave_ledger (tenant_id, dedup_key) where dedup_key is not null;

alter table public.leave_ledger enable row level security;
alter table public.leave_ledger force row level security;

-- ── 6) vacation_notices ─────────────────────────────────────────────────────
create table if not exists public.vacation_notices (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default public.current_tenant()
                 references public.organizations(id) on delete restrict,
  assistant_id   uuid not null references public.profiles(id) on delete cascade,
  leave_year     int  not null,
  remaining_days numeric(6,2) not null,
  expires_on     date not null,
  sent_at        timestamptz not null default now(),
  channel        text not null default 'email',
  message        text not null,
  read_at        timestamptz,
  constraint vacation_notices_once_uk unique (tenant_id, assistant_id, leave_year)
);

alter table public.vacation_notices enable row level security;
alter table public.vacation_notices force row level security;

-- ── 7) Composite-FKs (Cross-Tenant physisch unmöglich) ──────────────────────
do $$
declare r record;
begin
  for r in select * from (values
    ('employment_terms', 'assistant_id', 'profiles'),
    ('absences',         'assistant_id', 'profiles'),
    ('leave_ledger',     'assistant_id', 'profiles'),
    ('leave_ledger',     'absence_id',   'absences'),
    ('vacation_notices', 'assistant_id', 'profiles')
  ) as v(tbl, col, ref) loop
    if not exists (
      select 1 from pg_constraint
      where conname = r.tbl || '_' || r.col || '_tenant_fk'
        and conrelid = ('public.' || r.tbl)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (%I, tenant_id)
         references public.%I(id, tenant_id)',
        r.tbl, r.tbl || '_' || r.col || '_tenant_fk', r.col, r.ref);
    end if;
  end loop;
end $$;

-- ── 8) Indizes ──────────────────────────────────────────────────────────────
create index if not exists idx_employment_terms_tenant_assistant
  on public.employment_terms (tenant_id, assistant_id, valid_from);
create index if not exists idx_absences_tenant_assistant_from
  on public.absences (tenant_id, assistant_id, date_from);
create index if not exists idx_absences_tenant_status_from
  on public.absences (tenant_id, status, date_from);
create index if not exists idx_leave_ledger_tenant_assistant_year
  on public.leave_ledger (tenant_id, assistant_id, leave_year);

-- ── 9) RLS ──────────────────────────────────────────────────────────────────
-- Muster: Admin alles im Tenant; Assistentin liest nur eigene Zeilen.
-- Schreiben für Assistentinnen ausschließlich über API-Routen (Service-Role).
do $$
declare t text;
begin
  foreach t in array array['employment_terms','absences','leave_ledger','vacation_notices'] loop
    execute format('drop policy if exists %I on public.%I', t || '_own_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (tenant_id = (select public.current_tenant()) and assistant_id = auth.uid())',
      t || '_own_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using      (tenant_id = (select public.current_tenant()) and public.get_my_role() = ''admin'')
         with check (tenant_id = (select public.current_tenant()) and public.get_my_role() = ''admin'')',
      t || '_admin_all', t);
  end loop;
end $$;

-- Kalender braucht Abwesenheits-Zeiträume ALLER Kolleginnen (Blockade/Anzeige),
-- aber ohne Notizen/Entgelt → View mit security_invoker=false ist hier bewusst
-- NICHT gewählt; stattdessen liest der Kalender über die API. Keine weitere Policy.

-- ── 10) Saldo-View ──────────────────────────────────────────────────────────
create or replace view public.leave_balances
with (security_invoker = true) as
  select tenant_id, assistant_id, leave_year,
         coalesce(sum(days) filter (where days > 0), 0)        as credited,
         coalesce(-sum(days) filter (where kind = 'taken'), 0) as taken,
         coalesce(sum(days), 0)                                as balance
  from public.leave_ledger
  group by tenant_id, assistant_id, leave_year;

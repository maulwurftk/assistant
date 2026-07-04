-- ============================================================================
-- 0009 · RLS tenant-scoped auf den übrigen 10 Tabellen (Architektur §3)
-- Repliziert das in 0008 (calendar_slots) getestete Muster:
--   * Default-Deny, enable + FORCE row level security
--   * tenant_id = (select current_tenant()) in USING **und** WITH CHECK
--   * Rollenlogik immer ZUSÄTZLICH zum Tenant-Filter
--   * kein Superadmin-Bypass (D4)
-- Alte (tenant-blinde) Policies werden vollständig gedroppt — Bestand per
-- pg_policies gegen Staging verifiziert. Idempotent.
--
-- Bewusste Verschärfungen gegenüber dem Alt-Schema (Review!):
--   1. profiles: „Service role can insert profiles“ (WITH CHECK true — erlaubte
--      JEDEM eingeloggten User Profil-Inserts!) ersatzlos gestrichen. Anlage
--      läuft über Service-Role-Routen/RPC, die RLS ohnehin bypassen.
--   2. notifications: „Service role inserts notifications“ (WITH CHECK true)
--      ebenso gestrichen — gleiche Begründung.
--   3. profiles: „Assistants see assistant profiles“ war GLOBAL (Kollegen
--      fremder Mandanten sichtbar) → jetzt tenant-lokal.
-- ============================================================================

-- ── profiles ─────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

drop policy if exists "Users see own profile"             on public.profiles;
drop policy if exists "Admins see all profiles"           on public.profiles;
drop policy if exists "Assistants see assistant profiles" on public.profiles;
drop policy if exists "Service role can insert profiles"  on public.profiles;
drop policy if exists "Admins can update profiles"        on public.profiles;

drop policy if exists p_self_read on public.profiles;
create policy p_self_read on public.profiles
  for select to authenticated
  using (tenant_id = (select public.current_tenant()) and id = auth.uid());

drop policy if exists p_admin_read on public.profiles;
create policy p_admin_read on public.profiles
  for select to authenticated
  using (tenant_id = (select public.current_tenant()) and public.get_my_role() = 'admin');

drop policy if exists p_assistant_read_colleagues on public.profiles;
create policy p_assistant_read_colleagues on public.profiles
  for select to authenticated
  using (tenant_id = (select public.current_tenant()) and role = 'assistant' and active = true);

drop policy if exists p_admin_update on public.profiles;
create policy p_admin_update on public.profiles
  for update to authenticated
  using      (tenant_id = (select public.current_tenant()) and public.get_my_role() = 'admin')
  with check (tenant_id = (select public.current_tenant()) and public.get_my_role() = 'admin');
-- kein INSERT/DELETE für normale User (Provisionierung: Service-Role/RPC §4)

-- ── activities ───────────────────────────────────────────────────────────────
alter table public.activities enable row level security;
alter table public.activities force row level security;

drop policy if exists "Anyone authenticated can view activities" on public.activities;
drop policy if exists "Admins manage activities"                 on public.activities;

drop policy if exists act_tenant_read on public.activities;
create policy act_tenant_read on public.activities
  for select to authenticated
  using (tenant_id = (select public.current_tenant()));

drop policy if exists act_admin_all on public.activities;
create policy act_admin_all on public.activities
  for all to authenticated
  using      (tenant_id = (select public.current_tenant()) and public.get_my_role() = 'admin')
  with check (tenant_id = (select public.current_tenant()) and public.get_my_role() = 'admin');

-- ── time_entries (kanonisches Muster, Architektur §3.2) ─────────────────────
alter table public.time_entries enable row level security;
alter table public.time_entries force row level security;

drop policy if exists "Assistants manage own entries" on public.time_entries;
drop policy if exists "Admins view all entries"       on public.time_entries;

drop policy if exists te_assistant_rw on public.time_entries;
create policy te_assistant_rw on public.time_entries
  for all to authenticated
  using      (tenant_id = (select public.current_tenant()) and assistant_id = auth.uid())
  with check (tenant_id = (select public.current_tenant()) and assistant_id = auth.uid());

drop policy if exists te_admin_read on public.time_entries;
create policy te_admin_read on public.time_entries
  for select to authenticated
  using (tenant_id = (select public.current_tenant()) and public.get_my_role() = 'admin');

-- ── monthly_reports ──────────────────────────────────────────────────────────
alter table public.monthly_reports enable row level security;
alter table public.monthly_reports force row level security;

drop policy if exists "Assistants view own reports"       on public.monthly_reports;
drop policy if exists "Assistants update own reports"     on public.monthly_reports;
drop policy if exists "Assistants can update own reports" on public.monthly_reports;
drop policy if exists "Admins manage all reports"         on public.monthly_reports;

drop policy if exists mr_assistant_read on public.monthly_reports;
create policy mr_assistant_read on public.monthly_reports
  for select to authenticated
  using (tenant_id = (select public.current_tenant()) and assistant_id = auth.uid());

drop policy if exists mr_assistant_insert on public.monthly_reports;
create policy mr_assistant_insert on public.monthly_reports
  for insert to authenticated
  with check (tenant_id = (select public.current_tenant()) and assistant_id = auth.uid());

drop policy if exists mr_assistant_update on public.monthly_reports;
create policy mr_assistant_update on public.monthly_reports
  for update to authenticated
  using      (tenant_id = (select public.current_tenant()) and assistant_id = auth.uid())
  with check (tenant_id = (select public.current_tenant()) and assistant_id = auth.uid());

drop policy if exists mr_admin_all on public.monthly_reports;
create policy mr_admin_all on public.monthly_reports
  for all to authenticated
  using      (tenant_id = (select public.current_tenant()) and public.get_my_role() = 'admin')
  with check (tenant_id = (select public.current_tenant()) and public.get_my_role() = 'admin');

-- ── notifications ────────────────────────────────────────────────────────────
alter table public.notifications enable row level security;
alter table public.notifications force row level security;

drop policy if exists "Users view own notifications"        on public.notifications;
drop policy if exists "Users update own notifications"      on public.notifications;
drop policy if exists "Service role inserts notifications"  on public.notifications;

drop policy if exists n_user_read on public.notifications;
create policy n_user_read on public.notifications
  for select to authenticated
  using (tenant_id = (select public.current_tenant()) and user_id = auth.uid());

drop policy if exists n_user_update on public.notifications;
create policy n_user_update on public.notifications
  for update to authenticated
  using      (tenant_id = (select public.current_tenant()) and user_id = auth.uid())
  with check (tenant_id = (select public.current_tenant()) and user_id = auth.uid());
-- kein INSERT für normale User: Benachrichtigungen erzeugt der Server (Service-Role)

-- ── payroll_settings ─────────────────────────────────────────────────────────
alter table public.payroll_settings enable row level security;
alter table public.payroll_settings force row level security;

drop policy if exists "Admins manage payroll settings"             on public.payroll_settings;
drop policy if exists "Authenticated users view payroll settings"  on public.payroll_settings;

drop policy if exists ps_tenant_read on public.payroll_settings;
create policy ps_tenant_read on public.payroll_settings
  for select to authenticated
  using (tenant_id = (select public.current_tenant()));

drop policy if exists ps_admin_all on public.payroll_settings;
create policy ps_admin_all on public.payroll_settings
  for all to authenticated
  using      (tenant_id = (select public.current_tenant()) and public.get_my_role() = 'admin')
  with check (tenant_id = (select public.current_tenant()) and public.get_my_role() = 'admin');

-- ── payroll_runs ─────────────────────────────────────────────────────────────
alter table public.payroll_runs enable row level security;
alter table public.payroll_runs force row level security;

drop policy if exists "Admins manage payroll runs"        on public.payroll_runs;
drop policy if exists "Assistants view own payroll runs"  on public.payroll_runs;

drop policy if exists pr_assistant_read on public.payroll_runs;
create policy pr_assistant_read on public.payroll_runs
  for select to authenticated
  using (tenant_id = (select public.current_tenant()) and assistant_id = auth.uid());

drop policy if exists pr_admin_all on public.payroll_runs;
create policy pr_admin_all on public.payroll_runs
  for all to authenticated
  using      (tenant_id = (select public.current_tenant()) and public.get_my_role() = 'admin')
  with check (tenant_id = (select public.current_tenant()) and public.get_my_role() = 'admin');

-- ── account_ledger ───────────────────────────────────────────────────────────
alter table public.account_ledger enable row level security;
alter table public.account_ledger force row level security;

drop policy if exists "Admins manage ledger" on public.account_ledger;

drop policy if exists al_admin_all on public.account_ledger;
create policy al_admin_all on public.account_ledger
  for all to authenticated
  using      (tenant_id = (select public.current_tenant()) and public.get_my_role() = 'admin')
  with check (tenant_id = (select public.current_tenant()) and public.get_my_role() = 'admin');

-- ── push_subscriptions ───────────────────────────────────────────────────────
alter table public.push_subscriptions enable row level security;
alter table public.push_subscriptions force row level security;

drop policy if exists "Users manage own push subscriptions" on public.push_subscriptions;

drop policy if exists push_user_rw on public.push_subscriptions;
create policy push_user_rw on public.push_subscriptions
  for all to authenticated
  using      (tenant_id = (select public.current_tenant()) and user_id = auth.uid())
  with check (tenant_id = (select public.current_tenant()) and user_id = auth.uid());

-- ── assistant_unavailability ─────────────────────────────────────────────────
alter table public.assistant_unavailability enable row level security;
alter table public.assistant_unavailability force row level security;

drop policy if exists own_entries    on public.assistant_unavailability;
drop policy if exists admin_read_all on public.assistant_unavailability;

drop policy if exists au_own_rw on public.assistant_unavailability;
create policy au_own_rw on public.assistant_unavailability
  for all to authenticated
  using      (tenant_id = (select public.current_tenant()) and assistant_id = auth.uid())
  with check (tenant_id = (select public.current_tenant()) and assistant_id = auth.uid());

drop policy if exists au_admin_read on public.assistant_unavailability;
create policy au_admin_read on public.assistant_unavailability
  for select to authenticated
  using (tenant_id = (select public.current_tenant()) and public.get_my_role() = 'admin');

-- ── organizations: force ergänzen (enable kam in 0001, Policy in 0008) ──────
alter table public.organizations force row level security;

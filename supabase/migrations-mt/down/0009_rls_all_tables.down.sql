-- Rollback 0009: alte (tenant-blinde) Policies aus schema.sql wiederherstellen.
-- ⚠️ Stellt auch die beiden offenen INSERT-Policies (WITH CHECK true) wieder her.

-- profiles
drop policy if exists p_self_read on public.profiles;
drop policy if exists p_admin_read on public.profiles;
drop policy if exists p_assistant_read_colleagues on public.profiles;
drop policy if exists p_admin_update on public.profiles;
alter table public.profiles no force row level security;
create policy "Users see own profile" on public.profiles for select using (auth.uid() = id);
create policy "Admins see all profiles" on public.profiles for select using (public.get_my_role() = 'admin');
create policy "Assistants see assistant profiles" on public.profiles for select using (role = 'assistant' and active = true);
create policy "Service role can insert profiles" on public.profiles for insert with check (true);
create policy "Admins can update profiles" on public.profiles for update using (public.get_my_role() = 'admin');

-- activities
drop policy if exists act_tenant_read on public.activities;
drop policy if exists act_admin_all on public.activities;
alter table public.activities no force row level security;
create policy "Anyone authenticated can view activities" on public.activities for select using (auth.uid() is not null);
create policy "Admins manage activities" on public.activities for all using (public.get_my_role() = 'admin');

-- time_entries
drop policy if exists te_assistant_rw on public.time_entries;
drop policy if exists te_admin_read on public.time_entries;
alter table public.time_entries no force row level security;
create policy "Assistants manage own entries" on public.time_entries for all using (assistant_id = auth.uid());
create policy "Admins view all entries" on public.time_entries for select using (public.get_my_role() = 'admin');

-- monthly_reports
drop policy if exists mr_assistant_read on public.monthly_reports;
drop policy if exists mr_assistant_insert on public.monthly_reports;
drop policy if exists mr_assistant_update on public.monthly_reports;
drop policy if exists mr_admin_all on public.monthly_reports;
alter table public.monthly_reports no force row level security;
create policy "Assistants view own reports" on public.monthly_reports for select using (assistant_id = auth.uid());
create policy "Assistants update own reports" on public.monthly_reports for insert with check (assistant_id = auth.uid());
create policy "Assistants can update own reports" on public.monthly_reports for update using (assistant_id = auth.uid());
create policy "Admins manage all reports" on public.monthly_reports for all using (public.get_my_role() = 'admin');

-- notifications
drop policy if exists n_user_read on public.notifications;
drop policy if exists n_user_update on public.notifications;
alter table public.notifications no force row level security;
create policy "Users view own notifications" on public.notifications for select using (user_id = auth.uid());
create policy "Users update own notifications" on public.notifications for update using (user_id = auth.uid());
create policy "Service role inserts notifications" on public.notifications for insert with check (true);

-- payroll_settings
drop policy if exists ps_tenant_read on public.payroll_settings;
drop policy if exists ps_admin_all on public.payroll_settings;
alter table public.payroll_settings no force row level security;
create policy "Admins manage payroll settings" on public.payroll_settings for all using (public.get_my_role() = 'admin');
create policy "Authenticated users view payroll settings" on public.payroll_settings for select using (auth.uid() is not null);

-- payroll_runs
drop policy if exists pr_assistant_read on public.payroll_runs;
drop policy if exists pr_admin_all on public.payroll_runs;
alter table public.payroll_runs no force row level security;
create policy "Admins manage payroll runs" on public.payroll_runs for all using (public.get_my_role() = 'admin');
create policy "Assistants view own payroll runs" on public.payroll_runs for select using (assistant_id = auth.uid());

-- account_ledger
drop policy if exists al_admin_all on public.account_ledger;
alter table public.account_ledger no force row level security;
create policy "Admins manage ledger" on public.account_ledger for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- push_subscriptions
drop policy if exists push_user_rw on public.push_subscriptions;
alter table public.push_subscriptions no force row level security;
create policy "Users manage own push subscriptions" on public.push_subscriptions for all using (user_id = auth.uid());

-- assistant_unavailability
drop policy if exists au_own_rw on public.assistant_unavailability;
drop policy if exists au_admin_read on public.assistant_unavailability;
alter table public.assistant_unavailability no force row level security;
create policy "own_entries" on public.assistant_unavailability for all using (auth.uid() = assistant_id);
create policy "admin_read_all" on public.assistant_unavailability for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- organizations
alter table public.organizations no force row level security;

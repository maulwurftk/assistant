-- ============================================================================
-- 0007 · Tenant-führende Indizes (Architektur §1.3)
-- Jede Fachquery filtert künftig auf tenant_id → führende Spalte in den
-- relevanten Kombi-Indizes; Solo-Index nur, wo keine sinnvolle Kombination.
-- Idempotent.
-- ============================================================================

create index if not exists time_entries_tenant_date_idx
  on public.time_entries (tenant_id, date);

create index if not exists calendar_slots_tenant_status_start_idx
  on public.calendar_slots (tenant_id, status, start_time);

create index if not exists monthly_reports_tenant_assistant_ym_idx
  on public.monthly_reports (tenant_id, assistant_id, year, month);

create index if not exists notifications_tenant_user_read_idx
  on public.notifications (tenant_id, user_id, read);

create index if not exists payroll_runs_tenant_ym_idx
  on public.payroll_runs (tenant_id, year, month);

create index if not exists account_ledger_tenant_date_idx
  on public.account_ledger (tenant_id, booking_date);

create index if not exists assistant_unavailability_tenant_assistant_idx
  on public.assistant_unavailability (tenant_id, assistant_id);

create index if not exists push_subscriptions_tenant_user_idx
  on public.push_subscriptions (tenant_id, user_id);

-- Solo-Indizes (keine sinnvolle Kombination):
create index if not exists profiles_tenant_idx   on public.profiles (tenant_id);
create index if not exists activities_tenant_idx on public.activities (tenant_id);
-- payroll_settings: unique (tenant_id) aus 0006 liefert den Index bereits.

-- ============================================================================
-- 0002 · tenant_id (nullable) auf allen 11 Fachtabellen (Architektur §1.2, §6 Schritt 1)
-- Idempotent. FK/NOT NULL kommen erst in 0006 (nach dem Backfill 0005).
-- ============================================================================

alter table public.profiles                 add column if not exists tenant_id uuid;
alter table public.activities               add column if not exists tenant_id uuid;
alter table public.time_entries             add column if not exists tenant_id uuid;
alter table public.calendar_slots           add column if not exists tenant_id uuid;
alter table public.monthly_reports          add column if not exists tenant_id uuid;
alter table public.notifications            add column if not exists tenant_id uuid;
alter table public.payroll_settings         add column if not exists tenant_id uuid;
alter table public.payroll_runs             add column if not exists tenant_id uuid;
alter table public.account_ledger           add column if not exists tenant_id uuid;
alter table public.push_subscriptions       add column if not exists tenant_id uuid;
alter table public.assistant_unavailability add column if not exists tenant_id uuid;

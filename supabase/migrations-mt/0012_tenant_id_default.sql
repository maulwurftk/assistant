-- ============================================================================
-- 0012 · tenant_id DEFAULT current_tenant() auf allen 11 Fachtabellen
--
-- Zweck: user-scoped Inserts (Pages, RLS-geschützte Routen) brauchen die
-- tenant_id nicht mehr mitzugeben — die DB füllt sie aus der Session, und
-- WITH CHECK (0008/0009) validiert sie. Für die SERVICE-ROLE liefert
-- current_tenant() NULL (kein auth.uid()) → Insert ohne explizite tenant_id
-- scheitert laut an NOT NULL. Genau richtig: kein stilles Cross-Tenant-Leck,
-- Service-Role-Code MUSS den Tenant explizit setzen (Architektur §5.1).
-- Idempotent.
-- ============================================================================

alter table public.profiles                 alter column tenant_id set default public.current_tenant();
alter table public.activities               alter column tenant_id set default public.current_tenant();
alter table public.time_entries             alter column tenant_id set default public.current_tenant();
alter table public.calendar_slots           alter column tenant_id set default public.current_tenant();
alter table public.monthly_reports          alter column tenant_id set default public.current_tenant();
alter table public.notifications            alter column tenant_id set default public.current_tenant();
alter table public.payroll_settings         alter column tenant_id set default public.current_tenant();
alter table public.payroll_runs             alter column tenant_id set default public.current_tenant();
alter table public.account_ledger           alter column tenant_id set default public.current_tenant();
alter table public.push_subscriptions       alter column tenant_id set default public.current_tenant();
alter table public.assistant_unavailability alter column tenant_id set default public.current_tenant();

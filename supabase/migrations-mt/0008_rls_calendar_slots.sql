-- ============================================================================
-- 0008 · RLS-BLAUPAUSE: calendar_slots tenant-scoped (Architektur §3)
-- Erst diese eine Tabelle end-to-end inkl. Cross-Tenant-Test — dann 0009
-- auf die übrigen 10 Tabellen replizieren.
--
-- Muster: Default-Deny; JEDE Policy prüft tenant_id = (select current_tenant())
-- in USING **und** WITH CHECK; Rollenlogik immer ZUSÄTZLICH zum Tenant-Filter.
-- Kein Superadmin-Bypass (D4). Idempotent.
--
-- ⚠️ Erst NACH Backfill (0005) + NOT NULL (0006) einspielen — sonst sperren
--    sich Bestandszeilen mit tenant_id NULL selbst aus (Architektur §6).
-- ============================================================================

-- ── organizations: eigene Org lesen (§3.3) — hier, weil erste RLS-Migration ─
drop policy if exists org_self_read on public.organizations;
create policy org_self_read on public.organizations
  for select to authenticated
  using (id = (select public.current_tenant()));
-- KEINE Insert/Update/Delete-Policies: Anlage/Änderung nur via Service-Role (§4).

-- ── calendar_slots ───────────────────────────────────────────────────────────
alter table public.calendar_slots enable row level security;
alter table public.calendar_slots force row level security;  -- gilt auch für Tabellen-Owner

-- Alte (tenant-blinde) Policies entfernen — sie würden per OR alles wieder öffnen:
drop policy if exists "All authenticated users view slots" on public.calendar_slots;
drop policy if exists "Admins manage calendar slots" on public.calendar_slots;

-- Lesen: alle User des eigenen Tenants (entspricht bisherigem Verhalten,
-- Assistenten sehen offene Slots — jetzt tenant-lokal):
drop policy if exists cs_tenant_read on public.calendar_slots;
create policy cs_tenant_read on public.calendar_slots
  for select to authenticated
  using (tenant_id = (select public.current_tenant()));

-- Schreiben: nur Admins des eigenen Tenants (Slot-Requests der Assistenten
-- laufen wie bisher über die Service-Role-Route api/slot-request):
drop policy if exists cs_admin_all on public.calendar_slots;
create policy cs_admin_all on public.calendar_slots
  for all to authenticated
  using      (tenant_id = (select public.current_tenant()) and public.get_my_role() = 'admin')
  with check (tenant_id = (select public.current_tenant()) and public.get_my_role() = 'admin');

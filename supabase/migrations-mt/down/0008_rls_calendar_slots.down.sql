-- Rollback 0008: alte (tenant-blinde) Policies wiederherstellen (aus schema.sql)
drop policy if exists cs_tenant_read on public.calendar_slots;
drop policy if exists cs_admin_all on public.calendar_slots;
alter table public.calendar_slots no force row level security;

drop policy if exists "All authenticated users view slots" on public.calendar_slots;
create policy "All authenticated users view slots" on public.calendar_slots
  for select using (auth.uid() is not null);
drop policy if exists "Admins manage calendar slots" on public.calendar_slots;
create policy "Admins manage calendar slots" on public.calendar_slots
  for all using (public.get_my_role() = 'admin');

drop policy if exists org_self_read on public.organizations;

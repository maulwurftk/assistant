-- ============================================================================
-- 0014 · To-do-Feature (docs/todo-feature-architektur.md, Entscheidungen §7)
--
-- Drei Tabellen:
--   todo_templates — wiederkehrende Aufgaben als Definition (per_shift/daily/weekly)
--   todo_checks    — sparse Erledigungen (Zeile entsteht erst beim Abhaken)
--   todos          — einmalige Aufgaben mit Status
--
-- Entscheidungen: pro Dienst (nicht pro Tag), assignee_id optional,
-- MIT Abnahme (confirmed_by/confirmed_at), daily/weekly im MVP,
-- keine Fotos, Zeiteintrag-Kopplung v2.
--
-- Muster: Composite-FKs wie 0006 (Cross-Tenant physisch unmöglich),
-- RLS wie 0008/0009 (enable + force, (select current_tenant()), get_my_role()),
-- RPC complete_todo im Stil von provision_tenant (0010/0013).
-- Idempotent — mehrfach ausführbar.
-- ============================================================================

-- ── 1) Kandidatenschlüssel für Composite-FKs auf activities/calendar_slots ──
--       (profiles_id_tenant_uk existiert seit 0006; activities/calendar_slots
--        wurden bisher nirgends composite referenziert → hier nachziehen)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'activities_id_tenant_uk') then
    alter table public.activities add constraint activities_id_tenant_uk unique (id, tenant_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'calendar_slots_id_tenant_uk') then
    alter table public.calendar_slots add constraint calendar_slots_id_tenant_uk unique (id, tenant_id);
  end if;
end $$;

-- ── 2) todo_templates ───────────────────────────────────────────────────────
create table if not exists public.todo_templates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default public.current_tenant()
              references public.organizations(id) on delete restrict,
  title       text not null check (length(title) >= 1),
  description text,
  activity_id uuid references public.activities(id) on delete set null,
  recurrence  text not null default 'per_shift'
              check (recurrence in ('per_shift','daily','weekly')),
  weekday     int check (weekday between 0 and 6),
  assignee_id uuid references public.profiles(id) on delete set null,  -- null = alle
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  -- weekly braucht weekday, sonst keiner:
  constraint todo_templates_weekday_ck
    check ((recurrence = 'weekly') = (weekday is not null)),
  -- Kandidatenschlüssel für Composite-FK aus todo_checks:
  constraint todo_templates_id_tenant_uk unique (id, tenant_id)
);

alter table public.todo_templates enable row level security;
alter table public.todo_templates force row level security;

-- ── 3) todo_checks (sparse: Zeile = Fakt "abgehakt") ────────────────────────
create table if not exists public.todo_checks (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null default public.current_tenant()
               references public.organizations(id) on delete restrict,
  template_id  uuid not null references public.todo_templates(id) on delete cascade,
  slot_id      uuid references public.calendar_slots(id) on delete set null, -- per_shift
  check_date   date not null default current_date,   -- Bezugstag (immer gefüllt)
  done_by      uuid not null references public.profiles(id),
  done_at      timestamptz not null default now(),
  note         text,
  confirmed_by uuid references public.profiles(id) on delete set null,  -- Abnahme (§7.3)
  confirmed_at timestamptz,
  constraint todo_checks_confirm_ck
    check ((confirmed_by is null) = (confirmed_at is null))
);

alter table public.todo_checks enable row level security;
alter table public.todo_checks force row level security;

-- Eindeutigkeit: pro Dienst 1× (per_shift) bzw. pro Tag 1× (daily/weekly).
-- Partielle Unique-Indizes statt Table-Constraint (slot_id ist nullable):
create unique index if not exists todo_checks_template_slot_uk
  on public.todo_checks (template_id, slot_id) where slot_id is not null;
create unique index if not exists todo_checks_template_date_uk
  on public.todo_checks (template_id, check_date) where slot_id is null;

-- ── 4) todos (einmalige Aufgaben) ───────────────────────────────────────────
create table if not exists public.todos (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null default public.current_tenant()
               references public.organizations(id) on delete restrict,
  title        text not null check (length(title) >= 1),
  description  text,
  activity_id  uuid references public.activities(id) on delete set null,
  assignee_id  uuid references public.profiles(id) on delete set null,  -- null = wer zuerst kann
  due_date     date,
  status       text not null default 'open' check (status in ('open','done','cancelled')),
  done_by      uuid references public.profiles(id) on delete set null,
  done_at      timestamptz,
  note         text,                                  -- Rückmeldung des Assistenten
  confirmed_by uuid references public.profiles(id) on delete set null,  -- Abnahme (§7.3)
  confirmed_at timestamptz,
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now(),
  constraint todos_confirm_ck
    check ((confirmed_by is null) = (confirmed_at is null)),
  constraint todos_done_ck
    check (status <> 'done' or (done_by is not null and done_at is not null))
);

alter table public.todos enable row level security;
alter table public.todos force row level security;

-- ── 5) Composite-FKs (Muster 0006: Einspalten-FK liefert Delete-Semantik,
--       Composite-FK (NO ACTION, MATCH SIMPLE) verhindert Cross-Tenant) ─────
do $$
declare
  r record;
begin
  for r in select * from (values
    -- (tabelle, spalte, zieltabelle)
    ('todo_templates', 'activity_id',  'activities'),
    ('todo_templates', 'assignee_id',  'profiles'),
    ('todo_checks',    'template_id',  'todo_templates'),
    ('todo_checks',    'slot_id',      'calendar_slots'),
    ('todo_checks',    'done_by',      'profiles'),
    ('todo_checks',    'confirmed_by', 'profiles'),
    ('todos',          'activity_id',  'activities'),
    ('todos',          'assignee_id',  'profiles'),
    ('todos',          'done_by',      'profiles'),
    ('todos',          'confirmed_by', 'profiles'),
    ('todos',          'created_by',   'profiles')
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

-- ── 6) Indizes (tenant_id führend, Muster 0007) ─────────────────────────────
create index if not exists idx_todo_templates_tenant
  on public.todo_templates (tenant_id, active, sort_order);
create index if not exists idx_todo_checks_tenant_slot
  on public.todo_checks (tenant_id, slot_id);
create index if not exists idx_todo_checks_tenant_date
  on public.todo_checks (tenant_id, check_date);
create index if not exists idx_todos_tenant_status
  on public.todos (tenant_id, status, due_date);

-- ── 7) RLS-Policies ─────────────────────────────────────────────────────────

-- todo_templates: alle im Tenant lesen, nur Admin schreibt (Muster cs_*)
drop policy if exists ttpl_tenant_read on public.todo_templates;
create policy ttpl_tenant_read on public.todo_templates
  for select to authenticated
  using (tenant_id = (select public.current_tenant()));

drop policy if exists ttpl_admin_all on public.todo_templates;
create policy ttpl_admin_all on public.todo_templates
  for all to authenticated
  using      (tenant_id = (select public.current_tenant()) and public.get_my_role() = 'admin')
  with check (tenant_id = (select public.current_tenant()) and public.get_my_role() = 'admin');

-- todo_checks: alle im Tenant lesen; Assistent hakt nur selbst ab (done_by = ich,
-- keine Abnahme-Felder, Template muss für mich gelten); Admin alles;
-- Assistent darf eigenen, unbestätigten Check < 24 h löschen („aus Versehen").
drop policy if exists tc_tenant_read on public.todo_checks;
create policy tc_tenant_read on public.todo_checks
  for select to authenticated
  using (tenant_id = (select public.current_tenant()));

drop policy if exists tc_assistant_insert on public.todo_checks;
create policy tc_assistant_insert on public.todo_checks
  for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant())
    and done_by = auth.uid()
    and confirmed_by is null and confirmed_at is null
    and exists (
      select 1 from public.todo_templates t
      where t.id = template_id
        and t.tenant_id = (select public.current_tenant())
        and t.active
        and (t.assignee_id is null or t.assignee_id = auth.uid())
    )
  );

drop policy if exists tc_assistant_delete_own on public.todo_checks;
create policy tc_assistant_delete_own on public.todo_checks
  for delete to authenticated
  using (
    tenant_id = (select public.current_tenant())
    and done_by = auth.uid()
    and confirmed_at is null
    and done_at > now() - interval '24 hours'
  );

drop policy if exists tc_admin_all on public.todo_checks;
create policy tc_admin_all on public.todo_checks
  for all to authenticated
  using      (tenant_id = (select public.current_tenant()) and public.get_my_role() = 'admin')
  with check (tenant_id = (select public.current_tenant()) and public.get_my_role() = 'admin');

-- todos: alle im Tenant lesen; nur Admin schreibt direkt.
-- Assistenten erledigen AUSSCHLIESSLICH über RPC complete_todo (spaltengenau).
drop policy if exists td_tenant_read on public.todos;
create policy td_tenant_read on public.todos
  for select to authenticated
  using (tenant_id = (select public.current_tenant()));

drop policy if exists td_admin_all on public.todos;
create policy td_admin_all on public.todos
  for all to authenticated
  using      (tenant_id = (select public.current_tenant()) and public.get_my_role() = 'admin')
  with check (tenant_id = (select public.current_tenant()) and public.get_my_role() = 'admin');

-- ── 8) RPC complete_todo — wasserdichtes Erledigen für Assistenten ──────────
--       (Stil 0010/0013: security definer, search_path, Guards, Grants)
create or replace function public.complete_todo(p_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_role   text;
  v_todo   public.todos%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select tenant_id, role into v_tenant, v_role
  from public.profiles where id = auth.uid();
  if v_tenant is null then
    raise exception 'no tenant for caller';
  end if;

  select * into v_todo
  from public.todos
  where id = p_id and tenant_id = v_tenant
  for update;
  if not found then
    raise exception 'todo not found';
  end if;

  if v_todo.status <> 'open' then
    raise exception 'todo is not open (status: %)', v_todo.status;
  end if;

  -- Assistent: nur unzugewiesene oder mir zugewiesene Aufgaben
  if v_role <> 'admin'
     and v_todo.assignee_id is not null
     and v_todo.assignee_id <> auth.uid() then
    raise exception 'todo is assigned to someone else';
  end if;

  update public.todos
  set status  = 'done',
      done_by = auth.uid(),
      done_at = now(),
      note    = coalesce(p_note, note)
  where id = p_id;

  return jsonb_build_object('id', p_id, 'status', 'done', 'done_at', now());
end $$;

revoke all on function public.complete_todo(uuid, text) from public;
grant execute on function public.complete_todo(uuid, text) to authenticated;

-- ── 9) Realtime (Erledigt-Zustand live, Muster schema.sql) ──────────────────
do $$ begin
  begin
    alter publication supabase_realtime add table public.todos;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.todo_checks;
  exception when duplicate_object then null;
  end;
end $$;

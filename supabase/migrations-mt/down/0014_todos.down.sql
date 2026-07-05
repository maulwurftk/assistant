-- ============================================================================
-- 0014 · Rollback To-do-Feature
-- Reihenfolge umgekehrt zu 0014_todos.sql. Idempotent.
-- ============================================================================

-- Realtime-Publication
do $$ begin
  begin
    alter publication supabase_realtime drop table public.todos;
  exception when undefined_object or undefined_table then null;
  end;
  begin
    alter publication supabase_realtime drop table public.todo_checks;
  exception when undefined_object or undefined_table then null;
  end;
end $$;

-- RPC
drop function if exists public.complete_todo(uuid, text);

-- Tabellen (Policies, Indizes, Constraints fallen mit)
drop table if exists public.todo_checks;
drop table if exists public.todos;
drop table if exists public.todo_templates;

-- In 0014 ergänzte Kandidatenschlüssel auf Bestandstabellen
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'activities_id_tenant_uk') then
    alter table public.activities drop constraint activities_id_tenant_uk;
  end if;
  if exists (select 1 from pg_constraint where conname = 'calendar_slots_id_tenant_uk') then
    alter table public.calendar_slots drop constraint calendar_slots_id_tenant_uk;
  end if;
end $$;

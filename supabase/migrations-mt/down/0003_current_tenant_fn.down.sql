-- Rollback 0003 (scheitert absichtlich, solange Policies die Funktion nutzen — erst 0008-down)
drop function if exists public.current_tenant();

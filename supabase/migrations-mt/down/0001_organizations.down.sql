-- Rollback 0001 (setzt voraus: 0002-down ist gelaufen — FKs weg)
drop table if exists public.organizations;

-- ============================================================================
-- 0001 · Wurzeltabelle organizations (Architektur §1.1)
-- Idempotent. Kein owner_id-FK (Owner = erster Admin des Tenants).
-- slug ist rein kosmetisch — NIE Security-relevant.
-- ============================================================================

create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(name) >= 3),
  slug       text not null unique,
  status     text not null default 'active' check (status in ('active','suspended','deleted')),
  plan       text not null default 'free',
  created_at timestamptz not null default now()
);

-- RLS: Default-Deny; einzige Policy = eigenen Mandanten lesen (Architektur §3.3).
-- Die Policy selbst kommt in 0008/0009 (nach current_tenant()); hier nur aktivieren,
-- damit die Tabelle nie ungeschützt ist. Service-Role bypasst RLS ohnehin.
alter table public.organizations enable row level security;

-- ============================================================================
-- 0004 · platform_admins — Superadmin-Identität OHNE RLS-Bypass (Architektur §1.6, D4)
-- Kein profiles-Eintrag, kein Fachtabellen-Zugriff. Genutzt nur von auditierten
-- Service-Role-Routen. RLS aktiv, KEINE Policies → Default-Deny für alle User.
-- ============================================================================

create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
alter table public.platform_admins force row level security;

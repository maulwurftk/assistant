-- ============================================================================
-- 0016 · Google-Kalender-Feed pro Mandant statt global (Security-Fix)
-- Vorher: GOOGLE_CALENDAR_ICAL_URL war eine einzige Vercel-Env-Var → alle
-- Admins aller Mandanten sahen denselben (Karas-)Kalender in /kalender.
-- Jetzt: Spalte je Organisation. Befüllung nur via Service-Role/Superadmin
-- (analog zu organizations.notes aus 0015) — KEINE Insert/Update-Policy nötig,
-- org_self_read (0008) deckt das Lesen der eigenen Org bereits ab.
-- Idempotent.
-- ============================================================================

alter table public.organizations
  add column if not exists google_calendar_ical_url text;

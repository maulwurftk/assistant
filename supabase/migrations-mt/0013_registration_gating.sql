-- ============================================================================
-- 0013 · Registrierungs-Gating (Scan D1, Invite-Gating)
-- platform_settings.registration_mode: 'open' | 'code' | 'closed'
--   open   → jeder darf sich registrieren (Verhalten wie bisher)
--   code   → nur mit gültigem Einladungscode (registration_codes)
--   closed → niemand
-- Guard sitzt IN provision_tenant (SECURITY DEFINER) und blockt damit auch
-- direkte RPC-Aufrufe — nicht nur die UI. Codes werden transaktional
-- verbraucht (atomarer UPDATE mit Row-Lock, kein Race bei Parallel-Nutzung).
-- Initialwert 'open', damit Staging/Tests unverändert laufen; auf Prod nach
-- dem Einspielen bewusst auf 'code' stellen (Betrieb, kein Migrations-Teil):
--   update platform_settings set value = '"code"' where key = 'registration_mode';
--   insert into registration_codes (code, max_uses, note) values ('…', 1, '…');
-- ============================================================================

-- --- Plattform-Einstellungen (Key-Value, bewusst generisch) -----------------
create table if not exists public.platform_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;

-- Die UI (auch unauthentifiziert auf /registrieren) darf NUR den
-- Registrierungs-Modus lesen; alles andere bleibt unsichtbar.
-- Schreiben: keine Policy → nur service_role/Migrationen.
drop policy if exists platform_settings_read_registration_mode on public.platform_settings;
create policy platform_settings_read_registration_mode
  on public.platform_settings for select
  to anon, authenticated
  using (key = 'registration_mode');

insert into public.platform_settings (key, value)
values ('registration_mode', '"open"'::jsonb)
on conflict (key) do nothing;

-- --- Einladungscodes ---------------------------------------------------------
-- Mehrfach-Nutzung über max_uses (z. B. Partner-Codes), Ablauf über expires_at.
-- Später: Bezahl-Flow (z. B. Stripe-Webhook) legt Einmal-Codes an.
create table if not exists public.registration_codes (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  max_uses   integer not null default 1 check (max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  expires_at timestamptz,
  note       text,
  created_at timestamptz not null default now()
);

alter table public.registration_codes enable row level security;
-- Keine Policies: Codes sind für anon/authenticated komplett unsichtbar.
-- Validierung/Verbrauch passiert ausschließlich in provision_tenant (definer).

-- --- provision_tenant um Code-Guard erweitern --------------------------------
-- Alte 2-Arg-Signatur MUSS weg, sonst bliebe eine Guard-freie Überladung
-- aufrufbar. p_code hat Default → bestehende 2-Arg-Aufrufe funktionieren
-- weiter (und laufen in den Guard).
drop function if exists public.provision_tenant(text, text);

create function public.provision_tenant(p_org_name text, p_slug text, p_code text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_slug text;
  v_mode text;
  v_code_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Ein bereits zugeordneter User darf keinen zweiten Tenant erzeugen (D0):
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'user already provisioned';
  end if;

  -- Registrierungs-Gating (D1): Modus prüfen, ggf. Code verbrauchen.
  select value #>> '{}' into v_mode
    from public.platform_settings where key = 'registration_mode';
  v_mode := coalesce(v_mode, 'open');

  if v_mode = 'closed' then
    raise exception 'registration closed';
  elsif v_mode = 'code' then
    if p_code is null or length(trim(p_code)) = 0 then
      raise exception 'registration code required';
    end if;
    -- Atomar: zählt nur hoch, wenn Code existiert, nicht erschöpft, nicht
    -- abgelaufen. Bei Fehlschlag später im Funktionslauf rollt die gesamte
    -- Transaktion zurück — der Code wird dann NICHT verbraucht.
    update public.registration_codes
       set used_count = used_count + 1
     where code = trim(p_code)
       and used_count < max_uses
       and (expires_at is null or expires_at > now())
    returning id into v_code_id;
    if v_code_id is null then
      raise exception 'invalid registration code';
    end if;
  elsif v_mode <> 'open' then
    raise exception 'invalid registration mode: %', v_mode;
  end if;

  if p_org_name is null or length(trim(p_org_name)) < 3 then
    raise exception 'org name too short (min 3 chars)';
  end if;

  -- Slug normalisieren; rein kosmetisch (§1.1), NIE Security-relevant:
  v_slug := lower(regexp_replace(trim(coalesce(p_slug, p_org_name)), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if length(v_slug) < 3 then
    raise exception 'slug too short (min 3 chars)';
  end if;
  if exists (select 1 from public.organizations where slug = v_slug) then
    raise exception 'slug already taken: %', v_slug;
  end if;

  insert into public.organizations (name, slug)
  values (trim(p_org_name), v_slug)
  returning id into v_org;

  insert into public.profiles (id, tenant_id, email, full_name, role)
  values (
    auth.uid(),
    v_org,
    (select email from auth.users where id = auth.uid()),
    trim(p_org_name),
    'admin'
  );

  return v_org;
end $$;

revoke all on function public.provision_tenant(text, text, text) from public;
grant execute on function public.provision_tenant(text, text, text) to authenticated;

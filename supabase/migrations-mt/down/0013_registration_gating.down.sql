-- ============================================================================
-- down/0013 · Registrierungs-Gating zurückbauen:
-- provision_tenant auf den 0010-Stand (2 Argumente, ohne Guard) zurücksetzen,
-- danach Tabellen entfernen.
-- ============================================================================

drop function if exists public.provision_tenant(text, text, text);

create function public.provision_tenant(p_org_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_slug text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'user already provisioned';
  end if;

  if p_org_name is null or length(trim(p_org_name)) < 3 then
    raise exception 'org name too short (min 3 chars)';
  end if;

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

revoke all on function public.provision_tenant(text, text) from public;
grant execute on function public.provision_tenant(text, text) to authenticated;

drop table if exists public.registration_codes;
drop table if exists public.platform_settings;

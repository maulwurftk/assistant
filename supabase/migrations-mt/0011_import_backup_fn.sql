-- ============================================================================
-- 0011 · import_backup() — atomarer Fachdaten-Import (Backup-Spec §4.3, §7)
--
-- Modi: 'merge' (Upsert) | 'replace' (Fachtabellen des EIGENEN Tenants leeren,
-- dann einspielen). Läuft in einer Transaktion — jeder Fehler außerhalb der
-- Zeilen-Skips rollt alles zurück.
--
-- Sicherheits-Kernregeln (Spec §4.2, nicht verhandelbar):
--   * Nur Admins des aufrufenden Tenants.
--   * tenant_id JEDER Zeile wird auf den Caller-Tenant ERZWUNGEN — Werte aus
--     der Datei werden ignoriert (Import von Tenant A durch Admin B → landet in B).
--   * profiles: Upsert-only, NIE löschen. Unbekannte Auth-User → skip+Warnung.
--     Profile, deren id in einem FREMDEN Tenant existiert → skip (kein Hijack).
--   * id-Kollisionen mit fremden Tenants (UUID aus fremder Sicherung) → skip.
--   * Fehlende Profil-Referenzen: Pflicht-FKs → Zeile skip; optionale FKs
--     (assigned_to, pending_request_by, activity_id, created_by/updated_by
--     nullable) → auf NULL gesetzt.
--   * push_subscriptions sind nicht Teil der Sicherung (§2).
--
-- Rückgabe-Report: { mode, tenant, applied: {tabelle: {inserted, updated}},
--                    skipped: [{table, id, reason}] }
-- ============================================================================

create or replace function public.import_backup(p_payload jsonb, p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant  uuid;
  v_role    text;
  v_row     jsonb;
  v_id      uuid;
  v_ins     boolean;
  v_applied jsonb := '{}'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_i       int;
  v_u       int;
begin
  -- ── Berechtigung ───────────────────────────────────────────────────────────
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select tenant_id, role into v_tenant, v_role from public.profiles where id = auth.uid();
  if v_tenant is null then
    raise exception 'no tenant for caller';
  end if;
  if v_role <> 'admin' then
    raise exception 'admin only';
  end if;

  -- ── Validierung (Spec §4.1) ────────────────────────────────────────────────
  if p_mode not in ('merge', 'replace') then
    raise exception 'invalid mode: % (merge|replace)', p_mode;
  end if;
  if coalesce(p_payload->'manifest'->>'format', '') <> 'assistenten-app-backup'
     or coalesce((p_payload->'manifest'->>'schemaVersion')::int, -1) <> 1 then
    raise exception 'incompatible backup (format/schemaVersion)';
  end if;
  if p_payload->'data' is null then
    raise exception 'missing data section';
  end if;

  -- ── Modus 'replace': Fachtabellen des EIGENEN Tenants leeren ──────────────
  -- Delete-Reihenfolge = Kinder zuerst (§2). profiles/push_subscriptions NIE.
  if p_mode = 'replace' then
    delete from public.account_ledger           where tenant_id = v_tenant;
    delete from public.payroll_runs             where tenant_id = v_tenant;
    delete from public.notifications            where tenant_id = v_tenant;
    delete from public.monthly_reports          where tenant_id = v_tenant;
    delete from public.calendar_slots           where tenant_id = v_tenant;
    delete from public.time_entries             where tenant_id = v_tenant;
    delete from public.assistant_unavailability where tenant_id = v_tenant;
    delete from public.activities               where tenant_id = v_tenant;
    -- payroll_settings: Singleton bleibt stehen (wird per Upsert überschrieben)
  end if;

  -- ── profiles: Upsert-only (§2) ─────────────────────────────────────────────
  v_i := 0; v_u := 0;
  for v_row in select * from jsonb_array_elements(coalesce(p_payload->'data'->'profiles', '[]'::jsonb)) loop
    begin
      v_id := (v_row->>'id')::uuid;
      if not exists (select 1 from auth.users where id = v_id) then
        v_skipped := v_skipped || jsonb_build_object('table','profiles','id',v_id,'reason','kein Auth-User — Login kann nicht importiert werden');
        continue;
      end if;
      if exists (select 1 from public.profiles where id = v_id and tenant_id <> v_tenant) then
        v_skipped := v_skipped || jsonb_build_object('table','profiles','id',v_id,'reason','Profil gehört zu fremdem Tenant');
        continue;
      end if;
      insert into public.profiles (id, tenant_id, email, full_name, role, active, color, rv_pflicht, kv_pflicht, iban)
      values (
        v_id, v_tenant,
        coalesce(v_row->>'email', (select email from auth.users where id = v_id)),
        coalesce(v_row->>'full_name', '?'),
        case when v_row->>'role' in ('admin','assistant') then v_row->>'role' else 'assistant' end,
        coalesce((v_row->>'active')::boolean, true),
        coalesce(v_row->>'color', '#6366f1'),
        coalesce((v_row->>'rv_pflicht')::boolean, true),
        coalesce((v_row->>'kv_pflicht')::boolean, true),
        v_row->>'iban'
      )
      on conflict (id) do update set
        email = excluded.email, full_name = excluded.full_name, role = excluded.role,
        active = excluded.active, color = excluded.color,
        rv_pflicht = excluded.rv_pflicht, kv_pflicht = excluded.kv_pflicht, iban = excluded.iban
      returning (xmax = 0) into v_ins;
      if v_ins then v_i := v_i + 1; else v_u := v_u + 1; end if;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('table','profiles','id',v_row->>'id','reason',SQLERRM);
    end;
  end loop;
  v_applied := v_applied || jsonb_build_object('profiles', jsonb_build_object('inserted', v_i, 'updated', v_u));

  -- ── activities ─────────────────────────────────────────────────────────────
  v_i := 0; v_u := 0;
  for v_row in select * from jsonb_array_elements(coalesce(p_payload->'data'->'activities', '[]'::jsonb)) loop
    begin
      v_id := (v_row->>'id')::uuid;
      if exists (select 1 from public.activities where id = v_id and tenant_id <> v_tenant) then
        v_skipped := v_skipped || jsonb_build_object('table','activities','id',v_id,'reason','id-Kollision mit fremdem Tenant');
        continue;
      end if;
      insert into public.activities (id, tenant_id, name, active, sort_order, created_at)
      values (v_id, v_tenant, v_row->>'name',
              coalesce((v_row->>'active')::boolean, true),
              coalesce((v_row->>'sort_order')::int, 0),
              coalesce((v_row->>'created_at')::timestamptz, now()))
      on conflict (id) do update set
        name = excluded.name, active = excluded.active, sort_order = excluded.sort_order
      returning (xmax = 0) into v_ins;
      if v_ins then v_i := v_i + 1; else v_u := v_u + 1; end if;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('table','activities','id',v_row->>'id','reason',SQLERRM);
    end;
  end loop;
  v_applied := v_applied || jsonb_build_object('activities', jsonb_build_object('inserted', v_i, 'updated', v_u));

  -- ── payroll_settings: Singleton-Upsert per (tenant_id) ────────────────────
  v_i := 0; v_u := 0;
  for v_row in select * from jsonb_array_elements(coalesce(p_payload->'data'->'payroll_settings', '[]'::jsonb)) limit 1 loop
    begin
      insert into public.payroll_settings (
        tenant_id, hourly_rate, currency, payroll_enabled, payroll_count_mode,
        minijob_mode, bezirk_mode, uv_rate, employer_name, employer_address,
        employer_tax_number, monthly_budget, account_fee, weekly_hours_target,
        mj_kv_ag, mj_rv_ag, mj_pauschsteuer, mj_u2, mj_insolvenzgeld, mj_rv_an,
        updated_by
      )
      values (
        v_tenant,
        coalesce((v_row->>'hourly_rate')::numeric, 15.00),
        coalesce(v_row->>'currency', 'EUR'),
        coalesce((v_row->>'payroll_enabled')::boolean, true),
        coalesce(v_row->>'payroll_count_mode', 'slots'),
        coalesce((v_row->>'minijob_mode')::boolean, false),
        coalesce((v_row->>'bezirk_mode')::boolean, false),
        coalesce((v_row->>'uv_rate')::numeric, 1.60),
        coalesce(v_row->>'employer_name', ''),
        coalesce(v_row->>'employer_address', ''),
        coalesce(v_row->>'employer_tax_number', ''),
        coalesce((v_row->>'monthly_budget')::numeric, 0),
        coalesce((v_row->>'account_fee')::numeric, 10.00),
        coalesce((v_row->>'weekly_hours_target')::numeric, 15.0),
        coalesce((v_row->>'mj_kv_ag')::numeric, 13.00),
        coalesce((v_row->>'mj_rv_ag')::numeric, 15.00),
        coalesce((v_row->>'mj_pauschsteuer')::numeric, 2.00),
        coalesce((v_row->>'mj_u2')::numeric, 0.24),
        coalesce((v_row->>'mj_insolvenzgeld')::numeric, 0.06),
        coalesce((v_row->>'mj_rv_an')::numeric, 3.60),
        (select p.id from public.profiles p where p.id = (v_row->>'updated_by')::uuid and p.tenant_id = v_tenant)
      )
      on conflict (tenant_id) do update set
        hourly_rate = excluded.hourly_rate, currency = excluded.currency,
        payroll_enabled = excluded.payroll_enabled, payroll_count_mode = excluded.payroll_count_mode,
        minijob_mode = excluded.minijob_mode, bezirk_mode = excluded.bezirk_mode,
        uv_rate = excluded.uv_rate, employer_name = excluded.employer_name,
        employer_address = excluded.employer_address, employer_tax_number = excluded.employer_tax_number,
        monthly_budget = excluded.monthly_budget, account_fee = excluded.account_fee,
        weekly_hours_target = excluded.weekly_hours_target,
        mj_kv_ag = excluded.mj_kv_ag, mj_rv_ag = excluded.mj_rv_ag,
        mj_pauschsteuer = excluded.mj_pauschsteuer, mj_u2 = excluded.mj_u2,
        mj_insolvenzgeld = excluded.mj_insolvenzgeld, mj_rv_an = excluded.mj_rv_an,
        updated_by = excluded.updated_by
      returning (xmax = 0) into v_ins;
      if v_ins then v_i := v_i + 1; else v_u := v_u + 1; end if;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('table','payroll_settings','id',v_row->>'id','reason',SQLERRM);
    end;
  end loop;
  v_applied := v_applied || jsonb_build_object('payroll_settings', jsonb_build_object('inserted', v_i, 'updated', v_u));

  -- ── time_entries ───────────────────────────────────────────────────────────
  v_i := 0; v_u := 0;
  for v_row in select * from jsonb_array_elements(coalesce(p_payload->'data'->'time_entries', '[]'::jsonb)) loop
    begin
      v_id := (v_row->>'id')::uuid;
      if exists (select 1 from public.time_entries where id = v_id and tenant_id <> v_tenant) then
        v_skipped := v_skipped || jsonb_build_object('table','time_entries','id',v_id,'reason','id-Kollision mit fremdem Tenant');
        continue;
      end if;
      if not exists (select 1 from public.profiles where id = (v_row->>'assistant_id')::uuid and tenant_id = v_tenant) then
        v_skipped := v_skipped || jsonb_build_object('table','time_entries','id',v_id,'reason','assistant_id nicht im Tenant');
        continue;
      end if;
      insert into public.time_entries (id, tenant_id, assistant_id, date, start_time, end_time, activity_id, description, month_status, created_at, updated_at)
      values (
        v_id, v_tenant, (v_row->>'assistant_id')::uuid,
        (v_row->>'date')::date, (v_row->>'start_time')::time, (v_row->>'end_time')::time,
        (select a.id from public.activities a where a.id = (v_row->>'activity_id')::uuid and a.tenant_id = v_tenant),
        v_row->>'description',
        coalesce(v_row->>'month_status', 'draft'),
        coalesce((v_row->>'created_at')::timestamptz, now()),
        coalesce((v_row->>'updated_at')::timestamptz, now())
      )
      on conflict (id) do update set
        assistant_id = excluded.assistant_id, date = excluded.date,
        start_time = excluded.start_time, end_time = excluded.end_time,
        activity_id = excluded.activity_id, description = excluded.description,
        month_status = excluded.month_status, updated_at = excluded.updated_at
      returning (xmax = 0) into v_ins;
      if v_ins then v_i := v_i + 1; else v_u := v_u + 1; end if;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('table','time_entries','id',v_row->>'id','reason',SQLERRM);
    end;
  end loop;
  v_applied := v_applied || jsonb_build_object('time_entries', jsonb_build_object('inserted', v_i, 'updated', v_u));

  -- ── calendar_slots ─────────────────────────────────────────────────────────
  v_i := 0; v_u := 0;
  for v_row in select * from jsonb_array_elements(coalesce(p_payload->'data'->'calendar_slots', '[]'::jsonb)) loop
    begin
      v_id := (v_row->>'id')::uuid;
      if exists (select 1 from public.calendar_slots where id = v_id and tenant_id <> v_tenant) then
        v_skipped := v_skipped || jsonb_build_object('table','calendar_slots','id',v_id,'reason','id-Kollision mit fremdem Tenant');
        continue;
      end if;
      if not exists (select 1 from public.profiles where id = (v_row->>'created_by')::uuid and tenant_id = v_tenant) then
        v_skipped := v_skipped || jsonb_build_object('table','calendar_slots','id',v_id,'reason','created_by nicht im Tenant');
        continue;
      end if;
      insert into public.calendar_slots (id, tenant_id, date, start_time, end_time, title, description, assigned_to, created_by, status, pending_request_by, reminder_sent_at, created_at)
      values (
        v_id, v_tenant,
        (v_row->>'date')::date, (v_row->>'start_time')::time, (v_row->>'end_time')::time,
        v_row->>'title', v_row->>'description',
        (select p.id from public.profiles p where p.id = (v_row->>'assigned_to')::uuid and p.tenant_id = v_tenant),
        (v_row->>'created_by')::uuid,
        coalesce(v_row->>'status', 'open'),
        (select p.id from public.profiles p where p.id = (v_row->>'pending_request_by')::uuid and p.tenant_id = v_tenant),
        (v_row->>'reminder_sent_at')::timestamptz,
        coalesce((v_row->>'created_at')::timestamptz, now())
      )
      on conflict (id) do update set
        date = excluded.date, start_time = excluded.start_time, end_time = excluded.end_time,
        title = excluded.title, description = excluded.description,
        assigned_to = excluded.assigned_to, created_by = excluded.created_by,
        status = excluded.status, pending_request_by = excluded.pending_request_by,
        reminder_sent_at = excluded.reminder_sent_at
      returning (xmax = 0) into v_ins;
      if v_ins then v_i := v_i + 1; else v_u := v_u + 1; end if;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('table','calendar_slots','id',v_row->>'id','reason',SQLERRM);
    end;
  end loop;
  v_applied := v_applied || jsonb_build_object('calendar_slots', jsonb_build_object('inserted', v_i, 'updated', v_u));

  -- ── monthly_reports ────────────────────────────────────────────────────────
  v_i := 0; v_u := 0;
  for v_row in select * from jsonb_array_elements(coalesce(p_payload->'data'->'monthly_reports', '[]'::jsonb)) loop
    begin
      v_id := (v_row->>'id')::uuid;
      if exists (select 1 from public.monthly_reports where id = v_id and tenant_id <> v_tenant) then
        v_skipped := v_skipped || jsonb_build_object('table','monthly_reports','id',v_id,'reason','id-Kollision mit fremdem Tenant');
        continue;
      end if;
      if not exists (select 1 from public.profiles where id = (v_row->>'assistant_id')::uuid and tenant_id = v_tenant) then
        v_skipped := v_skipped || jsonb_build_object('table','monthly_reports','id',v_id,'reason','assistant_id nicht im Tenant');
        continue;
      end if;
      insert into public.monthly_reports (id, tenant_id, assistant_id, year, month, status, confirmed_at, sent_at, admin_viewed_at, created_at)
      values (
        v_id, v_tenant, (v_row->>'assistant_id')::uuid,
        (v_row->>'year')::int, (v_row->>'month')::int,
        coalesce(v_row->>'status', 'pending'),
        (v_row->>'confirmed_at')::timestamptz, (v_row->>'sent_at')::timestamptz,
        (v_row->>'admin_viewed_at')::timestamptz,
        coalesce((v_row->>'created_at')::timestamptz, now())
      )
      on conflict (id) do update set
        assistant_id = excluded.assistant_id, year = excluded.year, month = excluded.month,
        status = excluded.status, confirmed_at = excluded.confirmed_at,
        sent_at = excluded.sent_at, admin_viewed_at = excluded.admin_viewed_at
      returning (xmax = 0) into v_ins;
      if v_ins then v_i := v_i + 1; else v_u := v_u + 1; end if;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('table','monthly_reports','id',v_row->>'id','reason',SQLERRM);
    end;
  end loop;
  v_applied := v_applied || jsonb_build_object('monthly_reports', jsonb_build_object('inserted', v_i, 'updated', v_u));

  -- ── notifications ──────────────────────────────────────────────────────────
  v_i := 0; v_u := 0;
  for v_row in select * from jsonb_array_elements(coalesce(p_payload->'data'->'notifications', '[]'::jsonb)) loop
    begin
      v_id := (v_row->>'id')::uuid;
      if exists (select 1 from public.notifications where id = v_id and tenant_id <> v_tenant) then
        v_skipped := v_skipped || jsonb_build_object('table','notifications','id',v_id,'reason','id-Kollision mit fremdem Tenant');
        continue;
      end if;
      if not exists (select 1 from public.profiles where id = (v_row->>'user_id')::uuid and tenant_id = v_tenant) then
        v_skipped := v_skipped || jsonb_build_object('table','notifications','id',v_id,'reason','user_id nicht im Tenant');
        continue;
      end if;
      insert into public.notifications (id, tenant_id, user_id, title, message, type, read, related_type, related_id, created_at)
      values (
        v_id, v_tenant, (v_row->>'user_id')::uuid,
        v_row->>'title', v_row->>'message',
        coalesce(v_row->>'type', 'info'),
        coalesce((v_row->>'read')::boolean, false),
        v_row->>'related_type', (v_row->>'related_id')::uuid,
        coalesce((v_row->>'created_at')::timestamptz, now())
      )
      on conflict (id) do update set
        user_id = excluded.user_id, title = excluded.title, message = excluded.message,
        type = excluded.type, read = excluded.read,
        related_type = excluded.related_type, related_id = excluded.related_id
      returning (xmax = 0) into v_ins;
      if v_ins then v_i := v_i + 1; else v_u := v_u + 1; end if;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('table','notifications','id',v_row->>'id','reason',SQLERRM);
    end;
  end loop;
  v_applied := v_applied || jsonb_build_object('notifications', jsonb_build_object('inserted', v_i, 'updated', v_u));

  -- ── payroll_runs ───────────────────────────────────────────────────────────
  v_i := 0; v_u := 0;
  for v_row in select * from jsonb_array_elements(coalesce(p_payload->'data'->'payroll_runs', '[]'::jsonb)) loop
    begin
      v_id := (v_row->>'id')::uuid;
      if exists (select 1 from public.payroll_runs where id = v_id and tenant_id <> v_tenant) then
        v_skipped := v_skipped || jsonb_build_object('table','payroll_runs','id',v_id,'reason','id-Kollision mit fremdem Tenant');
        continue;
      end if;
      if not exists (select 1 from public.profiles where id = (v_row->>'assistant_id')::uuid and tenant_id = v_tenant) then
        v_skipped := v_skipped || jsonb_build_object('table','payroll_runs','id',v_id,'reason','assistant_id nicht im Tenant');
        continue;
      end if;
      insert into public.payroll_runs (id, tenant_id, year, month, assistant_id, total_minutes, hourly_rate, total_pay, email_sent_at, created_at, updated_at)
      values (
        v_id, v_tenant,
        (v_row->>'year')::int, (v_row->>'month')::int, (v_row->>'assistant_id')::uuid,
        (v_row->>'total_minutes')::int, (v_row->>'hourly_rate')::numeric, (v_row->>'total_pay')::numeric,
        (v_row->>'email_sent_at')::timestamptz,
        coalesce((v_row->>'created_at')::timestamptz, now()),
        coalesce((v_row->>'updated_at')::timestamptz, now())
      )
      on conflict (id) do update set
        year = excluded.year, month = excluded.month, assistant_id = excluded.assistant_id,
        total_minutes = excluded.total_minutes, hourly_rate = excluded.hourly_rate,
        total_pay = excluded.total_pay, email_sent_at = excluded.email_sent_at,
        updated_at = excluded.updated_at
      returning (xmax = 0) into v_ins;
      if v_ins then v_i := v_i + 1; else v_u := v_u + 1; end if;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('table','payroll_runs','id',v_row->>'id','reason',SQLERRM);
    end;
  end loop;
  v_applied := v_applied || jsonb_build_object('payroll_runs', jsonb_build_object('inserted', v_i, 'updated', v_u));

  -- ── account_ledger ─────────────────────────────────────────────────────────
  v_i := 0; v_u := 0;
  for v_row in select * from jsonb_array_elements(coalesce(p_payload->'data'->'account_ledger', '[]'::jsonb)) loop
    begin
      v_id := (v_row->>'id')::uuid;
      if exists (select 1 from public.account_ledger where id = v_id and tenant_id <> v_tenant) then
        v_skipped := v_skipped || jsonb_build_object('table','account_ledger','id',v_id,'reason','id-Kollision mit fremdem Tenant');
        continue;
      end if;
      insert into public.account_ledger (id, tenant_id, booking_date, direction, category, amount, description, status, source, dedup_key, created_by, created_at, confirmed_at)
      values (
        v_id, v_tenant,
        (v_row->>'booking_date')::date, v_row->>'direction', v_row->>'category',
        (v_row->>'amount')::numeric, v_row->>'description',
        coalesce(v_row->>'status', 'confirmed'), coalesce(v_row->>'source', 'manual'),
        v_row->>'dedup_key',
        (select p.id from public.profiles p where p.id = (v_row->>'created_by')::uuid and p.tenant_id = v_tenant),
        coalesce((v_row->>'created_at')::timestamptz, now()),
        (v_row->>'confirmed_at')::timestamptz
      )
      on conflict (id) do update set
        booking_date = excluded.booking_date, direction = excluded.direction,
        category = excluded.category, amount = excluded.amount, description = excluded.description,
        status = excluded.status, source = excluded.source, dedup_key = excluded.dedup_key,
        created_by = excluded.created_by, confirmed_at = excluded.confirmed_at
      returning (xmax = 0) into v_ins;
      if v_ins then v_i := v_i + 1; else v_u := v_u + 1; end if;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('table','account_ledger','id',v_row->>'id','reason',SQLERRM);
    end;
  end loop;
  v_applied := v_applied || jsonb_build_object('account_ledger', jsonb_build_object('inserted', v_i, 'updated', v_u));

  -- ── assistant_unavailability ───────────────────────────────────────────────
  v_i := 0; v_u := 0;
  for v_row in select * from jsonb_array_elements(coalesce(p_payload->'data'->'assistant_unavailability', '[]'::jsonb)) loop
    begin
      v_id := (v_row->>'id')::uuid;
      if exists (select 1 from public.assistant_unavailability where id = v_id and tenant_id <> v_tenant) then
        v_skipped := v_skipped || jsonb_build_object('table','assistant_unavailability','id',v_id,'reason','id-Kollision mit fremdem Tenant');
        continue;
      end if;
      if not exists (select 1 from public.profiles where id = (v_row->>'assistant_id')::uuid and tenant_id = v_tenant) then
        v_skipped := v_skipped || jsonb_build_object('table','assistant_unavailability','id',v_id,'reason','assistant_id nicht im Tenant');
        continue;
      end if;
      insert into public.assistant_unavailability (id, tenant_id, assistant_id, type, date, day_of_week, all_day, start_time, end_time, valid_from, valid_until, note, created_at)
      values (
        v_id, v_tenant, (v_row->>'assistant_id')::uuid,
        v_row->>'type', (v_row->>'date')::date, (v_row->>'day_of_week')::smallint,
        coalesce((v_row->>'all_day')::boolean, true),
        (v_row->>'start_time')::time, (v_row->>'end_time')::time,
        (v_row->>'valid_from')::date, (v_row->>'valid_until')::date,
        v_row->>'note',
        coalesce((v_row->>'created_at')::timestamptz, now())
      )
      on conflict (id) do update set
        assistant_id = excluded.assistant_id, type = excluded.type, date = excluded.date,
        day_of_week = excluded.day_of_week, all_day = excluded.all_day,
        start_time = excluded.start_time, end_time = excluded.end_time,
        valid_from = excluded.valid_from, valid_until = excluded.valid_until, note = excluded.note
      returning (xmax = 0) into v_ins;
      if v_ins then v_i := v_i + 1; else v_u := v_u + 1; end if;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('table','assistant_unavailability','id',v_row->>'id','reason',SQLERRM);
    end;
  end loop;
  v_applied := v_applied || jsonb_build_object('assistant_unavailability', jsonb_build_object('inserted', v_i, 'updated', v_u));

  return jsonb_build_object(
    'mode', p_mode,
    'tenant', v_tenant,
    'applied', v_applied,
    'skipped', v_skipped
  );
end $$;

revoke all on function public.import_backup(jsonb, text) from public;
grant execute on function public.import_backup(jsonb, text) to authenticated;

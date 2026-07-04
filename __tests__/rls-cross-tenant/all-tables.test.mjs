// ============================================================================
// Cross-Tenant-Isolationstest: ALLE Tabellen (nach 0009; Architektur §3.5/§7)
// Generische Matrix je Tabelle: Read-Isolation, Cross-Tenant-Insert (42501),
// Update/Delete auf fremde Zeile (0 Zeilen). Plus Spezialfälle:
// profiles-Kollegensicht, dedup_key tenant-lokal, payroll_settings-Singleton,
// verbotene Inserts (profiles/notifications), Realtime notifications +
// monthly_reports. (calendar_slots: eigene Testdatei.)
// Fixtures sind mit 'rls9' markiert und werden vor/nach dem Lauf geräumt.
// ============================================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serviceClient, getOrgs, ensureTestUsers, signedInClient } from './shared.mjs';

const svc = serviceClient();
let orgs, ids, A, B; // A/B = { org, admin, assist }
const fix = { A: {}, B: {} }; // fixture-Zeilen-IDs je Tabelle
const clients = {};

const MARK = 'rls9';

function tableConfigs() {
  const mk = {
    activities: (T) => ({ name: MARK + ' Aktivität ' + T.tag, tenant_id: T.org }),
    time_entries: (T) => ({
      assistant_id: T.assist, date: '2099-01-05', start_time: '08:00', end_time: '09:00',
      description: MARK, tenant_id: T.org,
    }),
    monthly_reports: (T) => ({ assistant_id: T.assist, year: 2099, month: 1, tenant_id: T.org }),
    notifications: (T) => ({ user_id: T.admin, title: MARK, message: 'x', tenant_id: T.org }),
    payroll_runs: (T) => ({
      year: 2099, month: 1, assistant_id: T.assist, total_minutes: 60,
      hourly_rate: 15, total_pay: 15, tenant_id: T.org,
    }),
    account_ledger: (T) => ({
      booking_date: '2099-01-05', direction: 'in', category: MARK, amount: 1,
      dedup_key: MARK + '-dedup', created_by: T.admin, tenant_id: T.org,
    }),
    push_subscriptions: (T) => ({
      user_id: T.assist, endpoint: 'https://example.com/' + MARK + '-' + T.tag,
      subscription: {}, tenant_id: T.org,
    }),
    assistant_unavailability: (T) => ({
      assistant_id: T.assist, type: 'single', date: '2099-01-06', note: MARK, tenant_id: T.org,
    }),
  };
  // reader/writer: Client-Schlüssel auf A-Seite für die generischen Tests
  return [
    { table: 'activities',               mk: mk.activities,               reader: 'aAssist', writer: 'aAdmin'  },
    { table: 'time_entries',             mk: mk.time_entries,             reader: 'aAdmin',  writer: 'aAssist' },
    { table: 'monthly_reports',          mk: mk.monthly_reports,          reader: 'aAdmin',  writer: 'aAdmin'  },
    { table: 'notifications',            mk: mk.notifications,            reader: 'aAdmin',  writer: 'aAdmin'  },
    { table: 'payroll_runs',             mk: mk.payroll_runs,             reader: 'aAssist', writer: 'aAdmin'  },
    { table: 'account_ledger',           mk: mk.account_ledger,           reader: 'aAdmin',  writer: 'aAdmin'  },
    { table: 'push_subscriptions',       mk: mk.push_subscriptions,       reader: 'aAssist', writer: 'aAssist' },
    { table: 'assistant_unavailability', mk: mk.assistant_unavailability, reader: 'aAssist', writer: 'aAssist' },
  ];
}

async function cleanupFixtures() {
  await svc.from('activities').delete().like('name', MARK + '%');
  await svc.from('time_entries').delete().eq('description', MARK);
  await svc.from('monthly_reports').delete().eq('year', 2099);
  await svc.from('notifications').delete().eq('title', MARK);
  await svc.from('payroll_runs').delete().eq('year', 2099);
  await svc.from('account_ledger').delete().eq('category', MARK);
  await svc.from('push_subscriptions').delete().like('endpoint', 'https://example.com/' + MARK + '%');
  await svc.from('assistant_unavailability').delete().eq('note', MARK);
}

before(async () => {
  orgs = await getOrgs(svc);
  ids = await ensureTestUsers(svc, orgs);
  A = { tag: 'A', org: orgs['demo-org-a'], admin: ids.aAdmin, assist: ids.aAssist };
  B = { tag: 'B', org: orgs['demo-org-b'], admin: ids.bAdmin, assist: ids.bAssist };

  // payroll_settings für Tenant B sicherstellen (Singleton je Tenant)
  const { data: psB } = await svc.from('payroll_settings').select('id').eq('tenant_id', B.org);
  if (!psB?.length) {
    const { error } = await svc.from('payroll_settings').insert({ tenant_id: B.org });
    if (error) throw error;
  }

  await cleanupFixtures();
  for (const cfg of tableConfigs()) {
    for (const T of [A, B]) {
      const { data, error } = await svc.from(cfg.table).insert(cfg.mk(T)).select('id').single();
      if (error) throw new Error('Fixture ' + cfg.table + ' ' + T.tag + ': ' + error.message);
      fix[T.tag][cfg.table] = data.id;
    }
  }

  for (const k of ['aAdmin', 'aAssist', 'bAdmin']) clients[k] = await signedInClient(k);
});

after(async () => {
  await cleanupFixtures();
});

// ── Generische Matrix ────────────────────────────────────────────────────────
for (const cfg of tableConfigs()) {
  test(cfg.table + ': Read-Isolation (A sieht keine B-Zeilen)', async () => {
    const { data, error } = await clients[cfg.reader].from(cfg.table).select('id, tenant_id');
    assert.equal(error, null, cfg.table + ' select: ' + error?.message);
    assert.ok(data.every((r) => r.tenant_id === A.org), cfg.table + ': fremde tenant_id sichtbar!');
    assert.ok(!data.some((r) => r.id === fix.B[cfg.table]), cfg.table + ': B-Fixture sichtbar!');
  });

  test(cfg.table + ': Insert in Tenant B scheitert (42501)', async () => {
    const { data, error } = await clients[cfg.writer].from(cfg.table).insert(cfg.mk(B)).select('id');
    if (data?.length) await svc.from(cfg.table).delete().in('id', data.map((d) => d.id));
    assert.ok(error, cfg.table + ': Insert in fremden Tenant wurde NICHT abgelehnt!');
    assert.equal(error.code, '42501', cfg.table + ': ' + error.message);
  });

  test(cfg.table + ': Update/Delete auf B-Zeile trifft 0 Zeilen', async () => {
    const w = clients[cfg.writer];
    const upd = await w.from(cfg.table).update({ tenant_id: B.org }).eq('id', fix.B[cfg.table]).select('id');
    assert.equal(upd.error, null);
    assert.equal(upd.data.length, 0, cfg.table + ': Update traf fremde Zeile!');
    const del = await w.from(cfg.table).delete().eq('id', fix.B[cfg.table]).select('id');
    assert.equal(del.error, null);
    assert.equal(del.data.length, 0, cfg.table + ': Delete traf fremde Zeile!');
    const { data: still } = await svc.from(cfg.table).select('id').eq('id', fix.B[cfg.table]);
    assert.equal(still.length, 1, cfg.table + ': B-Zeile wurde verändert/gelöscht!');
  });
}

// ── profiles (eigene Fälle — Fixtures sind die Test-User selbst) ─────────────
test('profiles: Assistent A sieht nur Tenant-A-Profile (Kollegensicht tenant-lokal)', async () => {
  const { data, error } = await clients.aAssist.from('profiles').select('id, tenant_id, email');
  assert.equal(error, null);
  assert.ok(data.length >= 2, 'Assistent muss sich + Kollegen sehen');
  assert.ok(data.every((r) => r.tenant_id === A.org), 'profiles: fremde tenant_id sichtbar!');
  assert.ok(!data.some((r) => r.id === ids.bAssist), 'profiles: B-Assistent für A sichtbar!');
});

test('profiles: Admin A sieht alle A-Profile, keine B-Profile', async () => {
  const { data, error } = await clients.aAdmin.from('profiles').select('id, tenant_id');
  assert.equal(error, null);
  assert.ok(data.every((r) => r.tenant_id === A.org));
  assert.ok(!data.some((r) => r.id === ids.bAdmin));
});

test('profiles: Insert durch eingeloggten User scheitert (Policy-Loch geschlossen)', async () => {
  const { data, error } = await clients.aAdmin.from('profiles').insert({
    id: crypto.randomUUID(), email: 'rls9-eindringling@example.com',
    full_name: 'x', role: 'assistant', tenant_id: A.org,
  }).select('id');
  if (data?.length) await svc.from('profiles').delete().in('id', data.map((d) => d.id));
  assert.ok(error, 'profiles-Insert wurde NICHT abgelehnt!');
  assert.equal(error.code, '42501');
});

test('profiles: Admin A kann B-Profil nicht ändern (0 Zeilen)', async () => {
  const { data, error } = await clients.aAdmin.from('profiles')
    .update({ full_name: 'gekapert' }).eq('id', ids.bAssist).select('id');
  assert.equal(error, null);
  assert.equal(data.length, 0);
  const { data: check } = await svc.from('profiles').select('full_name').eq('id', ids.bAssist).single();
  assert.equal(check.full_name, 'Test Assist B');
});

// ── notifications: Insert auch im EIGENEN Tenant verboten (nur Server) ──────
test('notifications: Insert durch User scheitert auch im eigenen Tenant (42501)', async () => {
  const { data, error } = await clients.aAdmin.from('notifications').insert({
    user_id: A.admin, title: MARK + '-own', message: 'x', tenant_id: A.org,
  }).select('id');
  if (data?.length) await svc.from('notifications').delete().in('id', data.map((d) => d.id));
  assert.ok(error, 'notifications-Insert wurde NICHT abgelehnt!');
  assert.equal(error.code, '42501');
});

// ── Uniqueness-Fixes (Architektur §1.4) ─────────────────────────────────────
test('account_ledger: gleicher dedup_key in A und B ist erlaubt (tenant-lokal)', async () => {
  // Fixtures nutzen bereits in beiden Tenants denselben dedup_key — beide existieren:
  const { data } = await svc.from('account_ledger').select('id, tenant_id').eq('dedup_key', MARK + '-dedup');
  assert.equal(data.length, 2, 'dedup_key ist nicht tenant-lokal!');
});

test('account_ledger: doppelter dedup_key im SELBEN Tenant scheitert (23505)', async () => {
  const { data, error } = await svc.from('account_ledger').insert({
    booking_date: '2099-01-07', direction: 'in', category: MARK, amount: 2,
    dedup_key: MARK + '-dedup', created_by: A.admin, tenant_id: A.org,
  }).select('id');
  if (data?.length) await svc.from('account_ledger').delete().in('id', data.map((d) => d.id));
  assert.ok(error);
  assert.equal(error.code, '23505');
});

test('payroll_settings: zweite Zeile im selben Tenant scheitert (23505)', async () => {
  const { data, error } = await svc.from('payroll_settings').insert({ tenant_id: B.org }).select('id');
  if (data?.length) await svc.from('payroll_settings').delete().in('id', data.map((d) => d.id));
  assert.ok(error, 'payroll_settings-Singleton wird nicht erzwungen!');
  assert.equal(error.code, '23505');
});

// ── Realtime: notifications + monthly_reports (calendar_slots: eigene Datei) ─
test('Realtime: notifications + monthly_reports tenant-isoliert', async (t) => {
  const a = clients.aAdmin;
  const events = { notifications: [], monthly_reports: [] };
  const channel = a.channel('rls9-rt');
  for (const tbl of ['notifications', 'monthly_reports']) {
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: tbl },
      (p) => events[tbl].push(p.new));
  }
  const subscribed = await new Promise((res) => {
    const to = setTimeout(() => res(false), 10000);
    channel.subscribe((s) => {
      if (s === 'SUBSCRIBED') { clearTimeout(to); res(true); }
      if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { clearTimeout(to); res(false); }
    });
  });
  if (!subscribed) {
    await a.removeChannel(channel);
    t.skip('Realtime-Verbindung aus dieser Umgebung nicht möglich — manuell/CI prüfen');
    return;
  }

  const cleanupIds = { notifications: [], monthly_reports: [] };
  const ins = async (tbl, row) => {
    const { data, error } = await svc.from(tbl).insert(row).select('id').single();
    if (error) throw new Error('rt-insert ' + tbl + ': ' + error.message);
    cleanupIds[tbl].push(data.id);
    return data.id;
  };

  try {
    // B-Inserts → dürfen bei A NICHT ankommen
    const bN = await ins('notifications', { user_id: B.admin, title: MARK + '-rt', message: 'x', tenant_id: B.org });
    const bM = await ins('monthly_reports', { assistant_id: B.assist, year: 2099, month: 2, tenant_id: B.org });
    await new Promise((r) => setTimeout(r, 5000));
    assert.ok(!events.notifications.some((e) => e.id === bN), 'B-notification-Event bei A!');
    assert.ok(!events.monthly_reports.some((e) => e.id === bM), 'B-report-Event bei A!');

    // A-Inserts → müssen ankommen (Kanal-Funktionsnachweis)
    const aN = await ins('notifications', { user_id: A.admin, title: MARK + '-rt', message: 'x', tenant_id: A.org });
    const aM = await ins('monthly_reports', { assistant_id: A.assist, year: 2099, month: 2, tenant_id: A.org });
    const both = await new Promise((res) => {
      const started = Date.now();
      const iv = setInterval(() => {
        const ok = events.notifications.some((e) => e.id === aN) && events.monthly_reports.some((e) => e.id === aM);
        if (ok) { clearInterval(iv); res(true); }
        if (Date.now() - started > 8000) { clearInterval(iv); res(false); }
      }, 200);
    });
    assert.ok(both, 'Eigene Realtime-Events nicht angekommen (Kanal defekt?)');
    assert.ok(!events.notifications.some((e) => e.id === bN), 'B-Event nachträglich bei A!');
  } finally {
    await a.removeChannel(channel);
    for (const [tbl, list] of Object.entries(cleanupIds)) {
      if (list.length) await svc.from(tbl).delete().in('id', list);
    }
  }
});

// ── Symmetrie-Stichprobe: B sieht nichts von A ───────────────────────────────
test('Symmetrie: Admin B sieht nur Tenant-B-Daten', async () => {
  for (const tbl of ['profiles', 'activities', 'time_entries', 'account_ledger']) {
    const { data, error } = await clients.bAdmin.from(tbl).select('tenant_id');
    assert.equal(error, null, tbl + ': ' + error?.message);
    assert.ok(data.every((r) => r.tenant_id === B.org), tbl + ': A-Daten bei B sichtbar!');
  }
});

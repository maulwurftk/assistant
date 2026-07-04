// ============================================================================
// Cross-Tenant-Isolationstest: calendar_slots (Blaupause, Architektur §7)
// Läuft gegen die DB aus .env.local — NUR Staging (eingebauter Wächter).
//
//   npm run test:rls   (bzw. node --test __tests__/rls-cross-tenant/)
//
// Legt idempotent an: 4 Test-Auth-User (test-…@example.com), Profile in
// Demo Org A/B, je einen Marker-Slot. Prüft Read/Write/Delete-Isolation,
// WITH CHECK, Composite-FK, Rollenlogik und Realtime-Isolation.
// ============================================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]])
);

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const PW = 'Rls-Test-1234!';

const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

const USERS = {
  aAdmin:  { email: 'test-a-admin@example.com',  role: 'admin',     org: 'demo-org-a', name: 'Test Admin A' },
  aAssist: { email: 'test-a-assist@example.com', role: 'assistant', org: 'demo-org-a', name: 'Test Assist A' },
  bAdmin:  { email: 'test-b-admin@example.com',  role: 'admin',     org: 'demo-org-b', name: 'Test Admin B' },
  bAssist: { email: 'test-b-assist@example.com', role: 'assistant', org: 'demo-org-b', name: 'Test Assist B' },
};

const orgs = {};   // slug -> id
const ids = {};    // key -> auth user id
const slots = {};  // 'A'|'B' -> marker slot id
const createdDuringTest = [];

async function ensureUser(u) {
  const { data, error } = await svc.auth.admin.createUser({
    email: u.email, password: PW, email_confirm: true,
  });
  if (!error) return data.user.id;
  // existiert schon → suchen
  const { data: list, error: e2 } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (e2) throw e2;
  const hit = list.users.find((x) => x.email === u.email);
  if (!hit) throw new Error('User weder anlegbar noch findbar: ' + u.email + ' / ' + error.message);
  return hit.id;
}

async function signedInClient(u) {
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: PW });
  if (error) throw new Error('Login fehlgeschlagen für ' + u.email + ': ' + error.message);
  return c;
}

before(async () => {
  // ── Staging-Wächter: nur demo-/test-User erlaubt ─────────────────────────
  const { data: list, error } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const fremd = list.users.filter(
    (u) => u.email && !/^demo-.*@example\.com$/.test(u.email) && !/^test-.*@example\.com$/.test(u.email)
  );
  if (fremd.length > 0) {
    throw new Error('Nicht-Demo-User gefunden (' + fremd.map((u) => u.email).join(', ') + ') — sieht nach PROD aus. Abbruch.');
  }

  // ── Orgs auflösen ────────────────────────────────────────────────────────
  const { data: orgRows, error: e1 } = await svc.from('organizations').select('id, slug')
    .in('slug', ['demo-org-a', 'demo-org-b']);
  if (e1) throw e1;
  for (const o of orgRows) orgs[o.slug] = o.id;
  assert.ok(orgs['demo-org-a'] && orgs['demo-org-b'], 'Demo-Orgs fehlen — staging/0005 einspielen');

  // ── User + Profile (idempotent) ──────────────────────────────────────────
  for (const [k, u] of Object.entries(USERS)) {
    ids[k] = await ensureUser(u);
    const { error: pe } = await svc.from('profiles').upsert({
      id: ids[k], email: u.email, full_name: u.name, role: u.role,
      tenant_id: orgs[u.org], active: true,
    });
    if (pe) throw pe;
  }

  // ── Marker-Slots je Tenant (idempotent über Titel) ──────────────────────
  for (const [tag, adminKey, orgSlug] of [['A', 'aAdmin', 'demo-org-a'], ['B', 'bAdmin', 'demo-org-b']]) {
    const title = 'RLS-Testslot ' + tag;
    const { data: found } = await svc.from('calendar_slots').select('id')
      .eq('title', title).eq('tenant_id', orgs[orgSlug]).limit(1);
    if (found?.length) { slots[tag] = found[0].id; continue; }
    const { data: ins, error: ie } = await svc.from('calendar_slots').insert({
      date: '2026-08-01', start_time: '09:00', end_time: '11:00',
      title, status: 'open', created_by: ids[adminKey], tenant_id: orgs[orgSlug],
    }).select('id').single();
    if (ie) throw ie;
    slots[tag] = ins.id;
  }
});

after(async () => {
  if (createdDuringTest.length) {
    await svc.from('calendar_slots').delete().in('id', createdDuringTest);
  }
});

// ── 1. current_tenant() ─────────────────────────────────────────────────────
test('current_tenant() liefert die eigene Org', async () => {
  const a = await signedInClient(USERS.aAdmin);
  const { data, error } = await a.rpc('current_tenant');
  assert.equal(error, null);
  assert.equal(data, orgs['demo-org-a']);
});

// ── 2. Read-Isolation ───────────────────────────────────────────────────────
test('Read: Admin A sieht nur Tenant-A-Slots, nie den B-Slot', async () => {
  const a = await signedInClient(USERS.aAdmin);
  const { data, error } = await a.from('calendar_slots').select('id, tenant_id');
  assert.equal(error, null);
  assert.ok(data.length > 0, 'Admin A muss eigene Slots sehen');
  assert.ok(data.every((r) => r.tenant_id === orgs['demo-org-a']), 'fremde tenant_id sichtbar!');
  assert.ok(!data.some((r) => r.id === slots.B), 'B-Slot ist für A sichtbar!');
});

// ── 3. Write-Isolation: WITH CHECK ──────────────────────────────────────────
test('Insert mit fremder tenant_id scheitert (42501)', async () => {
  const a = await signedInClient(USERS.aAdmin);
  const { data, error } = await a.from('calendar_slots').insert({
    date: '2026-08-02', start_time: '09:00', end_time: '10:00',
    title: 'Einbruchsversuch', status: 'open',
    created_by: ids.aAdmin, tenant_id: orgs['demo-org-b'],
  }).select('id');
  if (data?.length) createdDuringTest.push(...data.map((d) => d.id));
  assert.ok(error, 'Insert in fremden Tenant wurde NICHT abgelehnt!');
  assert.equal(error.code, '42501');
});

// ── 4. Composite-FK: eigene tenant_id, fremde Profil-Referenz ───────────────
test('Insert mit eigener tenant_id, aber fremdem assigned_to scheitert (23503)', async () => {
  const a = await signedInClient(USERS.aAdmin);
  const { data, error } = await a.from('calendar_slots').insert({
    date: '2026-08-02', start_time: '11:00', end_time: '12:00',
    title: 'FK-Einbruchsversuch', status: 'assigned',
    created_by: ids.aAdmin, assigned_to: ids.bAssist, tenant_id: orgs['demo-org-a'],
  }).select('id');
  if (data?.length) createdDuringTest.push(...data.map((d) => d.id));
  assert.ok(error, 'Cross-Tenant-Referenz wurde NICHT abgelehnt!');
  assert.equal(error.code, '23503');
});

// ── 5. Update-Isolation ─────────────────────────────────────────────────────
test('Update auf B-Slot trifft 0 Zeilen', async () => {
  const a = await signedInClient(USERS.aAdmin);
  const { data, error } = await a.from('calendar_slots')
    .update({ title: 'gekapert' }).eq('id', slots.B).select('id');
  assert.equal(error, null); // RLS filtert still: 0 Zeilen, kein Fehler
  assert.equal(data.length, 0, 'Update hat eine fremde Zeile getroffen!');
  const { data: check } = await svc.from('calendar_slots').select('title').eq('id', slots.B).single();
  assert.equal(check.title, 'RLS-Testslot B', 'B-Slot wurde verändert!');
});

// ── 6. Delete-Isolation ─────────────────────────────────────────────────────
test('Delete auf B-Slot trifft 0 Zeilen', async () => {
  const a = await signedInClient(USERS.aAdmin);
  const { data, error } = await a.from('calendar_slots')
    .delete().eq('id', slots.B).select('id');
  assert.equal(error, null);
  assert.equal(data.length, 0, 'Delete hat eine fremde Zeile getroffen!');
  const { data: check } = await svc.from('calendar_slots').select('id').eq('id', slots.B);
  assert.equal(check.length, 1, 'B-Slot wurde gelöscht!');
});

// ── 7. Rollenlogik unterhalb des Tenant-Filters ─────────────────────────────
test('Assistent A: lesen ja, schreiben nein (42501)', async () => {
  const c = await signedInClient(USERS.aAssist);
  const { data: rows, error: re } = await c.from('calendar_slots').select('id, tenant_id');
  assert.equal(re, null);
  assert.ok(rows.length > 0 && rows.every((r) => r.tenant_id === orgs['demo-org-a']));
  const { data, error } = await c.from('calendar_slots').insert({
    date: '2026-08-03', start_time: '09:00', end_time: '10:00',
    title: 'Assistent schreibt', status: 'open',
    created_by: ids.aAssist, tenant_id: orgs['demo-org-a'],
  }).select('id');
  if (data?.length) createdDuringTest.push(...data.map((d) => d.id));
  assert.ok(error, 'Assistent konnte Slot anlegen!');
  assert.equal(error.code, '42501');
});

// ── 8. Realtime-Isolation (Architektur §3.4) ────────────────────────────────
test('Realtime: A-Subscription bekommt kein Event aus Tenant B', async (t) => {
  const a = await signedInClient(USERS.aAdmin);
  const events = [];
  const channel = a.channel('rls-test')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calendar_slots' },
      (p) => events.push(p.new));

  const subscribed = await new Promise((res) => {
    const to = setTimeout(() => res(false), 10000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') { clearTimeout(to); res(true); }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(to); res(false); }
    });
  });
  if (!subscribed) {
    await a.removeChannel(channel);
    t.skip('Realtime-Verbindung aus dieser Umgebung nicht möglich — manuell/CI prüfen');
    return;
  }

  const mk = (org, adminKey, title) => svc.from('calendar_slots').insert({
    date: '2026-08-04', start_time: '14:00', end_time: '15:00',
    title, status: 'open', created_by: ids[adminKey], tenant_id: orgs[org],
  }).select('id').single();

  const { data: bIns } = await mk('demo-org-b', 'bAdmin', 'RT-Test B');
  createdDuringTest.push(bIns.id);
  await new Promise((r) => setTimeout(r, 5000));
  assert.ok(!events.some((e) => e.id === bIns.id), 'A hat ein Realtime-Event aus Tenant B empfangen!');

  const { data: aIns } = await mk('demo-org-a', 'aAdmin', 'RT-Test A');
  createdDuringTest.push(aIns.id);
  const gotA = await new Promise((res) => {
    const started = Date.now();
    const iv = setInterval(() => {
      if (events.some((e) => e.id === aIns.id)) { clearInterval(iv); res(true); }
      if (Date.now() - started > 8000) { clearInterval(iv); res(false); }
    }, 200);
  });
  await a.removeChannel(channel);
  assert.ok(gotA, 'A hat das eigene Realtime-Event nicht empfangen (Kanal defekt?)');
  assert.ok(!events.some((e) => e.id === bIns.id), 'B-Event nachträglich bei A angekommen!');
});

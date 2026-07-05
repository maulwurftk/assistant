// ============================================================================
// Tests: Mandanten-Sperre (0015) — current_tenant() erzwingt org.status='active'.
// Gesperrte Org B: kein Read (inkl. eigenes Profil!), kein Write,
// is_org_suspended()=true; Org A bleibt unberührt. Danach Entsperren →
// alles wieder normal. after() stellt status='active' IMMER wieder her.
// Läuft NUR gegen Staging (assertStaging via ensureTestUsers in shared.mjs).
// ============================================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serviceClient, getOrgs, ensureTestUsers, signedInClient } from './shared.mjs';

const svc = serviceClient();
let orgs, clients = {};

before(async () => {
  orgs = await getOrgs(svc);
  await ensureTestUsers(svc, orgs);
  // Beide VOR der Sperre anmelden — Session-Token bleibt gültig,
  // genau wie bei einem echten eingeloggten User im Moment der Sperrung.
  clients.aAdmin = await signedInClient('aAdmin');
  clients.bAdmin = await signedInClient('bAdmin');
});

after(async () => {
  // Sicherheitsnetz: Org B immer entsperren, egal was schiefging.
  await svc.from('organizations').update({ status: 'active' }).eq('id', orgs['demo-org-b']);
});

test('Vorher: Admin B sieht eigenes Profil, is_org_suspended=false', async () => {
  const { data: p } = await clients.bAdmin.from('profiles').select('id').eq('email', 'test-b-admin@example.com');
  assert.equal(p.length, 1);
  const { data: s, error } = await clients.bAdmin.rpc('is_org_suspended');
  assert.equal(error, null);
  assert.equal(s, false);
});

test('Org B sperren (Service-Role)', async () => {
  const { error } = await svc.from('organizations').update({ status: 'suspended' }).eq('id', orgs['demo-org-b']);
  assert.equal(error, null);
});

test('Gesperrt: Admin B sieht eigenes Profil NICHT mehr (p_self_read dicht)', async () => {
  const { data } = await clients.bAdmin.from('profiles').select('id');
  assert.equal(data.length, 0);
});

test('Gesperrt: current_tenant() liefert null, is_org_suspended() true', async () => {
  const { data: t } = await clients.bAdmin.rpc('current_tenant');
  assert.equal(t, null);
  const { data: s } = await clients.bAdmin.rpc('is_org_suspended');
  assert.equal(s, true);
});

test('Gesperrt: Fachtabellen dicht (todos, calendar_slots, activities leer)', async () => {
  for (const table of ['todos', 'calendar_slots', 'activities']) {
    const { data } = await clients.bAdmin.from(table).select('id').limit(5);
    assert.equal(data.length, 0, table + ' muss leer sein');
  }
});

test('Gesperrt: Write scheitert (Update eigenes Profil → 0 rows)', async () => {
  const { data } = await clients.bAdmin
    .from('profiles')
    .update({ full_name: 'Gesperrt Schreibversuch' })
    .eq('email', 'test-b-admin@example.com')
    .select('id');
  assert.equal(data.length, 0);
});

test('Gesperrt: Insert scheitert (activities → 42501)', async () => {
  const { error } = await clients.bAdmin
    .from('activities')
    .insert({ name: 'sperrtest-darf-nicht-existieren' });
  assert.ok(error, 'Insert muss scheitern');
  assert.equal(error.code, '42501');
});

test('Org A bleibt unberührt: Profil lesbar, is_org_suspended=false', async () => {
  const { data: p } = await clients.aAdmin.from('profiles').select('id').eq('email', 'test-a-admin@example.com');
  assert.equal(p.length, 1);
  const { data: s } = await clients.aAdmin.rpc('is_org_suspended');
  assert.equal(s, false);
});

test('Entsperren: Admin B sieht alles wieder', async () => {
  const { error } = await svc.from('organizations').update({ status: 'active' }).eq('id', orgs['demo-org-b']);
  assert.equal(error, null);
  const { data: p } = await clients.bAdmin.from('profiles').select('id').eq('email', 'test-b-admin@example.com');
  assert.equal(p.length, 1);
  const { data: s } = await clients.bAdmin.rpc('is_org_suspended');
  assert.equal(s, false);
});

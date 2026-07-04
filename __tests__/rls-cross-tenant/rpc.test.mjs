// ============================================================================
// Tests: provision_tenant() (0010) + import_backup() (0011)
// Onboarding: Doppelanlage, Slug-Kollision, unauthentifiziert.
// Import: tenant_id-Erzwingung, Referenz-Skips, id-Kollisionen, Idempotenz,
// replace-Isolation (löscht NUR den eigenen Tenant), Format-Ablehnung.
// Import-Tests laufen als Admin B (Tenant B ist die leere Test-Org) —
// Tenant A (Demo-Daten) wird nie destruktiv angefasst.
// ============================================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { serviceClient, getOrgs, ensureTestUsers, signedInClient, env, PW } from './shared.mjs';

const svc = serviceClient();
let orgs, ids, clients = {};
const FRESH = { c: 'test-c-fresh@example.com', d: 'test-d-fresh@example.com' };
const M = 'rls10';
const importedIds = { activities: [], time_entries: [] };

async function deleteFreshUser(email, orgSlug) {
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users.find((x) => x.email === email);
  if (u) {
    await svc.from('profiles').delete().eq('id', u.id);
    if (orgSlug) await svc.from('organizations').delete().eq('slug', orgSlug);
    await svc.auth.admin.deleteUser(u.id);
  } else if (orgSlug) {
    await svc.from('organizations').delete().eq('slug', orgSlug);
  }
}

async function freshSignedIn(email) {
  const { data, error } = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: le } = await c.auth.signInWithPassword({ email, password: PW });
  if (le) throw le;
  return { client: c, id: data.user.id };
}

async function cleanupImportRows() {
  await svc.from('time_entries').delete().eq('description', M);
  await svc.from('activities').delete().like('name', M + '%');
}

before(async () => {
  orgs = await getOrgs(svc);
  ids = await ensureTestUsers(svc, orgs);
  clients.bAdmin = await signedInClient('bAdmin');
  clients.bAssist = await signedInClient('bAssist');
  await deleteFreshUser(FRESH.c, 'test-org-c');
  await deleteFreshUser(FRESH.d, null);
  await cleanupImportRows();
});

after(async () => {
  await cleanupImportRows();
  await deleteFreshUser(FRESH.c, 'test-org-c');
  await deleteFreshUser(FRESH.d, null);
});

// ── provision_tenant ─────────────────────────────────────────────────────────
test('provision_tenant: frischer User bekommt Org + Admin-Profil (atomar)', async () => {
  const { client, id } = await freshSignedIn(FRESH.c);
  const { data: orgId, error } = await client.rpc('provision_tenant', {
    p_org_name: 'Test Org C', p_slug: 'Test Org C!',
  });
  assert.equal(error, null, error?.message);
  assert.ok(orgId);

  const { data: org } = await svc.from('organizations').select('slug,name').eq('id', orgId).single();
  assert.equal(org.slug, 'test-org-c'); // normalisiert
  const { data: prof } = await svc.from('profiles').select('role,tenant_id,email').eq('id', id).single();
  assert.equal(prof.role, 'admin');
  assert.equal(prof.tenant_id, orgId);
  assert.equal(prof.email, FRESH.c);
  const { data: ct } = await client.rpc('current_tenant');
  assert.equal(ct, orgId);

  // Doppelanlage: zweiter Aufruf desselben Users scheitert
  const second = await client.rpc('provision_tenant', { p_org_name: 'Nochmal', p_slug: 'nochmal-c' });
  assert.ok(second.error, 'Doppel-Provisionierung wurde NICHT abgelehnt!');
  assert.match(second.error.message, /already provisioned/);
  const { data: orgCount } = await svc.from('organizations').select('id').eq('slug', 'nochmal-c');
  assert.equal(orgCount.length, 0, 'Zombie-Org angelegt!');
});

test('provision_tenant: bereits zugeordneter User (Admin B) scheitert', async () => {
  const { error } = await clients.bAdmin.rpc('provision_tenant', {
    p_org_name: 'Zweitorg', p_slug: 'zweitorg-b',
  });
  assert.ok(error);
  assert.match(error.message, /already provisioned/);
});

test('provision_tenant: vergebener Slug scheitert, kein Zombie', async () => {
  const { client } = await freshSignedIn(FRESH.d);
  const { error } = await client.rpc('provision_tenant', {
    p_org_name: 'Slug Dieb', p_slug: 'demo-org-a',
  });
  assert.ok(error, 'Slug-Kollision wurde NICHT abgelehnt!');
  assert.match(error.message, /slug already taken/);
  // User d bleibt unprovisioniert (kein Profil):
  const { data } = await svc.from('profiles').select('id').eq('email', FRESH.d);
  assert.equal(data.length, 0);
});

test('provision_tenant: ohne Login nicht aufrufbar', async () => {
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await anon.rpc('provision_tenant', { p_org_name: 'Anon Org', p_slug: 'anon-org' });
  assert.ok(error, 'Anon-Aufruf wurde NICHT abgelehnt!');
});

// ── import_backup ────────────────────────────────────────────────────────────
function payload(rows) {
  return {
    manifest: { format: 'assistenten-app-backup', schemaVersion: 1 },
    data: rows,
  };
}

test('import_backup: merge erzwingt Caller-Tenant, skippt fremde Referenzen', async () => {
  const actId = crypto.randomUUID();
  const teId = crypto.randomUUID();
  const teForeign = crypto.randomUUID();
  const p = payload({
    activities: [
      // tenant_id der Datei zeigt auf A — muss ignoriert und auf B erzwungen werden:
      { id: actId, name: M + '-act', active: true, sort_order: 1, tenant_id: orgs['demo-org-a'] },
    ],
    time_entries: [
      { id: teId, assistant_id: ids.bAssist, date: '2099-02-01', start_time: '08:00', end_time: '09:00', description: M },
      // fremde assistant_id (Tenant A) → skip:
      { id: teForeign, assistant_id: ids.aAssist, date: '2099-02-01', start_time: '08:00', end_time: '09:00', description: M },
    ],
  });
  importedIds.activities.push(actId);
  importedIds.time_entries.push(teId);

  const { data: rep, error } = await clients.bAdmin.rpc('import_backup', { p_payload: p, p_mode: 'merge' });
  assert.equal(error, null, error?.message);
  assert.equal(rep.applied.activities.inserted, 1);
  assert.equal(rep.applied.time_entries.inserted, 1);
  assert.ok(rep.skipped.some((s) => s.table === 'time_entries' && s.id === teForeign && /nicht im Tenant/.test(s.reason)));

  const { data: act } = await svc.from('activities').select('tenant_id').eq('id', actId).single();
  assert.equal(act.tenant_id, orgs['demo-org-b'], 'tenant_id wurde NICHT erzwungen!');

  // Idempotenz: gleicher Import nochmal → updated statt inserted, keine Duplikate
  const again = await clients.bAdmin.rpc('import_backup', { p_payload: p, p_mode: 'merge' });
  assert.equal(again.error, null);
  assert.equal(again.data.applied.activities.updated, 1);
  assert.equal(again.data.applied.activities.inserted, 0);
});

test('import_backup: id-Kollision mit fremdem Tenant wird geskippt', async () => {
  const { data: aAct } = await svc.from('activities').select('id, name')
    .eq('tenant_id', orgs['demo-org-a']).limit(1).single();
  const p = payload({
    activities: [{ id: aAct.id, name: M + '-hijack' }],
  });
  const { data: rep, error } = await clients.bAdmin.rpc('import_backup', { p_payload: p, p_mode: 'merge' });
  assert.equal(error, null);
  assert.ok(rep.skipped.some((s) => s.table === 'activities' && /id-Kollision/.test(s.reason)));
  const { data: check } = await svc.from('activities').select('name, tenant_id').eq('id', aAct.id).single();
  assert.equal(check.name, aAct.name, 'A-Zeile wurde per Import gekapert!');
  assert.equal(check.tenant_id, orgs['demo-org-a']);
});

test('import_backup: profiles nur Upsert — kein Auth-User / fremder Tenant → skip', async () => {
  const p = payload({
    profiles: [
      { id: crypto.randomUUID(), email: M + '-ghost@example.com', full_name: 'Ghost', role: 'assistant' },
      { id: ids.aAdmin, email: 'test-a-admin@example.com', full_name: 'Hijack', role: 'assistant' },
    ],
  });
  const { data: rep, error } = await clients.bAdmin.rpc('import_backup', { p_payload: p, p_mode: 'merge' });
  assert.equal(error, null);
  assert.ok(rep.skipped.some((s) => s.table === 'profiles' && /kein Auth-User/.test(s.reason)));
  assert.ok(rep.skipped.some((s) => s.table === 'profiles' && /fremdem Tenant/.test(s.reason)));
  const { data: check } = await svc.from('profiles').select('full_name, role, tenant_id').eq('id', ids.aAdmin).single();
  assert.equal(check.full_name, 'Test Admin A', 'A-Profil wurde verändert!');
  assert.equal(check.tenant_id, orgs['demo-org-a']);
});

test('import_backup: replace leert NUR den eigenen Tenant', async () => {
  // Marker: einer in B (muss verschwinden), einer in A (muss überleben)
  const { data: vanish } = await svc.from('activities')
    .insert({ name: M + '-vanish', tenant_id: orgs['demo-org-b'] }).select('id').single();
  const { data: keep } = await svc.from('activities')
    .insert({ name: M + '-a-keep', tenant_id: orgs['demo-org-a'] }).select('id').single();

  const actId = crypto.randomUUID();
  importedIds.activities.push(actId);
  const p = payload({ activities: [{ id: actId, name: M + '-after-replace' }] });

  const { data: rep, error } = await clients.bAdmin.rpc('import_backup', { p_payload: p, p_mode: 'replace' });
  assert.equal(error, null, error?.message);
  assert.equal(rep.mode, 'replace');

  const { data: gone } = await svc.from('activities').select('id').eq('id', vanish.id);
  assert.equal(gone.length, 0, 'replace hat die alte B-Zeile NICHT gelöscht');
  const { data: survived } = await svc.from('activities').select('id').eq('id', keep.id);
  assert.equal(survived.length, 1, 'replace hat Tenant A angefasst!!');
  const { data: fresh } = await svc.from('activities').select('tenant_id').eq('id', actId).single();
  assert.equal(fresh.tenant_id, orgs['demo-org-b']);
  // B-Profile unangetastet (NIE löschen):
  const { data: bProfiles } = await svc.from('profiles').select('id').eq('tenant_id', orgs['demo-org-b']);
  assert.ok(bProfiles.length >= 2, 'replace hat Profile gelöscht!');
});

test('import_backup: fremdes Format / falsche schemaVersion wird abgelehnt', async () => {
  const bad1 = await clients.bAdmin.rpc('import_backup', {
    p_payload: { manifest: { format: 'anderes-tool', schemaVersion: 1 }, data: {} }, p_mode: 'merge',
  });
  assert.ok(bad1.error);
  assert.match(bad1.error.message, /incompatible/);
  const bad2 = await clients.bAdmin.rpc('import_backup', {
    p_payload: { manifest: { format: 'assistenten-app-backup', schemaVersion: 2 }, data: {} }, p_mode: 'merge',
  });
  assert.ok(bad2.error);
  assert.match(bad2.error.message, /incompatible/);
});

test('import_backup: Assistent darf nicht importieren', async () => {
  const { error } = await clients.bAssist.rpc('import_backup', {
    p_payload: payload({}), p_mode: 'merge',
  });
  assert.ok(error, 'Assistent konnte importieren!');
  assert.match(error.message, /admin only/);
});

test('import_backup: ungültiger Modus wird abgelehnt', async () => {
  const { error } = await clients.bAdmin.rpc('import_backup', {
    p_payload: payload({}), p_mode: 'delete-all',
  });
  assert.ok(error);
  assert.match(error.message, /invalid mode/);
});

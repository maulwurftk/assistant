// ============================================================================
// Backup-Feature End-to-End (Backup-Spec §6) — gegen Staging, nur Tenant B.
// Baut einen Export in Datei-Form (gleiche Tabellenliste wie lib/backup.ts)
// und prüft über den import_backup-RPC:
//   * Export → Import (merge) in dieselbe DB = Idempotenz (keine Duplikate)
//   * gelöschte Zeile → Import (merge) stellt exakt sie wieder her
//   * replace: Rundlauf erhält den Datenbestand; profiles unangetastet
// ============================================================================
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { serviceClient, getOrgs, ensureTestUsers, signedInClient } from './shared.mjs'

const EXPORT_TABLES = [
  'profiles', 'activities', 'payroll_settings', 'time_entries', 'calendar_slots',
  'monthly_reports', 'notifications', 'payroll_runs', 'account_ledger',
  'assistant_unavailability',
]

const svc = serviceClient()
let orgs, ids, bAdmin, orgB
const M = 'rls-backup'

async function exportTenant(tenantId) {
  const data = {}
  for (const t of EXPORT_TABLES) {
    const { data: rows, error } = await svc.from(t).select('*').eq('tenant_id', tenantId).order('id')
    if (error) throw new Error('Export ' + t + ': ' + error.message)
    data[t] = rows ?? []
  }
  return { manifest: { format: 'assistenten-app-backup', schemaVersion: 1 }, data }
}

async function countTenant(tenantId) {
  const counts = {}
  for (const t of EXPORT_TABLES) {
    const { count, error } = await svc.from(t).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId)
    if (error) throw new Error('Count ' + t + ': ' + error.message)
    counts[t] = count ?? 0
  }
  return counts
}

before(async () => {
  orgs = await getOrgs(svc)
  orgB = orgs['demo-org-b']
  ids = await ensureTestUsers(svc, orgs)
  bAdmin = await signedInClient('bAdmin')

  // payroll_settings für B sicherstellen (Singleton)
  const { data: ps } = await svc.from('payroll_settings').select('id').eq('tenant_id', orgB)
  if (!ps?.length) await svc.from('payroll_settings').insert({ tenant_id: orgB })

  // Aufräumen + definierte Testdaten in B anlegen
  await svc.from('time_entries').delete().eq('description', M)
  await svc.from('activities').delete().like('name', M + '%')
  const { error: ae } = await svc.from('activities').insert({ name: M + '-act', tenant_id: orgB })
  if (ae) throw ae
  const { error: te } = await svc.from('time_entries').insert({
    assistant_id: ids.bAssist, date: '2099-03-01', start_time: '08:00', end_time: '10:00',
    description: M, tenant_id: orgB,
  })
  if (te) throw te
})

after(async () => {
  await svc.from('time_entries').delete().eq('description', M)
  await svc.from('activities').delete().like('name', M + '%')
})

test('Export → Import (merge) ist idempotent (keine Duplikate, keine Verluste)', async () => {
  const backup = await exportTenant(orgB)
  const countsBefore = await countTenant(orgB)

  const { data: rep, error } = await bAdmin.rpc('import_backup', { p_payload: backup, p_mode: 'merge' })
  assert.equal(error, null, error?.message)

  const countsAfter = await countTenant(orgB)
  assert.deepEqual(countsAfter, countsBefore, 'Zeilenzahlen haben sich durch Re-Import verändert!')
  // alles wurde als update verbucht, nichts neu eingefügt
  for (const [t, s] of Object.entries(rep.applied)) {
    assert.equal(s.inserted, 0, t + ': Re-Import hat Zeilen NEU angelegt (Duplikate?)')
  }
})

test('gelöschte Zeile wird durch Import (merge) exakt wiederhergestellt', async () => {
  const backup = await exportTenant(orgB)
  const { data: victim } = await svc.from('time_entries')
    .select('id').eq('tenant_id', orgB).eq('description', M).single()

  await svc.from('time_entries').delete().eq('id', victim.id)
  const { data: gone } = await svc.from('time_entries').select('id').eq('id', victim.id)
  assert.equal(gone.length, 0)

  const { error } = await bAdmin.rpc('import_backup', { p_payload: backup, p_mode: 'merge' })
  assert.equal(error, null, error?.message)

  const { data: restored } = await svc.from('time_entries')
    .select('id, description, start_time, tenant_id').eq('id', victim.id).single()
  assert.ok(restored, 'Zeile wurde nicht wiederhergestellt')
  assert.equal(restored.description, M)
  assert.equal(restored.tenant_id, orgB)
})

test('replace-Rundlauf: Bestand bleibt erhalten, profiles unangetastet', async () => {
  const backup = await exportTenant(orgB)
  const countsBefore = await countTenant(orgB)
  const { data: profilesBefore } = await svc.from('profiles')
    .select('id, full_name').eq('tenant_id', orgB).order('id')

  const { data: rep, error } = await bAdmin.rpc('import_backup', { p_payload: backup, p_mode: 'replace' })
  assert.equal(error, null, error?.message)
  assert.equal(rep.mode, 'replace')

  const countsAfter = await countTenant(orgB)
  assert.deepEqual(countsAfter, countsBefore, 'replace-Rundlauf hat den Bestand verändert!')

  const { data: profilesAfter } = await svc.from('profiles')
    .select('id, full_name').eq('tenant_id', orgB).order('id')
  assert.deepEqual(profilesAfter, profilesBefore, 'profiles wurden durch replace verändert!')

  // Marker-Daten existieren weiterhin (mit identischer id aus dem Export)
  const exportedAct = backup.data.activities.find((a) => a.name === M + '-act')
  const { data: act } = await svc.from('activities').select('id').eq('id', exportedAct.id)
  assert.equal(act.length, 1, 'Marker-Activity nach replace verschwunden')
})

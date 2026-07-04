import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// ============================================================================
// Datensicherung (Backup-Spec): Export-Builder + Import-Dry-Run.
// Läuft mit dem SERVICE-Client (RLS-Bypass) — deshalb wird der Tenant hier
// überall EXPLIZIT gefiltert (Spec §1/§4.2/§7). push_subscriptions sind
// bewusst nicht enthalten (§2: flüchtige Device-Tokens).
// ============================================================================

export const SCHEMA_VERSION = 1
export const BACKUP_FORMAT = 'assistenten-app-backup'

// FK-Reihenfolge (Insert = Eltern zuerst; §2)
export const EXPORT_TABLES = [
  'profiles',
  'activities',
  'payroll_settings',
  'time_entries',
  'calendar_slots',
  'monthly_reports',
  'notifications',
  'payroll_runs',
  'account_ledger',
  'assistant_unavailability',
] as const

export type ExportTable = (typeof EXPORT_TABLES)[number]

type Db = SupabaseClient<Database>
type Row = Record<string, unknown>

// Pflicht-Referenzen auf profiles (fehlend → Zeile wird übersprungen; §4.2)
const REQUIRED_PROFILE_REF: Partial<Record<ExportTable, string>> = {
  time_entries: 'assistant_id',
  calendar_slots: 'created_by',
  monthly_reports: 'assistant_id',
  notifications: 'user_id',
  payroll_runs: 'assistant_id',
  assistant_unavailability: 'assistant_id',
}

// ── Validierungs-Gate (§4.1): fremde/inkompatible Dateien hart ablehnen ─────
const rowArray = z.array(z.record(z.string(), z.unknown())).optional()

export const backupFileSchema = z.object({
  manifest: z.object({
    format: z.literal(BACKUP_FORMAT),
    schemaVersion: z.literal(SCHEMA_VERSION),
  }),
  data: z.object(
    Object.fromEntries(EXPORT_TABLES.map((t) => [t, rowArray])) as Record<
      ExportTable,
      typeof rowArray
    >
  ),
})

export type BackupFile = {
  manifest: {
    format: typeof BACKUP_FORMAT
    schemaVersion: typeof SCHEMA_VERSION
    appVersion: string | null
    exportedAt: string
    exportedBy: string
    tenant: { id: string; name: string | null; slug: string | null }
    counts: Record<string, number>
  }
  data: Record<ExportTable, Row[]>
}

// ── Export (§3): alle Tabellen tenant-scoped, volle Zeilen inkl. id ─────────
export async function buildExport(
  db: Db,
  tenantId: string,
  exportedBy: string
): Promise<BackupFile> {
  const { data: org } = await db
    .from('organizations')
    .select('name, slug')
    .eq('id', tenantId)
    .single()

  const data = {} as Record<ExportTable, Row[]>
  const counts: Record<string, number> = {}

  for (const table of EXPORT_TABLES) {
    const { data: rows, error } = await db
      .from(table)
      .select('*')
      .eq('tenant_id', tenantId)
      .order('id')
    if (error) throw new Error(`Export ${table}: ${error.message}`)
    data[table] = (rows ?? []) as Row[]
    counts[table] = data[table].length
  }

  return {
    manifest: {
      format: BACKUP_FORMAT,
      schemaVersion: SCHEMA_VERSION,
      appVersion: process.env.npm_package_version ?? null,
      exportedAt: new Date().toISOString(),
      exportedBy,
      tenant: { id: tenantId, name: org?.name ?? null, slug: org?.slug ?? null },
      counts,
    },
    data,
  }
}

// ── Dry-Run (§4.5): Vorschau ohne einen einzigen Schreibzugriff ──────────────
// Spiegelt die Skip-Regeln des import_backup-RPC (0011).
export type DryRunResult = {
  mode: 'merge' | 'replace'
  tables: Record<string, { insert: number; update: number; skip: number; deleteExisting: number }>
  skipped: Array<{ table: string; id: string | null; reason: string }>
}

export async function dryRunImport(
  db: Db,
  tenantId: string,
  backup: { data: Partial<Record<ExportTable, Row[]>> },
  mode: 'merge' | 'replace'
): Promise<DryRunResult> {
  const result: DryRunResult = { mode, tables: {}, skipped: [] }

  // Profile des eigenen Tenants (für Referenz-Checks)
  const { data: tenantProfiles } = await db
    .from('profiles')
    .select('id')
    .eq('tenant_id', tenantId)
  const inTenant = new Set((tenantProfiles ?? []).map((p) => p.id))

  // Auth-User (für profiles-Skip „kein Auth-User“)
  const { data: userList, error: authError } = await db.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })
  if (authError) throw new Error('Auth-Userliste: ' + authError.message)
  const authIds = new Set(userList.users.map((u) => u.id))

  for (const table of EXPORT_TABLES) {
    const rows = backup.data[table] ?? []
    const stats = { insert: 0, update: 0, skip: 0, deleteExisting: 0 }
    result.tables[table] = stats

    // Bestehende Zeilen im eigenen Tenant
    const { data: ownRows, error: ownError } = await db
      .from(table)
      .select('id')
      .eq('tenant_id', tenantId)
    if (ownError) throw new Error(`Dry-Run ${table}: ${ownError.message}`)
    const ownIds = new Set((ownRows ?? []).map((r) => r.id))

    // replace löscht bestehende Fachzeilen (NICHT profiles/payroll_settings; §2/0011)
    if (mode === 'replace' && table !== 'profiles' && table !== 'payroll_settings') {
      stats.deleteExisting = ownIds.size
    }

    // id-Kollisionen mit fremden Tenants
    const fileIds = rows.map((r) => r.id).filter((x): x is string => typeof x === 'string')
    const foreignIds = new Set<string>()
    for (let i = 0; i < fileIds.length; i += 500) {
      const chunk = fileIds.slice(i, i + 500)
      const { data: foreign } = await db
        .from(table)
        .select('id')
        .in('id', chunk)
        .neq('tenant_id', tenantId)
      for (const f of foreign ?? []) foreignIds.add(f.id)
    }

    const refCol = REQUIRED_PROFILE_REF[table]

    for (const row of rows) {
      const id = typeof row.id === 'string' ? row.id : null

      if (table === 'profiles') {
        if (!id || !authIds.has(id)) {
          stats.skip++
          result.skipped.push({ table, id, reason: 'kein Auth-User — Login kann nicht importiert werden' })
          continue
        }
        if (foreignIds.has(id)) {
          stats.skip++
          result.skipped.push({ table, id, reason: 'Profil gehört zu fremdem Tenant' })
          continue
        }
        if (ownIds.has(id)) stats.update++
        else stats.insert++
        continue
      }

      if (id && foreignIds.has(id)) {
        stats.skip++
        result.skipped.push({ table, id, reason: 'id-Kollision mit fremdem Tenant' })
        continue
      }
      if (refCol) {
        const ref = row[refCol]
        if (typeof ref !== 'string' || !inTenant.has(ref)) {
          stats.skip++
          result.skipped.push({ table, id, reason: `${refCol} nicht im Tenant` })
          continue
        }
      }
      if (table === 'payroll_settings') {
        // Singleton je Tenant: erste Zeile zählt, Upsert per tenant_id
        if (stats.insert + stats.update > 0) {
          stats.skip++
          result.skipped.push({ table, id, reason: 'nur eine payroll_settings-Zeile je Tenant' })
          continue
        }
        if (ownIds.size > 0) stats.update++
        else stats.insert++
        continue
      }
      if (id && ownIds.has(id) && mode === 'merge') stats.update++
      else stats.insert++
    }
  }

  return result
}

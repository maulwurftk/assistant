import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { resolveTenantAdmin } from '@/lib/tenant'
import { backupFileSchema, buildExport, dryRunImport } from '@/lib/backup'
import type { Database } from '@/types/database'

const MAX_BYTES = 25 * 1024 * 1024 // §4.1: Upload-Größenlimit

// POST /api/admin/backup/import — Admin-only.
// Body: { mode: 'merge'|'replace', dryRun?: boolean, confirm?: string, backup: <Datei-JSON> }
//   dryRun=true  → nur Vorschau (liest, schreibt nichts; §4.5)
//   dryRun=false → Pre-Restore-Snapshot (§4.4) + atomarer Import via RPC (0011)
//                  bei 'replace' zusätzlich confirm === 'ERSETZEN' (§4.5)
export async function POST(request: Request) {
  const ctx = await resolveTenantAdmin()
  if (!ctx) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BYTES) {
    return NextResponse.json({ error: 'Datei zu groß (max. 25 MB)' }, { status: 413 })
  }

  let body: { mode?: string; dryRun?: boolean; confirm?: string; backup?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 })
  }

  const mode = body.mode
  if (mode !== 'merge' && mode !== 'replace') {
    return NextResponse.json({ error: 'Ungültiger Modus (merge|replace)' }, { status: 400 })
  }

  // Format-Gate (§4.1): fremde/inkompatible Sicherungen hart ablehnen
  const parsed = backupFileSchema.safeParse(body.backup)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Inkompatible oder fremde Sicherungsdatei (Format/schemaVersion)' },
      { status: 400 }
    )
  }
  const backup = body.backup as { data: Parameters<typeof dryRunImport>[2]['data'] }

  const db = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── Vorschau ────────────────────────────────────────────────────────────────
  if (body.dryRun) {
    try {
      const preview = await dryRunImport(db, ctx.tenantId, backup, mode)
      return NextResponse.json({ preview })
    } catch (e) {
      console.error('Dry-Run error:', e)
      return NextResponse.json({ error: 'Vorschau fehlgeschlagen' }, { status: 500 })
    }
  }

  // ── Ausführung ──────────────────────────────────────────────────────────────
  if (mode === 'replace' && body.confirm !== 'ERSETZEN') {
    return NextResponse.json(
      { error: 'Bestätigung fehlt: Für „Ersetzen" muss ERSETZEN getippt werden' },
      { status: 400 }
    )
  }

  try {
    // Pre-Restore-Snapshot (§4.4): Stand VOR dem Import, geht als Download zurück
    const preRestoreSnapshot = await buildExport(db, ctx.tenantId, ctx.userId)

    // Import atomar über den security-definer-RPC (0011) — läuft als
    // eingeloggter Admin (user-scoped Client), tenant_id wird DB-seitig erzwungen
    const supabase = await createClient()
    const { data: report, error } = await supabase.rpc('import_backup', {
      p_payload: body.backup,
      p_mode: mode,
    })

    if (error) {
      console.error('Import RPC error:', error)
      return NextResponse.json({ error: 'Import fehlgeschlagen: ' + error.message }, { status: 500 })
    }

    return NextResponse.json({ report, preRestoreSnapshot })
  } catch (e) {
    console.error('Import error:', e)
    return NextResponse.json({ error: 'Import fehlgeschlagen' }, { status: 500 })
  }
}

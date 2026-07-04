import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { resolveTenantAdmin } from '@/lib/tenant'
import { buildExport } from '@/lib/backup'
import type { Database } from '@/types/database'

// GET /api/admin/backup/export — Datensicherung (Fachdaten) als JSON-Download.
// Admin-only; Service-Role nötig, weil der Export ALLE Zeilen des Tenants
// enthält (z. B. fremde notifications), die RLS dem Admin nicht liefert.
// Tenant kommt ausschließlich aus der Session (Spec §7).
export async function GET() {
  const ctx = await resolveTenantAdmin()
  if (!ctx) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })

  const db = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const backup = await buildExport(db, ctx.tenantId, ctx.userId)

    const ts = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const stamp = `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}`
    const slug = backup.manifest.tenant.slug ?? 'tenant'
    const filename = `sicherung-${slug}-${stamp}.json`

    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    console.error('Export error:', e)
    return NextResponse.json({ error: 'Export fehlgeschlagen' }, { status: 500 })
  }
}

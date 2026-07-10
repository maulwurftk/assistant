import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveTenantAdmin } from '@/lib/tenant'

export async function POST(request: Request) {
  const ctx = await resolveTenantAdmin()
  if (!ctx) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })

  const body = await request.json()
  const { assistantId, rv_pflicht, kv_pflicht, minijob_limit } = body

  const hasMinijobLimit =
    minijob_limit === null || typeof minijob_limit === 'number'
  if (
    !assistantId ||
    (typeof rv_pflicht !== 'boolean' &&
      typeof kv_pflicht !== 'boolean' &&
      minijob_limit === undefined)
  ) {
    return NextResponse.json({ error: 'Ungültige Parameter' }, { status: 400 })
  }
  if (minijob_limit !== undefined && !hasMinijobLimit) {
    return NextResponse.json({ error: 'Ungültige Minijobgrenze' }, { status: 400 })
  }
  if (typeof minijob_limit === 'number' && minijob_limit < 0) {
    return NextResponse.json({ error: 'Minijobgrenze darf nicht negativ sein' }, { status: 400 })
  }

  const updatePayload: { rv_pflicht?: boolean; kv_pflicht?: boolean; minijob_limit?: number | null } = {}
  if (typeof rv_pflicht === 'boolean') updatePayload.rv_pflicht = rv_pflicht
  if (typeof kv_pflicht === 'boolean') updatePayload.kv_pflicht = kv_pflicht
  if (minijob_limit !== undefined) updatePayload.minijob_limit = minijob_limit

  // Tenant explizit scopen (Defense-in-Depth zusätzlich zur RLS) und 0 Zeilen
  // als 404 melden statt still „ok" (M3)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .update(updatePayload)
    .eq('id', assistantId)
    .eq('tenant_id', ctx.tenantId)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

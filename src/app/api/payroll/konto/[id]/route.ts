import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { resolveTenantAdmin } from '@/lib/tenant'
import type { Database } from '@/types/database'

function adminDb() {
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// PATCH: entweder bestätigen (action: 'confirm' / leerer Body) oder Felder bearbeiten
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveTenantAdmin()
  if (!ctx) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })

  const { id } = await params
  const db = adminDb()
  const body = await req.json().catch(() => ({}))

  // Bearbeiten: wenn Buchungsfelder mitgeschickt werden
  const hasFields =
    body.booking_date != null ||
    body.direction != null ||
    body.category != null ||
    body.amount != null ||
    body.description !== undefined

  if (hasFields) {
    const update: Record<string, unknown> = {}
    if (body.booking_date) update.booking_date = body.booking_date
    if (body.direction === 'in' || body.direction === 'out') update.direction = body.direction
    if (typeof body.category === 'string' && body.category.trim()) update.category = body.category.trim()
    if (body.amount != null && !isNaN(Number(body.amount))) update.amount = Math.abs(Number(body.amount))
    if (body.description !== undefined) update.description = body.description || null

    const { data, error } = await db.from('account_ledger').update(update as never)
      .eq('id', id).eq('tenant_id', ctx.tenantId).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  // Sonst: bestätigen (pending → confirmed)
  const { data, error } = await db
    .from('account_ledger')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() } as never)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

// Buchung löschen (verwerfen)
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveTenantAdmin()
  if (!ctx) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })

  const { id } = await params
  const db = adminDb()
  const { data, error } = await db.from('account_ledger').delete()
    .eq('id', id).eq('tenant_id', ctx.tenantId).select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

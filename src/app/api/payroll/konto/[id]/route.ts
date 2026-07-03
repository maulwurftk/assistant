import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function adminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401 as const }
  const db = adminDb()
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { ok: false, status: 403 as const }
  return { ok: true, status: 200 as const }
}

// PATCH: entweder bestätigen (action: 'confirm' / leerer Body) oder Felder bearbeiten
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'Kein Zugriff' }, { status: auth.status })

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

    const { error } = await db.from('account_ledger').update(update).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Sonst: bestätigen (pending → confirmed)
  const { error } = await db
    .from('account_ledger')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// Buchung löschen (verwerfen)
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'Kein Zugriff' }, { status: auth.status })

  const { id } = await params
  const db = adminDb()
  const { error } = await db.from('account_ledger').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

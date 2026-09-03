import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveTenant } from '@/lib/tenant'

/**
 * Bestätigt einen zugewiesenen Kalender-Slot mit der tatsächlich geleisteten
 * Zeit (Ist-Zeit). Erst durch diese Bestätigung wird ein Slot
 * abrechnungsrelevant (siehe Migration 0024_slot_confirmation.sql) – reine
 * Zuweisung reicht nicht mehr aus.
 *
 * Darf die zugewiesene Assistentin selbst aufrufen (Regelfall) oder ein Admin
 * (z.B. wenn die Assistentin es vergessen hat / Fremderfassung).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveTenant()
  if (!ctx) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const { actual_start_time, actual_end_time, activity_id } = body as {
    actual_start_time?: string | null
    actual_end_time?: string | null
    activity_id?: string | null
  }

  const service = await createServiceClient()

  const { data: slot, error: slotErr } = await service
    .from('calendar_slots')
    .select('id, tenant_id, assigned_to, status, start_time, end_time, confirmed_at')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle()

  if (slotErr) return NextResponse.json({ error: slotErr.message }, { status: 500 })
  if (!slot) return NextResponse.json({ error: 'Termin nicht gefunden' }, { status: 404 })

  const isOwnSlot = slot.assigned_to === ctx.userId
  if (!isOwnSlot && ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Kein Zugriff auf diesen Termin' }, { status: 403 })
  }
  if (slot.status !== 'assigned') {
    return NextResponse.json({ error: 'Nur zugewiesene Termine können bestätigt werden' }, { status: 400 })
  }

  const { error: updateErr } = await service
    .from('calendar_slots')
    .update({
      confirmed_at: new Date().toISOString(),
      confirmed_by: ctx.userId,
      actual_start_time: actual_start_time || null,
      actual_end_time: actual_end_time || null,
      activity_id: activity_id || null,
    } as never)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

/**
 * Macht eine Bestätigung rückgängig (z.B. wenn sich die Assistentin vertippt
 * hat). Nur die Assistentin selbst oder ein Admin.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveTenant()
  if (!ctx) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })

  const { id } = await params
  const service = await createServiceClient()

  const { data: slot, error: slotErr } = await service
    .from('calendar_slots')
    .select('id, tenant_id, assigned_to, confirmed_by')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle()

  if (slotErr) return NextResponse.json({ error: slotErr.message }, { status: 500 })
  if (!slot) return NextResponse.json({ error: 'Termin nicht gefunden' }, { status: 404 })

  const isOwnSlot = slot.assigned_to === ctx.userId
  if (!isOwnSlot && ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Kein Zugriff auf diesen Termin' }, { status: 403 })
  }

  const { error: updateErr } = await service
    .from('calendar_slots')
    .update({
      confirmed_at: null,
      confirmed_by: null,
      actual_start_time: null,
      actual_end_time: null,
    } as never)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveTenantAdmin } from '@/lib/tenant'

type Params = Promise<{ id: string }>

export async function PATCH(request: Request, { params }: { params: Params }) {
  const ctx = await resolveTenantAdmin()
  if (!ctx) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })

  const { id } = await params
  const body = await request.json()
  const { title, date, start_time, end_time, is_private, activity_id } = body

  if (start_time && end_time && start_time >= end_time) {
    return NextResponse.json({ error: 'Endzeit muss nach der Startzeit liegen' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (title !== undefined) patch.title = title
  if (date !== undefined) patch.date = date
  if (start_time !== undefined) patch.start_time = start_time
  if (end_time !== undefined) patch.end_time = end_time
  if (is_private !== undefined) patch.is_private = is_private
  if (activity_id !== undefined) patch.activity_id = activity_id || null

  const service = await createServiceClient()

  // Nachträgliche Meldung (self_reported) noch nicht freigegeben: Ist-Zeit = geänderte Zeit,
  // sonst zählt nach Freigabe die alte Ist-Zeit in der Lohnabrechnung.
  if (start_time !== undefined || end_time !== undefined) {
    const { data: cur } = await service.from('calendar_slots')
      .select('status, self_reported, start_time, end_time')
      .eq('id', id).eq('tenant_id', ctx.tenantId).single()
    const c = cur as { status: string; self_reported: boolean | null; start_time: string; end_time: string } | null
    if (c && c.status === 'pending' && c.self_reported) {
      patch.actual_start_time = start_time ?? c.start_time
      patch.actual_end_time = end_time ?? c.end_time
    }
  }

  const { data, error } = await service
    .from('calendar_slots')
    .update(patch as never)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

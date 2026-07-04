import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveTenantAdmin } from '@/lib/tenant'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params
  const ctx = await resolveTenantAdmin()
  if (!ctx) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })

  const body = await request.json()
  const { date, start_time, end_time, activity_id, description } = body

  if (!date || !start_time || !end_time) {
    return NextResponse.json({ error: 'Pflichtfelder fehlen' }, { status: 400 })
  }
  if (start_time >= end_time) {
    return NextResponse.json({ error: 'Endzeit muss nach Startzeit liegen' }, { status: 400 })
  }

  const service = await createServiceClient()
  const { data, error } = await service
    .from('time_entries')
    .update({
      date,
      start_time,
      end_time,
      activity_id: activity_id || null,
      description: description || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params
  const ctx = await resolveTenantAdmin()
  if (!ctx) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })

  const service = await createServiceClient()
  const { data, error } = await service
    .from('time_entries')
    .delete()
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveTenantAdmin } from '@/lib/tenant'

export async function POST(request: Request) {
  const ctx = await resolveTenantAdmin()
  if (!ctx) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })

  const body = await request.json()
  const { assistant_id, date, start_time, end_time, activity_id, description } = body

  if (!assistant_id || !date || !start_time || !end_time) {
    return NextResponse.json({ error: 'Pflichtfelder fehlen' }, { status: 400 })
  }
  if (start_time >= end_time) {
    return NextResponse.json({ error: 'Endzeit muss nach Startzeit liegen' }, { status: 400 })
  }

  const service = await createServiceClient()
  const { data, error } = await service
    .from('time_entries')
    .insert({
      tenant_id: ctx.tenantId, // Composite-FK erzwingt: assistant_id muss zum Tenant gehören
      assistant_id,
      date,
      start_time,
      end_time,
      activity_id: activity_id || null,
      description: description || null,
      month_status: 'draft',
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

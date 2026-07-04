import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveTenantAdmin } from '@/lib/tenant'

type Params = Promise<{ id: string }>

export async function PATCH(request: Request, { params }: { params: Params }) {
  const ctx = await resolveTenantAdmin()
  if (!ctx) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })

  const { id } = await params
  const body = await request.json()
  const { title, date, start_time, end_time } = body

  if (start_time && end_time && start_time >= end_time) {
    return NextResponse.json({ error: 'Endzeit muss nach der Startzeit liegen' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (title !== undefined) patch.title = title
  if (date !== undefined) patch.date = date
  if (start_time !== undefined) patch.start_time = start_time
  if (end_time !== undefined) patch.end_time = end_time

  const service = await createServiceClient()
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

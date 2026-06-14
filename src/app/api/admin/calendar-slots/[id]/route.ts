import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

type Params = Promise<{ id: string }>

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? user : null
}

export async function PATCH(request: Request, { params }: { params: Params }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })

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
  const { error } = await service.from('calendar_slots').update(patch as any).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

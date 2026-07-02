import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if ((caller as { role?: string } | null)?.role !== 'admin') {
    return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })
  }

  const body = await request.json()
  const { assistantId, rv_pflicht, kv_pflicht } = body

  if (!assistantId || (typeof rv_pflicht !== 'boolean' && typeof kv_pflicht !== 'boolean')) {
    return NextResponse.json({ error: 'Ungültige Parameter' }, { status: 400 })
  }

  const updatePayload: { rv_pflicht?: boolean; kv_pflicht?: boolean } = {}
  if (typeof rv_pflicht === 'boolean') updatePayload.rv_pflicht = rv_pflicht
  if (typeof kv_pflicht === 'boolean') updatePayload.kv_pflicht = kv_pflicht

  const { error } = await supabase
    .from('profiles')
    .update(updatePayload)
    .eq('id', assistantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

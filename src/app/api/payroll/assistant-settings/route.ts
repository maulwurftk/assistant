import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const body = await request.json()
  const { assistantId, rv_pflicht } = body

  if (!assistantId || typeof rv_pflicht !== 'boolean') {
    return NextResponse.json({ error: 'Ungültige Parameter' }, { status: 400 })
  }

  const { error } = await supabase
    .from('profiles')
    .update({ rv_pflicht })
    .eq('id', assistantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

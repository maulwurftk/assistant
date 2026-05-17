import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('ical_token')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profil nicht gefunden' }, { status: 404 })

  return NextResponse.json({ token: profile.ical_token })
}

// Token zurücksetzen (neuen generieren)
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  const { data } = await supabase
    .from('profiles')
    .update({ ical_token: crypto.randomUUID() })
    .eq('id', user.id)
    .select('ical_token')
    .single()

  return NextResponse.json({ token: data?.ical_token })
}

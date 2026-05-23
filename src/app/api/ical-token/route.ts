import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('ical_token')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profil nicht gefunden' }, { status: 404 })

  const origin = new URL(request.url).origin
  const token = (profile as any).ical_token
  return NextResponse.json({
    token,
    url: `${origin}/api/calendar.ics?token=${token}`,
  })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  const { data } = await supabase
    .from('profiles')
    .update({ ical_token: crypto.randomUUID() } as any)
    .eq('id', user.id)
    .select('ical_token')
    .single()

  const origin = new URL(request.url).origin
  const token = (data as any)?.ical_token
  return NextResponse.json({
    token,
    url: `${origin}/api/calendar.ics?token=${token}`,
  })
}

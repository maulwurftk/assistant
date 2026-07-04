import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  let query = supabase
    .from('assistant_unavailability')
    .select('*, profiles!assistant_id(full_name)')
    .order('type')
    .order('date', { ascending: true, nullsFirst: false })
    .order('day_of_week', { ascending: true, nullsFirst: false })

  if (profile?.role !== 'admin') {
    query = query.eq('assistant_id', user.id)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const body = await request.json()
  const { type, date, day_of_week, all_day, start_time, end_time, valid_from, valid_until, note } = body

  if (!type || !['single', 'recurring'].includes(type)) {
    return NextResponse.json({ error: 'Ungültiger Typ' }, { status: 400 })
  }
  if (type === 'single' && !date) {
    return NextResponse.json({ error: 'Datum fehlt' }, { status: 400 })
  }
  if (type === 'recurring' && (day_of_week === undefined || day_of_week === null)) {
    return NextResponse.json({ error: 'Wochentag fehlt' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('assistant_unavailability')
    .insert({
      assistant_id: user.id,
      type,
      date: type === 'single' ? date : null,
      day_of_week: type === 'recurring' ? day_of_week : null,
      all_day: all_day ?? true,
      start_time: all_day ? null : (start_time || null),
      end_time: all_day ? null : (end_time || null),
      valid_from: type === 'recurring' ? (valid_from || null) : null,
      valid_until: type === 'recurring' ? (valid_until || null) : null,
      note: note || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

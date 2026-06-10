import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// Wöchentliche Vorlage aus Zielvereinbarung Bezirk Oberpfalz (01.03.2026–29.02.2028)
// Mo/Mi/Fr Elternassistenz (9h), Di/Do Persönliche Assistenz (6h)
const TEMPLATE = [
  { jsDay: 1, start_time: '08:00', end_time: '11:00', activityName: 'Elternassistenz – Betreuung Tochter' },
  { jsDay: 2, start_time: '10:00', end_time: '13:00', activityName: 'Pers. Assistenz – Freizeitbegleitung' },
  { jsDay: 3, start_time: '08:00', end_time: '11:00', activityName: 'Elternassistenz – Betreuung Tochter' },
  { jsDay: 4, start_time: '09:00', end_time: '10:00', activityName: 'Pers. Assistenz – Einkauf' },
  { jsDay: 4, start_time: '10:00', end_time: '12:00', activityName: 'Pers. Assistenz – Arzttermin' },
  { jsDay: 5, start_time: '08:00', end_time: '11:00', activityName: 'Elternassistenz – Aufräumen / Einkauf' },
]

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })

  const { assistant_id, year, month } = await request.json()
  if (!assistant_id || !year || !month) {
    return NextResponse.json({ error: 'Pflichtfelder fehlen' }, { status: 400 })
  }

  const service = await createServiceClient()

  // Tätigkeits-IDs per Name nachschlagen
  const { data: activities } = await service.from('activities').select('id, name')
  const activityByName = Object.fromEntries((activities ?? []).map((a) => [a.name, a.id]))

  // Bestehende Einträge im Monat laden (zur Duplikaterkennung)
  const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`
  const dateTo = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
  const { data: existing } = await service
    .from('time_entries')
    .select('date, start_time')
    .eq('assistant_id', assistant_id)
    .gte('date', dateFrom)
    .lt('date', dateTo)

  const existingKeys = new Set((existing ?? []).map((e) => `${e.date}|${e.start_time.slice(0, 5)}`))

  // Alle Tage des Monats durchlaufen, Template anwenden
  const toInsert: object[] = []
  const daysInMonth = new Date(year, month, 0).getDate()
  let skipped = 0

  for (let day = 1; day <= daysInMonth; day++) {
    const jsDay = new Date(year, month - 1, day).getDay()
    for (const slot of TEMPLATE) {
      if (slot.jsDay !== jsDay) continue
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const key = `${dateStr}|${slot.start_time}`
      if (existingKeys.has(key)) { skipped++; continue }
      toInsert.push({
        assistant_id,
        date: dateStr,
        start_time: slot.start_time,
        end_time: slot.end_time,
        activity_id: activityByName[slot.activityName] ?? null,
        month_status: 'draft',
        updated_at: new Date().toISOString(),
      })
    }
  }

  if (toInsert.length > 0) {
    const { error } = await service.from('time_entries').insert(toInsert)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, created: toInsert.length, skipped })
}

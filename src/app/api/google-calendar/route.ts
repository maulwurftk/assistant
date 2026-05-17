import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json([])

  const icalUrl = process.env.GOOGLE_CALENDAR_ICAL_URL
  if (!icalUrl) return NextResponse.json([])

  try {
    const res = await fetch(icalUrl, {
      headers: { 'User-Agent': 'AssistentenApp/1.0' },
      next: { revalidate: 300 },
    })
    if (!res.ok) return NextResponse.json([])
    const text = await res.text()
    return NextResponse.json(parseIcal(text))
  } catch {
    return NextResponse.json([])
  }
}

function unfold(text: string): string {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
}

function parseIcalDate(value: string, line: string): string | null {
  const isDateOnly = line.includes('VALUE=DATE') || !value.includes('T')
  if (isDateOnly) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
  }
  const y = value.slice(0, 4), mo = value.slice(4, 6), d = value.slice(6, 8)
  const h = value.slice(9, 11), mi = value.slice(11, 13), s = value.slice(13, 15)
  return value.endsWith('Z')
    ? `${y}-${mo}-${d}T${h}:${mi}:${s}Z`
    : `${y}-${mo}-${d}T${h}:${mi}:${s}`
}

function parseIcal(icalText: string) {
  const unfolded = unfold(icalText)
  const events = []
  const blocks = unfolded.split('BEGIN:VEVENT')

  for (let i = 1; i < blocks.length; i++) {
    const endIdx = blocks[i].indexOf('END:VEVENT')
    if (endIdx === -1) continue
    const block = blocks[i].substring(0, endIdx)

    const summaryMatch = block.match(/^SUMMARY:(.*)$/m)
    const uidMatch = block.match(/^UID:(.*)$/m)
    const dtStartMatch = block.match(/^DTSTART(?:;[^:]*)?:(.*)$/m)
    const dtEndMatch = block.match(/^DTEND(?:;[^:]*)?:(.*)$/m)

    if (!dtStartMatch) continue

    const summary = summaryMatch?.[1]?.trim() ?? '(kein Titel)'
    const uid = uidMatch?.[1]?.trim() ?? `gcal-${i}`
    const startVal = dtStartMatch[1].trim()
    const endVal = dtEndMatch?.[1]?.trim()
    const isAllDay = dtStartMatch[0].includes('VALUE=DATE') || !startVal.includes('T')

    const start = parseIcalDate(startVal, dtStartMatch[0])
    if (!start) continue

    events.push({
      id: `gcal-${uid}`,
      title: summary,
      start,
      ...(endVal ? { end: parseIcalDate(endVal, dtEndMatch![0]) } : {}),
      allDay: isAllDay,
      backgroundColor: '#4285F4',
      borderColor: '#3367D6',
      textColor: '#fff',
      editable: false,
      extendedProps: { source: 'google' },
    })
  }

  return events
}

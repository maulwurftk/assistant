import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function toIcalDate(dateStr: string, timeStr: string): string {
  // dateStr: "2024-01-15", timeStr: "09:00:00" → "20240115T090000"
  const [y, m, d] = dateStr.split('-')
  const [h, min] = timeStr.split(':')
  return `${y}${m}${d}T${h}${min}00`
}

function escapeIcal(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function formatIcal(lines: string[]): string {
  // iCal spec: lines max 75 chars, continuation lines start with space
  return lines
    .map((line) => {
      if (line.length <= 75) return line
      const chunks: string[] = []
      chunks.push(line.slice(0, 75))
      let i = 75
      while (i < line.length) {
        chunks.push(' ' + line.slice(i, i + 74))
        i += 74
      }
      return chunks.join('\r\n')
    })
    .join('\r\n')
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return new NextResponse('Token fehlt', { status: 400 })
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Token validieren – Profil anhand des ical_token finden
  const { data: profile } = await adminClient
    .from('profiles')
    .select('id, full_name, role')
    .eq('ical_token', token)
    .single()

  if (!profile) {
    return new NextResponse('Ungültiger Token', { status: 401 })
  }

  // Kalender-Slots laden (Admin sieht alle, Assistent nur eigene)
  let query = adminClient
    .from('calendar_slots')
    .select('*, assigned_profile:profiles!assigned_to(full_name)')
    .neq('status', 'cancelled')
    .order('date')
    .order('start_time')

  if (profile.role === 'assistant') {
    query = query.eq('assigned_to', profile.id)
  }

  const { data: slots } = await query

  // iCal aufbauen
  const now = new Date()
  const dtstamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://assistenten-app.vercel.app'

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Assistenten-App//Kalender//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Assistenten-App – Einsatzplanung',
    'X-WR-CALDESC:Kalender-Slots aus der Assistenten-App',
    'X-WR-TIMEZONE:Europe/Vienna',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Vienna',
    'BEGIN:STANDARD',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'END:DAYLIGHT',
    'END:VTIMEZONE',
  ]

  for (const slot of slots ?? []) {
    const assignedName = (slot.assigned_profile as any)?.full_name
    const summary = assignedName
      ? `${escapeIcal(slot.title)} (${escapeIcal(assignedName)})`
      : `${escapeIcal(slot.title)} – offen`

    const description = [
      slot.description ? `Notizen: ${slot.description}` : null,
      assignedName ? `Assistent: ${assignedName}` : 'Noch kein Assistent zugewiesen',
      `Status: ${slot.status === 'open' ? 'Offen' : slot.status === 'assigned' ? 'Besetzt' : slot.status}`,
    ]
      .filter(Boolean)
      .join('\\n')

    lines.push(
      'BEGIN:VEVENT',
      `UID:slot-${slot.id}@assistenten-app`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=Europe/Vienna:${toIcalDate(slot.date, slot.start_time)}`,
      `DTEND;TZID=Europe/Vienna:${toIcalDate(slot.date, slot.end_time)}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      `URL:${appUrl}/kalender`,
      `STATUS:${slot.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
      'END:VEVENT'
    )
  }

  lines.push('END:VCALENDAR')

  const icsContent = formatIcal(lines)

  return new NextResponse(icsContent, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

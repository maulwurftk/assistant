import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function adminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function toIsoLocal(date: string, time: string) {
  return `${date}T${time.slice(0, 5)}:00`
}

function minutesBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 60000)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Token fehlt' }, { status: 400 })
  }

  const db = adminDb()

  // Tenant folgt aus dem Profil des Tokens (Architektur §5.4) — nie aus der URL.
  const { data: profile } = await db
    .from('profiles')
    .select('id, full_name, role, tenant_id')
    .eq('ical_token', token)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Ungültiger Token' }, { status: 401 })
  }

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const horizonDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  const { data: slots } = await db
    .from('calendar_slots')
    .select('*, assigned_profile:profiles!assigned_to(id, full_name, color)')
    .eq('tenant_id', profile.tenant_id)
    .neq('status', 'cancelled')
    .gte('date', today)
    .lte('date', horizonDate)
    .order('date')
    .order('start_time')

  const all = (slots ?? []).map((s: any) => ({
    id: s.id,
    title: s.title,
    date: s.date,
    start_time: s.start_time.slice(0, 5),
    end_time: s.end_time.slice(0, 5),
    status: s.status,
    assistant: s.assigned_profile?.full_name ?? null,
    assistant_id: s.assigned_profile?.id ?? null,
    color: s.assigned_profile?.color ?? null,
    start_iso: toIsoLocal(s.date, s.start_time),
    end_iso: toIsoLocal(s.date, s.end_time),
  }))

  const current = all.find((s) => {
    const start = new Date(s.start_iso)
    const end = new Date(s.end_iso)
    return start <= now && now < end && s.status === 'assigned'
  })

  const upcoming = all.filter((s) => new Date(s.start_iso) > now)
  const next = upcoming.find((s) => s.status === 'assigned')

  const todaySlots = all.filter((s) => s.date === today)
  const todayAssistants = [
    ...new Set(todaySlots.filter((s) => s.assistant).map((s) => s.assistant)),
  ]

  const openSlots = all.filter((s) => s.status === 'open')
  const nextOpen = openSlots[0] ?? null

  return NextResponse.json(
    {
      generated_at: now.toISOString(),
      current: current
        ? {
            assistant: current.assistant,
            title: current.title,
            end_time: current.end_time,
            end_iso: current.end_iso,
            minutes_left: minutesBetween(now, new Date(current.end_iso)),
          }
        : null,
      next: next
        ? {
            assistant: next.assistant,
            title: next.title,
            date: next.date,
            start_time: next.start_time,
            end_time: next.end_time,
            start_iso: next.start_iso,
            minutes_until: minutesBetween(now, new Date(next.start_iso)),
          }
        : null,
      today: {
        date: today,
        slots_count: todaySlots.length,
        assistants: todayAssistants,
      },
      open: {
        count: openSlots.length,
        next: nextOpen
          ? {
              title: nextOpen.title,
              date: nextOpen.date,
              start_time: nextOpen.start_time,
              end_time: nextOpen.end_time,
            }
          : null,
      },
      upcoming: upcoming.slice(0, 20),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  )
}

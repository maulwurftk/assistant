import { NextResponse } from 'next/server'
import { resolveTenant } from '@/lib/tenant'
import { adminIds, createServiceDb, loadVacationSettings, notify } from '@/lib/vacation-server'
import { approveAbsence, VacationError } from '@/lib/vacation-actions'
import { ABSENCE_TYPE_LABELS, isVacationEligibleDay, formatDays } from '@/lib/vacation'
import type { AbsenceType } from '@/types/database'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const TYPES: AbsenceType[] = ['vacation', 'vacation_payout', 'sick', 'sick_child', 'special', 'unpaid']
const ASSISTANT_TYPES: AbsenceType[] = ['vacation', 'sick', 'sick_child']

/**
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Abwesenheiten (beantragt/genehmigt) im Zeitraum für Kalender & Planung.
 * Assistentinnen sehen bei Kolleginnen nur Zeitraum + "abwesend" (keine Art/Notiz).
 */
export async function GET(request: Request) {
  const ctx = await resolveTenant()
  if (!ctx) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  const url = new URL(request.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  if (!from || !to || !ISO.test(from) || !ISO.test(to)) {
    return NextResponse.json({ error: 'from/to fehlen' }, { status: 400 })
  }
  const db = createServiceDb()
  const { data, error } = await db
    .from('absences')
    .select('id, assistant_id, type, status, date_from, date_to, workdays, days, note')
    .eq('tenant_id', ctx.tenantId)
    .in('status', ['requested', 'approved'])
    .neq('type', 'vacation_payout')
    .lte('date_from', to)
    .gte('date_to', from)
    .order('date_from')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []).map((a) =>
    ctx.role === 'admin' || a.assistant_id === ctx.userId
      ? a
      : { id: a.id, assistant_id: a.assistant_id, type: 'absent', status: a.status, date_from: a.date_from, date_to: a.date_to, workdays: [], days: 0, note: null }
  )
  return NextResponse.json({ absences: rows })
}

/**
 * POST { assistant_id?, type, date_from, date_to, workdays?, days?, note?, approve? }
 * Assistentin: Antrag für sich selbst (Urlaub/Krankmeldung).
 * Admin: für jede Assistentin, jede Art, optional direkt genehmigt.
 */
export async function POST(request: Request) {
  const ctx = await resolveTenant()
  if (!ctx) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  const isAdmin = ctx.role === 'admin'
  const db = createServiceDb()
  const settings = await loadVacationSettings(db, ctx.tenantId)
  if (!settings.enabled) return NextResponse.json({ error: 'Urlaubsverwaltung ist nicht aktiviert.' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const type = body.type as AbsenceType
  const assistantId: string = isAdmin && typeof body.assistant_id === 'string' ? body.assistant_id : ctx.userId
  const dateFrom: string = body.date_from
  const dateTo: string = body.date_to ?? body.date_from
  const note: string | null = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 1000) : null

  if (!TYPES.includes(type) || (!isAdmin && !ASSISTANT_TYPES.includes(type))) {
    return NextResponse.json({ error: 'Ungültige Art' }, { status: 400 })
  }
  if (!ISO.test(dateFrom ?? '') || !ISO.test(dateTo ?? '') || dateTo < dateFrom) {
    return NextResponse.json({ error: 'Ungültiger Zeitraum' }, { status: 400 })
  }

  const { data: assistant } = await db
    .from('profiles').select('id, full_name, role')
    .eq('id', assistantId).eq('tenant_id', ctx.tenantId).maybeSingle()
  if (!assistant || assistant.role !== 'assistant') return NextResponse.json({ error: 'Assistentin nicht gefunden' }, { status: 404 })

  let workdays: string[] = []
  let days = 0
  if (type === 'vacation') {
    const raw: unknown[] = Array.isArray(body.workdays) ? body.workdays : []
    workdays = Array.from(new Set(raw.filter((d): d is string => typeof d === 'string' && ISO.test(d)))).sort()
    if (!workdays.length) return NextResponse.json({ error: 'Bitte die Arbeitstage auswählen, die als Urlaub zählen.' }, { status: 400 })
    if (workdays.some((d) => d < dateFrom || d > dateTo)) return NextResponse.json({ error: 'Urlaubstag außerhalb des Zeitraums' }, { status: 400 })
    const bad = workdays.find((d) => !isVacationEligibleDay(d, settings.region))
    if (bad) return NextResponse.json({ error: `${bad.split('-').reverse().join('.')} ist Sonntag oder Feiertag und zählt nicht als Urlaubstag.` }, { status: 400 })
    days = workdays.length
  } else if (type === 'vacation_payout') {
    days = Number(body.days)
    if (!(days > 0 && days <= 100)) return NextResponse.json({ error: 'Ungültige Anzahl Tage' }, { status: 400 })
  }

  if (type !== 'vacation_payout') {
    const { data: overlap } = await db
      .from('absences').select('id')
      .eq('tenant_id', ctx.tenantId).eq('assistant_id', assistantId)
      .in('status', ['requested', 'approved']).neq('type', 'vacation_payout')
      .lte('date_from', dateTo).gte('date_to', dateFrom).limit(1)
    if (overlap?.length) return NextResponse.json({ error: 'Im Zeitraum gibt es bereits eine Abwesenheit.' }, { status: 409 })
  }

  const { data: created, error } = await db.from('absences').insert({
    tenant_id: ctx.tenantId,
    assistant_id: assistantId,
    type,
    date_from: dateFrom,
    date_to: dateTo,
    workdays,
    days,
    note,
    requested_by: ctx.userId,
  }).select('*').single()
  if (error || !created) return NextResponse.json({ error: error?.message ?? 'Speichern fehlgeschlagen' }, { status: 500 })

  const range = `${dateFrom.split('-').reverse().join('.')}–${dateTo.split('-').reverse().join('.')}`
  if (isAdmin && body.approve === true) {
    try {
      const result = await approveAbsence(db, ctx.tenantId, created, ctx.userId, settings, null)
      return NextResponse.json({ absence: { ...created, status: 'approved' }, ...result })
    } catch (e) {
      // Antrag bleibt als "beantragt" stehen, damit nichts verloren geht
      const err = e as VacationError
      return NextResponse.json({ absence: created, error: err.message }, { status: err.status ?? 500 })
    }
  }

  if (!isAdmin) {
    await notify(db, ctx.tenantId, await adminIds(db, ctx.tenantId),
      `${ABSENCE_TYPE_LABELS[type]}: ${assistant.full_name}`,
      `${range}${days ? ` · ${formatDays(days)}` : ''}${note ? ` · ${note}` : ''} – bitte prüfen.`,
      'info', created.id)
  }
  return NextResponse.json({ absence: created })
}

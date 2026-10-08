import { NextResponse } from 'next/server'
import { resolveTenant } from '@/lib/tenant'
import { createServiceDb, loadVacationSettings, previewVacation } from '@/lib/vacation-server'
import { datesInRange, holidays, isVacationEligibleDay } from '@/lib/vacation'

const ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * POST { assistant_id?, date_from, date_to, workdays? }
 * Liefert: wählbare Tage (ohne Sonntag/Feiertag), vorgeschlagene Tage (geplante
 * Dienste der Assistentin), Urlaubsentgelt-Basis und Kontobelastung.
 */
export async function POST(request: Request) {
  const ctx = await resolveTenant()
  if (!ctx) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const assistantId: string = ctx.role === 'admin' && typeof body.assistant_id === 'string' ? body.assistant_id : ctx.userId
  const dateFrom: string = body.date_from
  const dateTo: string = body.date_to ?? body.date_from
  if (!ISO.test(dateFrom ?? '') || !ISO.test(dateTo ?? '') || dateTo < dateFrom) {
    return NextResponse.json({ error: 'Ungültiger Zeitraum' }, { status: 400 })
  }
  if (datesInRange(dateFrom, dateTo).length > 120) return NextResponse.json({ error: 'Zeitraum zu lang (max. 120 Tage)' }, { status: 400 })

  const db = createServiceDb()
  const { data: assistant } = await db.from('profiles').select('id').eq('id', assistantId).eq('tenant_id', ctx.tenantId).maybeSingle()
  if (!assistant) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })

  const settings = await loadVacationSettings(db, ctx.tenantId)
  const all = datesInRange(dateFrom, dateTo)
  const hol = new Map<string, string>()
  for (const y of new Set(all.map((d) => Number(d.slice(0, 4))))) {
    for (const [k, v] of holidays(y, settings.region)) hol.set(k, v)
  }
  const eligible = all.filter((d) => isVacationEligibleDay(d, settings.region))

  const { data: planned } = await db
    .from('calendar_slots').select('date')
    .eq('tenant_id', ctx.tenantId).eq('assigned_to', assistantId).eq('status', 'assigned')
    .gte('date', dateFrom).lte('date', dateTo)
  const suggested = Array.from(new Set((planned ?? []).map((s) => s.date))).filter((d) => eligible.includes(d)).sort()

  const chosen: string[] = Array.isArray(body.workdays)
    ? body.workdays.filter((d: unknown) => typeof d === 'string' && eligible.includes(d as string))
    : suggested
  const preview = await previewVacation(db, ctx.tenantId, assistantId, dateFrom, chosen.length, settings)

  return NextResponse.json({
    days: all.map((d) => ({ date: d, eligible: eligible.includes(d), holiday: hol.get(d) ?? null, planned: suggested.includes(d) })),
    suggested,
    chosen,
    preview,
  })
}

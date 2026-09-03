import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveTenantAdmin } from '@/lib/tenant'

/**
 * Übernimmt Zeiterfassungs-Einträge (time_entries) eines Assistenten für einen
 * Monat 1:1 als zugewiesene Kalender-Slots (calendar_slots, status='assigned').
 *
 * Hintergrund: Bei Zähl-Modus "Nur Kalender-Slots" (Standard, siehe
 * payroll_settings.payroll_count_mode) fließen Zeiterfassungs-Einträge NIE in
 * die Lohnabrechnung ein – sie gelten dort nur als Nachweis. Diese Route ist
 * der Ausgleich dafür: statt den Zähl-Modus global umzustellen (was doppelt
 * zählen könnte, wenn für dieselbe Zeit schon ein Slot existiert), werden nur
 * die Einträge übernommen, für die es noch KEINEN Slot am selben Datum mit
 * derselben Start-/Endzeit gibt. Private Einträge werden nie übernommen.
 */
export async function POST(request: Request) {
  const ctx = await resolveTenantAdmin()
  if (!ctx) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })

  const body = await request.json()
  const { assistant_id, year, month } = body
  if (!assistant_id || !year || !month) {
    return NextResponse.json({ error: 'Pflichtfelder fehlen' }, { status: 400 })
  }

  const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`
  const dateTo =
    month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`

  const service = await createServiceClient()

  const [entriesRes, slotsRes] = await Promise.all([
    service
      .from('time_entries')
      .select('id, date, start_time, end_time, description, is_private, activity:activities(name)')
      .eq('tenant_id', ctx.tenantId)
      .eq('assistant_id', assistant_id)
      .gte('date', dateFrom)
      .lt('date', dateTo),
    service
      .from('calendar_slots')
      .select('date, start_time, end_time')
      .eq('tenant_id', ctx.tenantId)
      .eq('assigned_to', assistant_id)
      .gte('date', dateFrom)
      .lt('date', dateTo),
  ])

  if (entriesRes.error) return NextResponse.json({ error: entriesRes.error.message }, { status: 500 })
  if (slotsRes.error) return NextResponse.json({ error: slotsRes.error.message }, { status: 500 })

  const slotKey = (s: { date: string; start_time: string; end_time: string }) =>
    `${s.date}|${s.start_time}|${s.end_time}`
  const existingKeys = new Set((slotsRes.data ?? []).map(slotKey))

  const entries = entriesRes.data ?? []
  const toCreate = entries.filter((e: any) => !e.is_private && !existingKeys.has(slotKey(e)))

  if (toCreate.length === 0) {
    return NextResponse.json({ ok: true, created: 0, skipped: entries.length })
  }

  const rows = toCreate.map((e: any) => ({
    tenant_id: ctx.tenantId,
    date: e.date,
    start_time: e.start_time,
    end_time: e.end_time,
    title: (e.activity as any)?.name ?? e.description ?? 'Zeiterfassung',
    description: e.description || null,
    assigned_to: assistant_id,
    created_by: ctx.userId,
    status: 'assigned' as const,
    is_private: false,
    // Slots zählen erst nach Bestätigung zur Lohnabrechnung (0024_slot_confirmation.sql).
    // Diese Übernahme stammt aus bereits erfassten Zeiterfassungs-Einträgen – die
    // Ist-Zeit ist identisch mit der geplanten Zeit, daher hier direkt bestätigt.
    confirmed_at: new Date().toISOString(),
    confirmed_by: ctx.userId,
    actual_start_time: e.start_time,
    actual_end_time: e.end_time,
  }))

  const { error: insertErr } = await service.from('calendar_slots').insert(rows as never)
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, created: rows.length, skipped: entries.length - rows.length })
}

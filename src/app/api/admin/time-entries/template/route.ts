import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveTenantAdmin } from '@/lib/tenant'
import { DEFAULT_TEMPLATE } from '@/lib/time-entry-template'
import type { Database } from '@/types/database'

/**
 * Legt aus der wöchentlichen Vorlage Kalender-Slots (calendar_slots) für einen
 * Monat an — zugewiesen an die Assistentin, aber NOCH NICHT bestätigt. Erst
 * die Bestätigung der Ist-Zeit durch die Assistentin (oder den Admin) macht
 * einen Slot abrechnungsrelevant (siehe Migration 0024_slot_confirmation.sql).
 *
 * Vor dem "harten Schnitt" (siehe Änderungsprotokoll) legte diese Route
 * time_entries an — calendar_slots ist inzwischen die alleinige Wahrheitsquelle.
 */
export async function POST(request: Request) {
  const ctx = await resolveTenantAdmin()
  if (!ctx) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })

  const { assistant_id, year, month } = await request.json()
  if (!assistant_id || !year || !month) {
    return NextResponse.json({ error: 'Pflichtfelder fehlen' }, { status: 400 })
  }

  const service = await createServiceClient()

  // Assistent muss zum Tenant des Aufrufers gehören
  const { data: assistant } = await service
    .from('profiles')
    .select('id')
    .eq('id', assistant_id)
    .eq('tenant_id', ctx.tenantId)
    .single()
  if (!assistant) return NextResponse.json({ error: 'Assistent nicht gefunden' }, { status: 404 })

  // Aktuelle Vorlage aus DB laden (Fallback: Default) — tenant-scoped
  const { data: settings } = await service
    .from('payroll_settings')
    .select('*')
    .eq('tenant_id', ctx.tenantId)
    .single()
  const template: typeof DEFAULT_TEMPLATE = (settings as any)?.weekly_template ?? DEFAULT_TEMPLATE

  // Tätigkeits-IDs per Name nachschlagen — tenant-scoped
  const { data: activities } = await service
    .from('activities')
    .select('id, name')
    .eq('tenant_id', ctx.tenantId)
  const activityByName = Object.fromEntries((activities ?? []).map((a) => [a.name, a.id]))

  // Bestehende Slots im Monat laden (zur Duplikaterkennung) — jeder ihr
  // zugewiesene, nicht stornierte Slot zählt, unabhängig vom Status.
  const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`
  const dateTo = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
  const { data: existing } = await service
    .from('calendar_slots')
    .select('date, start_time')
    .eq('tenant_id', ctx.tenantId)
    .eq('assigned_to', assistant_id)
    .neq('status', 'cancelled')
    .gte('date', dateFrom)
    .lt('date', dateTo)

  const existingKeys = new Set((existing ?? []).map((e) => `${e.date}|${e.start_time.slice(0, 5)}`))

  const toInsert: Database['public']['Tables']['calendar_slots']['Insert'][] = []
  const daysInMonth = new Date(year, month, 0).getDate()
  let skipped = 0

  for (let day = 1; day <= daysInMonth; day++) {
    const jsDay = new Date(year, month - 1, day).getDay()
    for (const slot of template) {
      if (slot.jsDay !== jsDay) continue
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const key = `${dateStr}|${slot.start}`
      if (existingKeys.has(key)) { skipped++; continue }
      toInsert.push({
        tenant_id: ctx.tenantId,
        date: dateStr,
        start_time: slot.start,
        end_time: slot.end,
        title: slot.activityName,
        activity_id: activityByName[slot.activityName] ?? null,
        assigned_to: assistant_id,
        created_by: ctx.userId,
        status: 'assigned',
        is_private: false,
      })
    }
  }

  if (toInsert.length > 0) {
    const { error } = await service.from('calendar_slots').insert(toInsert)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, created: toInsert.length, skipped })
}

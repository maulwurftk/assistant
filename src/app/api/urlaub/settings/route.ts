import { NextResponse } from 'next/server'
import { resolveTenantAdmin } from '@/lib/tenant'
import { createServiceDb, loadVacationSettings, recomputeEntitlement } from '@/lib/vacation-server'

/** POST (Admin) { vacation_enabled, vacation_base_days, vacation_holiday_region, vacation_notice_month } */
export async function POST(request: Request) {
  const ctx = await resolveTenantAdmin()
  if (!ctx) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const db = createServiceDb()

  const before = await loadVacationSettings(db, ctx.tenantId)
  const base = Number(body.vacation_base_days)
  const notice = Number(body.vacation_notice_month)
  const region = body.vacation_holiday_region
  if (!(base >= 0 && base <= 60)) return NextResponse.json({ error: 'Ungültige Urlaubsbasis' }, { status: 400 })
  if (!(Number.isInteger(notice) && notice >= 1 && notice <= 12)) return NextResponse.json({ error: 'Ungültiger Monat' }, { status: 400 })
  if (!['BY', 'DE', 'AT'].includes(region)) return NextResponse.json({ error: 'Ungültige Region' }, { status: 400 })

  const { data, error } = await db.from('payroll_settings').update({
    vacation_enabled: body.vacation_enabled === true,
    vacation_base_days: base,
    vacation_holiday_region: region,
    vacation_notice_month: notice,
  }).eq('tenant_id', ctx.tenantId).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Bitte zuerst die Lohn-Einstellungen anlegen.' }, { status: 404 })

  // Beim Aktivieren / Basiswechsel: Anspruch des laufenden Jahres für alle buchen
  const after = await loadVacationSettings(db, ctx.tenantId)
  if (after.enabled && (!before.enabled || before.baseDays !== after.baseDays)) {
    const { data: assistants } = await db.from('profiles').select('id')
      .eq('tenant_id', ctx.tenantId).eq('role', 'assistant').eq('active', true)
    const year = new Date().getFullYear()
    for (const a of assistants ?? []) await recomputeEntitlement(db, ctx.tenantId, a.id, year, after, ctx.userId)
  }
  return NextResponse.json({ ok: true })
}

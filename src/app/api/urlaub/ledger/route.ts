import { NextResponse } from 'next/server'
import { resolveTenantAdmin } from '@/lib/tenant'
import { createServiceDb, loadVacationSettings, recomputeEntitlement } from '@/lib/vacation-server'
import type { LeaveLedgerKind } from '@/types/database'

const MANUAL_KINDS: LeaveLedgerKind[] = ['opening_balance', 'correction', 'parental_reduction', 'expired']

/**
 * POST (Admin)
 *  { action: 'book', assistant_id, kind, leave_year, days, note }   – manuelle Buchung
 *  { action: 'recompute', assistant_id, year }                      – Jahresanspruch neu berechnen
 */
export async function POST(request: Request) {
  const ctx = await resolveTenantAdmin()
  if (!ctx) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const db = createServiceDb()

  const { data: assistant } = await db.from('profiles').select('id')
    .eq('id', body.assistant_id ?? '').eq('tenant_id', ctx.tenantId).eq('role', 'assistant').maybeSingle()
  if (!assistant) return NextResponse.json({ error: 'Assistentin nicht gefunden' }, { status: 404 })

  if (body.action === 'recompute') {
    const year = Number(body.year)
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return NextResponse.json({ error: 'Ungültiges Jahr' }, { status: 400 })
    const settings = await loadVacationSettings(db, ctx.tenantId)
    try {
      const result = await recomputeEntitlement(db, ctx.tenantId, assistant.id, year, settings, ctx.userId)
      return NextResponse.json({ ok: true, result })
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 })
    }
  }

  if (body.action === 'book') {
    const kind = body.kind as LeaveLedgerKind
    const year = Number(body.leave_year)
    let days = Number(body.days)
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : ''
    if (!MANUAL_KINDS.includes(kind)) return NextResponse.json({ error: 'Ungültige Buchungsart' }, { status: 400 })
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return NextResponse.json({ error: 'Ungültiges Jahr' }, { status: 400 })
    if (!Number.isFinite(days) || days === 0 || Math.abs(days) > 100) return NextResponse.json({ error: 'Ungültige Tage' }, { status: 400 })
    if (!note) return NextResponse.json({ error: 'Bitte einen Grund angeben (Nachvollziehbarkeit).' }, { status: 400 })
    // Kürzung/Verfall sind immer Abbuchungen
    if (kind === 'parental_reduction' || kind === 'expired') days = -Math.abs(days)
    const { error } = await db.from('leave_ledger').insert({
      tenant_id: ctx.tenantId,
      assistant_id: assistant.id,
      leave_year: year,
      kind,
      days: Math.round(days * 100) / 100,
      note,
      created_by: ctx.userId,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 })
}

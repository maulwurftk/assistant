import { NextResponse } from 'next/server'
import { resolveTenant } from '@/lib/tenant'
import { createServiceDb, loadVacationSettings } from '@/lib/vacation-server'
import { approveAbsence, cancelAbsence, rejectAbsence, VacationError } from '@/lib/vacation-actions'

/** PATCH { action: 'approve' | 'reject' | 'cancel', note? } */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveTenant()
  if (!ctx) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const action = body.action as string
  const note: string | null = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 1000) : null
  const isAdmin = ctx.role === 'admin'

  const db = createServiceDb()
  const { data: absence } = await db.from('absences').select('*').eq('id', id).eq('tenant_id', ctx.tenantId).maybeSingle()
  if (!absence) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
  if (!isAdmin && absence.assistant_id !== ctx.userId) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })

  try {
    if (action === 'approve' || action === 'reject') {
      if (!isAdmin) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })
      if (action === 'approve') {
        const settings = await loadVacationSettings(db, ctx.tenantId)
        const result = await approveAbsence(db, ctx.tenantId, absence, ctx.userId, settings, note)
        return NextResponse.json({ ok: true, ...result })
      }
      await rejectAbsence(db, ctx.tenantId, absence, ctx.userId, note)
      return NextResponse.json({ ok: true })
    }
    if (action === 'cancel') {
      await cancelAbsence(db, ctx.tenantId, absence, ctx.userId, isAdmin)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 })
  } catch (e) {
    const err = e as VacationError
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 })
  }
}

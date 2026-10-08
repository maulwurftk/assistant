import { NextResponse } from 'next/server'
import { resolveTenantAdmin } from '@/lib/tenant'
import { createServiceDb, loadVacationSettings, recomputeEntitlement } from '@/lib/vacation-server'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const numOrNull = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v))

async function recomputeAffected(tenantId: string, assistantId: string, fromIso: string | null, userId: string) {
  const db = createServiceDb()
  const settings = await loadVacationSettings(db, tenantId)
  if (!settings.enabled) return
  const now = new Date().getFullYear()
  const start = Math.max(now - 1, fromIso ? Number(fromIso.slice(0, 4)) : now)
  for (let y = start; y <= now; y++) await recomputeEntitlement(db, tenantId, assistantId, y, settings, userId)
}

/**
 * POST (Admin)
 *  { action: 'employment', assistant_id, employment_start, employment_end }
 *  { action: 'save', assistant_id, id?, valid_from, valid_until, days_per_week, weekly_hours, base_days, extra_days, job_title, note }
 *  { action: 'notice_sent', id }  – Nachweis (NachwG) als ausgehändigt markieren
 */
export async function POST(request: Request) {
  const ctx = await resolveTenantAdmin()
  if (!ctx) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const db = createServiceDb()

  if (body.action === 'notice_sent') {
    const { data, error } = await db.from('employment_terms')
      .update({ notice_sent_at: new Date().toISOString() })
      .eq('id', body.id ?? '').eq('tenant_id', ctx.tenantId).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  const { data: assistant } = await db.from('profiles').select('id')
    .eq('id', body.assistant_id ?? '').eq('tenant_id', ctx.tenantId).eq('role', 'assistant').maybeSingle()
  if (!assistant) return NextResponse.json({ error: 'Assistentin nicht gefunden' }, { status: 404 })

  if (body.action === 'employment') {
    const start = body.employment_start || null
    const end = body.employment_end || null
    if ((start && !ISO.test(start)) || (end && !ISO.test(end)) || (start && end && end < start)) {
      return NextResponse.json({ error: 'Ungültige Daten' }, { status: 400 })
    }
    const { error } = await db.from('profiles').update({ employment_start: start, employment_end: end })
      .eq('id', assistant.id).eq('tenant_id', ctx.tenantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await recomputeAffected(ctx.tenantId, assistant.id, start, ctx.userId)
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'save') {
    const validFrom: string = body.valid_from
    const validUntil: string | null = body.valid_until || null
    if (!ISO.test(validFrom ?? '') || (validUntil && (!ISO.test(validUntil) || validUntil < validFrom))) {
      return NextResponse.json({ error: 'Ungültiger Gültigkeitszeitraum' }, { status: 400 })
    }
    const dpw = numOrNull(body.days_per_week)
    const weekly = numOrNull(body.weekly_hours)
    const base = numOrNull(body.base_days)
    const extra = numOrNull(body.extra_days) ?? 0
    if (dpw !== null && !(dpw > 0 && dpw <= 6)) return NextResponse.json({ error: 'Tage/Woche: 0,5 bis 6' }, { status: 400 })
    if (weekly !== null && !(weekly >= 0 && weekly <= 60)) return NextResponse.json({ error: 'Ungültige Wochenstunden' }, { status: 400 })
    if (base !== null && !(base >= 0 && base <= 60)) return NextResponse.json({ error: 'Ungültige Urlaubsbasis' }, { status: 400 })
    if (!(extra >= 0 && extra <= 30)) return NextResponse.json({ error: 'Ungültiger Zusatzurlaub' }, { status: 400 })

    // Überschneidung mit anderen Bedingungen derselben Person verhindern
    const { data: others } = await db.from('employment_terms').select('id, valid_from, valid_until')
      .eq('tenant_id', ctx.tenantId).eq('assistant_id', assistant.id)
    const clash = (others ?? []).find((o) => o.id !== body.id &&
      o.valid_from <= (validUntil ?? '9999-12-31') && (o.valid_until ?? '9999-12-31') >= validFrom)
    if (clash) {
      return NextResponse.json({ error: `Überschneidet sich mit der Bedingung ab ${clash.valid_from.split('-').reverse().join('.')} – dort zuerst ein Enddatum setzen.` }, { status: 409 })
    }

    const payload = {
      valid_from: validFrom,
      valid_until: validUntil,
      days_per_week: dpw,
      weekly_hours: weekly,
      base_days: base,
      extra_days: extra,
      job_title: typeof body.job_title === 'string' ? body.job_title.trim().slice(0, 200) || null : null,
      note: typeof body.note === 'string' ? body.note.trim().slice(0, 1000) || null : null,
    }
    const res = body.id
      ? await db.from('employment_terms').update(payload).eq('id', body.id).eq('tenant_id', ctx.tenantId).select('id')
      : await db.from('employment_terms').insert({ ...payload, tenant_id: ctx.tenantId, assistant_id: assistant.id }).select('id')
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 })
    if (!res.data?.length) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
    await recomputeAffected(ctx.tenantId, assistant.id, validFrom, ctx.userId)
    return NextResponse.json({ ok: true, id: res.data[0].id })
  }

  return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 })
}

export async function DELETE(request: Request) {
  const ctx = await resolveTenantAdmin()
  if (!ctx) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })
  const id = new URL(request.url).searchParams.get('id') ?? ''
  const db = createServiceDb()
  const { data, error } = await db.from('employment_terms').delete().eq('id', id).eq('tenant_id', ctx.tenantId)
    .select('assistant_id, valid_from')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
  await recomputeAffected(ctx.tenantId, data[0].assistant_id, data[0].valid_from, ctx.userId)
  return NextResponse.json({ ok: true })
}

import { NextResponse } from 'next/server'
import { resolveTenant } from '@/lib/tenant'
import { createServiceDb } from '@/lib/vacation-server'

/** POST – Assistentin bestätigt den Hinweis auf Resturlaub/Verfall als gelesen. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveTenant()
  if (!ctx) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  const { id } = await params
  const db = createServiceDb()
  const { data, error } = await db.from('vacation_notices')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id).eq('tenant_id', ctx.tenantId).eq('assistant_id', ctx.userId).is('read_at', null)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

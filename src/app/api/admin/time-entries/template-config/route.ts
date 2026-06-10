import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { DEFAULT_TEMPLATE } from '@/lib/time-entry-template'

export type { TemplateRow } from '@/lib/time-entry-template'
export { DEFAULT_TEMPLATE }

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? user : null
}

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })

  const supabase = await createClient()
  const { data } = await supabase.from('payroll_settings').select('*').limit(1).single()
  const template = (data as any)?.weekly_template ?? DEFAULT_TEMPLATE
  return NextResponse.json({ template })
}

export async function PUT(request: Request) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })

  const { template } = await request.json()
  if (!Array.isArray(template)) return NextResponse.json({ error: 'Ungültiges Format' }, { status: 400 })

  const service = await createServiceClient()
  const { data: existing } = await service.from('payroll_settings').select('id').limit(1).single()

  if (!existing?.id) {
    return NextResponse.json({ error: 'Keine Einstellungen gefunden – bitte zuerst Einstellungen speichern' }, { status: 404 })
  }

  const { error } = await service
    .from('payroll_settings')
    .update({ weekly_template: template } as any)
    .eq('id', existing.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { resolveTenantAdmin } from '@/lib/tenant'
import { DEFAULT_TEMPLATE } from '@/lib/time-entry-template'
// Hinweis: Route-Dateien dürfen nur HTTP-Handler exportieren (Next.js App Router).
// DEFAULT_TEMPLATE/TemplateRow werden direkt aus '@/lib/time-entry-template' importiert.

export async function GET() {
  const ctx = await resolveTenantAdmin()
  if (!ctx) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })

  // User-scoped Client: RLS filtert automatisch auf den eigenen Tenant
  const supabase = await createClient()
  const { data } = await supabase.from('payroll_settings').select('*').single()
  const template = (data as any)?.weekly_template ?? DEFAULT_TEMPLATE
  return NextResponse.json({ template })
}

export async function PUT(request: Request) {
  const ctx = await resolveTenantAdmin()
  if (!ctx) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })

  const { template } = await request.json()
  if (!Array.isArray(template)) return NextResponse.json({ error: 'Ungültiges Format' }, { status: 400 })

  const service = await createServiceClient()
  const { data, error } = await service
    .from('payroll_settings')
    .update({ weekly_template: template } as any)
    .eq('tenant_id', ctx.tenantId)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) {
    return NextResponse.json({ error: 'Keine Einstellungen gefunden – bitte zuerst Einstellungen speichern' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}

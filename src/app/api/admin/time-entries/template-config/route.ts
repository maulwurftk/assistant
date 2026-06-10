import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export type TemplateRow = {
  jsDay: number   // 0=So, 1=Mo, 2=Di, 3=Mi, 4=Do, 5=Fr, 6=Sa
  start: string   // HH:MM
  end: string     // HH:MM
  activityName: string
}

export const DEFAULT_TEMPLATE: TemplateRow[] = [
  { jsDay: 1, start: '08:00', end: '11:00', activityName: 'Elternassistenz – Betreuung Tochter' },
  { jsDay: 2, start: '10:00', end: '13:00', activityName: 'Pers. Assistenz – Freizeitbegleitung' },
  { jsDay: 3, start: '08:00', end: '11:00', activityName: 'Elternassistenz – Betreuung Tochter' },
  { jsDay: 4, start: '09:00', end: '10:00', activityName: 'Pers. Assistenz – Einkauf' },
  { jsDay: 4, start: '10:00', end: '12:00', activityName: 'Pers. Assistenz – Arzttermin' },
  { jsDay: 5, start: '08:00', end: '11:00', activityName: 'Elternassistenz – Aufräumen / Einkauf' },
]

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

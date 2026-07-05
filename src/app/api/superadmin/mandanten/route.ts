import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolvePlatformAdmin, serviceClient } from '@/lib/platform'

// Superadmin-API für die Mandanten-Verwaltung (Plan docs/mandanten-verwaltung-plan.md):
// Zugriff NUR für platform_admins (Service-Role-Route, Session-basiert).
// GET  → alle Organisationen inkl. Userzahl
// POST → { action: 'set_status' | 'set_plan' | 'set_note', ... }

const setStatusSchema = z.object({
  action: z.literal('set_status'),
  id: z.string().uuid(),
  // 'deleted' bewusst nicht anbieten — Soft-Delete kommt mit eigenem Lösch-Konzept.
  status: z.enum(['active', 'suspended']),
})

const setPlanSchema = z.object({
  action: z.literal('set_plan'),
  id: z.string().uuid(),
  plan: z.enum(['free', 'paid']),
})

const setNoteSchema = z.object({
  action: z.literal('set_note'),
  id: z.string().uuid(),
  notes: z.string().trim().max(2000).nullable(),
})

const bodySchema = z.discriminatedUnion('action', [
  setStatusSchema,
  setPlanSchema,
  setNoteSchema,
])

async function loadState() {
  const db = serviceClient()
  const [{ data: orgs, error: orgsError }, { data: profiles, error: profilesError }] =
    await Promise.all([
      db
        .from('organizations')
        .select('id, name, slug, status, plan, notes, created_at')
        .order('created_at', { ascending: false }),
      db.from('profiles').select('tenant_id'),
    ])
  if (orgsError) throw orgsError
  if (profilesError) throw profilesError

  const userCounts = new Map<string, number>()
  for (const p of profiles ?? []) {
    userCounts.set(p.tenant_id, (userCounts.get(p.tenant_id) ?? 0) + 1)
  }

  const result = (orgs ?? []).map((org) => ({
    ...org,
    user_count: userCounts.get(org.id) ?? 0,
  }))

  return { orgs: result }
}

export async function GET() {
  const ctx = await resolvePlatformAdmin()
  if (!ctx) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })
  try {
    return NextResponse.json(await loadState())
  } catch (e) {
    console.error('Superadmin GET error:', e)
    return NextResponse.json({ error: 'Laden fehlgeschlagen' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const ctx = await resolvePlatformAdmin()
  if (!ctx) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 })
  }
  const body = parsed.data
  const db = serviceClient()

  try {
    if (body.action === 'set_status') {
      if (body.status === 'suspended') {
        // Selbstaussperr-Schutz: Der eigene Mandant des eingeloggten
        // Superadmins darf nicht gesperrt werden.
        const { data: ownProfile, error: ownProfileError } = await db
          .from('profiles')
          .select('tenant_id')
          .eq('id', ctx.userId)
          .maybeSingle()
        if (ownProfileError) throw ownProfileError
        if (ownProfile?.tenant_id === body.id) {
          return NextResponse.json(
            { error: 'Eigener Mandant kann nicht gesperrt werden' },
            { status: 400 }
          )
        }
      }
      const { error } = await db
        .from('organizations')
        .update({ status: body.status })
        .eq('id', body.id)
      if (error) throw error
    } else if (body.action === 'set_plan') {
      const { error } = await db
        .from('organizations')
        .update({ plan: body.plan })
        .eq('id', body.id)
      if (error) throw error
    } else {
      const { error } = await db
        .from('organizations')
        .update({ notes: body.notes })
        .eq('id', body.id)
      if (error) throw error
    }

    return NextResponse.json(await loadState())
  } catch (e) {
    console.error('Superadmin POST error:', e)
    return NextResponse.json({ error: 'Aktion fehlgeschlagen' }, { status: 500 })
  }
}

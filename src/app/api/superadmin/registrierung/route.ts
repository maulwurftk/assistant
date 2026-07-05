import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { resolvePlatformAdmin, serviceClient } from '@/lib/platform'

// Superadmin-API für das Registrierungs-Gating (0013, Architektur §1.6/D4):
// Zugriff NUR für platform_admins (Service-Role-Route, Session-basiert).
// GET  → Modus + alle Codes
// POST → { action: 'create_code' | 'lock_code' | 'set_mode', ... }

const createCodeSchema = z.object({
  action: z.literal('create_code'),
  code: z.string().trim().min(4).max(64).regex(/^[A-Za-z0-9-]+$/,
    'Nur Buchstaben, Zahlen und Bindestriche').optional(),
  max_uses: z.number().int().min(1).max(10000).default(1),
  expires_at: z.string().nullable().optional(),
  note: z.string().trim().max(200).nullable().optional(),
})

const lockCodeSchema = z.object({
  action: z.literal('lock_code'),
  id: z.string().uuid(),
})

const setModeSchema = z.object({
  action: z.literal('set_mode'),
  mode: z.enum(['open', 'code', 'closed']),
})

const bodySchema = z.discriminatedUnion('action', [
  createCodeSchema,
  lockCodeSchema,
  setModeSchema,
])

async function loadState() {
  const db = serviceClient()
  const [{ data: setting }, { data: codes, error }] = await Promise.all([
    db.from('platform_settings').select('value').eq('key', 'registration_mode').maybeSingle(),
    db.from('registration_codes')
      .select('id, code, max_uses, used_count, expires_at, note, created_at')
      .order('created_at', { ascending: false }),
  ])
  if (error) throw error
  const mode = typeof setting?.value === 'string' ? setting.value : 'open'
  return { mode, codes: codes ?? [] }
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
    if (body.action === 'create_code') {
      const code =
        body.code ?? 'EINLADUNG-' + randomBytes(4).toString('hex').toUpperCase()
      let expiresAt: string | null = null
      if (body.expires_at) {
        const d = new Date(body.expires_at)
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ error: 'Ungültiges Ablaufdatum' }, { status: 400 })
        }
        expiresAt = d.toISOString()
      }
      const { error } = await db.from('registration_codes').insert({
        code,
        max_uses: body.max_uses,
        expires_at: expiresAt,
        note: body.note ?? null,
      })
      if (error) {
        if (error.code === '23505') {
          return NextResponse.json({ error: 'Dieser Code existiert bereits' }, { status: 409 })
        }
        throw error
      }
    } else if (body.action === 'lock_code') {
      const { error } = await db
        .from('registration_codes')
        .update({ expires_at: new Date().toISOString() })
        .eq('id', body.id)
      if (error) throw error
    } else {
      const { error } = await db
        .from('platform_settings')
        .update({ value: body.mode, updated_at: new Date().toISOString() })
        .eq('key', 'registration_mode')
      if (error) throw error
    }

    return NextResponse.json(await loadState())
  } catch (e) {
    console.error('Superadmin POST error:', e)
    return NextResponse.json({ error: 'Aktion fehlgeschlagen' }, { status: 500 })
  }
}

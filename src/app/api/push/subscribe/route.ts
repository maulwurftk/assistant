import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { resolveTenant } from '@/lib/tenant'
import type { Database } from '@/types/database'

function adminDb() {
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: Request) {
  const ctx = await resolveTenant()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { subscription } = await req.json()
  if (!subscription?.endpoint) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  const db = adminDb()
  await db.from('push_subscriptions').upsert(
    { tenant_id: ctx.tenantId, user_id: ctx.userId, endpoint: subscription.endpoint, subscription } as never,
    { onConflict: 'endpoint' }
  )

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const ctx = await resolveTenant()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { endpoint } = await req.json()
  if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })

  const db = adminDb()
  await db.from('push_subscriptions').delete()
    .eq('endpoint', endpoint)
    .eq('user_id', ctx.userId)
    .eq('tenant_id', ctx.tenantId)

  return NextResponse.json({ ok: true })
}

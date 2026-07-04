import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { resolveTenantAdmin } from '@/lib/tenant'
import type { Database } from '@/types/database'

export async function POST(request: Request) {
  // Aufrufer muss Admin SEINES Tenants sein → neues Profil bekommt dessen tenant_id
  const ctx = await resolveTenantAdmin()
  if (!ctx) return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })

  const { email, full_name, password, role } = await request.json()

  if (!email || !full_name || !password || !role) {
    return NextResponse.json({ error: 'Fehlende Felder' }, { status: 400 })
  }
  if (role !== 'admin' && role !== 'assistant') {
    return NextResponse.json({ error: 'Ungültige Rolle' }, { status: 400 })
  }

  const adminClient = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createError) return NextResponse.json({ error: createError.message }, { status: 400 })

  const { error: profileError } = await adminClient.from('profiles').insert({
    id: newUser.user.id,
    tenant_id: ctx.tenantId,
    email,
    full_name,
    role,
    active: true,
  })

  if (profileError) {
    await adminClient.auth.admin.deleteUser(newUser.user.id)
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, userId: newUser.user.id })
}

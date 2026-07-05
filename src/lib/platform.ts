import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export type PlatformAdminContext = {
  userId: string
  email: string | null
}

/** Service-Role-Client (nur serverseitig verwenden!). */
export function serviceClient() {
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Superadmin-Auflösung (Architektur §1.6, D4): platform_admins hat KEINE
 * RLS-Policies — Mitgliedschaft wird ausschließlich hier, serverseitig mit
 * Service-Role, geprüft. Identität kommt NUR aus der verifizierten Session.
 * Rückgabe null = nicht eingeloggt oder kein Platform-Admin.
 */
export async function resolvePlatformAdmin(): Promise<PlatformAdminContext | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await serviceClient()
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!data) return null
  return { userId: user.id, email: user.email ?? null }
}

import { createClient } from '@/lib/supabase/server'

export type TenantContext = {
  userId: string
  email: string | null
  tenantId: string
  role: 'admin' | 'assistant'
}

/**
 * Zentrale Tenant-Auflösung für Route-Handler (Architektur §5.1/§1.7).
 *
 * Ermittelt den Tenant AUSSCHLIESSLICH aus der verifizierten Session
 * (auth.getUser() → eigenes Profil) — nie aus Body/Header/Query.
 * Jede Service-Role-Query MUSS anschließend `.eq('tenant_id', ctx.tenantId)`
 * (Reads/Updates/Deletes) bzw. `tenant_id: ctx.tenantId` (Inserts) verwenden.
 *
 * Rückgabe null = nicht eingeloggt oder kein Profil (Handler → 401).
 */
export async function resolveTenant(): Promise<TenantContext | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.tenant_id) return null

  return {
    userId: user.id,
    email: user.email ?? null,
    tenantId: profile.tenant_id,
    role: profile.role as 'admin' | 'assistant',
  }
}

/** Wie resolveTenant(), aber nur für Admins (sonst null). */
export async function resolveTenantAdmin(): Promise<TenantContext | null> {
  const ctx = await resolveTenant()
  return ctx?.role === 'admin' ? ctx : null
}

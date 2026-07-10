import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/navigation'
import { PushSubscriber } from '@/components/push-subscriber'
import { resolvePlatformAdmin } from '@/lib/platform'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Eingeloggt, aber (noch) kein Profil: Zwei mögliche Ursachen, die hier
  // unterschieden werden müssen. RLS blendet das Profil über current_tenant()
  // auch dann aus, wenn die Organisation gesperrt ist (Migration 0015) — das
  // sieht identisch aus wie "Registrierung noch nicht abgeschlossen".
  if (!profile) {
    const { data: suspended } = await supabase.rpc('is_org_suspended')
    if (suspended === true) redirect('/gesperrt')
    // (provision_tenant wurde nach signUp noch nicht ausgeführt; Architektur §4.1)
    redirect('/registrieren/abschliessen')
  }
  if (!profile.active) redirect('/login')

  // Onboarding-Wizard (Plan: docs/onboarding-plan.md) noch nicht abgeschlossen?
  // Bestandsmandanten sind per Migration 0017 vorbelegt (onboarding_completed_at
  // = now()) — dieser Guard betrifft also nur neu registrierte Organisationen.
  const { data: org } = await supabase
    .from('organizations')
    .select('onboarding_completed_at')
    .eq('id', profile.tenant_id)
    .single()
  if (org && !org.onboarding_completed_at) redirect('/onboarding')

  // Nav-Menü für Platform-Admins um "Superadmin"-Bereich erweitern (Existenz
  // der Seiten wird weiterhin durch resolvePlatformAdmin()+notFound() in den
  // Seiten selbst geschützt, nicht durch das Verstecken des Links).
  const platformAdmin = await resolvePlatformAdmin()

  return (
    <div className="min-h-screen bg-gray-50/60 md:flex">
      <Navigation profile={profile} isPlatformAdmin={!!platformAdmin} />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-4 md:p-8 overflow-auto">
          {children}
        </main>
      </div>
      <PushSubscriber />
    </div>
  )
}

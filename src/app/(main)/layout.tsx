import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/navigation'
import { PushSubscriber } from '@/components/push-subscriber'

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

  return (
    <div className="min-h-screen bg-gray-50/60 md:flex">
      <Navigation profile={profile} />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-4 md:p-8 overflow-auto">
          {children}
        </main>
      </div>
      <PushSubscriber />
    </div>
  )
}

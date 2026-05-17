import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/navigation'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.active) redirect('/login')

  return (
    <div className="flex min-h-screen bg-gray-50/60">
      <Navigation profile={profile} />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-5 md:p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

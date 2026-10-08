import { redirect } from 'next/navigation'
import { TreePalm } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { AdminUrlaub } from './AdminUrlaub'

export default async function AdminUrlaubPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/urlaub')

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        icon={<TreePalm className="h-5 w-5" />}
        title="Urlaub & Abwesenheiten"
        subtitle="Anträge, Urlaubskonten, Arbeitsbedingungen"
        tone="amber"
      />
      <AdminUrlaub />
    </div>
  )
}

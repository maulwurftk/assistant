import { redirect } from 'next/navigation'
import { TreePalm } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { UrlaubView } from './UrlaubView'

export default async function UrlaubPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'admin') redirect('/admin/urlaub')

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader icon={<TreePalm className="h-5 w-5" />} title="Urlaub" subtitle="Resturlaub, Anträge und Krankmeldungen" tone="amber" />
      <UrlaubView userId={user.id} />
    </div>
  )
}

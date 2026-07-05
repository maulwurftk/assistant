import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ListTodo } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { AdminAufgabenTabs } from './AdminAufgabenTabs'

export default async function AdminAufgabenPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        icon={<ListTodo className="h-5 w-5" />}
        title="Aufgaben"
        subtitle="Vorlagen, Einmalaufgaben und Überwachung"
        tone="sky"
      />
      <AdminAufgabenTabs />
    </div>
  )
}

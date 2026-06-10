import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminZeiterfassung from './_components/AdminZeiterfassung'

export default async function AdminZeiterfassungPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: assistants } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'assistant')
    .eq('active', true)
    .order('full_name')

  return <AdminZeiterfassung assistants={assistants ?? []} />
}

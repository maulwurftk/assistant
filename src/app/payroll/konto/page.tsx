import { createClient } from '@/lib/supabase/server'
import { KontoView } from './_components/KontoView'

export const dynamic = 'force-dynamic'

export default async function KontoPage() {
  const supabase = await createClient()

  const [settingsRes, ledgerRes] = await Promise.all([
    supabase.from('payroll_settings').select('currency, monthly_budget').limit(1).single(),
    supabase
      .from('account_ledger')
      .select('*')
      .order('booking_date', { ascending: false })
      .order('created_at', { ascending: false }),
  ])

  const settings = settingsRes.data as { currency?: string; monthly_budget?: number } | null
  const ledger = (ledgerRes.data ?? []) as Array<{
    id: string
    booking_date: string
    direction: 'in' | 'out'
    category: string
    amount: number
    description: string | null
    status: 'pending' | 'confirmed'
    source: 'manual' | 'auto'
  }>

  return (
    <KontoView
      currency={settings?.currency ?? 'EUR'}
      monthlyBudget={settings?.monthly_budget ?? 0}
      initialLedger={ledger}
    />
  )
}

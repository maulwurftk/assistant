'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

// Landeplatz für User, deren Organisation gesperrt ist (Migration 0015,
// is_org_suspended). RLS blendet ihr Profil aus current_tenant() aus,
// daher gibt es hier bewusst keinen weiteren Datenzugriff.
export default function GesperrtPage() {
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm bg-surface rounded-xl shadow-sm border border-slate-200 p-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Konto gesperrt</h1>
        <p className="text-sm text-slate-500 mt-3">
          Dieses Konto ist derzeit gesperrt. Bitte wenden Sie sich an den Betreiber.
        </p>

        <button
          type="button"
          onClick={handleLogout}
          className="mt-6 w-full py-2.5 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Abmelden
        </button>
      </div>
    </div>
  )
}

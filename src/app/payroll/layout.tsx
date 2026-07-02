import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LogoutButton from './_components/LogoutButton'

export default async function PayrollLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  const { data: settingsRow } = await supabase
    .from('payroll_settings')
    .select('payroll_enabled')
    .limit(1)
    .single()
  const payrollEnabled = (settingsRow as { payroll_enabled?: boolean } | null)?.payroll_enabled !== false

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-slate-600 text-lg">Kein Zugriff</p>
          <p className="text-slate-400 text-sm mt-1">
            Diese Seite ist nur für Administratoren zugänglich.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <a
              href="/dashboard"
              className="flex items-center gap-1.5 text-slate-400 hover:text-slate-700 transition-colors text-sm"
            >
              ← Dashboard
            </a>
            <span className="font-semibold text-slate-900">Lohnabrechnung</span>
            <nav className="flex items-center gap-4 text-sm">
              {payrollEnabled && (
                <>
                  <a
                    href="/payroll"
                    className="text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    Übersicht
                  </a>
                  <a
                    href="/payroll/zeitraum"
                    className="text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    Zeitraum
                  </a>
                  <a
                    href="/payroll/konto"
                    className="text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    Konto
                  </a>
                </>
              )}
              <a
                href="/payroll/settings"
                className="text-slate-600 hover:text-slate-900 transition-colors"
              >
                Einstellungen
              </a>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span>{profile.full_name}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}

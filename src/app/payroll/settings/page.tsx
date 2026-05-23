import { createClient } from '@/lib/supabase/server'
import SettingsForm from './_components/SettingsForm'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: settings } = await supabase.from('payroll_settings').select('*').limit(1).single()

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Einstellungen</h1>
      <p className="text-sm text-slate-500 mb-8">Lohnparameter konfigurieren</p>

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <SettingsForm
          currentRate={settings?.hourly_rate ?? 15}
          currentCurrency={settings?.currency ?? 'EUR'}
          currentMinijobMode={settings?.minijob_mode ?? false}
          currentUvRate={settings?.uv_rate ?? 1.6}
          currentEmployerName={settings?.employer_name ?? ''}
          currentEmployerAddress={settings?.employer_address ?? ''}
          currentEmployerTaxNumber={settings?.employer_tax_number ?? ''}
          hasSettings={!!settings}
        />
      </div>

      <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <strong>Hinweis:</strong> Der Stundensatz gilt einheitlich für alle Assistenten. Änderungen
        wirken sich auf zukünftige Abrechnungen aus. Bereits versendete Lohnzettel behalten ihren
        damaligen Satz.
      </div>
    </div>
  )
}

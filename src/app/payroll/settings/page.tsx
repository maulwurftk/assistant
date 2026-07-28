import { createClient } from '@/lib/supabase/server'
import { ratesFromSettings, atRatesFromSettings, normalizeCountryMode } from '@/lib/payroll'
import { Settings } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import SettingsForm from './_components/SettingsForm'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: settings } = await supabase.from('payroll_settings').select('*').limit(1).single()
  const rates = ratesFromSettings(settings)
  const atRates = atRatesFromSettings(settings)

  return (
    <div className="max-w-lg">
      <div className="mb-8">
        <PageHeader
          icon={<Settings className="h-5 w-5" />}
          title="Einstellungen"
          subtitle="Lohnparameter konfigurieren"
          tone="slate"
        />
      </div>

      <div className="bg-surface border border-slate-200 rounded-xl p-6">
        <SettingsForm
          currentRate={settings?.hourly_rate ?? 20}
          currentCurrency={settings?.currency ?? 'EUR'}
          currentPayrollEnabled={settings?.payroll_enabled ?? true}
          currentCountMode={(settings?.payroll_count_mode as 'slots' | 'entries' | 'both') ?? 'slots'}
          currentMinijobMode={settings?.minijob_mode ?? false}
          currentBezirkMode={settings?.bezirk_mode ?? false}
          currentUvRate={settings?.uv_rate ?? 1.6}
          currentEmployerName={settings?.employer_name ?? ''}
          currentEmployerAddress={settings?.employer_address ?? ''}
          currentEmployerTaxNumber={settings?.employer_tax_number ?? ''}
          currentMonthlyBudget={settings?.monthly_budget ?? 1310}
          currentAccountFee={settings?.account_fee ?? 10}
          currentWeeklyHoursTarget={settings?.weekly_hours_target ?? 15}
          currentPrivateHoursBudget={settings?.private_hours_budget ?? 0}
          currentPrivateSlotColor={settings?.private_slot_color ?? '#a855f7'}
          currentRates={rates}
          currentCountryMode={normalizeCountryMode(settings?.country_mode)}
          currentAtGeringfuegigMode={settings?.at_geringfuegig_mode ?? false}
          currentAtGrenze={settings?.at_geringfuegigkeitsgrenze ?? 551.10}
          currentAtRates={atRates}
          currentAtIncludeUrlaubsgeld={settings?.at_include_urlaubsgeld ?? false}
          currentAtIncludeWeihnachtsgeld={settings?.at_include_weihnachtsgeld ?? false}
          currentAtDienstgeberkontoNr={settings?.at_dienstgeberkonto_nr ?? ''}
          currentAtKostentraegerName={settings?.at_kostentraeger_name ?? ''}
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

'use client'

import { useState } from 'react'
import { MINIJOB_RATES } from '@/lib/payroll'

type Props = {
  currentRate: number
  currentCurrency: string
  currentMinijobMode: boolean
  currentUvRate: number
  currentEmployerName: string
  currentEmployerAddress: string
  currentEmployerTaxNumber: string
  currentMonthlyBudget: number
  currentAccountFee: number
  currentWeeklyHoursTarget: number
  hasSettings: boolean
}

export default function SettingsForm({
  currentRate,
  currentCurrency,
  currentMinijobMode,
  currentUvRate,
  currentEmployerName,
  currentEmployerAddress,
  currentEmployerTaxNumber,
  currentMonthlyBudget,
  currentAccountFee,
  currentWeeklyHoursTarget,
  hasSettings,
}: Props) {
  const [rate, setRate] = useState(currentRate.toString())
  const [currency, setCurrency] = useState(currentCurrency)
  const [minijobMode, setMinijobMode] = useState(currentMinijobMode)
  const [uvRate, setUvRate] = useState(currentUvRate.toString())
  const [employerName, setEmployerName] = useState(currentEmployerName)
  const [employerAddress, setEmployerAddress] = useState(currentEmployerAddress)
  const [employerTaxNumber, setEmployerTaxNumber] = useState(currentEmployerTaxNumber)
  const [monthlyBudget, setMonthlyBudget] = useState(currentMonthlyBudget.toString())
  const [accountFee, setAccountFee] = useState(currentAccountFee.toString())
  const [weeklyHoursTarget, setWeeklyHoursTarget] = useState(currentWeeklyHoursTarget.toString())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    const parsedRate = parseFloat(rate.replace(',', '.'))
    if (isNaN(parsedRate) || parsedRate <= 0) {
      setMessage({ type: 'error', text: 'Bitte einen gültigen Stundensatz eingeben.' })
      setSaving(false)
      return
    }

    const parsedUvRate = parseFloat(uvRate.replace(',', '.'))

    try {
      const res = await fetch('/api/payroll/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hourly_rate: parsedRate,
          currency,
          minijob_mode: minijobMode,
          uv_rate: isNaN(parsedUvRate) ? 1.6 : parsedUvRate,
          employer_name: employerName,
          employer_address: employerAddress,
          employer_tax_number: employerTaxNumber,
          monthly_budget: parseFloat(monthlyBudget.replace(',', '.')) || 0,
          account_fee: parseFloat(accountFee.replace(',', '.')) || 0,
          weekly_hours_target: parseFloat(weeklyHoursTarget.replace(',', '.')) || 15,
        }),
      })
      if (!res.ok) throw new Error('Fehler beim Speichern')
      setMessage({ type: 'success', text: 'Einstellungen gespeichert.' })
    } catch {
      setMessage({ type: 'error', text: 'Fehler beim Speichern. Bitte erneut versuchen.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Stundensatz */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Stundensatz (€/h)
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            step="0.01"
            min="0.01"
            required
            className="w-36 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="z.B. 15.50"
          />
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="EUR">EUR (€)</option>
            <option value="CHF">CHF</option>
          </select>
        </div>
        <p className="text-xs text-slate-400 mt-1.5">Gilt für alle Assistenten gleichmäßig</p>
      </div>

      {/* Persönliches Budget */}
      <div className="border-t border-slate-200 pt-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Persönliches Budget (Zielvereinbarung)</h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Monatsbudget (€)</label>
            <input
              type="number"
              value={monthlyBudget}
              onChange={(e) => setMonthlyBudget(e.target.value)}
              step="0.01"
              min="0"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="1310.00"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Kontogebühren (€/Monat)</label>
            <input
              type="number"
              value={accountFee}
              onChange={(e) => setAccountFee(e.target.value)}
              step="0.01"
              min="0"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="10.00"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Stunden-Ziel/Woche</label>
            <input
              type="number"
              value={weeklyHoursTarget}
              onChange={(e) => setWeeklyHoursTarget(e.target.value)}
              step="0.5"
              min="0"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="15"
            />
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-1.5">
          Aus der Zielvereinbarung: 1.310 €/Monat · 10 € Kontogebühren · 15 h/Woche (9h Elternass. + 6h Pers. Ass.)
        </p>
      </div>

      {/* Minijob-Modus */}
      <div className="border-t border-slate-200 pt-6">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={minijobMode}
            onChange={(e) => setMinijobMode(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <div>
            <span className="text-sm font-medium text-slate-700">Minijob-Modus aktivieren</span>
            <p className="text-xs text-slate-400 mt-0.5">
              Lohnzettel und E-Mail zeigen Brutto/Netto sowie alle Pauschalbeiträge
            </p>
          </div>
        </label>
      </div>

      {minijobMode && (
        <>
          {/* Arbeitgeberdaten */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700">Arbeitgeberdaten (für Lohnzettel)</h3>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Name / Firmenname</label>
              <input
                type="text"
                value={employerName}
                onChange={(e) => setEmployerName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Max Mustermann"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Adresse</label>
              <input
                type="text"
                value={employerAddress}
                onChange={(e) => setEmployerAddress(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Musterstraße 1, 12345 Musterstadt"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Betriebsnummer (Minijob-Zentrale)
              </label>
              <input
                type="text"
                value={employerTaxNumber}
                onChange={(e) => setEmployerTaxNumber(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="12345678"
              />
            </div>
          </div>

          {/* Beitragssätze */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-blue-800 mb-3">
              Pauschalbeitragssätze 2025 (Arbeitgeber)
            </h3>
            <table className="w-full text-xs text-blue-900">
              <tbody>
                <tr className="border-b border-blue-100">
                  <td className="py-1.5">Krankenversicherung (KV)</td>
                  <td className="text-right font-mono">{MINIJOB_RATES.kvAG.toFixed(2)} %</td>
                </tr>
                <tr className="border-b border-blue-100">
                  <td className="py-1.5">Rentenversicherung (RV)</td>
                  <td className="text-right font-mono">{MINIJOB_RATES.rvAG.toFixed(2)} %</td>
                </tr>
                <tr className="border-b border-blue-100">
                  <td className="py-1.5">Lohnsteuerpauschale</td>
                  <td className="text-right font-mono">{MINIJOB_RATES.pauschsteuer.toFixed(2)} %</td>
                </tr>
                <tr className="border-b border-blue-100">
                  <td className="py-1.5">Umlage 2 (Mutterschaft)</td>
                  <td className="text-right font-mono">{MINIJOB_RATES.u2.toFixed(2)} %</td>
                </tr>
                <tr className="border-b border-blue-100">
                  <td className="py-1.5">Insolvenzgeldumlage</td>
                  <td className="text-right font-mono">{MINIJOB_RATES.insolvenzgeld.toFixed(2)} %</td>
                </tr>
                <tr>
                  <td className="py-1.5">
                    Unfallversicherung (BG)
                    <span className="text-blue-600 ml-1">(konfigurierbar)</span>
                  </td>
                  <td className="text-right">
                    <input
                      type="number"
                      value={uvRate}
                      onChange={(e) => setUvRate(e.target.value)}
                      step="0.01"
                      min="0"
                      className="w-20 px-2 py-0.5 border border-blue-300 rounded text-xs text-right font-mono bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="ml-1">%</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-blue-700 mt-3">
              AN-Aufstockungsbetrag RV: {MINIJOB_RATES.rvAN.toFixed(2)} % (wenn nicht befreit) · wird pro Assistent konfiguriert
            </p>
          </div>
        </>
      )}

      {message && (
        <div
          className={`px-4 py-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? 'Speichern…' : hasSettings ? 'Aktualisieren' : 'Erstmalig speichern'}
      </button>
    </form>
  )
}

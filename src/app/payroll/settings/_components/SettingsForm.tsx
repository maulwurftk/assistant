'use client'

import { useState } from 'react'
import {
  agTotalPercent,
  grossFromBezirkRate,
  formatCurrency,
  type MinijobRates,
  type PayrollCountMode,
} from '@/lib/payroll'

type Props = {
  currentRate: number
  currentCurrency: string
  currentPayrollEnabled: boolean
  currentCountMode: PayrollCountMode
  currentMinijobMode: boolean
  currentBezirkMode: boolean
  currentUvRate: number
  currentEmployerName: string
  currentEmployerAddress: string
  currentEmployerTaxNumber: string
  currentMonthlyBudget: number
  currentAccountFee: number
  currentWeeklyHoursTarget: number
  currentPrivateHoursBudget: number
  currentRates: MinijobRates
  hasSettings: boolean
}

const RATE_FIELDS: Array<{ key: keyof MinijobRates; label: string }> = [
  { key: 'kvAG', label: 'Krankenversicherung (KV)' },
  { key: 'rvAG', label: 'Rentenversicherung (RV)' },
  { key: 'pauschsteuer', label: 'Lohnsteuerpauschale' },
  { key: 'u1', label: 'Umlage 1 (Krankheit/Kur)' },
  { key: 'u2', label: 'Umlage 2 (Mutterschaft)' },
  { key: 'insolvenzgeld', label: 'Insolvenzgeldumlage (Haushaltsscheck: i.d.R. 0)' },
  { key: 'rvAN', label: 'RV-Aufstockungsbetrag AN (wenn nicht befreit)' },
]

export default function SettingsForm({
  currentRate,
  currentCurrency,
  currentPayrollEnabled,
  currentCountMode,
  currentMinijobMode,
  currentBezirkMode,
  currentUvRate,
  currentEmployerName,
  currentEmployerAddress,
  currentEmployerTaxNumber,
  currentMonthlyBudget,
  currentAccountFee,
  currentWeeklyHoursTarget,
  currentPrivateHoursBudget,
  currentRates,
  hasSettings,
}: Props) {
  const [rate, setRate] = useState(currentRate.toString())
  const [currency, setCurrency] = useState(currentCurrency)
  const [payrollEnabled, setPayrollEnabled] = useState(currentPayrollEnabled)
  const [countMode, setCountMode] = useState<PayrollCountMode>(currentCountMode)
  const [minijobMode, setMinijobMode] = useState(currentMinijobMode)
  const [bezirkMode, setBezirkMode] = useState(currentBezirkMode)
  const [uvRate, setUvRate] = useState(currentUvRate.toString())
  const [employerName, setEmployerName] = useState(currentEmployerName)
  const [employerAddress, setEmployerAddress] = useState(currentEmployerAddress)
  const [employerTaxNumber, setEmployerTaxNumber] = useState(currentEmployerTaxNumber)
  const [monthlyBudget, setMonthlyBudget] = useState(currentMonthlyBudget.toString())
  const [accountFee, setAccountFee] = useState(currentAccountFee.toString())
  const [weeklyHoursTarget, setWeeklyHoursTarget] = useState(currentWeeklyHoursTarget.toString())
  const [privateHoursBudget, setPrivateHoursBudget] = useState(currentPrivateHoursBudget.toString())
  const [rateFields, setRateFields] = useState<Record<keyof MinijobRates, string>>({
    kvAG: currentRates.kvAG.toString(),
    rvAG: currentRates.rvAG.toString(),
    pauschsteuer: currentRates.pauschsteuer.toString(),
    u1: currentRates.u1.toString(),
    u2: currentRates.u2.toString(),
    insolvenzgeld: currentRates.insolvenzgeld.toString(),
    rvAN: currentRates.rvAN.toString(),
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const num = (v: string, fallback = 0) => {
    const n = parseFloat(v.replace(',', '.'))
    return isNaN(n) ? fallback : n
  }

  // Live-Sätze aus den Eingabefeldern
  const liveRates: MinijobRates = {
    kvAG: num(rateFields.kvAG, currentRates.kvAG),
    rvAG: num(rateFields.rvAG, currentRates.rvAG),
    pauschsteuer: num(rateFields.pauschsteuer, currentRates.pauschsteuer),
    u1: num(rateFields.u1, currentRates.u1),
    u2: num(rateFields.u2, currentRates.u2),
    insolvenzgeld: num(rateFields.insolvenzgeld, currentRates.insolvenzgeld),
    rvAN: num(rateFields.rvAN, currentRates.rvAN),
  }

  // Bezirk live preview
  const bezirkRateNum = num(rate)
  const effectiveUvRate = num(uvRate, 1.6)
  const derivedBrutto =
    bezirkMode && bezirkRateNum > 0 ? grossFromBezirkRate(bezirkRateNum, effectiveUvRate, true, liveRates) : 0
  const agTotal = agTotalPercent(effectiveUvRate, true, liveRates)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    const parsedRate = num(rate)
    if (parsedRate <= 0) {
      setMessage({ type: 'error', text: 'Bitte einen gültigen Stundensatz eingeben.' })
      setSaving(false)
      return
    }

    try {
      const res = await fetch('/api/payroll/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hourly_rate: parsedRate,
          currency,
          payroll_enabled: payrollEnabled,
          payroll_count_mode: countMode,
          minijob_mode: minijobMode,
          bezirk_mode: bezirkMode,
          uv_rate: effectiveUvRate,
          employer_name: employerName,
          employer_address: employerAddress,
          employer_tax_number: employerTaxNumber,
          monthly_budget: num(monthlyBudget),
          account_fee: num(accountFee),
          weekly_hours_target: num(weeklyHoursTarget, 15),
          private_hours_budget: num(privateHoursBudget, 0),
          mj_kv_ag: liveRates.kvAG,
          mj_rv_ag: liveRates.rvAG,
          mj_pauschsteuer: liveRates.pauschsteuer,
          mj_u1: liveRates.u1,
          mj_u2: liveRates.u2,
          mj_insolvenzgeld: liveRates.insolvenzgeld,
          mj_rv_an: liveRates.rvAN,
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
      {/* Lohnabrechnung aktivieren */}
      <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
        <input
          type="checkbox"
          checked={payrollEnabled}
          onChange={(e) => setPayrollEnabled(e.target.checked)}
          className="w-4 h-4 mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
        />
        <div>
          <span className="text-sm font-medium text-slate-800">Lohnabrechnung aktiviert</span>
          <p className="text-xs text-slate-500 mt-0.5">
            Ist dies deaktiviert, sind Übersicht, Zeitraum und Konto ausgeblendet – die App
            funktioniert weiter als reines Planungs-/Kalendertool.
          </p>
        </div>
      </div>

      {/* Zähl-Modus */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Welche Zeiten zählen für die Lohnabrechnung?
        </label>
        <select
          value={countMode}
          onChange={(e) => setCountMode(e.target.value as PayrollCountMode)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="slots">Nur Kalender-Slots (empfohlen)</option>
          <option value="entries">Nur Zeiteinträge</option>
          <option value="both">Slots + Einträge</option>
        </select>
        <p className="text-xs text-slate-400 mt-1.5">
          {countMode === 'slots' && 'Es zählen ausschließlich zugewiesene Kalender-Slots. Zeiteinträge sind nur Nachweis.'}
          {countMode === 'entries' && 'Es zählen ausschließlich manuell erfasste Zeiteinträge.'}
          {countMode === 'both' && '⚠ Slots und Einträge werden addiert – wenn beide denselben Einsatz abbilden, zählt er doppelt.'}
        </p>
      </div>

      {/* Stundensatz */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          {bezirkMode ? 'Bezirkssatz (€/h, inkl. AG-Kosten)' : 'Stundensatz (€/h)'}
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
            placeholder={bezirkMode ? 'z.B. 20.00' : 'z.B. 15.50'}
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

      {/* Bezirk-Modus */}
      <div className="border-t border-slate-200 pt-6">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={bezirkMode}
            onChange={(e) => setBezirkMode(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <div>
            <span className="text-sm font-medium text-slate-700">Bezirk-Modus aktivieren</span>
            <p className="text-xs text-slate-400 mt-0.5">
              Der Bezirk zahlt eine Pauschale inkl. aller AG-Kosten. Der tatsächliche
              Bruttolohn wird automatisch zurückgerechnet.
            </p>
          </div>
        </label>

        {bezirkMode && bezirkRateNum > 0 && (
          <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-emerald-800 mb-3">
              Bezirk-Rückrechnung (live)
            </h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-emerald-900">
                <span>Bezirkssatz (Pauschale inkl. AG-Kosten)</span>
                <span className="font-mono font-medium">{formatCurrency(bezirkRateNum)}/h</span>
              </div>
              <div className="flex justify-between text-emerald-700 text-xs">
                <span>AG-Gesamtkosten ({agTotal.toFixed(2)} %)</span>
                <span className="font-mono">÷ {(1 + agTotal / 100).toFixed(4)}</span>
              </div>
              <div className="border-t border-emerald-200 pt-2 flex justify-between font-semibold text-emerald-900">
                <span>Tatsächlicher Bruttolohn (AN)</span>
                <span className="font-mono text-emerald-700 font-bold text-base">
                  {formatCurrency(derivedBrutto)}/h
                </span>
              </div>
            </div>
            <p className="text-xs text-emerald-600 mt-2">
              Lohnzettel und E-Mails verwenden {formatCurrency(derivedBrutto)}/h als Bruttolohn.
            </p>
            <p className="text-xs text-emerald-600 mt-1">
              Bei PKV-versicherten Assistentinnen:{' '}
              {formatCurrency(grossFromBezirkRate(bezirkRateNum, effectiveUvRate, false, liveRates))}/h
              (ohne KV-Beitrag, {agTotalPercent(effectiveUvRate, false, liveRates).toFixed(2)} % AG-Kosten)
            </p>
          </div>
        )}
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
      </div>

      {/* Private Stunden */}
      <div className="border-t border-slate-200 pt-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-1">Privates Monatsbudget (Stunden)</h3>
        <p className="text-xs text-slate-400 mb-3">
          Optionales monatliches Stunden-Limit für unbezahlte, private Einträge (z.B. Gefälligkeiten).
          Diese Stunden fließen nie in Lohn, Anwesenheitsnachweis oder Bezirks-Budget ein — 0 = kein Limit/keine Anzeige.
        </p>
        <input
          type="number"
          value={privateHoursBudget}
          onChange={(e) => setPrivateHoursBudget(e.target.value)}
          step="0.5"
          min="0"
          className="w-36 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="z.B. 4"
        />
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

          {/* Beitragssätze – jetzt editierbar */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-blue-800 mb-1">
              Pauschalbeitragssätze (Arbeitgeber)
            </h3>
            <p className="text-xs text-blue-600 mb-3">
              Alle Sätze manuell pflegbar – bei Gesetzesänderungen hier anpassen.
            </p>
            <table className="w-full text-xs text-blue-900">
              <tbody>
                {RATE_FIELDS.map((f) => (
                  <tr key={f.key} className="border-b border-blue-100 last:border-0">
                    <td className="py-1.5 pr-2">{f.label}</td>
                    <td className="text-right py-1 w-28">
                      <input
                        type="number"
                        value={rateFields[f.key]}
                        onChange={(e) =>
                          setRateFields((prev) => ({ ...prev, [f.key]: e.target.value }))
                        }
                        step="0.01"
                        min="0"
                        className="w-20 px-2 py-0.5 border border-blue-300 rounded text-xs text-right font-mono bg-surface focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="ml-1">%</span>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="py-1.5 pr-2">
                    Unfallversicherung (BG)
                    <span className="text-blue-600 ml-1">(betriebsindividuell)</span>
                  </td>
                  <td className="text-right py-1">
                    <input
                      type="number"
                      value={uvRate}
                      onChange={(e) => setUvRate(e.target.value)}
                      step="0.01"
                      min="0"
                      className="w-20 px-2 py-0.5 border border-blue-300 rounded text-xs text-right font-mono bg-surface focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="ml-1">%</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-blue-700 mt-3">
              AG-Gesamtabgaben aktuell: <strong>{agTotal.toFixed(2)} %</strong> (GKV) · RV-AN wird
              pro Assistent über den RV-Befreiungs-Schalter angewandt.
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

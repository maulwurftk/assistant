'use client'

import { useState } from 'react'
import {
  agTotalPercent,
  grossFromBezirkRate,
  formatCurrency,
  calculateGeringfuegigAT,
  type MinijobRates,
  type PayrollCountMode,
  type AtRates,
  type CountryMode,
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
  currentPrivateSlotColor: string
  currentRates: MinijobRates
  currentCountryMode: CountryMode
  currentAtGeringfuegigMode: boolean
  currentAtGrenze: number
  currentAtRates: AtRates
  currentAtIncludeUrlaubsgeld: boolean
  currentAtIncludeWeihnachtsgeld: boolean
  currentAtDienstgeberkontoNr: string
  currentAtKostentraegerName: string
  hasSettings: boolean
}

const AT_RATE_FIELDS: Array<{ key: keyof AtRates; label: string; hint: string }> = [
  { key: 'uvBeitrag', label: 'Unfallversicherung (UV)', hint: 'Pflicht für jede geringfügig beschäftigte Person' },
  { key: 'mvkBeitrag', label: 'Betriebliche Vorsorge (MVK / "Abfertigung neu")', hint: 'Pflicht ab dem 2. Beschäftigungsmonat' },
  { key: 'dgAbgabe', label: 'Dienstgeberabgabe', hint: 'Nur bei mehreren geringfügig Beschäftigten über der 1,5x-Schwelle — sonst 0 lassen' },
  { key: 'kommunalsteuer', label: 'Kommunalsteuer', hint: 'Nur wenn Gemeinde-Freibetrag überschritten — bei Privathaushalten i.d.R. 0' },
]

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
  currentPrivateSlotColor,
  currentRates,
  currentCountryMode,
  currentAtGeringfuegigMode,
  currentAtGrenze,
  currentAtRates,
  currentAtIncludeUrlaubsgeld,
  currentAtIncludeWeihnachtsgeld,
  currentAtDienstgeberkontoNr,
  currentAtKostentraegerName,
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
  const [privateSlotColor, setPrivateSlotColor] = useState(currentPrivateSlotColor)
  const [rateFields, setRateFields] = useState<Record<keyof MinijobRates, string>>({
    kvAG: currentRates.kvAG.toString(),
    rvAG: currentRates.rvAG.toString(),
    pauschsteuer: currentRates.pauschsteuer.toString(),
    u1: currentRates.u1.toString(),
    u2: currentRates.u2.toString(),
    insolvenzgeld: currentRates.insolvenzgeld.toString(),
    rvAN: currentRates.rvAN.toString(),
  })
  const [countryMode, setCountryMode] = useState<CountryMode>(currentCountryMode)
  const [atGeringfuegigMode, setAtGeringfuegigMode] = useState(currentAtGeringfuegigMode)
  const [atGrenze, setAtGrenze] = useState(currentAtGrenze.toString())
  const [atIncludeUrlaubsgeld, setAtIncludeUrlaubsgeld] = useState(currentAtIncludeUrlaubsgeld)
  const [atIncludeWeihnachtsgeld, setAtIncludeWeihnachtsgeld] = useState(currentAtIncludeWeihnachtsgeld)
  const [atDienstgeberkontoNr, setAtDienstgeberkontoNr] = useState(currentAtDienstgeberkontoNr)
  const [atKostentraegerName, setAtKostentraegerName] = useState(currentAtKostentraegerName)
  const [atRateFields, setAtRateFields] = useState<Record<keyof AtRates, string>>({
    uvBeitrag: currentAtRates.uvBeitrag.toString(),
    mvkBeitrag: currentAtRates.mvkBeitrag.toString(),
    dgAbgabe: currentAtRates.dgAbgabe.toString(),
    kommunalsteuer: currentAtRates.kommunalsteuer.toString(),
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

  // AT live preview
  const liveAtRates: AtRates = {
    uvBeitrag: num(atRateFields.uvBeitrag, currentAtRates.uvBeitrag),
    mvkBeitrag: num(atRateFields.mvkBeitrag, currentAtRates.mvkBeitrag),
    dgAbgabe: num(atRateFields.dgAbgabe, currentAtRates.dgAbgabe),
    kommunalsteuer: num(atRateFields.kommunalsteuer, currentAtRates.kommunalsteuer),
  }
  const atBreakdown =
    countryMode === 'at' && bezirkRateNum > 0
      ? calculateGeringfuegigAT(
          bezirkRateNum,
          { includeUrlaubsgeld: atIncludeUrlaubsgeld, includeWeihnachtsgeld: atIncludeWeihnachtsgeld },
          liveAtRates
        )
      : null

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
          private_slot_color: privateSlotColor || '#a855f7',
          mj_kv_ag: liveRates.kvAG,
          mj_rv_ag: liveRates.rvAG,
          mj_pauschsteuer: liveRates.pauschsteuer,
          mj_u1: liveRates.u1,
          mj_u2: liveRates.u2,
          mj_insolvenzgeld: liveRates.insolvenzgeld,
          mj_rv_an: liveRates.rvAN,
          country_mode: countryMode,
          at_geringfuegig_mode: atGeringfuegigMode,
          at_geringfuegigkeitsgrenze: num(atGrenze, currentAtGrenze),
          at_uv_beitrag: liveAtRates.uvBeitrag,
          at_mvk_beitrag: liveAtRates.mvkBeitrag,
          at_dg_abgabe: liveAtRates.dgAbgabe,
          at_kommunalsteuer: liveAtRates.kommunalsteuer,
          at_include_urlaubsgeld: atIncludeUrlaubsgeld,
          at_include_weihnachtsgeld: atIncludeWeihnachtsgeld,
          at_dienstgeberkonto_nr: atDienstgeberkontoNr,
          at_kostentraeger_name: atKostentraegerName,
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
      {/* Länder-Modus */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Land / Abrechnungsmodus</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCountryMode('de')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm border ${
              countryMode === 'de'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-surface text-slate-600 border-slate-300'
            }`}
          >
            Deutschland (Minijob)
          </button>
          <button
            type="button"
            onClick={() => setCountryMode('at')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm border ${
              countryMode === 'at'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-surface text-slate-600 border-slate-300'
            }`}
          >
            Österreich (geringfügig)
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-1.5">
          Schaltet zwischen deutschem Minijob-/Bezirk-Verfahren und österreichischer geringfügiger
          Beschäftigung um. Die jeweils andere Rate-Tabelle bleibt gespeichert, wird aber nicht
          verwendet.
        </p>
      </div>

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

      {/* Bezirk-Modus (nur DE) */}
      {countryMode === 'de' && (
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
      )}

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

        <label className="block text-xs font-medium text-slate-600 mt-4 mb-1">
          Kalenderfarbe für private Termine
        </label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={privateSlotColor}
            onChange={(e) => setPrivateSlotColor(e.target.value)}
            className="h-9 w-14 border border-slate-300 rounded-lg cursor-pointer"
          />
          <span className="text-xs font-mono text-slate-500">{privateSlotColor}</span>
        </div>
      </div>

      {/* Minijob-Modus (nur DE) */}
      {countryMode === 'de' && (
      <>
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
      </>
      )}

      {/* Geringfügige Beschäftigung (nur AT) */}
      {countryMode === 'at' && (
      <div className="border-t border-slate-200 pt-6">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={atGeringfuegigMode}
            onChange={(e) => setAtGeringfuegigMode(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <div>
            <span className="text-sm font-medium text-slate-700">
              Geringfügige Beschäftigung – Detailanzeige aktivieren
            </span>
            <p className="text-xs text-slate-400 mt-0.5">
              Lohnzettel und E-Mail zeigen Brutto/Netto sowie alle Abgaben-Positionen
            </p>
          </div>
        </label>

        {atGeringfuegigMode && (
          <>
            {/* Arbeitgeberdaten AT */}
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
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
                  placeholder="Musterstraße 1, 1010 Wien"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  ÖGK-Beitragskontonummer (Dienstgeberkonto)
                </label>
                <input
                  type="text"
                  value={atDienstgeberkontoNr}
                  onChange={(e) => setAtDienstgeberkontoNr(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="z.B. 123456789"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Kostenträger (z.B. Sozialministeriumservice oder Bundesland)
                </label>
                <input
                  type="text"
                  value={atKostentraegerName}
                  onChange={(e) => setAtKostentraegerName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="z.B. Sozialministeriumservice / Land Tirol"
                />
              </div>
            </div>

            {/* Geringfügigkeitsgrenze */}
            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Geringfügigkeitsgrenze (€/Monat)
              </label>
              <input
                type="number"
                value={atGrenze}
                onChange={(e) => setAtGrenze(e.target.value)}
                step="0.01"
                min="0"
                className="w-36 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-400 mt-1.5">
                Ändert sich jährlich per Gesetz — hier bei Bedarf anpassen (2026: 551,10 €).
              </p>
            </div>

            {/* Sonderzahlungen */}
            <div className="mt-4 space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={atIncludeUrlaubsgeld}
                  onChange={(e) => setAtIncludeUrlaubsgeld(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">13. Gehalt (Urlaubsgeld) aliquot einrechnen</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={atIncludeWeihnachtsgeld}
                  onChange={(e) => setAtIncludeWeihnachtsgeld(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">14. Gehalt (Weihnachtsgeld) aliquot einrechnen</span>
              </label>
              <p className="text-xs text-slate-400">
                Nur aktivieren, wenn für das Assistenzverhältnis ein Kollektivvertrag oder
                Einzelvertrag Sonderzahlungen vorsieht — das ist eine Einzelfallfrage, keine
                automatische Pflicht.
              </p>
            </div>

            {/* Beitragssätze AT */}
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-blue-800 mb-1">Abgaben (Arbeitgeber)</h3>
              <p className="text-xs text-blue-600 mb-3">
                Alle Sätze manuell pflegbar – bei Gesetzesänderungen hier anpassen. Im Normalfall
                (eine Assistenzperson) reichen UV und MVK; Dienstgeberabgabe/Kommunalsteuer nur in
                Sonderfällen aktivieren.
              </p>
              <table className="w-full text-xs text-blue-900">
                <tbody>
                  {AT_RATE_FIELDS.map((f) => (
                    <tr key={f.key} className="border-b border-blue-100 last:border-0">
                      <td className="py-1.5 pr-2">
                        {f.label}
                        <div className="text-blue-500">{f.hint}</div>
                      </td>
                      <td className="text-right py-1 w-28 align-top">
                        <input
                          type="number"
                          value={atRateFields[f.key]}
                          onChange={(e) =>
                            setAtRateFields((prev) => ({ ...prev, [f.key]: e.target.value }))
                          }
                          step="0.01"
                          min="0"
                          className="w-20 px-2 py-0.5 border border-blue-300 rounded text-xs text-right font-mono bg-surface focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <span className="ml-1">%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Live-Vorschau */}
            {atBreakdown && (
              <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-emerald-800 mb-3">Abrechnung (live, pro Stunde)</h3>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-emerald-900">
                    <span>Brutto</span>
                    <span className="font-mono font-medium">{formatCurrency(atBreakdown.brutto)}/h</span>
                  </div>
                  {atIncludeUrlaubsgeld && (
                    <div className="flex justify-between text-emerald-700 text-xs">
                      <span>+ Urlaubsgeld-Anteil (1/12)</span>
                      <span className="font-mono">{formatCurrency(atBreakdown.urlaubsgeldAnteil)}/h</span>
                    </div>
                  )}
                  {atIncludeWeihnachtsgeld && (
                    <div className="flex justify-between text-emerald-700 text-xs">
                      <span>+ Weihnachtsgeld-Anteil (1/12)</span>
                      <span className="font-mono">{formatCurrency(atBreakdown.weihnachtsgeldAnteil)}/h</span>
                    </div>
                  )}
                  <div className="flex justify-between text-emerald-700 text-xs">
                    <span>AG-Abgaben gesamt</span>
                    <span className="font-mono">{formatCurrency(atBreakdown.totalAGAbgaben)}/h</span>
                  </div>
                  <div className="border-t border-emerald-200 pt-2 flex justify-between font-semibold text-emerald-900">
                    <span>Gesamtkosten AG</span>
                    <span className="font-mono text-emerald-700 font-bold text-base">
                      {formatCurrency(atBreakdown.totalKosten)}/h
                    </span>
                  </div>
                </div>
                <p className="text-xs text-emerald-600 mt-2">
                  Netto = Brutto (inkl. Sonderzahlungsanteile), solange keine freiwillige
                  Selbstversicherung greift — die läuft ohnehin separat/jährlich direkt zwischen
                  Assistenzperson und ÖGK, nicht über diese Lohnabrechnung.
                </p>
              </div>
            )}
          </>
        )}
      </div>
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

'use client'

import { useEffect, useState } from 'react'
import { formatCurrency } from '@/lib/payroll'

type Props = {
  currency: string
  monthlyBudget: number
  agAbgabenPeriod: number
}

function euro(v: string): number {
  const n = parseFloat(v.replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}

export function RuecklagenRechner({ currency, monthlyBudget, agAbgabenPeriod }: Props) {
  const [kontostand, setKontostand] = useState('')
  const [minijobRes, setMinijobRes] = useState(agAbgabenPeriod.toFixed(2).replace('.', ','))
  const [budgetMonths, setBudgetMonths] = useState('2')
  const [loaded, setLoaded] = useState(false)

  // Aus localStorage laden
  useEffect(() => {
    const k = localStorage.getItem('ruecklage_kontostand')
    const b = localStorage.getItem('ruecklage_budgetMonths')
    if (k) setKontostand(k)
    if (b) setBudgetMonths(b)
    setLoaded(true)
  }, [])

  // Bei Zeitraumwechsel Minijob-Rücklage auf den neuen AG-Abgaben-Wert setzen
  useEffect(() => {
    setMinijobRes(agAbgabenPeriod.toFixed(2).replace('.', ','))
  }, [agAbgabenPeriod])

  useEffect(() => {
    if (loaded) localStorage.setItem('ruecklage_kontostand', kontostand)
  }, [kontostand, loaded])
  useEffect(() => {
    if (loaded) localStorage.setItem('ruecklage_budgetMonths', budgetMonths)
  }, [budgetMonths, loaded])

  const stand = euro(kontostand)
  const minijob = euro(minijobRes)
  const months = parseInt(budgetMonths, 10) || 0
  const bezirkRes = months * monthlyBudget
  const sollRuecklage = minijob + bezirkRes
  const differenz = stand - sollRuecklage
  const mussZurueck = differenz > 0

  return (
    <div className="bg-surface border border-slate-200 rounded-lg p-6 mb-6 print:hidden">
      <h3 className="font-bold text-slate-900 mb-1">Rücklagen-Rechner</h3>
      <p className="text-xs text-slate-500 mb-4">
        Wieviel muss auf dem Konto bleiben, wieviel geht an den Bezirk zurück.
      </p>

      <div className="grid md:grid-cols-3 gap-4 mb-5">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Aktueller Kontostand
          </label>
          <div className="relative">
            <input
              inputMode="decimal"
              value={kontostand}
              onChange={(e) => setKontostand(e.target.value)}
              placeholder="0,00"
              className="w-full pl-3 pr-8 py-2 border border-slate-300 rounded-md text-sm tabular-nums"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">€</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Rücklage Minijobzentrale
          </label>
          <div className="relative">
            <input
              inputMode="decimal"
              value={minijobRes}
              onChange={(e) => setMinijobRes(e.target.value)}
              className="w-full pl-3 pr-8 py-2 border border-slate-300 rounded-md text-sm tabular-nums"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">€</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Vorbelegt mit AG-Abgaben des Zeitraums (noch nicht abgebucht)
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Bezirk-Rücklage
          </label>
          <div className="flex items-center gap-2">
            <input
              inputMode="numeric"
              value={budgetMonths}
              onChange={(e) => setBudgetMonths(e.target.value)}
              className="w-14 px-2 py-2 border border-slate-300 rounded-md text-sm text-center tabular-nums"
            />
            <span className="text-sm text-slate-500">
              × {formatCurrency(monthlyBudget, currency)}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            = {formatCurrency(bezirkRes, currency)} ({budgetMonths} Monatsbudgets)
          </p>
        </div>
      </div>

      {/* Rechnung */}
      <div className="border-t border-slate-100 pt-4 space-y-1.5 text-sm">
        <div className="flex justify-between text-slate-600">
          <span>Kontostand</span>
          <span className="tabular-nums">{formatCurrency(stand, currency)}</span>
        </div>
        <div className="flex justify-between text-slate-600">
          <span>− Rücklage Minijobzentrale</span>
          <span className="tabular-nums">−{formatCurrency(minijob, currency)}</span>
        </div>
        <div className="flex justify-between text-slate-600">
          <span>− Rücklage Bezirk ({budgetMonths} × Budget)</span>
          <span className="tabular-nums">−{formatCurrency(bezirkRes, currency)}</span>
        </div>
        <div className="flex justify-between font-medium text-slate-800 pt-1.5 border-t border-slate-100">
          <span>Soll-Rücklage gesamt</span>
          <span className="tabular-nums">{formatCurrency(sollRuecklage, currency)}</span>
        </div>
      </div>

      {/* Ergebnis */}
      <div
        className={
          mussZurueck
            ? 'mt-4 rounded-lg p-4 bg-amber-50 border border-amber-200'
            : 'mt-4 rounded-lg p-4 bg-emerald-50 border border-emerald-200'
        }
      >
        {mussZurueck ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-amber-800">
                An den Bezirk zurücküberweisen
              </p>
              <p className="text-[11px] text-amber-600 mt-0.5">
                Guthaben über der Soll-Rücklage
              </p>
            </div>
            <p className="text-2xl font-bold text-amber-700 tabular-nums">
              {formatCurrency(differenz, currency)}
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-800">
                Keine Rückzahlung nötig
              </p>
              <p className="text-[11px] text-emerald-600 mt-0.5">
                {differenz === 0
                  ? 'Kontostand entspricht exakt der Soll-Rücklage'
                  : `${formatCurrency(Math.abs(differenz), currency)} unter der Soll-Rücklage`}
              </p>
            </div>
            <p className="text-2xl font-bold text-emerald-700 tabular-nums">
              {formatCurrency(0, currency)}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

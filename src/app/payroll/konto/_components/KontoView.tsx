'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/payroll'

type Entry = {
  id: string
  booking_date: string
  direction: 'in' | 'out'
  category: string
  amount: number
  description: string | null
  status: 'pending' | 'confirmed'
  source: 'manual' | 'auto'
}

type Props = {
  currency: string
  monthlyBudget: number
  initialLedger: Entry[]
}

export function KontoView({ currency, monthlyBudget, initialLedger }: Props) {
  const router = useRouter()
  const [ledger, setLedger] = useState<Entry[]>(initialLedger)
  const [busy, setBusy] = useState<string | null>(null)
  const [budgetMonths, setBudgetMonths] = useState('2')
  const [showForm, setShowForm] = useState(false)

  // Formular
  const [fDate, setFDate] = useState(new Date().toISOString().slice(0, 10))
  const [fDir, setFDir] = useState<'in' | 'out'>('out')
  const [fCat, setFCat] = useState('')
  const [fAmount, setFAmount] = useState('')
  const [fDesc, setFDesc] = useState('')

  useEffect(() => {
    const b = localStorage.getItem('konto_budgetMonths')
    if (b) setBudgetMonths(b)
  }, [])
  useEffect(() => {
    localStorage.setItem('konto_budgetMonths', budgetMonths)
  }, [budgetMonths])

  const confirmed = ledger.filter((e) => e.status === 'confirmed')
  const pending = ledger.filter((e) => e.status === 'pending')

  const ist = confirmed.reduce(
    (sum, e) => sum + (e.direction === 'in' ? e.amount : -e.amount),
    0
  )
  const months = parseInt(budgetMonths, 10) || 0
  const soll = months * monthlyBudget
  const differenz = ist - soll
  const ueber = differenz > 0

  async function refresh() {
    router.refresh()
  }

  async function confirmEntry(id: string) {
    setBusy(id)
    const res = await fetch(`/api/payroll/konto/${id}`, { method: 'PATCH' })
    if (res.ok) {
      setLedger((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: 'confirmed' } : e))
      )
    }
    setBusy(null)
  }

  async function deleteEntry(id: string) {
    setBusy(id)
    const res = await fetch(`/api/payroll/konto/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setLedger((prev) => prev.filter((e) => e.id !== id))
    }
    setBusy(null)
  }

  async function generate() {
    setBusy('generate')
    const res = await fetch('/api/payroll/konto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate' }),
    })
    setBusy(null)
    if (res.ok) refresh()
  }

  async function addManual() {
    if (!fCat || !fAmount) return
    setBusy('add')
    const res = await fetch('/api/payroll/konto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        booking_date: fDate,
        direction: fDir,
        category: fCat,
        amount: parseFloat(fAmount.replace(',', '.')),
        description: fDesc || null,
      }),
    })
    setBusy(null)
    if (res.ok) {
      setFCat('')
      setFAmount('')
      setFDesc('')
      setShowForm(false)
      refresh()
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Virtuelles Konto</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Kontostand ohne Bankzugriff – jede Buchung wird bestätigt.
          </p>
        </div>
        <button
          onClick={generate}
          disabled={busy === 'generate'}
          className="px-3 py-2 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          {busy === 'generate' ? 'Berechne…' : '↻ Vorschläge aus Lohndaten'}
        </button>
      </div>

      {/* Übersicht Ist / Soll */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="bg-surface border border-slate-200 rounded-lg p-5">
          <p className="text-xs text-slate-500">Virtuelles Guthaben (Ist)</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {formatCurrency(Math.round(ist * 100) / 100, currency)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            {confirmed.length} bestätigte Buchungen
          </p>
        </div>

        <div className="bg-surface border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Soll-Rücklage (max erlaubt)</p>
            <div className="flex items-center gap-1">
              <input
                inputMode="numeric"
                value={budgetMonths}
                onChange={(e) => setBudgetMonths(e.target.value)}
                className="w-10 px-1.5 py-0.5 border border-slate-300 rounded text-xs text-center tabular-nums"
              />
              <span className="text-[11px] text-slate-400">× Budget</span>
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {formatCurrency(soll, currency)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            {budgetMonths} × {formatCurrency(monthlyBudget, currency)}
          </p>
        </div>

        <div
          className={
            ueber
              ? 'rounded-lg p-5 bg-amber-50 border border-amber-200'
              : 'rounded-lg p-5 bg-emerald-50 border border-emerald-200'
          }
        >
          <p className={ueber ? 'text-xs text-amber-700' : 'text-xs text-emerald-700'}>
            {ueber ? 'Über Soll → zurücküberweisen' : 'Puffer bis Soll-Grenze'}
          </p>
          <p
            className={
              ueber
                ? 'text-2xl font-bold text-amber-700 mt-1 tabular-nums'
                : 'text-2xl font-bold text-emerald-700 mt-1 tabular-nums'
            }
          >
            {formatCurrency(Math.abs(Math.round(differenz * 100) / 100), currency)}
          </p>
          <p className={ueber ? 'text-[11px] text-amber-600 mt-1' : 'text-[11px] text-emerald-600 mt-1'}>
            {ueber ? 'Guthaben über der Rücklage-Grenze' : 'noch Luft bis zur Grenze'}
          </p>
        </div>
      </div>

      {/* Zu bestätigen */}
      {pending.length > 0 && (
        <div className="bg-surface border border-amber-200 rounded-lg overflow-hidden mb-6">
          <div className="bg-amber-50 px-4 py-2.5 border-b border-amber-200">
            <p className="text-sm font-semibold text-amber-800">
              {pending.length} Vorschläge zu bestätigen
            </p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {pending.map((e) => (
                <tr key={e.id} className="border-t border-slate-100 first:border-t-0">
                  <td className="px-4 py-2.5 text-slate-500 tabular-nums whitespace-nowrap">
                    {formatDate(e.booking_date)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-medium text-slate-800">{e.category}</span>
                    {e.description && (
                      <span className="text-xs text-slate-400 ml-2">{e.description}</span>
                    )}
                  </td>
                  <td
                    className={
                      e.direction === 'in'
                        ? 'px-3 py-2.5 text-right tabular-nums font-medium text-emerald-600 whitespace-nowrap'
                        : 'px-3 py-2.5 text-right tabular-nums font-medium text-red-600 whitespace-nowrap'
                    }
                  >
                    {e.direction === 'in' ? '+' : '−'}
                    {formatCurrency(e.amount, currency)}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => confirmEntry(e.id)}
                      disabled={busy === e.id}
                      className="px-2.5 py-1 text-xs font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 mr-1.5"
                    >
                      Bestätigen
                    </button>
                    <button
                      onClick={() => deleteEntry(e.id)}
                      disabled={busy === e.id}
                      className="px-2.5 py-1 text-xs font-medium rounded border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Verwerfen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Buchungen */}
      <div className="bg-surface border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">Kontobuch</p>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            {showForm ? '× Abbrechen' : '+ Manuelle Buchung'}
          </button>
        </div>

        {showForm && (
          <div className="p-4 bg-slate-50 border-b border-slate-200 grid md:grid-cols-5 gap-2 items-end">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Datum</label>
              <input
                type="date"
                value={fDate}
                onChange={(e) => setFDate(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Richtung</label>
              <select
                value={fDir}
                onChange={(e) => setFDir(e.target.value as 'in' | 'out')}
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm bg-surface"
              >
                <option value="in">Einnahme (+)</option>
                <option value="out">Ausgabe (−)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Kategorie</label>
              <input
                value={fCat}
                onChange={(e) => setFCat(e.target.value)}
                placeholder="z.B. Minijobzentrale"
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Betrag €</label>
              <input
                inputMode="decimal"
                value={fAmount}
                onChange={(e) => setFAmount(e.target.value)}
                placeholder="0,00"
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm tabular-nums"
              />
            </div>
            <button
              onClick={addManual}
              disabled={busy === 'add' || !fCat || !fAmount}
              className="px-3 py-1.5 text-sm font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Buchen
            </button>
            <div className="md:col-span-5">
              <input
                value={fDesc}
                onChange={(e) => setFDesc(e.target.value)}
                placeholder="Notiz (optional)"
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
              />
            </div>
          </div>
        )}

        <table className="w-full text-sm">
          <tbody>
            {confirmed.length === 0 && (
              <tr>
                <td className="text-center text-slate-400 py-8">
                  Noch keine bestätigten Buchungen
                </td>
              </tr>
            )}
            {confirmed.map((e) => (
              <tr key={e.id} className="border-t border-slate-100 first:border-t-0 group">
                <td className="px-4 py-2.5 text-slate-500 tabular-nums whitespace-nowrap">
                  {formatDate(e.booking_date)}
                </td>
                <td className="px-3 py-2.5">
                  <span className="font-medium text-slate-800">{e.category}</span>
                  {e.description && (
                    <span className="text-xs text-slate-400 ml-2">{e.description}</span>
                  )}
                  {e.source === 'auto' && (
                    <span className="text-[10px] text-slate-400 ml-2 px-1 py-0.5 bg-slate-100 rounded">
                      auto
                    </span>
                  )}
                </td>
                <td
                  className={
                    e.direction === 'in'
                      ? 'px-3 py-2.5 text-right tabular-nums font-medium text-emerald-600 whitespace-nowrap'
                      : 'px-3 py-2.5 text-right tabular-nums font-medium text-red-600 whitespace-nowrap'
                  }
                >
                  {e.direction === 'in' ? '+' : '−'}
                  {formatCurrency(e.amount, currency)}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap w-10">
                  <button
                    onClick={() => deleteEntry(e.id)}
                    disabled={busy === e.id}
                    className="text-xs text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Löschen"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

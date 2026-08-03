'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { formatCurrency, formatDate } from '@/lib/payroll'
import { Wallet, Pencil, Trash2, FileDown, Printer } from 'lucide-react'
import { PageHeader } from '@/components/page-header'

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
  const [editingId, setEditingId] = useState<string | null>(null)

  // Formular (Neu-Buchung und Bearbeiten)
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

  function resetForm() {
    setFDate(new Date().toISOString().slice(0, 10))
    setFDir('out')
    setFCat('')
    setFAmount('')
    setFDesc('')
    setEditingId(null)
    setShowForm(false)
  }

  function startEdit(e: Entry) {
    setEditingId(e.id)
    setFDate(e.booking_date)
    setFDir(e.direction)
    setFCat(e.category)
    setFAmount(String(e.amount).replace('.', ','))
    setFDesc(e.description ?? '')
    setShowForm(true)
  }

  async function saveEntry() {
    if (!fCat || !fAmount) return
    const payload = {
      booking_date: fDate,
      direction: fDir,
      category: fCat,
      amount: parseFloat(fAmount.replace(',', '.')),
      description: fDesc || null,
    }
    if (editingId) {
      // Bearbeiten
      setBusy(editingId)
      const res = await fetch(`/api/payroll/konto/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setBusy(null)
      if (res.ok) {
        setLedger((prev) =>
          prev.map((e) => (e.id === editingId ? { ...e, ...payload } : e))
        )
        resetForm()
      }
    } else {
      // Neu
      setBusy('add')
      const res = await fetch('/api/payroll/konto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setBusy(null)
      if (res.ok) {
        resetForm()
        refresh()
      }
    }
  }

  function exportXls() {
    const rows = confirmed.map((e) => ({
      Datum: formatDate(e.booking_date),
      Kategorie: e.category,
      Notiz: e.description ?? '',
      Richtung: e.direction === 'in' ? 'Einnahme' : 'Ausgabe',
      'Betrag (€)': e.direction === 'in' ? e.amount : -e.amount,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.sheet_add_aoa(
      ws,
      [[], ['', '', '', 'Guthaben (Ist)', Math.round(ist * 100) / 100]],
      { origin: -1 }
    )
    ws['!cols'] = [{ wch: 12 }, { wch: 24 }, { wch: 28 }, { wch: 12 }, { wch: 12 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Kontobuch')
    XLSX.writeFile(wb, `Kontobuch_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function exportPdf() {
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const rowsHtml = confirmed
      .map(
        (e) => `<tr>
          <td>${formatDate(e.booking_date)}</td>
          <td>${esc(e.category)}${e.description ? ' – <span style="color:#888">' + esc(e.description) + '</span>' : ''}</td>
          <td style="text-align:right;color:${e.direction === 'in' ? '#059669' : '#dc2626'};white-space:nowrap">${e.direction === 'in' ? '+' : '−'}${formatCurrency(e.amount, currency)}</td>
        </tr>`
      )
      .join('')
    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Kontobuch</title>
      <style>
        body{font-family:system-ui,-apple-system,sans-serif;color:#0f172a;padding:32px;max-width:800px;margin:0 auto}
        h1{font-size:20px;margin:0 0 2px} .sub{color:#64748b;font-size:13px;margin:0 0 20px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{text-align:left;color:#64748b;font-weight:600;border-bottom:2px solid #cbd5e1;padding:8px 6px}
        td{padding:7px 6px;border-bottom:1px solid #e2e8f0}
        tfoot td{border-top:2px solid #cbd5e1;font-weight:700;font-size:15px;padding-top:12px}
        .sign{margin-top:48px;display:flex;justify-content:space-between;gap:40px}
        .sign div{flex:1;border-top:1px solid #94a3b8;padding-top:6px;font-size:12px;color:#64748b}
      </style></head><body>
      <h1>Kontobuch – Bezirk-Konto</h1>
      <p class="sub">Stand: ${new Date().toLocaleDateString('de-DE')} · Virtuelles Guthaben (Ist): <strong>${formatCurrency(Math.round(ist * 100) / 100, currency)}</strong></p>
      <table>
        <thead><tr><th>Datum</th><th>Kategorie</th><th style="text-align:right">Betrag</th></tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:24px">Keine bestätigten Buchungen</td></tr>'}</tbody>
        <tfoot><tr><td colspan="2">Guthaben (Ist)</td><td style="text-align:right">${formatCurrency(Math.round(ist * 100) / 100, currency)}</td></tr></tfoot>
      </table>
      <div class="sign"><div>Datum, Unterschrift Arbeitgeber</div><div>Datum, Unterschrift Bezirk</div></div>
      <script>window.onload=function(){window.print()}</script>
      </body></html>`
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <PageHeader
          icon={<Wallet className="h-5 w-5" />}
          title="Virtuelles Konto"
          subtitle="Kontostand ohne Bankzugriff – jede Buchung wird bestätigt."
          tone="violet"
        />
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
        <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-semibold text-slate-800">Kontobuch</p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={exportXls}
              title="Als Excel-Datei exportieren"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <FileDown className="h-3.5 w-3.5" /> Excel
            </button>
            <button
              onClick={exportPdf}
              title="Als PDF drucken / speichern"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Printer className="h-3.5 w-3.5" /> PDF
            </button>
            <button
              onClick={() => (showForm ? resetForm() : (resetForm(), setShowForm(true)))}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
            >
              {showForm ? '× Abbrechen' : '+ Buchung'}
            </button>
          </div>
        </div>

        {showForm && (
          <div className="p-4 bg-slate-50 border-b border-slate-200 grid md:grid-cols-5 gap-2 items-end">
            {editingId && (
              <div className="md:col-span-5 text-xs font-semibold text-violet-700">
                Buchung bearbeiten
              </div>
            )}
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
              onClick={saveEntry}
              disabled={
                busy === 'add' ||
                (editingId !== null && busy === editingId) ||
                !fCat ||
                !fAmount
              }
              className="px-3 py-1.5 text-sm font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {editingId ? 'Speichern' : 'Buchen'}
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
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-0.5">
                    <button
                      onClick={() => startEdit(e)}
                      className="p-1.5 rounded text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                      title="Bearbeiten"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteEntry(e.id)}
                      disabled={busy === e.id}
                      className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                      title="Löschen"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

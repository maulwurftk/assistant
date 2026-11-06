'use client'

import { useState } from 'react'
import { Landmark, X } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency, formatDate } from '@/lib/payroll'

type Item = {
  ref: string
  date: string
  amount: number
  direction: 'in' | 'out'
  recipient: string
  purpose: string
  category: string
  action: 'attach' | 'insert' | 'skip'
  skipReason?: string
  match?: { id: string; expected: number; status: 'pending' | 'confirmed'; category: string }
  diff?: number
  warning?: string
  uncertain?: boolean
}
type Missing = { id: string; booking_date: string; category: string; amount: number; direction: 'in' | 'out'; status: string }

export function BankImport({ currency, defaultFrom, onDone }: { currency: string; defaultFrom: string; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [csv, setCsv] = useState('')
  const [fileName, setFileName] = useState('')
  const [from, setFrom] = useState(defaultFrom)
  const [busy, setBusy] = useState(false)
  const [items, setItems] = useState<Item[] | null>(null)
  const [missing, setMissing] = useState<Missing[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  function reset() {
    setCsv(''); setFileName(''); setItems(null); setMissing([]); setSelected(new Set())
  }

  async function onFile(f: File | undefined) {
    if (!f) return
    setFileName(f.name)
    setCsv(await f.text())
    setItems(null)
  }

  async function call(action: 'preview' | 'commit', refs?: string[]) {
    const res = await fetch('/api/payroll/konto/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, csv, from: from || undefined, refs }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error ?? 'Fehler beim Import')
    return data
  }

  async function preview() {
    setBusy(true)
    try {
      const data = await call('preview')
      const list = data.items as Item[]
      setItems(list)
      setMissing(data.missing as Missing[])
      // Vorauswahl: neue Buchungen + Zuordnungen ohne Abweichung bzw. zu offenen Vorschlägen
      setSelected(new Set(list.filter((i) => i.action === 'insert' || (i.action === 'attach' && (i.match?.status === 'pending' || !i.warning))).map((i) => i.ref)))
    } catch (e) {
      toast.error((e as Error).message)
    }
    setBusy(false)
  }

  async function commit() {
    setBusy(true)
    try {
      const data = await call('commit', [...selected])
      toast.success(`${data.attached} zugeordnet, ${data.inserted} neu gebucht`)
      setOpen(false)
      reset()
      onDone()
    } catch (e) {
      toast.error((e as Error).message)
    }
    setBusy(false)
  }

  function toggle(ref: string) {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(ref)) n.delete(ref); else n.add(ref)
      return n
    })
  }

  const actionable = (items ?? []).filter((i) => i.action !== 'skip')
  const withDiff = actionable.filter((i) => i.action === 'attach' && i.warning).length

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-2 text-sm font-medium rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5"
      >
        <Landmark className="h-4 w-4" /> Kontoauszug importieren
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-surface rounded-xl shadow-xl w-full max-w-5xl my-8">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="font-semibold text-slate-900">Kontoauszug importieren &amp; abgleichen</h2>
              <button onClick={() => { setOpen(false); reset() }} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">CSV-Datei der Bank (z.&nbsp;B. C24 „Transaktionen")</label>
                  <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Nur Buchungen ab</label>
                  <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setItems(null) }} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
                </div>
                <button
                  onClick={preview}
                  disabled={!csv || busy}
                  className="px-3 py-2 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busy && !items ? 'Prüfe…' : 'Vorschau & Abgleich'}
                </button>
                {fileName && <span className="text-xs text-slate-400">{fileName}</span>}
              </div>

              {items && (
                <>
                  <p className="text-sm text-slate-600">
                    {actionable.length} Buchungen zu übernehmen, {items.length - actionable.length} bereits importiert.
                    {withDiff > 0 && <span className="text-amber-700"> {withDiff} mit Abweichung zum erwarteten Betrag.</span>}
                  </p>

                  <div className="border border-slate-200 rounded-lg overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-3 py-2 w-8"></th>
                          <th className="px-3 py-2 text-left">Datum</th>
                          <th className="px-3 py-2 text-left">Bank-Buchung</th>
                          <th className="px-3 py-2 text-right">Betrag</th>
                          <th className="px-3 py-2 text-left">Zuordnung im Konto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((i) => (
                          <tr key={i.ref} className={`border-t border-slate-100 ${i.action === 'skip' ? 'opacity-40' : ''}`}>
                            <td className="px-3 py-2">
                              {i.action !== 'skip' && (
                                <input type="checkbox" checked={selected.has(i.ref)} onChange={() => toggle(i.ref)} />
                              )}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">{formatDate(i.date)}</td>
                            <td className="px-3 py-2">
                              <p className="font-medium text-slate-800">{i.recipient}</p>
                              <p className="text-xs text-slate-400 max-w-xs truncate" title={i.purpose}>{i.purpose}</p>
                            </td>
                            <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${i.direction === 'in' ? 'text-emerald-700' : 'text-slate-800'}`}>
                              {i.direction === 'in' ? '+' : '−'}{formatCurrency(i.amount, currency)}
                            </td>
                            <td className="px-3 py-2 text-xs">
                              {i.action === 'skip' && <span className="text-slate-400">{i.skipReason}</span>}
                              {i.action === 'attach' && (
                                <>
                                  <span className="text-slate-700">✓ {i.match?.category}</span>
                                  {i.warning && <span className="block text-amber-700">{i.warning}</span>}
                                  {i.match?.status === 'confirmed' && <span className="block text-slate-400">bereits bestätigt</span>}
                                </>
                              )}
                              {i.action === 'insert' && <span className="text-blue-700">＋ neu: {i.category}</span>}
                              {i.uncertain && <span className="block text-amber-700">Monat geschätzt – bitte prüfen</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {missing.length > 0 && (
                    <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-amber-900 mb-2">Im Konto erwartet, aber nicht auf dem Kontoauszug gefunden ({missing.length})</p>
                      <ul className="text-xs text-amber-900 space-y-0.5">
                        {missing.map((m) => (
                          <li key={m.id}>
                            {formatDate(m.booking_date)} · {m.category} · {m.direction === 'in' ? '+' : '−'}{formatCurrency(m.amount, currency)}
                            <span className="text-amber-700"> ({m.status === 'confirmed' ? 'bestätigt' : 'Vorschlag'})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setOpen(false); reset() }} className="px-3 py-2 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50">Abbrechen</button>
                    <button
                      onClick={commit}
                      disabled={busy || selected.size === 0}
                      className="px-3 py-2 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {busy ? 'Übernehme…' : `${selected.size} Buchungen übernehmen`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

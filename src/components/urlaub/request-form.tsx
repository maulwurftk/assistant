'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ABSENCE_TYPE_LABELS, formatDays } from '@/lib/vacation'
import { formatMinutes } from '@/lib/payroll'

type PreviewDay = { date: string; eligible: boolean; holiday: string | null; planned: boolean }
type PreviewResponse = {
  days: PreviewDay[]
  suggested: string[]
  preview: {
    minutesPerDay: number
    basis: { method: string; refWorkdays: number }
    balanceBefore: number
  }
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
export const selectClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function VacationRequestForm({
  admin = false,
  assistants = [],
  onDone,
}: {
  admin?: boolean
  assistants?: { id: string; full_name: string }[]
  onDone?: () => void
}) {
  const [assistantChoice, setAssistantId] = useState('')
  const assistantId = assistantChoice || assistants[0]?.id || ''
  const [type, setType] = useState('vacation')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [note, setNote] = useState('')
  const [approve, setApprove] = useState(true)
  const [result, setResult] = useState<{ key: string; data: PreviewResponse } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const rangeValid = !!from && !!to && to >= from
  const isVacation = type === 'vacation'
  // Vorschau gilt nur für genau diese Kombination – sonst wird neu geladen
  const previewKey = isVacation && rangeValid && (!admin || assistantId) ? `${assistantId}|${from}|${to}` : null
  const preview = result && result.key === previewKey ? result.data : null
  const loading = !!previewKey && !preview

  useEffect(() => {
    if (!previewKey) return
    let cancelled = false
    fetch('/api/urlaub/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assistant_id: admin ? assistantId : undefined, date_from: from, date_to: to }),
    })
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Vorschau fehlgeschlagen')
        return d as PreviewResponse
      })
      .then((d) => {
        if (cancelled) return
        setResult({ key: previewKey, data: d })
        // Vorschlag: geplante Dienste; ohne Planung alle wählbaren Mo–Fr
        const initial = d.suggested.length
          ? d.suggested
          : d.days.filter((x) => x.eligible && new Date(x.date + 'T00:00:00Z').getUTCDay() !== 6).map((x) => x.date)
        setSelected(new Set(initial))
      })
      .catch((e) => !cancelled && toast.error(e.message))
    return () => { cancelled = true }
  }, [previewKey, admin, assistantId, from, to])

  const count = selected.size
  const restAfter = preview ? preview.preview.balanceBefore - count : null
  const mpd = preview?.preview.minutesPerDay ?? 0

  const typeOptions = useMemo(
    () => (admin ? ['vacation', 'sick', 'sick_child', 'special', 'unpaid'] : ['vacation', 'sick', 'sick_child']),
    [admin]
  )

  function toggle(date: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  async function submit() {
    if (!rangeValid) return toast.error('Bitte Zeitraum angeben')
    if (isVacation && count === 0) return toast.error('Bitte mindestens einen Urlaubstag auswählen')
    setSaving(true)
    const res = await fetch('/api/urlaub/absences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assistant_id: admin ? assistantId : undefined,
        type,
        date_from: from,
        date_to: to,
        workdays: isVacation ? Array.from(selected).sort() : [],
        note,
        approve: admin ? approve : undefined,
      }),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) return toast.error(d.error ?? 'Speichern fehlgeschlagen')
    toast.success(
      admin && approve
        ? `Eingetragen und genehmigt${d.freedSlots ? ` – ${d.freedSlots} Dienst(e) freigegeben` : ''}`
        : 'Antrag gestellt – der Arbeitgeber wird benachrichtigt'
    )
    setFrom(''); setTo(''); setNote(''); setResult(null); setSelected(new Set())
    onDone?.()
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {admin && (
          <div className="space-y-1.5">
            <Label>Assistentin</Label>
            <select className={selectClass} value={assistantId} onChange={(e) => setAssistantId(e.target.value)}>
              {assistants.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Art</Label>
          <select className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
            {typeOptions.map((t) => <option key={t} value={t}>{ABSENCE_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Von</Label>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (!to || to < e.target.value) setTo(e.target.value) }} />
        </div>
        <div className="space-y-1.5">
          <Label>Bis</Label>
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {isVacation && rangeValid && (
        <div className="rounded-lg border border-slate-200 p-3 space-y-3">
          <p className="text-sm text-slate-600">
            Welche Tage zählen als Urlaub? Ausgewählt sind die Tage, an denen du laut Dienstplan arbeiten würdest.
            Sonn- und Feiertage zählen nie.
          </p>
          {loading && <p className="text-sm text-slate-400">Berechne …</p>}
          {preview && (
            <div className="flex flex-wrap gap-1.5">
              {preview.days.map((d) => {
                const on = selected.has(d.date)
                const label = `${WEEKDAYS[new Date(d.date + 'T00:00:00Z').getUTCDay()]} ${d.date.slice(8, 10)}.${d.date.slice(5, 7)}.`
                return (
                  <button
                    key={d.date}
                    type="button"
                    disabled={!d.eligible}
                    onClick={() => toggle(d.date)}
                    title={d.holiday ?? (d.planned ? 'Dienst geplant' : undefined)}
                    className={
                      'rounded-md border px-2 py-1 text-xs transition-colors ' +
                      (!d.eligible
                        ? 'border-slate-100 text-slate-300 line-through cursor-not-allowed'
                        : on
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-slate-300 text-slate-600 hover:bg-slate-50')
                    }
                  >
                    {label}{d.planned ? ' •' : ''}
                  </button>
                )
              })}
            </div>
          )}
          {preview && (
            <div className="text-sm text-slate-700 space-y-0.5">
              <p><strong>{formatDays(count)}</strong> Urlaub · Resturlaub danach: <strong className={restAfter! < 0 ? 'text-rose-600' : ''}>{formatDays(Math.round(restAfter! * 100) / 100)}</strong></p>
              <p className="text-slate-500">
                Bezahlt je Urlaubstag: {mpd > 0 ? formatMinutes(mpd) : '–'}
                {preview.preview.basis.method === 'reference_13w' && ` (Ø der letzten 13 Wochen, ${preview.preview.basis.refWorkdays} Arbeitstage)`}
                {preview.preview.basis.method === 'fallback_terms' && ' (aus vereinbarter Arbeitszeit)'}
                {preview.preview.basis.method === 'none' && ' – noch keine Dienste als Berechnungsgrundlage'}
              </p>
              {restAfter! < 0 && <p className="text-rose-600">Achtung: mehr Tage als Resturlaub vorhanden.</p>}
            </div>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Notiz <span className="text-slate-400 font-normal">(optional)</span></Label>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </div>

      {admin && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} />
          Direkt genehmigen (Dienste im Zeitraum werden freigegeben)
        </label>
      )}

      <Button onClick={submit} disabled={saving || !rangeValid}>
        {saving ? 'Speichere …' : admin ? 'Eintragen' : isVacation ? 'Urlaub beantragen' : 'Melden'}
      </Button>
    </div>
  )
}

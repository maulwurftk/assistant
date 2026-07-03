'use client'

import { useEffect, useState } from 'react'
import { Trash2, Plus, CalendarOff, RefreshCw } from 'lucide-react'
import { PageHeader } from '@/components/page-header'

const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

type Entry = {
  id: string
  type: 'single' | 'recurring'
  date: string | null
  day_of_week: number | null
  all_day: boolean
  start_time: string | null
  end_time: string | null
  valid_from: string | null
  valid_until: string | null
  note: string | null
}

type Tab = 'single' | 'recurring'

export default function VerfuegbarkeitPage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('single')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Einmalig
  const [date, setDate] = useState('')
  const [allDay, setAllDay] = useState(true)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [note, setNote] = useState('')

  // Regelmäßig
  const [dayOfWeek, setDayOfWeek] = useState<number>(0)
  const [recurAllDay, setRecurAllDay] = useState(true)
  const [recurStart, setRecurStart] = useState('')
  const [recurEnd, setRecurEnd] = useState('')
  const [validFrom, setValidFrom] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [recurNote, setRecurNote] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/unavailability')
    const data = await res.json()
    setEntries(data ?? [])
    setLoading(false)
  }

  async function add() {
    setSaving(true)
    setError(null)
    const body = tab === 'single'
      ? { type: 'single', date, all_day: allDay, start_time: startTime, end_time: endTime, note }
      : { type: 'recurring', day_of_week: dayOfWeek, all_day: recurAllDay, start_time: recurStart, end_time: recurEnd, valid_from: validFrom, valid_until: validUntil, note: recurNote }

    const res = await fetch('/api/unavailability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Fehler')
    } else {
      // Reset form
      setDate(''); setStartTime(''); setEndTime(''); setNote(''); setAllDay(true)
      setRecurStart(''); setRecurEnd(''); setValidFrom(''); setValidUntil(''); setRecurNote(''); setRecurAllDay(true)
      await load()
    }
    setSaving(false)
  }

  async function remove(id: string) {
    await fetch(`/api/unavailability/${id}`, { method: 'DELETE' })
    setEntries((e) => e.filter((x) => x.id !== id))
  }

  function fmtTime(t: string | null) {
    return t ? t.slice(0, 5) : ''
  }

  function fmtDate(d: string) {
    const [y, m, day] = d.split('-')
    return `${day}.${m}.${y}`
  }

  const singles = entries.filter((e) => e.type === 'single')
  const recurrings = entries.filter((e) => e.type === 'recurring')

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <PageHeader
          icon={<CalendarOff className="h-5 w-5" />}
          title="Meine Sperrzeiten"
          subtitle="Tragen Sie ein, wann Sie nicht verfügbar sind — der Admin sieht das bei der Planung."
          tone="amber"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-6 w-fit">
        {(['single', 'recurring'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              tab === t ? 'bg-surface text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'single' ? <><CalendarOff className="h-3.5 w-3.5" /> Einmalig</> : <><RefreshCw className="h-3.5 w-3.5" /> Regelmäßig</>}
          </button>
        ))}
      </div>

      {/* Formular */}
      <div className="bg-surface border border-gray-200 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          {tab === 'single' ? 'Einmalige Sperrzeit hinzufügen' : 'Regelmäßige Sperrzeit hinzufügen'}
        </h2>

        {tab === 'single' ? (
          <div className="space-y-3">
            <div className="flex gap-3 flex-wrap">
              <div>
                <label htmlFor="unav-date" className="block text-xs font-medium text-gray-600 mb-1">Datum</label>
                <input id="unav-date" aria-label="Datum" type="date" value={date} onChange={(e) => setDate(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-gray-600 pb-2 cursor-pointer">
                  <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)}
                    className="rounded border-gray-300 text-emerald-600" />
                  Ganzer Tag
                </label>
              </div>
              {!allDay && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Von</label>
                    <input aria-label="Von (Uhrzeit)" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Bis</label>
                    <input aria-label="Bis (Uhrzeit)" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                </>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Bemerkung (optional)</label>
              <input aria-label="Bemerkung" type="text" value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="z.B. Urlaub, Arzttermin..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-3 flex-wrap">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Wochentag</label>
                <select aria-label="Wochentag" value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-gray-600 pb-2 cursor-pointer">
                  <input type="checkbox" checked={recurAllDay} onChange={(e) => setRecurAllDay(e.target.checked)}
                    className="rounded border-gray-300 text-emerald-600" />
                  Ganzer Tag
                </label>
              </div>
              {!recurAllDay && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Von</label>
                    <input aria-label="Von (Uhrzeit)" type="time" value={recurStart} onChange={(e) => setRecurStart(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Bis</label>
                    <input aria-label="Bis (Uhrzeit)" type="time" value={recurEnd} onChange={(e) => setRecurEnd(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-3 flex-wrap">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Gültig ab (optional)</label>
                <input aria-label="Gültig ab" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Gültig bis (optional)</label>
                <input aria-label="Gültig bis" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Bemerkung (optional)</label>
              <input aria-label="Bemerkung" type="text" value={recurNote} onChange={(e) => setRecurNote(e.target.value)}
                placeholder="z.B. Kurs, regelmäßiger Termin..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

        <button onClick={add} disabled={saving || (tab === 'single' && !date)}
          className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <Plus className="h-4 w-4" />
          {saving ? 'Speichern…' : 'Hinzufügen'}
        </button>
      </div>

      {/* Listen */}
      {loading ? (
        <p className="text-sm text-gray-400">Lädt…</p>
      ) : (
        <div className="space-y-6">
          {/* Einmalige */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
              Einmalige Sperrzeiten ({singles.length})
            </h2>
            {singles.length === 0 ? (
              <p className="text-sm text-gray-400 py-3">Keine eingetragen.</p>
            ) : (
              <div className="bg-surface border border-gray-200 rounded-xl divide-y divide-gray-100">
                {singles.map((e) => (
                  <div key={e.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {e.date ? fmtDate(e.date) : '–'}
                        {e.all_day
                          ? <span className="ml-2 text-xs text-gray-400">Ganzer Tag</span>
                          : <span className="ml-2 text-xs text-gray-500">{fmtTime(e.start_time)} – {fmtTime(e.end_time)} Uhr</span>
                        }
                      </p>
                      {e.note && <p className="text-xs text-gray-400 mt-0.5">{e.note}</p>}
                    </div>
                    <button onClick={() => remove(e.id)}
                      className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Regelmäßige */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
              Regelmäßige Sperrzeiten ({recurrings.length})
            </h2>
            {recurrings.length === 0 ? (
              <p className="text-sm text-gray-400 py-3">Keine eingetragen.</p>
            ) : (
              <div className="bg-surface border border-gray-200 rounded-xl divide-y divide-gray-100">
                {recurrings.map((e) => (
                  <div key={e.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Jeden {e.day_of_week !== null ? WEEKDAYS[e.day_of_week] : '–'}
                        {e.all_day
                          ? <span className="ml-2 text-xs text-gray-400">Ganzer Tag</span>
                          : <span className="ml-2 text-xs text-gray-500">{fmtTime(e.start_time)} – {fmtTime(e.end_time)} Uhr</span>
                        }
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {e.valid_from || e.valid_until
                          ? `${e.valid_from ? `ab ${fmtDate(e.valid_from)}` : ''} ${e.valid_until ? `bis ${fmtDate(e.valid_until)}` : ''}`.trim()
                          : 'Dauerhaft'
                        }
                        {e.note ? ` · ${e.note}` : ''}
                      </p>
                    </div>
                    <button onClick={() => remove(e.id)}
                      className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export type FilterAssistant = { id: string; name: string; active: boolean; count: number }

type Props = {
  basePath: string
  /** Gewählte Monate als "YYYY-MM", aufsteigend sortiert */
  selectedMonths: string[]
  assistants: FilterAssistant[]
  excluded: string[]
  includeEmpty: boolean
  sortBy: 'monat' | 'assistent'
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
const MAX_MONTHS = 24

const key = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`

/** Auswahl für den Sammeldruck: mehrere Monate (auch über Jahresgrenzen),
 * einzelne Assistenten an/aus, leere Berichte ein-/ausblenden, Sortierung. */
export default function BerichtAlleFilter({
  basePath, selectedMonths, assistants, excluded, includeEmpty, sortBy,
}: Props) {
  const router = useRouter()
  const [months, setMonths] = useState<Set<string>>(new Set(selectedMonths))
  const [viewYear, setViewYear] = useState(() => parseInt(selectedMonths[selectedMonths.length - 1].slice(0, 4), 10))
  const [off, setOff] = useState<Set<string>>(new Set(excluded))
  const [empty, setEmpty] = useState(includeEmpty)
  const [sort, setSort] = useState(sortBy)

  // Zähler beziehen sich auf die zuletzt angewendete Monatsauswahl
  const monthsDirty = [...months].sort().join(',') !== selectedMonths.join(',')

  function toggleMonth(k: string) {
    setMonths((prev) => {
      const next = new Set(prev)
      if (next.has(k)) {
        if (next.size > 1) next.delete(k) // mindestens ein Monat bleibt gewählt
      } else if (next.size < MAX_MONTHS) {
        next.add(k)
      }
      return next
    })
  }

  function selectYear() {
    setMonths(new Set(Array.from({ length: 12 }, (_, i) => key(viewYear, i + 1))))
  }

  function toggleAssistant(id: string) {
    setOff((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function apply() {
    const params = new URLSearchParams()
    params.set('m', [...months].sort().join(','))
    if (off.size > 0) params.set('x', [...off].join(','))
    if (empty) params.set('leer', '1')
    if (sort === 'assistent') params.set('sort', 'assistent')
    router.push(`${basePath}?${params.toString()}`)
  }

  const visibleAssistants = assistants.filter((a) => empty || a.count > 0 || monthsDirty)

  return (
    <div className="border border-slate-200 rounded-xl p-5 bg-surface space-y-5">
      {/* Monate */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Monate ({months.size} gewählt)
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setViewYear((y) => y - 1)}
              className="p-1 rounded hover:bg-slate-100 text-slate-600"
              aria-label="Vorheriges Jahr"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium text-slate-700 w-12 text-center">{viewYear}</span>
            <button
              type="button"
              onClick={() => setViewYear((y) => y + 1)}
              className="p-1 rounded hover:bg-slate-100 text-slate-600"
              aria-label="Nächstes Jahr"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={selectYear}
              className="ml-2 text-xs text-blue-600 hover:text-blue-700"
            >
              ganzes Jahr
            </button>
          </div>
        </div>
        <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
          {MONTHS_SHORT.map((label, i) => {
            const k = key(viewYear, i + 1)
            const on = months.has(k)
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleMonth(k)}
                className={`px-2 py-1.5 text-xs rounded-lg border transition-colors ${
                  on
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
        {months.size > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            {[...months].sort().map((k) => `${MONTHS_SHORT[parseInt(k.slice(5), 10) - 1]} ${k.slice(0, 4)}`).join(', ')}
          </p>
        )}
      </div>

      {/* Assistenten */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Assistenten</h2>
          <div className="flex gap-3 text-xs">
            <button type="button" onClick={() => setOff(new Set())} className="text-blue-600 hover:text-blue-700">
              alle
            </button>
            <button
              type="button"
              onClick={() => setOff(new Set(assistants.map((a) => a.id)))}
              className="text-blue-600 hover:text-blue-700"
            >
              keine
            </button>
          </div>
        </div>
        {monthsDirty && (
          <p className="text-xs text-amber-600 mb-2">
            Monatsauswahl geändert – Einsatzzahlen aktualisieren sich nach „Anwenden“.
          </p>
        )}
        {visibleAssistants.length === 0 ? (
          <p className="text-sm text-slate-400">Niemand hat im gewählten Zeitraum Einsätze.</p>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
            {visibleAssistants.map((a) => (
              <li key={a.id}>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer py-0.5">
                  <input
                    type="checkbox"
                    checked={!off.has(a.id)}
                    onChange={() => toggleAssistant(a.id)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span className={a.count === 0 && !monthsDirty ? 'text-slate-400' : ''}>{a.name}</span>
                  {!a.active && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                      inaktiv
                    </span>
                  )}
                  {!monthsDirty && (
                    <span className="ml-auto text-xs text-slate-400">
                      {a.count} {a.count === 1 ? 'Einsatz' : 'Einsätze'}
                    </span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Optionen */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-700">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={empty}
            onChange={(e) => setEmpty(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Leere Berichte mitdrucken
        </label>
        <label className="flex items-center gap-2">
          Sortierung
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as 'monat' | 'assistent')}
            className="border border-slate-300 rounded-lg px-2 py-1 text-sm bg-surface"
          >
            <option value="monat">nach Monat</option>
            <option value="assistent">nach Assistent</option>
          </select>
        </label>
        <button
          type="button"
          onClick={apply}
          className="ml-auto px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Anwenden
        </button>
      </div>
    </div>
  )
}

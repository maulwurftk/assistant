'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

function quarterRange(year: number, q: 1 | 2 | 3 | 4) {
  const startMonth = (q - 1) * 3 + 1
  const endMonth = startMonth + 2
  const from = `${year}-${startMonth.toString().padStart(2, '0')}-01`
  const lastDay = new Date(year, endMonth, 0).getDate()
  const to = `${year}-${endMonth.toString().padStart(2, '0')}-${lastDay}`
  return { from, to, label: `Q${q} ${year}` }
}

function halfYearRange(year: number, h: 1 | 2) {
  return h === 1
    ? { from: `${year}-01-01`, to: `${year}-06-30`, label: `H1 ${year}` }
    : { from: `${year}-07-01`, to: `${year}-12-31`, label: `H2 ${year}` }
}

function yearRange(year: number) {
  return { from: `${year}-01-01`, to: `${year}-12-31`, label: `${year}` }
}

export function PeriodPicker({
  currentFrom,
  currentTo,
}: {
  currentFrom: string
  currentTo: string
}) {
  const router = useRouter()
  const search = useSearchParams()
  const [from, setFrom] = useState(currentFrom)
  const [to, setTo] = useState(currentTo)

  const now = new Date()
  const year = now.getFullYear()
  const currentQuarter = (Math.floor(now.getMonth() / 3) + 1) as 1 | 2 | 3 | 4
  const lastQuarterDate = new Date(year, (currentQuarter - 1) * 3 - 1, 1)
  const lastQ = (Math.floor(lastQuarterDate.getMonth() / 3) + 1) as 1 | 2 | 3 | 4
  const lastQYear = lastQuarterDate.getFullYear()
  const currentHalf = (now.getMonth() < 6 ? 1 : 2) as 1 | 2

  function navigate(from: string, to: string) {
    const params = new URLSearchParams(search.toString())
    params.set('from', from)
    params.set('to', to)
    router.push(`/payroll/zeitraum?${params.toString()}`)
  }

  const presets: Array<{ label: string; range: { from: string; to: string } }> = [
    {
      label: `Aktuelles Q (Q${currentQuarter} ${year})`,
      range: quarterRange(year, currentQuarter),
    },
    {
      label: `Letztes Q (Q${lastQ} ${lastQYear})`,
      range: quarterRange(lastQYear, lastQ),
    },
    { label: `Q1 ${year}`, range: quarterRange(year, 1) },
    { label: `Q2 ${year}`, range: quarterRange(year, 2) },
    { label: `Q3 ${year}`, range: quarterRange(year, 3) },
    { label: `Q4 ${year}`, range: quarterRange(year, 4) },
    {
      label: `Akt. Halbjahr (H${currentHalf} ${year})`,
      range: halfYearRange(year, currentHalf),
    },
    { label: `H1 ${year} (Jan–Jun)`, range: halfYearRange(year, 1) },
    { label: `H2 ${year} (Jul–Dez)`, range: halfYearRange(year, 2) },
    { label: `H2 ${year - 1}`, range: halfYearRange(year - 1, 2) },
    { label: `Jahr ${year}`, range: yearRange(year) },
    { label: `Jahr ${year - 1}`, range: yearRange(year - 1) },
  ]

  const activePreset = presets.find(
    (p) => p.range.from === currentFrom && p.range.to === currentTo
  )

  return (
    <div className="bg-surface border border-slate-200 rounded-lg p-4 print:hidden">
      <div className="flex flex-wrap gap-2 mb-3">
        {presets.map((p) => {
          const active = activePreset?.label === p.label
          return (
            <button
              key={p.label}
              onClick={() => navigate(p.range.from, p.range.to)}
              className={
                active
                  ? 'px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 text-white'
                  : 'px-3 py-1.5 text-xs font-medium rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors'
              }
            >
              {p.label}
            </button>
          )
        })}
      </div>

      <div className="flex items-end gap-2 pt-3 border-t border-slate-100">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Von</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-2 py-1.5 border border-slate-300 rounded-md text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Bis</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-2 py-1.5 border border-slate-300 rounded-md text-sm"
          />
        </div>
        <button
          onClick={() => navigate(from, to)}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
        >
          Übernehmen
        </button>
        <button
          onClick={() => window.print()}
          className="ml-auto px-3 py-1.5 text-sm font-medium rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
        >
          🖨 Drucken
        </button>
      </div>
    </div>
  )
}

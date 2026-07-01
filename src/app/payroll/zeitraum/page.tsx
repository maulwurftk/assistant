import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  entryDurationMinutes,
  formatMinutes,
  calculatePay,
  calculateMinijob,
  formatCurrency,
  formatDate,
  grossFromBezirkRate,
} from '@/lib/payroll'
import { PeriodPicker } from './_components/PeriodPicker'
import { RuecklagenRechner } from './_components/RuecklagenRechner'

type Props = {
  searchParams: Promise<{ from?: string; to?: string }>
}

function defaultRange() {
  const now = new Date()
  const q = Math.floor(now.getMonth() / 3)
  const startMonth = q * 3
  const endMonth = startMonth + 2
  const year = now.getFullYear()
  const from = `${year}-${(startMonth + 1).toString().padStart(2, '0')}-01`
  const lastDay = new Date(year, endMonth + 1, 0).getDate()
  const to = `${year}-${(endMonth + 1).toString().padStart(2, '0')}-${lastDay}`
  return { from, to }
}

export default async function PayrollPeriodPage({ searchParams }: Props) {
  const params = await searchParams
  const def = defaultRange()
  const from = params.from || def.from
  const to = params.to || def.to

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    redirect('/payroll/zeitraum')
  }

  const supabase = await createClient()

  const [settingsRes, assistantsRes, slotsRes] = await Promise.all([
    supabase.from('payroll_settings').select('*').limit(1).single(),
    supabase
      .from('profiles')
      .select('id, full_name, email, rv_pflicht, kv_pflicht, iban')
      .eq('role', 'assistant')
      .eq('active', true)
      .order('full_name'),
    supabase
      .from('calendar_slots')
      .select('id, assigned_to, date, start_time, end_time')
      .eq('status', 'assigned')
      .gte('date', from)
      .lte('date', to),
  ])

  const settings = settingsRes.data as {
    hourly_rate: number
    currency: string
    minijob_mode?: boolean
    bezirk_mode?: boolean
    uv_rate?: number
    monthly_budget?: number
    employer_name?: string
    employer_address?: string
    employer_tax_number?: string
  } | null

  const assistants = (assistantsRes.data ?? []) as unknown as Array<{
    id: string
    full_name: string
    email: string
    rv_pflicht?: boolean
    kv_pflicht?: boolean
    iban?: string | null
  }>
  const slots = slotsRes.data ?? []

  const hourlyRate = settings?.hourly_rate ?? 0
  const currency = settings?.currency ?? 'EUR'
  const minijobMode = settings?.minijob_mode ?? false
  const bezirkMode = settings?.bezirk_mode ?? false
  const uvRate = settings?.uv_rate ?? 1.6
  const monthlyBudget = settings?.monthly_budget ?? 0

  const rows = assistants.map((a) => {
    const mySlots = slots.filter((s) => s.assigned_to === a.id)
    const totalMinutes = mySlots.reduce(
      (sum, s) => sum + entryDurationMinutes(s.start_time, s.end_time),
      0
    )
    const rvPflicht = a.rv_pflicht !== false
    const kvPflicht = a.kv_pflicht !== false
    const bruttoRate = bezirkMode
      ? grossFromBezirkRate(hourlyRate, uvRate, kvPflicht)
      : hourlyRate
    const brutto = calculatePay(totalMinutes, bruttoRate)
    const minijob =
      minijobMode && totalMinutes > 0
        ? calculateMinijob(brutto, rvPflicht, uvRate, kvPflicht)
        : null
    const netto = minijob ? minijob.netto : brutto
    const bezirkKosten = bezirkMode ? calculatePay(totalMinutes, hourlyRate) : null

    return {
      id: a.id,
      name: a.full_name,
      iban: a.iban ?? null,
      rvPflicht,
      kvPflicht,
      totalMinutes,
      slotCount: mySlots.length,
      brutto,
      netto,
      minijob,
      bezirkKosten,
    }
  })

  const activeRows = rows.filter((r) => r.totalMinutes > 0)

  const totals = activeRows.reduce(
    (acc, r) => {
      acc.minutes += r.totalMinutes
      acc.brutto += r.brutto
      acc.netto += r.netto
      acc.rvAN += r.minijob?.rvAN ?? 0
      acc.kvAG += r.minijob?.kvAGAmount ?? 0
      acc.rvAG += r.minijob?.rvAGAmount ?? 0
      acc.pauschsteuer += r.minijob?.pauschsteuerAmount ?? 0
      acc.u2 += r.minijob?.u2Amount ?? 0
      acc.insolvenz += r.minijob?.insolvenzgeldAmount ?? 0
      acc.uv += r.minijob?.uvAmount ?? 0
      acc.agAbgaben += r.minijob?.totalAGAbgaben ?? 0
      acc.gesamtkosten += r.minijob?.totalKosten ?? r.brutto
      acc.bezirkKosten += r.bezirkKosten ?? 0
      return acc
    },
    {
      minutes: 0,
      brutto: 0,
      netto: 0,
      rvAN: 0,
      kvAG: 0,
      rvAG: 0,
      pauschsteuer: 0,
      u2: 0,
      insolvenz: 0,
      uv: 0,
      agAbgaben: 0,
      gesamtkosten: 0,
      bezirkKosten: 0,
    }
  )

  const round2 = (n: number) => Math.round(n * 100) / 100

  return (
    <div>
      {/* Print-Stil: bricht beim Drucken sauber */}
      <style>{`
        @media print {
          @page { size: A4; margin: 1.5cm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="flex items-center justify-between mb-6 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Zeitraum-Auswertung</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Quartals- und Jahressummen für Minijobzentrale & Bezirk
          </p>
        </div>
      </div>

      <div className="mb-6">
        <PeriodPicker currentFrom={from} currentTo={to} />
      </div>

      {minijobMode && (
        <RuecklagenRechner
          currency={currency}
          monthlyBudget={monthlyBudget}
          agAbgabenPeriod={round2(totals.agAbgaben)}
        />
      )}

      {/* Berichts-Kopf (auch beim Drucken sichtbar) */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Lohn-Auswertung</h2>
            <p className="text-sm text-slate-600 mt-1">
              Zeitraum: <strong>{formatDate(from)} – {formatDate(to)}</strong>
            </p>
            {settings?.employer_name && (
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                {settings.employer_name}<br />
                {settings.employer_address}
                {settings.employer_tax_number && <><br />Steuernr.: {settings.employer_tax_number}</>}
              </p>
            )}
          </div>
          <div className="text-right text-xs text-slate-500">
            Erstellt am {formatDate(new Date().toISOString().slice(0, 10))}
          </div>
        </div>

        {/* Summen-Boxen */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          <div className="bg-slate-50 rounded-md p-3">
            <p className="text-xs text-slate-500">Arbeitsstunden</p>
            <p className="text-lg font-bold text-slate-900 mt-0.5">{formatMinutes(totals.minutes)}</p>
          </div>
          <div className="bg-blue-50 rounded-md p-3">
            <p className="text-xs text-blue-700">Bruttoentgelt</p>
            <p className="text-lg font-bold text-blue-900 mt-0.5">{formatCurrency(round2(totals.brutto), currency)}</p>
          </div>
          {minijobMode && (
            <div className="bg-amber-50 rounded-md p-3">
              <p className="text-xs text-amber-700">AG-Abgaben (Minijobzentrale)</p>
              <p className="text-lg font-bold text-amber-900 mt-0.5">{formatCurrency(round2(totals.agAbgaben), currency)}</p>
            </div>
          )}
          <div className="bg-emerald-50 rounded-md p-3">
            <p className="text-xs text-emerald-700">Gesamtkosten</p>
            <p className="text-lg font-bold text-emerald-900 mt-0.5">{formatCurrency(round2(totals.gesamtkosten), currency)}</p>
          </div>
        </div>
      </div>

      {/* Tabelle pro Assistentin */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">Assistentin</th>
              <th className="text-right px-3 py-2.5 font-medium">Stunden</th>
              <th className="text-right px-3 py-2.5 font-medium">Brutto</th>
              {minijobMode && <th className="text-right px-3 py-2.5 font-medium">RV-AN</th>}
              {minijobMode && <th className="text-right px-3 py-2.5 font-medium">Netto</th>}
              {minijobMode && <th className="text-right px-3 py-2.5 font-medium">AG-Abgaben</th>}
              <th className="text-right px-4 py-2.5 font-medium">Gesamt</th>
            </tr>
          </thead>
          <tbody>
            {activeRows.length === 0 && (
              <tr>
                <td colSpan={minijobMode ? 7 : 4} className="text-center text-slate-400 py-8">
                  Keine zugewiesenen Slots in diesem Zeitraum
                </td>
              </tr>
            )}
            {activeRows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-slate-900">{r.name}</div>
                  {r.iban && (
                    <div className="text-xs font-mono text-slate-400 mt-0.5">
                      {r.iban.replace(/(.{4})/g, '$1 ').trim()}
                    </div>
                  )}
                  <div className="text-xs text-slate-500 mt-0.5">
                    {!r.rvPflicht && <span className="mr-2">RV befreit</span>}
                    {!r.kvPflicht && <span>PKV</span>}
                  </div>
                </td>
                <td className="text-right px-3 py-2.5 tabular-nums">{formatMinutes(r.totalMinutes)}</td>
                <td className="text-right px-3 py-2.5 tabular-nums">{formatCurrency(r.brutto, currency)}</td>
                {minijobMode && (
                  <td className="text-right px-3 py-2.5 tabular-nums text-slate-500">
                    {r.minijob ? `−${formatCurrency(r.minijob.rvAN, currency)}` : '–'}
                  </td>
                )}
                {minijobMode && (
                  <td className="text-right px-3 py-2.5 tabular-nums font-medium text-emerald-700">
                    {r.minijob ? formatCurrency(r.minijob.netto, currency) : formatCurrency(r.brutto, currency)}
                  </td>
                )}
                {minijobMode && (
                  <td className="text-right px-3 py-2.5 tabular-nums text-amber-700">
                    {r.minijob ? formatCurrency(r.minijob.totalAGAbgaben, currency) : '–'}
                  </td>
                )}
                <td className="text-right px-4 py-2.5 tabular-nums font-bold">
                  {formatCurrency(r.minijob ? r.minijob.totalKosten : r.brutto, currency)}
                </td>
              </tr>
            ))}
          </tbody>
          {activeRows.length > 0 && (
            <tfoot className="bg-slate-50 font-bold">
              <tr>
                <td className="px-4 py-2.5">Summe</td>
                <td className="text-right px-3 py-2.5 tabular-nums">{formatMinutes(totals.minutes)}</td>
                <td className="text-right px-3 py-2.5 tabular-nums">{formatCurrency(round2(totals.brutto), currency)}</td>
                {minijobMode && <td className="text-right px-3 py-2.5 tabular-nums">−{formatCurrency(round2(totals.rvAN), currency)}</td>}
                {minijobMode && <td className="text-right px-3 py-2.5 tabular-nums text-emerald-700">{formatCurrency(round2(totals.netto), currency)}</td>}
                {minijobMode && <td className="text-right px-3 py-2.5 tabular-nums text-amber-700">{formatCurrency(round2(totals.agAbgaben), currency)}</td>}
                <td className="text-right px-4 py-2.5 tabular-nums">{formatCurrency(round2(totals.gesamtkosten), currency)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Minijobzentrale-Aufschlüsselung */}
      {minijobMode && activeRows.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 mb-6">
          <h3 className="font-bold text-slate-900 mb-1">Aufschlüsselung AG-Abgaben (Minijobzentrale)</h3>
          <p className="text-xs text-slate-500 mb-4">
            Diese Beträge zieht die Minijob-Zentrale ein. Rücklagen-Bedarf für den Bezirk.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded p-3">
              <p className="text-xs text-slate-500">KV-Pauschalbeitrag (13%)</p>
              <p className="font-bold text-slate-900">{formatCurrency(round2(totals.kvAG), currency)}</p>
            </div>
            <div className="bg-slate-50 rounded p-3">
              <p className="text-xs text-slate-500">RV-Pauschalbeitrag (15%)</p>
              <p className="font-bold text-slate-900">{formatCurrency(round2(totals.rvAG), currency)}</p>
            </div>
            <div className="bg-slate-50 rounded p-3">
              <p className="text-xs text-slate-500">Lohnsteuerpauschale (2%)</p>
              <p className="font-bold text-slate-900">{formatCurrency(round2(totals.pauschsteuer), currency)}</p>
            </div>
            <div className="bg-slate-50 rounded p-3">
              <p className="text-xs text-slate-500">Umlage 2 Mutterschaft (0,24%)</p>
              <p className="font-bold text-slate-900">{formatCurrency(round2(totals.u2), currency)}</p>
            </div>
            <div className="bg-slate-50 rounded p-3">
              <p className="text-xs text-slate-500">Insolvenzgeldumlage (0,06%)</p>
              <p className="font-bold text-slate-900">{formatCurrency(round2(totals.insolvenz), currency)}</p>
            </div>
            <div className="bg-slate-50 rounded p-3">
              <p className="text-xs text-slate-500">Unfallversicherung ({uvRate}%)</p>
              <p className="font-bold text-slate-900">{formatCurrency(round2(totals.uv), currency)}</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between">
            <span className="font-medium text-slate-700">Summe AG-Abgaben</span>
            <span className="text-lg font-bold text-amber-700">{formatCurrency(round2(totals.agAbgaben), currency)}</span>
          </div>
        </div>
      )}

      {/* Bezirk-Aufschlüsselung */}
      {bezirkMode && activeRows.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 mb-6">
          <h3 className="font-bold text-slate-900 mb-1">Bezirk-Abrechnung</h3>
          <p className="text-xs text-slate-500 mb-4">
            Bezirkssatz: {formatCurrency(hourlyRate, currency)}/h (inkl. AG-Kosten)
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded p-3">
              <p className="text-xs text-slate-500">Bezirkskosten (Stundensatz × h)</p>
              <p className="font-bold text-slate-900">{formatCurrency(round2(totals.bezirkKosten), currency)}</p>
            </div>
            {minijobMode && (
              <div className="bg-amber-50 rounded p-3">
                <p className="text-xs text-amber-700">Davon Rücklage Minijobzentrale</p>
                <p className="font-bold text-amber-900">{formatCurrency(round2(totals.agAbgaben), currency)}</p>
              </div>
            )}
            {minijobMode && (
              <div className="bg-emerald-50 rounded p-3">
                <p className="text-xs text-emerald-700">Auszahlung an Assistentinnen</p>
                <p className="font-bold text-emerald-900">{formatCurrency(round2(totals.netto), currency)}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Unterschriften */}
      <div className="hidden print:block mt-12 grid grid-cols-2 gap-12">
        <div>
          <div className="border-t border-slate-400 pt-1">
            <p className="text-xs text-slate-600">Datum, Unterschrift Arbeitgeber</p>
          </div>
        </div>
        <div>
          <div className="border-t border-slate-400 pt-1">
            <p className="text-xs text-slate-600">Datum, Unterschrift Bezirk</p>
          </div>
        </div>
      </div>
    </div>
  )
}

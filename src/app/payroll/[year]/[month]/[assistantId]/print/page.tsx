import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  entryDurationMinutes,
  formatMinutes,
  calculatePay,
  formatCurrency,
  formatDate,
  monthName,
} from '@/lib/payroll'
import PrintButton from './_components/PrintButton'

type Props = {
  params: Promise<{ year: string; month: string; assistantId: string }>
}

export default async function PrintPage({ params }: Props) {
  const { year: yearStr, month: monthStr, assistantId } = await params
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)

  const supabase = await createClient()

  const [assistantRes, settingsRes, entriesRes, activitiesRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', assistantId)
      .eq('role', 'assistant')
      .single(),
    supabase.from('payroll_settings').select('*').limit(1).single(),
    supabase
      .from('time_entries')
      .select('id, date, start_time, end_time, activity_id, description, month_status')
      .eq('assistant_id', assistantId)
      .gte('date', `${year}-${month.toString().padStart(2, '0')}-01`)
      .lt(
        'date',
        month === 12
          ? `${year + 1}-01-01`
          : `${year}-${(month + 1).toString().padStart(2, '0')}-01`
      )
      .order('date')
      .order('start_time'),
    supabase.from('activities').select('id, name'),
  ])

  if (!assistantRes.data) notFound()

  const assistant = assistantRes.data
  const settings = settingsRes.data
  const entries = entriesRes.data ?? []
  const activities = activitiesRes.data ?? []

  const activityMap = Object.fromEntries(activities.map((a) => [a.id, a.name]))

  const hourlyRate = settings?.hourly_rate ?? 0
  const currency = settings?.currency ?? 'EUR'
  const totalMinutes = entries.reduce(
    (sum, e) => sum + entryDurationMinutes(e.start_time, e.end_time),
    0
  )
  const totalPay = calculatePay(totalMinutes, hourlyRate)

  const today = new Date().toLocaleDateString('de-DE')

  return (
    <div className="min-h-screen bg-white">
      {/* Drucken-Button (wird beim Drucken ausgeblendet) */}
      <div className="no-print fixed top-4 right-4 flex gap-2">
        <PrintButton />
        <a
          href={`/payroll/${year}/${month}`}
          className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 bg-white"
        >
          Zurück
        </a>
      </div>

      <div className="max-w-3xl mx-auto p-12 print:p-8">
        {/* Kopfzeile */}
        <div className="flex justify-between items-start mb-10">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Lohnabrechnung</h1>
            <p className="text-lg text-slate-600 mt-1">
              {monthName(month)} {year}
            </p>
          </div>
          <div className="text-right text-sm text-slate-500">
            <p>Erstellt am {today}</p>
          </div>
        </div>

        {/* Arbeitnehmer-Info */}
        <div className="mb-8 p-5 bg-slate-50 rounded-xl print:bg-white print:border print:border-slate-200">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Arbeitnehmer
          </h2>
          <p className="text-lg font-semibold text-slate-900">{assistant.full_name}</p>
          <p className="text-sm text-slate-600">{assistant.email}</p>
        </div>

        {/* Stunden-Tabelle */}
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Arbeitsnachweise
          </h2>

          {entries.length === 0 ? (
            <p className="text-slate-400 text-sm py-4">
              Keine Zeiteinträge für diesen Monat.
            </p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="text-left py-2 pr-4 font-semibold text-slate-700">Datum</th>
                  <th className="text-left py-2 pr-4 font-semibold text-slate-700">Tätigkeit</th>
                  <th className="text-left py-2 pr-4 font-semibold text-slate-700">Von</th>
                  <th className="text-left py-2 pr-4 font-semibold text-slate-700">Bis</th>
                  <th className="text-right py-2 font-semibold text-slate-700">Dauer</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const minutes = entryDurationMinutes(e.start_time, e.end_time)
                  const activity = e.activity_id ? (activityMap[e.activity_id] ?? '–') : '–'
                  return (
                    <tr key={e.id} className="border-b border-slate-100">
                      <td className="py-2 pr-4 text-slate-800">{formatDate(e.date)}</td>
                      <td className="py-2 pr-4 text-slate-700">{activity}</td>
                      <td className="py-2 pr-4 text-slate-600 font-mono text-xs">
                        {e.start_time.slice(0, 5)}
                      </td>
                      <td className="py-2 pr-4 text-slate-600 font-mono text-xs">
                        {e.end_time.slice(0, 5)}
                      </td>
                      <td className="py-2 text-right text-slate-800">{formatMinutes(minutes)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300">
                  <td colSpan={4} className="py-3 font-semibold text-slate-800">
                    Gesamt
                  </td>
                  <td className="py-3 text-right font-bold text-slate-900">
                    {formatMinutes(totalMinutes)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Vergütung */}
        <div className="mb-10 border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-50 px-5 py-3 border-b border-slate-200">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Vergütung
            </h2>
          </div>
          <div className="px-5 py-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Gearbeitete Stunden</span>
              <span className="font-medium text-slate-800">{formatMinutes(totalMinutes)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Stundensatz</span>
              <span className="font-medium text-slate-800">
                {formatCurrency(hourlyRate, currency)}/h
              </span>
            </div>
            <div className="border-t border-slate-200 pt-2 mt-2 flex justify-between">
              <span className="font-semibold text-slate-900">Gesamtvergütung (brutto)</span>
              <span className="font-bold text-lg text-slate-900">
                {formatCurrency(totalPay, currency)}
              </span>
            </div>
          </div>
        </div>

        {/* Unterschriften */}
        <div className="grid grid-cols-2 gap-12 mt-16">
          <div>
            <div className="border-b border-slate-400 mb-2" style={{ height: '40px' }} />
            <p className="text-xs text-slate-500">Datum, Unterschrift Arbeitnehmer</p>
          </div>
          <div>
            <div className="border-b border-slate-400 mb-2" style={{ height: '40px' }} />
            <p className="text-xs text-slate-500">Datum, Unterschrift Arbeitgeber</p>
          </div>
        </div>
      </div>
    </div>
  )
}

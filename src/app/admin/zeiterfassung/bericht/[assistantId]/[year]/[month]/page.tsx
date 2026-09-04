import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { entryDurationMinutes, formatMinutes, formatDate, monthName } from '@/lib/payroll'
import PrintButton from './_components/PrintButton'

type Props = { params: Promise<{ assistantId: string; year: string; month: string }> }

export default async function BerichtPage({ params }: Props) {
  const { assistantId, year: yearStr, month: monthStr } = await params
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`
  const dateTo = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`

  const [assistantRes, slotsRes, activitiesRes, settingsRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email').eq('id', assistantId).single(),
    supabase
      .from('calendar_slots')
      .select('id, date, start_time, end_time, title, actual_start_time, actual_end_time, activity_id')
      .eq('assigned_to', assistantId)
      .eq('status', 'assigned')
      .eq('is_private', false)
      .not('confirmed_at', 'is', null)
      .gte('date', dateFrom).lt('date', dateTo)
      .order('date').order('start_time'),
    supabase.from('activities').select('id, name'),
    supabase.from('payroll_settings').select('employer_name, employer_address').limit(1).single(),
  ])

  if (!assistantRes.data) notFound()

  const assistant = assistantRes.data
  const slots = slotsRes.data ?? []
  const activityMap = Object.fromEntries((activitiesRes.data ?? []).map((a) => [a.id, a.name]))
  const settings = settingsRes.data

  // Nur bestätigte Slots (siehe Migration 0024_slot_confirmation.sql) – die
  // tatsächlich geleistete Zeit (Ist) hat Vorrang vor der geplanten Zeit, und
  // die bei der Bestätigung gewählte Tätigkeit hat Vorrang vor dem Slot-Titel.
  type WorkRow = { id: string; date: string; start_time: string; end_time: string; label: string }
  const allRows: WorkRow[] = slots
    .map((s) => ({
      id: `s-${s.id}`,
      date: s.date,
      start_time: s.actual_start_time || s.start_time,
      end_time: s.actual_end_time || s.end_time,
      label: s.activity_id ? (activityMap[s.activity_id] ?? s.title) : s.title,
    }))
    .sort((a, b) => {
      const d = a.date.localeCompare(b.date)
      return d !== 0 ? d : a.start_time.localeCompare(b.start_time)
    })

  const totalMinutes = allRows.reduce((sum, e) => sum + entryDurationMinutes(e.start_time, e.end_time), 0)
  const today = new Date().toLocaleDateString('de-DE')

  return (
    <div className="min-h-screen bg-surface">
      <div className="no-print fixed top-4 right-4 flex gap-2 z-10">
        <PrintButton />
        <a
          href="/admin/zeiterfassung"
          className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 bg-surface"
        >
          Zurück
        </a>
      </div>

      <div className="max-w-3xl mx-auto p-12 print:p-8">
        <div className="flex justify-between items-start mb-8 print:break-inside-avoid">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Tätigkeitsbericht</h1>
            <p className="text-xl text-slate-600 mt-1">{monthName(month)} {year}</p>
          </div>
          <div className="text-right text-sm text-slate-400">
            <p>Erstellt am {today}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8 print:break-inside-avoid">
          {settings?.employer_name && (
            <div className="p-4 border border-slate-200 rounded-xl">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Auftraggeber</h2>
              <p className="text-sm font-semibold text-slate-900">{settings.employer_name}</p>
              {settings.employer_address && (
                <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-line">{settings.employer_address}</p>
              )}
            </div>
          )}
          <div className={`p-4 border border-slate-200 rounded-xl ${!settings?.employer_name ? 'col-span-2' : ''}`}>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Assistenz</h2>
            <p className="text-sm font-semibold text-slate-900">{assistant.full_name}</p>
            <p className="text-xs text-slate-500">{assistant.email}</p>
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Bestätigte Einsätze</h2>
          {allRows.length === 0 ? (
            <p className="text-slate-400 text-sm py-6">Keine bestätigten Einsätze für diesen Monat.</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="text-left py-2 pr-4 font-semibold text-slate-600">Datum</th>
                  <th className="text-left py-2 pr-4 font-semibold text-slate-600">Tätigkeit</th>
                  <th className="text-left py-2 pr-3 font-semibold text-slate-600">Von</th>
                  <th className="text-left py-2 pr-3 font-semibold text-slate-600">Bis</th>
                  <th className="text-right py-2 font-semibold text-slate-600">Dauer</th>
                </tr>
              </thead>
              <tbody>
                {allRows.map((e) => {
                  const mins = entryDurationMinutes(e.start_time, e.end_time)
                  return (
                    <tr key={e.id} className="border-b border-slate-100 print:break-inside-avoid">
                      <td className="py-2 pr-4 text-slate-800">{formatDate(e.date)}</td>
                      <td className="py-2 pr-4 text-slate-700">{e.label}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-slate-600">{e.start_time.slice(0, 5)}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-slate-600">{e.end_time.slice(0, 5)}</td>
                      <td className="py-2 text-right text-slate-800">{formatMinutes(mins)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300">
                  <td colSpan={4} className="py-3 font-semibold text-slate-800">Gesamt</td>
                  <td className="py-3 text-right font-bold text-slate-900">{formatMinutes(totalMinutes)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="border border-slate-200 rounded-xl p-5 mb-10 bg-slate-50 print:bg-slate-50 print:border-slate-300 print:break-inside-avoid">
          <p className="text-sm text-slate-700 leading-relaxed">
            Hiermit bestätigen beide Parteien, dass die oben aufgeführten Tätigkeiten für{' '}
            <strong>{monthName(month)} {year}</strong> ordnungsgemäß und wie beschrieben durchgeführt wurden.
            Dieser Bericht dient ausschließlich dem Tätigkeitsnachweis und enthält keine Vergütungsangaben.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-16 mt-8 print:break-inside-avoid">
          <div>
            <div className="border-b-2 border-slate-300 mb-3" style={{ height: '48px' }} />
            <p className="text-xs text-slate-500">Datum, Unterschrift</p>
            <p className="text-sm font-medium text-slate-700 mt-0.5">{assistant.full_name}</p>
          </div>
          <div>
            <div className="border-b-2 border-slate-300 mb-3" style={{ height: '48px' }} />
            <p className="text-xs text-slate-500">Datum, Unterschrift</p>
            {settings?.employer_name && (
              <p className="text-sm font-medium text-slate-700 mt-0.5">{settings.employer_name}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

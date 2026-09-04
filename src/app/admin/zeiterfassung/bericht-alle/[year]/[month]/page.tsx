import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { monthName } from '@/lib/payroll'
import { ReportBlock, type ReportRow } from '@/app/admin/zeiterfassung/bericht/_components/ReportBlock'
import PrintButton from '@/app/admin/zeiterfassung/bericht/_components/PrintButton'

type Props = { params: Promise<{ year: string; month: string }> }

/** Sammel-Druckansicht: ein Tätigkeitsbericht pro aktivem Assistenten, jeweils
 * auf einer eigenen Seite – damit der Admin nicht jeden Bericht einzeln öffnen
 * und drucken muss. */
export default async function BerichtAllePage({ params }: Props) {
  const { year: yearStr, month: monthStr } = await params
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`
  const dateTo = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`

  const [assistantsRes, slotsRes, activitiesRes, settingsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'assistant')
      .eq('active', true)
      .order('full_name'),
    supabase
      .from('calendar_slots')
      .select('id, assigned_to, date, start_time, end_time, title, actual_start_time, actual_end_time, activity_id')
      .eq('status', 'assigned')
      .eq('is_private', false)
      .not('confirmed_at', 'is', null)
      .gte('date', dateFrom).lt('date', dateTo)
      .order('date').order('start_time'),
    supabase.from('activities').select('id, name'),
    supabase.from('payroll_settings').select('employer_name, employer_address').limit(1).single(),
  ])

  const assistants = assistantsRes.data ?? []
  const slots = slotsRes.data ?? []
  const activityMap = Object.fromEntries((activitiesRes.data ?? []).map((a) => [a.id, a.name]))
  const settings = settingsRes.data
  const employer = settings ? { name: settings.employer_name ?? null, address: settings.employer_address ?? null } : null
  const today = new Date().toLocaleDateString('de-DE')

  const reports = assistants.map((assistant) => {
    const rows: ReportRow[] = slots
      .filter((s) => s.assigned_to === assistant.id)
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
    return { assistant, rows }
  })

  return (
    <div className="min-h-screen bg-surface">
      <div className="no-print fixed top-4 right-4 flex gap-2 z-10">
        <PrintButton />
        <a
          href={`/payroll/${year}/${month}`}
          className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 bg-surface"
        >
          Zurück
        </a>
      </div>

      <p className="no-print max-w-3xl mx-auto pt-8 px-12 text-sm text-slate-500">
        Tätigkeitsberichte aller aktiven Assistenten für {monthName(month)} {year} ({assistants.length}) –
        jeder Bericht beginnt beim Drucken auf einer neuen Seite.
      </p>

      {assistants.length === 0 ? (
        <p className="max-w-3xl mx-auto p-12 text-slate-400">Keine aktiven Assistenten gefunden.</p>
      ) : (
        reports.map(({ assistant, rows }, i) => (
          <ReportBlock
            key={assistant.id}
            assistant={assistant}
            employer={employer}
            year={year}
            month={month}
            rows={rows}
            today={today}
            pageBreak={i < reports.length - 1}
          />
        ))
      )}
    </div>
  )
}

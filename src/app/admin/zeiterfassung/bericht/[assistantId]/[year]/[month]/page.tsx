import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ReportBlock, type ReportRow } from '@/app/admin/zeiterfassung/bericht/_components/ReportBlock'
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
  const rows: ReportRow[] = slots
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

      <ReportBlock
        assistant={assistant}
        employer={settings ? { name: settings.employer_name ?? null, address: settings.employer_address ?? null } : null}
        year={year}
        month={month}
        rows={rows}
        today={today}
      />
    </div>
  )
}

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { monthName } from '@/lib/payroll'
import { ReportBlock, type ReportRow } from '@/app/admin/zeiterfassung/bericht/_components/ReportBlock'
import PrintButton from '@/app/admin/zeiterfassung/bericht/_components/PrintButton'
import BerichtAlleFilter, { type FilterAssistant } from './_components/BerichtAlleFilter'

type Props = {
  params: Promise<{ year: string; month: string }>
  searchParams: Promise<{ m?: string; x?: string; leer?: string; sort?: string }>
}

type MonthKey = { year: number; month: number; key: string }

const MAX_MONTHS = 24
const PAGE_SIZE = 1000

function toKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

/** "2026-09,2026-10" → sortierte, deduplizierte Monatsliste (ungültige Einträge werden ignoriert). */
function parseMonths(raw: string | undefined, fallback: MonthKey): MonthKey[] {
  if (!raw) return [fallback]
  const seen = new Map<string, MonthKey>()
  for (const part of raw.split(',')) {
    const match = /^(\d{4})-(\d{1,2})$/.exec(part.trim())
    if (!match) continue
    const year = parseInt(match[1], 10)
    const month = parseInt(match[2], 10)
    if (month < 1 || month > 12) continue
    const key = toKey(year, month)
    seen.set(key, { year, month, key })
  }
  const list = [...seen.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-MAX_MONTHS)
  return list.length > 0 ? list : [fallback]
}

/** Sammel-Druckansicht: ein Tätigkeitsbericht pro Assistent und Monat, jeweils auf
 * einer eigenen Seite. Monate und Assistenten sind über die Filterleiste wählbar;
 * Berichte ohne bestätigte Einsätze werden standardmäßig ausgeblendet. */
export default async function BerichtAllePage({ params, searchParams }: Props) {
  const { year: yearStr, month: monthStr } = await params
  const sp = await searchParams
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) redirect('/payroll')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const months = parseMonths(sp.m, { year, month, key: toKey(year, month) })
  const monthKeys = new Set(months.map((m) => m.key))
  const excluded = new Set((sp.x ?? '').split(',').filter(Boolean))
  const includeEmpty = sp.leer === '1'
  const sortBy: 'monat' | 'assistent' = sp.sort === 'assistent' ? 'assistent' : 'monat'

  const first = months[0]
  const last = months[months.length - 1]
  const dateFrom = `${first.key}-01`
  const dateTo = last.month === 12 ? `${last.year + 1}-01-01` : `${toKey(last.year, last.month + 1)}-01`

  // Einsätze seitenweise laden – bei mehreren Monaten kann das Supabase-Limit (1000 Zeilen) greifen.
  async function loadSlots() {
    const all: {
      id: string; assigned_to: string | null; date: string; start_time: string; end_time: string
      title: string; description: string | null; actual_start_time: string | null; actual_end_time: string | null; activity_id: string | null
    }[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data } = await supabase
        .from('calendar_slots')
        .select('id, assigned_to, date, start_time, end_time, title, description, actual_start_time, actual_end_time, activity_id')
        .eq('status', 'assigned')
        .eq('is_private', false)
        .not('confirmed_at', 'is', null)
        .gte('date', dateFrom).lt('date', dateTo)
        .order('date').order('start_time').order('id')
        .range(from, from + PAGE_SIZE - 1)
      const page = data ?? []
      all.push(...page)
      if (page.length < PAGE_SIZE) break
    }
    // Nur die gewählten Monate (bei Lücken, z. B. Jan + März, liegt Februar im Datumsbereich).
    return all.filter((s) => monthKeys.has(s.date.slice(0, 7)))
  }

  const [assistantsRes, slots, activitiesRes, settingsRes] = await Promise.all([
    // Bewusst auch inaktive Assistenten laden: wer im gewählten Zeitraum gearbeitet hat und
    // inzwischen ausgeschieden ist, braucht trotzdem seinen Bericht.
    supabase
      .from('profiles')
      .select('id, full_name, email, active')
      .eq('role', 'assistant')
      .eq('exclude_from_payroll', false)
      .order('full_name'),
    loadSlots(),
    supabase.from('activities').select('id, name, report_label'),
    supabase.from('payroll_settings').select('employer_name, employer_address').limit(1).single(),
  ])

  const allAssistants = assistantsRes.data ?? []
  const activityMap = Object.fromEntries((activitiesRes.data ?? []).map((a) => [a.id, a.report_label || a.name]))
  const settings = settingsRes.data
  const employer = settings ? { name: settings.employer_name ?? null, address: settings.employer_address ?? null } : null
  const today = new Date().toLocaleDateString('de-DE')

  // Einsätze je Assistent und Monat gruppieren
  const rowsBy = new Map<string, ReportRow[]>() // `${assistantId}|${YYYY-MM}`
  for (const s of slots) {
    if (!s.assigned_to) continue
    const k = `${s.assigned_to}|${s.date.slice(0, 7)}`
    const list = rowsBy.get(k) ?? []
    list.push({
      id: `s-${s.id}`,
      date: s.date,
      start_time: s.actual_start_time || s.start_time,
      end_time: s.actual_end_time || s.end_time,
      label: s.activity_id ? (activityMap[s.activity_id] ?? s.title) : s.title,
      description: s.description,
    })
    rowsBy.set(k, list)
  }
  for (const list of rowsBy.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))
  }

  const slotCount = (assistantId: string) =>
    months.reduce((n, m) => n + (rowsBy.get(`${assistantId}|${m.key}`)?.length ?? 0), 0)

  // Auswahlliste: aktive Assistenten + inaktive, die im Zeitraum Einsätze haben
  const filterAssistants: FilterAssistant[] = allAssistants
    .map((a) => ({ id: a.id, name: a.full_name, active: a.active !== false, count: slotCount(a.id) }))
    .filter((a) => a.active || a.count > 0)

  const printable = allAssistants.filter((a) => {
    if (excluded.has(a.id)) return false
    const count = slotCount(a.id)
    if (count > 0) return true
    return includeEmpty && a.active !== false
  })

  const pairs = sortBy === 'monat'
    ? months.flatMap((m) => printable.map((a) => ({ m, a })))
    : printable.flatMap((a) => months.map((m) => ({ m, a })))

  const reports = pairs
    .map(({ m, a }) => ({ m, a, rows: rowsBy.get(`${a.id}|${m.key}`) ?? [] }))
    .filter((r) => includeEmpty || r.rows.length > 0)

  const periodLabel = months.length === 1
    ? `${monthName(months[0].month)} ${months[0].year}`
    : `${months.length} Monate (${monthName(first.month)} ${first.year} – ${monthName(last.month)} ${last.year})`

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

      <div className="no-print max-w-3xl mx-auto pt-16 px-12">
        <BerichtAlleFilter
          basePath={`/admin/zeiterfassung/bericht-alle/${year}/${month}`}
          selectedMonths={months.map((m) => m.key)}
          assistants={filterAssistants}
          excluded={[...excluded]}
          includeEmpty={includeEmpty}
          sortBy={sortBy}
        />
        <p className="mt-4 text-sm text-slate-500">
          {reports.length} {reports.length === 1 ? 'Bericht' : 'Berichte'} für {periodLabel} –
          jeder Bericht beginnt beim Drucken auf einer neuen Seite.
        </p>
      </div>

      {reports.length === 0 ? (
        <p className="max-w-3xl mx-auto p-12 text-slate-400">
          Keine Berichte für die aktuelle Auswahl.
        </p>
      ) : (
        reports.map(({ m, a, rows }, i) => (
          <ReportBlock
            key={`${a.id}-${m.key}`}
            assistant={{ full_name: a.full_name, email: a.email }}
            employer={employer}
            year={m.year}
            month={m.month}
            rows={rows}
            today={today}
            pageBreak={i < reports.length - 1}
          />
        ))
      )}
    </div>
  )
}

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  entryDurationMinutes,
  formatMinutes,
  calculatePay,
  calculateMinijob,
  formatCurrency,
  monthName,
  prevMonth,
  nextMonth,
} from '@/lib/payroll'
import PayrollActions from './_components/PayrollActions'
import RvPflichtToggle from './_components/RvPflichtToggle'

type Props = {
  params: Promise<{ year: string; month: string }>
}

export default async function MonthlyPayrollPage({ params }: Props) {
  const { year: yearStr, month: monthStr } = await params
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    redirect('/payroll')
  }

  const supabase = await createClient()

  const [settingsRes, assistantsRes, entriesRes, reportsRes, runsRes] = await Promise.all([
    supabase.from('payroll_settings').select('*').limit(1).single(),
    supabase
      .from('profiles')
      .select('id, full_name, email, rv_pflicht')
      .eq('role', 'assistant')
      .eq('active', true)
      .order('full_name'),
    supabase
      .from('time_entries')
      .select('id, assistant_id, date, start_time, end_time, activity_id, month_status')
      .gte('date', `${year}-${month.toString().padStart(2, '0')}-01`)
      .lt(
        'date',
        month === 12
          ? `${year + 1}-01-01`
          : `${year}-${(month + 1).toString().padStart(2, '0')}-01`
      ),
    supabase
      .from('monthly_reports')
      .select('assistant_id, status')
      .eq('year', year)
      .eq('month', month),
    supabase
      .from('payroll_runs')
      .select('assistant_id, email_sent_at, total_pay, total_minutes')
      .eq('year', year)
      .eq('month', month),
  ])

  const settings = settingsRes.data as {
    hourly_rate: number
    currency: string
    minijob_mode?: boolean
    uv_rate?: number
  } | null
  const assistants = (assistantsRes.data ?? []) as Array<{
    id: string
    full_name: string
    email: string
    rv_pflicht?: boolean
  }>
  const entries = entriesRes.data ?? []
  const reports = reportsRes.data ?? []
  const runs = runsRes.data ?? []

  const hourlyRate = settings?.hourly_rate ?? 0
  const currency = settings?.currency ?? 'EUR'
  const minijobMode = settings?.minijob_mode ?? false
  const uvRate = settings?.uv_rate ?? 1.6

  const assistantData = assistants.map((a) => {
    const myEntries = entries.filter((e) => e.assistant_id === a.id)
    const totalMinutes = myEntries.reduce(
      (sum, e) => sum + entryDurationMinutes(e.start_time, e.end_time),
      0
    )
    const brutto = calculatePay(totalMinutes, hourlyRate)
    const rvPflicht = a.rv_pflicht !== false
    const minijob = minijobMode && totalMinutes > 0 ? calculateMinijob(brutto, rvPflicht, uvRate) : null
    const netto = minijob ? minijob.netto : brutto
    const report = reports.find((r) => r.assistant_id === a.id)
    const run = runs.find((r) => r.assistant_id === a.id)

    return {
      ...a,
      rvPflicht,
      entryCount: myEntries.length,
      totalMinutes,
      brutto,
      netto,
      minijob,
      reportStatus: report?.status ?? null,
      emailSentAt: run?.email_sent_at ?? null,
    }
  })

  const totalAllMinutes = assistantData.reduce((s, a) => s + a.totalMinutes, 0)
  const totalAllBrutto = assistantData.reduce((s, a) => s + a.brutto, 0)
  const totalAllNetto = assistantData.reduce((s, a) => s + a.netto, 0)

  const prev = prevMonth(year, month)
  const next = nextMonth(year, month)
  const now = new Date()
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const isFutureMonth =
    year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {monthName(month)} {year}
          </h1>
          {settings ? (
            <p className="text-sm text-slate-500 mt-0.5">
              Stundensatz: {formatCurrency(hourlyRate, currency)}/h
              {minijobMode && (
                <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-medium">
                  Minijob-Modus
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm text-amber-600 mt-0.5">
              ⚠ Stundensatz noch nicht konfiguriert –{' '}
              <a href="/payroll/settings" className="underline">
                Einstellungen öffnen
              </a>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/payroll/${prev.year}/${prev.month}`}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors text-slate-700"
          >
            ← {monthName(prev.month)}
          </Link>
          {!isCurrentMonth && !isFutureMonth && (
            <Link
              href={`/payroll/${now.getFullYear()}/${now.getMonth() + 1}`}
              className="px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 transition-colors"
            >
              Heute
            </Link>
          )}
          <Link
            href={`/payroll/${next.year}/${next.month}`}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors text-slate-700"
          >
            {monthName(next.month)} →
          </Link>
        </div>
      </div>

      {/* Zusammenfassung */}
      <div className={`grid gap-4 mb-6 ${minijobMode ? 'grid-cols-4' : 'grid-cols-3'}`}>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Assistenten</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{assistants.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Gesamtstunden</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{formatMinutes(totalAllMinutes)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            {minijobMode ? 'Brutto gesamt' : 'Gesamtlohn'}
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {formatCurrency(totalAllBrutto, currency)}
          </p>
        </div>
        {minijobMode && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-xs font-medium text-green-600 uppercase tracking-wide">Netto gesamt</p>
            <p className="text-2xl font-bold text-green-700 mt-1">
              {formatCurrency(totalAllNetto, currency)}
            </p>
          </div>
        )}
      </div>

      {/* Assistenten-Tabelle */}
      {assistants.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <p className="text-slate-400">Keine aktiven Assistenten gefunden.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-5 py-3 font-medium text-slate-600">Assistent</th>
                <th className="text-right px-5 py-3 font-medium text-slate-600">Einträge</th>
                <th className="text-right px-5 py-3 font-medium text-slate-600">Stunden</th>
                <th className="text-right px-5 py-3 font-medium text-slate-600">
                  {minijobMode ? 'Brutto' : 'Lohn (brutto)'}
                </th>
                {minijobMode && (
                  <>
                    <th className="text-center px-3 py-3 font-medium text-slate-600 whitespace-nowrap">
                      RV-Pflicht
                    </th>
                    <th className="text-right px-5 py-3 font-medium text-slate-600">Netto</th>
                  </>
                )}
                <th className="text-center px-5 py-3 font-medium text-slate-600">Status</th>
                <th className="text-right px-5 py-3 font-medium text-slate-600">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {assistantData.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <p className="font-medium text-slate-900">{a.full_name}</p>
                    <p className="text-xs text-slate-400">{a.email}</p>
                  </td>
                  <td className="px-5 py-4 text-right text-slate-600">{a.entryCount}</td>
                  <td className="px-5 py-4 text-right font-medium text-slate-800">
                    {a.totalMinutes > 0 ? formatMinutes(a.totalMinutes) : '–'}
                  </td>
                  <td className="px-5 py-4 text-right font-semibold text-slate-900">
                    {a.totalMinutes > 0 ? formatCurrency(a.brutto, currency) : '–'}
                  </td>
                  {minijobMode && (
                    <>
                      <td className="px-3 py-4 text-center">
                        <RvPflichtToggle assistantId={a.id} rvPflicht={a.rvPflicht} />
                      </td>
                      <td className="px-5 py-4 text-right font-semibold text-green-700">
                        {a.totalMinutes > 0 ? formatCurrency(a.netto, currency) : '–'}
                      </td>
                    </>
                  )}
                  <td className="px-5 py-4 text-center">
                    <ReportBadge status={a.reportStatus} />
                  </td>
                  <td className="px-5 py-4">
                    <PayrollActions
                      assistantId={a.id}
                      assistantName={a.full_name}
                      assistantEmail={a.email}
                      year={year}
                      month={month}
                      totalMinutes={a.totalMinutes}
                      totalPay={a.brutto}
                      hourlyRate={hourlyRate}
                      currency={currency}
                      emailSentAt={a.emailSentAt}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ReportBadge({ status }: { status: string | null }) {
  if (!status) {
    return <span className="text-xs text-slate-400">Offen</span>
  }
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Ausstehend', cls: 'bg-slate-100 text-slate-600' },
    confirmed: { label: 'Bestätigt', cls: 'bg-green-100 text-green-700' },
    sent: { label: 'Gesendet', cls: 'bg-blue-100 text-blue-700' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600' }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  )
}

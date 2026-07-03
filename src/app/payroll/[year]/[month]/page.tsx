import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Banknote } from 'lucide-react'
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
  grossFromBezirkRate,
  ratesFromSettings,
  normalizeCountMode,
  countedMinutes,
} from '@/lib/payroll'
import PayrollActions from './_components/PayrollActions'
import RvPflichtToggle from './_components/RvPflichtToggle'
import KvPflichtToggle from './_components/KvPflichtToggle'

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

  const dateFrom = `${year}-${month.toString().padStart(2, '0')}-01`
  const dateTo = month === 12 ? `${year + 1}-01-01` : `${year}-${(month + 1).toString().padStart(2, '0')}-01`

  const [settingsRes, assistantsRes, entriesRes, reportsRes, runsRes, slotsRes] = await Promise.all([
    supabase.from('payroll_settings').select('*').limit(1).single(),
    supabase
      .from('profiles')
      .select('id, full_name, email, rv_pflicht, kv_pflicht')
      .eq('role', 'assistant')
      .eq('active', true)
      .order('full_name'),
    supabase
      .from('time_entries')
      .select('id, assistant_id, date, start_time, end_time, activity_id, month_status')
      .gte('date', dateFrom)
      .lt('date', dateTo),
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
    supabase
      .from('calendar_slots')
      .select('id, assigned_to, date, start_time, end_time, title')
      .eq('status', 'assigned')
      .gte('date', dateFrom)
      .lt('date', dateTo),
  ])

  const settings = settingsRes.data as {
    hourly_rate: number
    currency: string
    minijob_mode?: boolean
    bezirk_mode?: boolean
    payroll_count_mode?: string
    uv_rate?: number
    monthly_budget?: number
    account_fee?: number
    weekly_hours_target?: number
    mj_kv_ag?: number | null
    mj_rv_ag?: number | null
    mj_pauschsteuer?: number | null
    mj_u2?: number | null
    mj_insolvenzgeld?: number | null
    mj_rv_an?: number | null
  } | null
  const assistants = (assistantsRes.data ?? []) as Array<{
    id: string
    full_name: string
    email: string
    rv_pflicht?: boolean
    kv_pflicht?: boolean
  }>
  const entries = entriesRes.data ?? []
  const reports = reportsRes.data ?? []
  const runs = runsRes.data ?? []
  const slots = (slotsRes.data ?? []) as Array<{
    id: string
    assigned_to: string | null
    date: string
    start_time: string
    end_time: string
    title: string
  }>

  const hourlyRate = settings?.hourly_rate ?? 0
  const currency = settings?.currency ?? 'EUR'
  const minijobMode = settings?.minijob_mode ?? false
  const bezirkMode = settings?.bezirk_mode ?? false
  const uvRate = settings?.uv_rate ?? 1.6
  const monthlyBudget = settings?.monthly_budget ?? 0
  const accountFee = settings?.account_fee ?? 0
  const weeklyHoursTarget = settings?.weekly_hours_target ?? 15
  const countMode = normalizeCountMode(settings?.payroll_count_mode)
  const rates = ratesFromSettings(settings)

  // When bezirk_mode: hourly_rate is the Bezirk's flat rate (incl. AG costs).
  // Derive the actual employee brutto from it (GKV default, shown in header).
  const effectiveBruttoRate = bezirkMode ? grossFromBezirkRate(hourlyRate, uvRate, true, rates) : hourlyRate

  const assistantData = assistants.map((a) => {
    const myEntries = entries.filter((e) => e.assistant_id === a.id)
    const mySlots = slots.filter((s) => s.assigned_to === a.id)
    const entryMinutes = myEntries.reduce(
      (sum, e) => sum + entryDurationMinutes(e.start_time, e.end_time),
      0
    )
    const slotMinutes = mySlots.reduce(
      (sum, s) => sum + entryDurationMinutes(s.start_time, s.end_time),
      0
    )
    const totalMinutes = countedMinutes(countMode, entryMinutes, slotMinutes)
    const rvPflicht = a.rv_pflicht !== false
    const kvPflicht = a.kv_pflicht !== false
    const effectiveBruttoRateForAssistant = bezirkMode
      ? grossFromBezirkRate(hourlyRate, uvRate, kvPflicht, rates)
      : hourlyRate
    const brutto = calculatePay(totalMinutes, effectiveBruttoRateForAssistant)
    const minijob = minijobMode && totalMinutes > 0
      ? calculateMinijob(brutto, rvPflicht, uvRate, kvPflicht, rates)
      : null
    const netto = minijob ? minijob.netto : brutto
    const report = reports.find((r) => r.assistant_id === a.id)
    const run = runs.find((r) => r.assistant_id === a.id)

    return {
      ...a,
      rvPflicht,
      kvPflicht,
      slotCount: mySlots.length,
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
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg text-white shadow-sm bg-gradient-to-br from-emerald-500 to-emerald-600">
              <Banknote className="h-5 w-5" />
            </span>
            {monthName(month)} {year}
          </h1>
          {settings ? (
            <p className="text-sm text-slate-500 mt-0.5">
              {bezirkMode
                ? `Bezirkssatz: ${formatCurrency(hourlyRate, currency)}/h → Bruttolohn: ${formatCurrency(effectiveBruttoRate, currency)}/h`
                : `Stundensatz: ${formatCurrency(hourlyRate, currency)}/h`}
              {bezirkMode && (
                <span className="ml-2 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded font-medium">
                  Bezirk-Modus
                </span>
              )}
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
        <div className="bg-surface border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Assistenten</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{assistants.length}</p>
        </div>
        <div className="bg-surface border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Gesamtstunden</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{formatMinutes(totalAllMinutes)}</p>
        </div>
        <div className="bg-surface border border-slate-200 rounded-xl p-4">
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

      {/* Budget-Übersicht */}
      {monthlyBudget > 0 && (
        <BudgetCard
          monthlyBudget={monthlyBudget}
          accountFee={accountFee}
          weeklyHoursTarget={weeklyHoursTarget}
          totalAllMinutes={totalAllMinutes}
          totalAllBrutto={totalAllBrutto}
          currency={currency}
          year={year}
          month={month}
        />
      )}

      {/* Assistenten-Tabelle */}
      {assistants.length === 0 ? (
        <div className="bg-surface border border-slate-200 rounded-xl p-12 text-center">
          <p className="text-slate-400">Keine aktiven Assistenten gefunden.</p>
        </div>
      ) : (
        <div className="bg-surface border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-5 py-3 font-medium text-slate-600">Assistent</th>
                <th className="text-right px-5 py-3 font-medium text-slate-600">Einsätze</th>
                <th className="text-right px-5 py-3 font-medium text-slate-600">Stunden</th>
                <th className="text-right px-5 py-3 font-medium text-slate-600">
                  {minijobMode ? 'Brutto' : 'Lohn (brutto)'}
                </th>
                {minijobMode && (
                  <>
                    <th className="text-center px-3 py-3 font-medium text-slate-600 whitespace-nowrap">
                      RV-Pflicht
                    </th>
                    <th className="text-center px-3 py-3 font-medium text-slate-600 whitespace-nowrap">
                      KV-Status
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
                  <td className="px-5 py-4 text-right text-slate-500 text-xs leading-snug">
                    {a.slotCount > 0 && (
                      <span className="block text-blue-600 font-medium">{a.slotCount} Slot{a.slotCount !== 1 ? 's' : ''}</span>
                    )}
                    {a.entryCount > 0 && (
                      <span className="block">{a.entryCount} Eintr.</span>
                    )}
                    {a.slotCount === 0 && a.entryCount === 0 && '–'}
                  </td>
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
                      <td className="px-3 py-4 text-center">
                        <KvPflichtToggle assistantId={a.id} kvPflicht={a.kvPflicht} />
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

function BudgetCard({
  monthlyBudget,
  accountFee,
  weeklyHoursTarget,
  totalAllMinutes,
  totalAllBrutto,
  currency,
  year,
  month,
}: {
  monthlyBudget: number
  accountFee: number
  weeklyHoursTarget: number
  totalAllMinutes: number
  totalAllBrutto: number
  currency: string
  year: number
  month: number
}) {
  const totalSpent = totalAllBrutto + accountFee
  const remaining = monthlyBudget - totalSpent
  const usedPct = Math.min(100, Math.round((totalSpent / monthlyBudget) * 100))

  // Wochen im Monat (exakt: Tage / 7)
  const daysInMonth = new Date(year, month, 0).getDate()
  const weeksInMonth = daysInMonth / 7
  const monthlyHoursTarget = Math.round(weeklyHoursTarget * weeksInMonth * 10) / 10
  const actualHours = Math.round((totalAllMinutes / 60) * 10) / 10
  const hoursPct = monthlyHoursTarget > 0
    ? Math.min(100, Math.round((actualHours / monthlyHoursTarget) * 100))
    : 0

  const isOver = remaining < 0
  const isWarning = !isOver && usedPct >= 85

  function fmt(n: number) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n)
  }

  return (
    <div className={`mb-6 border rounded-xl overflow-hidden ${isOver ? 'border-red-300' : isWarning ? 'border-amber-300' : 'border-emerald-200'}`}>
      <div className={`px-5 py-3 flex items-center justify-between ${isOver ? 'bg-red-50' : isWarning ? 'bg-amber-50' : 'bg-emerald-50'}`}>
        <h2 className={`text-xs font-semibold uppercase tracking-wide ${isOver ? 'text-red-700' : isWarning ? 'text-amber-700' : 'text-emerald-700'}`}>
          Persönliches Budget
        </h2>
        <span className={`text-xs font-medium ${isOver ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-emerald-600'}`}>
          {isOver ? 'Budget überschritten' : `${usedPct} % verbraucht`}
        </span>
      </div>

      <div className="bg-surface px-5 py-4">
        <div className="grid grid-cols-2 gap-6">
          {/* Budget-Rechnung */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Bewilligtes Budget</span>
              <span className="font-medium text-slate-900">{fmt(monthlyBudget)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Lohnkosten</span>
              <span>−{fmt(totalAllBrutto)}</span>
            </div>
            {accountFee > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>Kontogebühren</span>
                <span>−{fmt(accountFee)}</span>
              </div>
            )}
            <div className={`border-t pt-2 flex justify-between font-semibold ${isOver ? 'text-red-600' : 'text-slate-900'}`}>
              <span>Verbleibendes Budget</span>
              <span>{fmt(remaining)}</span>
            </div>
          </div>

          {/* Stunden-Tracking */}
          <div className="space-y-3">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Stunden diesen Monat</span>
              <span className="font-medium text-slate-900">
                {actualHours.toLocaleString('de-DE')} / {monthlyHoursTarget.toLocaleString('de-DE')} h
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${hoursPct >= 100 ? 'bg-emerald-500' : 'bg-blue-400'}`}
                style={{ width: `${hoursPct}%` }}
              />
            </div>
            <p className="text-xs text-slate-400">
              Ziel: {weeklyHoursTarget} h/Woche (9h Elternass. + 6h Pers. Ass.)
            </p>
          </div>
        </div>

        {/* Fortschrittsbalken Budget */}
        <div className="mt-4">
          <div className="w-full bg-slate-100 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all ${isOver ? 'bg-red-500' : isWarning ? 'bg-amber-400' : 'bg-emerald-500'}`}
              style={{ width: `${usedPct}%` }}
            />
          </div>
        </div>
      </div>
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

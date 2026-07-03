import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, CheckCircle, AlertCircle, Users, CalendarOff, Wallet, ArrowRight } from 'lucide-react'
import { OpenSlotsCard } from '@/components/open-slots-card'
import { StatCard } from '@/components/stat-card'
import { KpiTile } from '@/components/kpi-tile'
import { CalendarSubscribeCard } from '@/components/calendar-subscribe-card'
import { entryDurationMinutes, calculatePay, formatCurrency } from '@/lib/payroll'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { de } from 'date-fns/locale'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const now = new Date()
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd')

  if (profile.role === 'assistant') {
    const { data: entries } = await supabase
      .from('time_entries')
      .select('*, activity:activities(name)')
      .eq('assistant_id', user.id)
      .gte('date', monthStart)
      .lte('date', monthEnd)
      .order('date', { ascending: false })

    const { data: openSlots } = await supabase
      .from('calendar_slots')
      .select('*')
      .eq('status', 'open')
      .gte('date', format(now, 'yyyy-MM-dd'))
      .order('date')

    const { data: report } = await supabase
      .from('monthly_reports')
      .select('*')
      .eq('assistant_id', user.id)
      .eq('year', now.getFullYear())
      .eq('month', now.getMonth() + 1)
      .single()

    const totalHours = (entries ?? []).reduce((acc, e) => {
      const [sh, sm] = e.start_time.split(':').map(Number)
      const [eh, em] = e.end_time.split(':').map(Number)
      return acc + (eh * 60 + em - sh * 60 - sm) / 60
    }, 0)

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Begrüßungs-Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-6 text-white shadow-sm">
          <div className="relative flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-lg font-bold backdrop-blur">
              {initials(profile.full_name)}
            </div>
            <div>
              <h1 className="text-2xl font-bold">Hallo, {profile.full_name.split(' ')[0]}!</h1>
              <p className="text-emerald-50/90 mt-0.5 text-sm capitalize">
                {format(now, 'EEEE, dd. MMMM yyyy', { locale: de })}
              </p>
            </div>
          </div>
          <div className="pointer-events-none absolute -right-6 -top-8 h-32 w-32 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute right-10 -bottom-12 h-28 w-28 rounded-full bg-white/5" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <StatCard
            icon={<Clock className="h-5 w-5" />}
            label="Stunden diesen Monat"
            value={totalHours.toFixed(1)}
            hint={`${(entries ?? []).length} Einträge`}
            tone="emerald"
          />
          <StatCard
            icon={<CheckCircle className="h-5 w-5" />}
            label="Monatsabschluss"
            tone={report?.status === 'sent' || report?.status === 'confirmed' ? 'emerald' : 'amber'}
            value={
              report?.status === 'sent' ? (
                <Badge className="bg-green-100 text-green-700 border-green-200">Gesendet</Badge>
              ) : report?.status === 'confirmed' ? (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Bestätigt</Badge>
              ) : (
                <Badge variant="secondary">Offen</Badge>
              )
            }
            hint={format(now, 'MMMM yyyy', { locale: de })}
          />
        </div>

        {report?.status !== 'sent' && (entries ?? []).length > 0 && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">Monatsabschluss ausstehend</p>
                <p className="text-sm text-amber-700 mt-0.5">
                  Bitte überprüfen und bestätigen Sie Ihre Einträge für {format(now, 'MMMM yyyy', { locale: de })}.
                </p>
                <Link href="/zeiterfassung">
                  <Button size="sm" className="mt-2 bg-amber-600 hover:bg-amber-700">
                    Zur Zeiterfassung
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        <OpenSlotsCard slots={openSlots ?? []} />

        <CalendarSubscribeCard />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Letzte Einträge</CardTitle>
          </CardHeader>
          <CardContent>
            {(entries ?? []).length === 0 ? (
              <div className="flex flex-col items-center text-center py-8 text-gray-500">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500 mb-3">
                  <Clock className="h-7 w-7" />
                </div>
                <p className="font-medium text-gray-700">Noch keine Einträge diesen Monat</p>
                <p className="text-sm text-gray-400 mt-0.5">Erfasse deine erste Arbeitszeit.</p>
                <Link href="/zeiterfassung">
                  <Button size="sm" className="mt-4">Eintrag hinzufügen</Button>
                </Link>
              </div>
            ) : (
              <ul className="space-y-3">
                {(entries ?? []).slice(0, 5).map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="font-medium text-sm">
                        {format(new Date(entry.date), 'dd.MM.yyyy')} · {entry.start_time.slice(0, 5)}–{entry.end_time.slice(0, 5)} Uhr
                      </p>
                      <p className="text-xs text-gray-500">{(entry.activity as any)?.name ?? 'Keine Tätigkeit'}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {(() => {
                        const [sh, sm] = entry.start_time.split(':').map(Number)
                        const [eh, em] = entry.end_time.split(':').map(Number)
                        const h = (eh * 60 + em - sh * 60 - sm) / 60
                        return `${h.toFixed(1)} h`
                      })()}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // Admin Dashboard
  const { data: assistants } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'assistant')
    .eq('active', true)

  const { data: pendingReports } = await supabase
    .from('monthly_reports')
    .select('*, assistant:profiles(full_name)')
    .eq('status', 'sent')
    .is('admin_viewed_at', null)

  const { data: openSlots } = await supabase
    .from('calendar_slots')
    .select('*')
    .eq('status', 'open')
    .gte('date', format(now, 'yyyy-MM-dd'))

  // Zugewiesene Slots diesen Monat → Stunden je Assistentin + Budget-Nutzung
  const { data: monthSlots } = await supabase
    .from('calendar_slots')
    .select('assigned_to, start_time, end_time')
    .eq('status', 'assigned')
    .gte('date', monthStart)
    .lte('date', monthEnd)

  const { data: settingsRow } = await supabase
    .from('payroll_settings')
    .select('hourly_rate, monthly_budget, currency')
    .limit(1)
    .single()

  const hourlyRate = (settingsRow as any)?.hourly_rate ?? 0
  const monthlyBudget = (settingsRow as any)?.monthly_budget ?? 0
  const currency = (settingsRow as any)?.currency ?? 'EUR'

  const minutesByAssistant = new Map<string, number>()
  for (const s of (monthSlots ?? []) as Array<{ assigned_to: string | null; start_time: string; end_time: string }>) {
    if (!s.assigned_to) continue
    minutesByAssistant.set(
      s.assigned_to,
      (minutesByAssistant.get(s.assigned_to) ?? 0) + entryDurationMinutes(s.start_time, s.end_time)
    )
  }
  const totalMinutes = [...minutesByAssistant.values()].reduce((a, b) => a + b, 0)
  const totalHours = totalMinutes / 60
  const monthCost = calculatePay(totalMinutes, hourlyRate)
  const budgetPct = monthlyBudget > 0 ? Math.round((monthCost / monthlyBudget) * 100) : 0

  const hoursRows = (assistants ?? [])
    .map((a) => ({ name: a.full_name as string, minutes: minutesByAssistant.get(a.id) ?? 0 }))
    .sort((x, y) => y.minutes - x.minutes)
  const maxMinutes = Math.max(60, ...hoursRows.map((r) => r.minutes))
  const monthLabel = format(now, 'MMMM', { locale: de })

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Begrüßungs-Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-6 text-white shadow-sm">
        <div className="relative flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <Users className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Admin-Übersicht</h1>
            <p className="text-emerald-50/90 mt-0.5 text-sm capitalize">
              {format(now, 'EEEE, dd. MMMM yyyy', { locale: de })}
            </p>
          </div>
        </div>
        <div className="pointer-events-none absolute -right-6 -top-8 h-32 w-32 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute right-10 -bottom-12 h-28 w-28 rounded-full bg-white/5" />
      </div>

      {/* KPI-Kacheln – klickbar, springen direkt zum Ort */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile
          href="/admin/benutzer"
          tone="emerald"
          icon={<Users className="h-4 w-4" />}
          label="Assistenten"
          value={(assistants ?? []).length}
          sub="alle aktiv"
          subTone="up"
        />
        <KpiTile
          href="/payroll"
          tone="sky"
          icon={<Clock className="h-4 w-4" />}
          label={`Stunden ${monthLabel}`}
          value={totalHours.toFixed(1)}
          sub={`${formatCurrency(monthCost, currency)} Kosten`}
        />
        <KpiTile
          href="/payroll/konto"
          tone={budgetPct > 100 ? 'rose' : 'violet'}
          icon={<Wallet className="h-4 w-4" />}
          label="Budget genutzt"
          value={`${budgetPct}%`}
          sub={`${formatCurrency(monthCost, currency)} / ${formatCurrency(monthlyBudget, currency)}`}
          subTone={budgetPct > 100 ? 'down' : 'muted'}
        />
        <KpiTile
          href="/kalender"
          tone="amber"
          icon={<CalendarOff className="h-4 w-4" />}
          label="Offene Slots"
          value={(openSlots ?? []).length}
          sub={(openSlots ?? []).length > 0 ? 'zu besetzen' : 'alle besetzt'}
          subTone={(openSlots ?? []).length > 0 ? 'warn' : 'up'}
        />
      </div>

      {/* Stunden-Balken + Zu erledigen */}
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stunden pro Assistentin · {monthLabel}</CardTitle>
          </CardHeader>
          <CardContent>
            {hoursRows.every((r) => r.minutes === 0) ? (
              <p className="text-sm text-slate-400 py-6 text-center">
                Noch keine zugewiesenen Slots diesen Monat.
              </p>
            ) : (
              <div className="space-y-3">
                {hoursRows.map((r) => (
                  <div key={r.name} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3 text-sm">
                    <span className="truncate text-slate-700">{r.name}</span>
                    <span className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <span
                        className="block h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600"
                        style={{ width: `${Math.round((r.minutes / maxMinutes) * 100)}%` }}
                      />
                    </span>
                    <span className="text-right tabular-nums text-slate-600">{(r.minutes / 60).toFixed(1)}</span>
                  </div>
                ))}
                <div className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3 text-xs pt-2 border-t border-slate-100 text-slate-400">
                  <span>Gesamt</span>
                  <span />
                  <span className="text-right tabular-nums font-semibold text-slate-600">{totalHours.toFixed(1)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Zu erledigen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <Link
              href="/admin/berichte"
              className="flex items-center justify-between py-2.5 border-b border-slate-100 hover:text-emerald-700 transition-colors"
            >
              <span className="text-sm">Berichte prüfen</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-violet-100 text-violet-700">
                {(pendingReports ?? []).length} neu
              </span>
            </Link>
            <Link
              href="/kalender"
              className="flex items-center justify-between py-2.5 border-b border-slate-100 hover:text-emerald-700 transition-colors"
            >
              <span className="text-sm">Slots besetzen</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-700">
                {(openSlots ?? []).length} offen
              </span>
            </Link>
            <Link
              href="/payroll/zeitraum"
              className="flex items-center justify-between py-2.5 hover:text-emerald-700 transition-colors"
            >
              <span className="text-sm">Rücklage prüfen</span>
              <ArrowRight className="h-4 w-4 text-slate-300" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Schnellzugriff */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schnellzugriff</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link href="/admin/benutzer"><Button variant="outline" className="w-full">Benutzer</Button></Link>
          <Link href="/admin/berichte"><Button variant="outline" className="w-full">Berichte</Button></Link>
          <Link href="/payroll"><Button variant="outline" className="w-full">Abrechnung</Button></Link>
          <Link href="/admin/taetigkeiten"><Button variant="outline" className="w-full">Tätigkeiten</Button></Link>
        </CardContent>
      </Card>

      <CalendarSubscribeCard />
    </div>
  )
}

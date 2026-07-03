import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, CheckCircle, AlertCircle, Users, FileText, CalendarOff } from 'lucide-react'
import { OpenSlotsCard } from '@/components/open-slots-card'
import { StatCard } from '@/components/stat-card'
import { CalendarSubscribeCard } from '@/components/calendar-subscribe-card'
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

      <div className="grid grid-cols-3 gap-4">
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="Aktive Assistenten"
          value={(assistants ?? []).length}
          tone="emerald"
        />
        <StatCard
          icon={<FileText className="h-5 w-5" />}
          label="Neue Berichte"
          value={(pendingReports ?? []).length}
          tone={(pendingReports ?? []).length > 0 ? 'emerald' : 'slate'}
        />
        <StatCard
          icon={<CalendarOff className="h-5 w-5" />}
          label="Offene Slots"
          value={(openSlots ?? []).length}
          tone={(openSlots ?? []).length > 0 ? 'amber' : 'slate'}
        />
      </div>

      {(pendingReports ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-emerald-600" />
              Neue Monatsberichte
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(pendingReports ?? []).map((r) => (
                <li key={r.id} className="flex items-center justify-between">
                  <span className="text-sm">{(r.assistant as any)?.full_name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">
                      {format(new Date(r.sent_at!), 'dd.MM.yyyy HH:mm')}
                    </span>
                    <Link href="/admin/berichte">
                      <Button size="sm" variant="outline">Ansehen</Button>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schnellzugriff</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <Link href="/admin/benutzer"><Button variant="outline" className="w-full">Benutzerverwaltung</Button></Link>
          <Link href="/admin/berichte"><Button variant="outline" className="w-full">Berichte & Export</Button></Link>
          <Link href="/kalender"><Button variant="outline" className="w-full">Kalender</Button></Link>
          <Link href="/admin/taetigkeiten"><Button variant="outline" className="w-full">Tätigkeiten</Button></Link>
        </CardContent>
      </Card>

      <CalendarSubscribeCard />
    </div>
  )
}

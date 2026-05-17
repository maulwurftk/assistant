import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, CalendarDays, CheckCircle, AlertCircle } from 'lucide-react'
import { OpenSlotsCard } from '@/components/open-slots-card'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { de } from 'date-fns/locale'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Hallo, {profile.full_name.split(' ')[0]}!
          </h1>
          <p className="text-gray-500 mt-1">
            {format(now, 'EEEE, dd. MMMM yyyy', { locale: de })}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500 font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" /> Stunden diesen Monat
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-gray-900">{totalHours.toFixed(1)}</p>
              <p className="text-xs text-gray-500 mt-1">{(entries ?? []).length} Einträge</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500 font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4" /> Monatsabschluss
              </CardTitle>
            </CardHeader>
            <CardContent>
              {report?.status === 'sent' ? (
                <Badge className="bg-green-100 text-green-700 border-green-200">Gesendet</Badge>
              ) : report?.status === 'confirmed' ? (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Bestätigt</Badge>
              ) : (
                <Badge variant="secondary">Offen</Badge>
              )}
              <p className="text-xs text-gray-500 mt-2">
                {format(now, 'MMMM yyyy', { locale: de })}
              </p>
            </CardContent>
          </Card>
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Letzte Einträge</CardTitle>
          </CardHeader>
          <CardContent>
            {(entries ?? []).length === 0 ? (
              <div className="text-center py-6 text-gray-500">
                <p>Noch keine Einträge diesen Monat.</p>
                <Link href="/zeiterfassung">
                  <Button size="sm" className="mt-3">Eintrag hinzufügen</Button>
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin-Übersicht</h1>
        <p className="text-gray-500 mt-1">{format(now, 'EEEE, dd. MMMM yyyy', { locale: de })}</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500 font-medium">Aktive Assistenten</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{(assistants ?? []).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500 font-medium">Neue Berichte</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-600">{(pendingReports ?? []).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500 font-medium">Offene Slots</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-600">{(openSlots ?? []).length}</p>
          </CardContent>
        </Card>
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
    </div>
  )
}

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const WEEKDAYS_FULL = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}.${m}.${y}`
}

function fmtTime(t: string | null) {
  return t ? t.slice(0, 5) : ''
}

type Entry = {
  id: string
  assistant_id: string
  type: 'single' | 'recurring'
  date: string | null
  day_of_week: number | null
  all_day: boolean
  start_time: string | null
  end_time: string | null
  valid_from: string | null
  valid_until: string | null
  note: string | null
  profiles: { full_name: string } | null
}

export default async function AdminVerfuegbarkeitPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: entries } = await supabase
    .from('assistant_unavailability')
    .select('*, profiles(full_name)')
    .order('type')
    .order('date', { ascending: true, nullsFirst: false })
    .order('day_of_week', { ascending: true, nullsFirst: false })

  const all = (entries ?? []) as Entry[]
  const singles = all.filter((e) => e.type === 'single')
  const recurrings = all.filter((e) => e.type === 'recurring')

  // Regelmäßige nach Wochentag gruppieren
  const byDay: Record<number, Entry[]> = {}
  for (const e of recurrings) {
    if (e.day_of_week !== null) {
      if (!byDay[e.day_of_week]) byDay[e.day_of_week] = []
      byDay[e.day_of_week].push(e)
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Sperrzeiten der Assistenten</h1>
      <p className="text-sm text-gray-500 mb-8">Übersicht aller eingetragenen Nicht-Verfügbarkeiten</p>

      {all.length === 0 ? (
        <div className="bg-surface border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-sm">Noch keine Sperrzeiten eingetragen.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Wochenübersicht regelmäßig */}
          {recurrings.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
                Regelmäßige Sperrzeiten
              </h2>
              <div className="bg-surface border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Wochentag</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Assistent</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Zeit</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Gültig</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Bemerkung</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[0,1,2,3,4,5,6].flatMap((day) =>
                      (byDay[day] ?? []).map((e, i) => (
                        <tr key={e.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {i === 0 ? WEEKDAYS_FULL[day] : ''}
                          </td>
                          <td className="px-4 py-3 text-gray-700">{e.profiles?.full_name ?? '–'}</td>
                          <td className="px-4 py-3 text-gray-600">
                            {e.all_day ? 'Ganzer Tag' : `${fmtTime(e.start_time)} – ${fmtTime(e.end_time)}`}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {e.valid_from || e.valid_until
                              ? `${e.valid_from ? fmtDate(e.valid_from) : '…'} – ${e.valid_until ? fmtDate(e.valid_until) : '∞'}`
                              : 'Dauerhaft'}
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs">{e.note ?? ''}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Einmalige */}
          {singles.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
                Einmalige Sperrzeiten ({singles.length})
              </h2>
              <div className="bg-surface border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Datum</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Assistent</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Zeit</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Bemerkung</th>
                    </tr>
                  </thead>
                  <tbody>
                    {singles.map((e) => (
                      <tr key={e.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {e.date ? fmtDate(e.date) : '–'}
                          {e.date && <span className="ml-1.5 text-xs text-gray-400">{WEEKDAYS[new Date(e.date).getDay() === 0 ? 6 : new Date(e.date).getDay() - 1]}</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{e.profiles?.full_name ?? '–'}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {e.all_day ? 'Ganzer Tag' : `${fmtTime(e.start_time)} – ${fmtTime(e.end_time)}`}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{e.note ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

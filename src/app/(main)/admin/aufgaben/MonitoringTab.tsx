'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { CheckCheck, CheckCircle2 } from 'lucide-react'
import { format, subDays } from 'date-fns'
import { de } from 'date-fns/locale'

interface CheckRow {
  id: string
  template_id: string
  slot_id: string | null
  check_date: string
  done_by: string
  done_at: string
  note: string | null
  confirmed_by: string | null
  confirmed_at: string | null
  template: { title: string } | null
  done_by_profile?: Profile | null
}

export function MonitoringTab() {
  const supabase = createClient()
  const [rows, setRows] = useState<CheckRow[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    load()
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  async function load() {
    setLoading(true)
    const since = format(subDays(new Date(), 14), 'yyyy-MM-dd')

    const { data: checks, error } = await supabase
      .from('todo_checks')
      .select('*, template:todo_templates(title)')
      .gte('check_date', since)
      .order('check_date', { ascending: false })
      .order('done_at', { ascending: false })

    if (error) {
      toast.error('Fehler beim Laden: ' + error.message)
      setLoading(false)
      return
    }

    // Separate Query für profiles statt Embed-Hint mit zwei FKs (done_by,
    // confirmed_by) auf profiles im selben select — robuster/eindeutiger.
    const ids = Array.from(
      new Set((checks ?? []).flatMap((c) => [c.done_by, c.confirmed_by].filter(Boolean) as string[]))
    )
    let profileMap = new Map<string, Profile>()
    if (ids.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('*').in('id', ids)
      profileMap = new Map((profiles ?? []).map((p) => [p.id, p as unknown as Profile]))
    }

    const enriched = (checks ?? []).map((c) => ({
      ...c,
      done_by_profile: profileMap.get(c.done_by) ?? null,
      confirmed_by_profile: profileMap.get(c.confirmed_by ?? '') ?? null,
    })) as unknown as (CheckRow & { confirmed_by_profile?: Profile | null })[]

    setRows(enriched)
    setLoading(false)
  }

  async function handleConfirm(row: CheckRow) {
    if (!userId) return
    const { error } = await supabase
      .from('todo_checks')
      .update({ confirmed_by: userId, confirmed_at: new Date().toISOString() })
      .eq('id', row.id)
    if (error) { toast.error('Fehler: ' + error.message) }
    else { toast.success('Abgenommen'); load() }
  }

  if (loading) {
    return <p className="text-center py-8 text-gray-500">Lädt...</p>
  }

  return (
    <Card>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="text-center py-8 text-gray-500">Keine Abhakungen in den letzten 14 Tagen.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Aufgabe</TableHead>
                <TableHead>Bezugstag</TableHead>
                <TableHead>Erledigt von</TableHead>
                <TableHead>Erledigt am</TableHead>
                <TableHead>Abnahme</TableHead>
                <TableHead className="text-right">Aktion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.template?.title ?? '–'}</TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {format(new Date(r.check_date), 'dd.MM.yyyy', { locale: de })}
                    {r.slot_id && <Badge variant="outline" className="ml-1.5 text-xs">Dienst</Badge>}
                  </TableCell>
                  <TableCell className="text-sm text-gray-700">{r.done_by_profile?.full_name ?? '–'}</TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {format(new Date(r.done_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                  </TableCell>
                  <TableCell>
                    {r.confirmed_at ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1 text-xs">
                        <CheckCheck className="h-3 w-3" /> Abgenommen
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Ausstehend</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!r.confirmed_at && (
                      <Button size="sm" variant="outline" onClick={() => handleConfirm(r)}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Abnehmen
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

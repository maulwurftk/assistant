'use client'

import { useState } from 'react'
import { CalendarSlot } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CalendarDays, CheckCircle } from 'lucide-react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { toast } from 'sonner'

interface Props {
  slots: CalendarSlot[]
}

export function OpenSlotsCard({ slots }: Props) {
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [requested, setRequested] = useState<Set<string>>(new Set())

  if (slots.length === 0) return null

  async function requestSlot(slotId: string) {
    setPending(prev => new Set([...prev, slotId]))
    try {
      const res = await fetch('/api/slot-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_id: slotId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Fehler beim Senden der Anfrage')
      } else {
        setRequested(prev => new Set([...prev, slotId]))
        toast.success('Anfrage gesendet – der Admin wird benachrichtigt')
      }
    } catch {
      toast.error('Verbindungsfehler')
    }
    setPending(prev => { const s = new Set(prev); s.delete(slotId); return s })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-amber-500" />
          Offene Slots
          <Badge className="bg-amber-100 text-amber-700 ml-1">{slots.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-gray-100">
          {slots.map(slot => (
            <li key={slot.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{slot.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {format(new Date(slot.date), 'EEEE, dd. MMMM', { locale: de })}
                  {' · '}{slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)} Uhr
                </p>
              </div>
              {requested.has(slot.id) ? (
                <Badge className="bg-emerald-100 text-emerald-700 border-0 shrink-0 gap-1">
                  <CheckCircle className="h-3 w-3" /> Angefragt
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={pending.has(slot.id)}
                  onClick={() => requestSlot(slot.id)}
                >
                  {pending.has(slot.id) ? 'Sende…' : 'Nehmen'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

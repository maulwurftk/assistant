'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Send, CheckCircle2, AlertTriangle } from 'lucide-react'
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'
import { de } from 'date-fns/locale'

interface MonthSlot {
  id: string
  start_time: string
  end_time: string
  actual_start_time: string | null
  actual_end_time: string | null
  confirmed_at: string | null
  is_private: boolean
}

function durationHours(start: string, end: string) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return (eh * 60 + em - sh * 60 - sm) / 60
}

export function MonthlyCloseCard({ userId }: { userId: string }) {
  const supabase = createClient()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [slots, setSlots] = useState<MonthSlot[]>([])
  const [reportStatus, setReportStatus] = useState<{ status: string; sent_at: string | null } | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
    const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd')

    const [{ data: slotData }, { data: reportData }] = await Promise.all([
      supabase
        .from('calendar_slots')
        .select('id, start_time, end_time, actual_start_time, actual_end_time, confirmed_at, is_private')
        .eq('assigned_to', userId)
        .eq('status', 'assigned')
        .gte('date', monthStart)
        .lte('date', monthEnd),
      supabase
        .from('monthly_reports')
        .select('status, sent_at')
        .eq('assistant_id', userId)
        .eq('year', currentMonth.getFullYear())
        .eq('month', currentMonth.getMonth() + 1)
        .maybeSingle(),
    ])
    setSlots((slotData ?? []) as unknown as MonthSlot[])
    setReportStatus(reportData ?? null)
    setLoading(false)
  }, [userId, currentMonth])

  useEffect(() => { load() }, [load])

  async function handleClose() {
    setSubmitting(true)
    try {
      const year = currentMonth.getFullYear()
      const month = currentMonth.getMonth() + 1
      const now = new Date().toISOString()

      const { data: existing } = await supabase
        .from('monthly_reports')
        .select('id')
        .eq('assistant_id', userId)
        .eq('year', year)
        .eq('month', month)
        .maybeSingle()

      let reportId: string
      if (existing) {
        const { data } = await supabase
          .from('monthly_reports')
          .update({ status: 'sent', sent_at: now, confirmed_at: now })
          .eq('id', existing.id)
          .select('id')
          .single()
        reportId = data!.id
      } else {
        const { data } = await supabase
          .from('monthly_reports')
          .insert({ assistant_id: userId, year, month, status: 'sent', sent_at: now, confirmed_at: now })
          .select('id')
          .single()
        reportId = data!.id
      }

      await fetch('/api/notify-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, assistantId: userId, year, month }),
      })

      toast.success('Monat erfolgreich abgeschlossen und gesendet!')
      setConfirmOpen(false)
      load()
    } catch {
      toast.error('Verbindungsfehler')
    }
    setSubmitting(false)
  }

  const relevantSlots = slots.filter(s => !s.is_private)
  const confirmedSlots = relevantSlots.filter(s => s.confirmed_at)
  const unconfirmedCount = relevantSlots.length - confirmedSlots.length
  const totalHours = confirmedSlots.reduce(
    (acc, s) => acc + durationHours(s.actual_start_time || s.start_time, s.actual_end_time || s.end_time),
    0
  )
  const isSent = reportStatus?.status === 'sent'
  const canClose = !isSent && relevantSlots.length > 0 && unconfirmedCount === 0

  return (
    <Card>
      <CardContent className="py-4 px-4 sm:px-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Monatsabschluss</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-sm font-medium min-w-[100px] text-center">
              {format(currentMonth, 'MMMM yyyy', { locale: de })}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              disabled={format(currentMonth, 'yyyy-MM') === format(new Date(), 'yyyy-MM')}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Lädt…</p>
        ) : isSent ? (
          <div className="flex items-center gap-2 text-emerald-700 text-sm">
            <CheckCircle2 className="h-4 w-4" />
            Abgeschlossen und gesendet
            {reportStatus?.sent_at && ` am ${format(new Date(reportStatus.sent_at), 'dd.MM.yyyy', { locale: de })}`}
          </div>
        ) : relevantSlots.length === 0 ? (
          <p className="text-sm text-gray-400">Keine Termine in diesem Monat.</p>
        ) : (
          <>
            <p className="text-sm text-gray-500">
              {confirmedSlots.length} von {relevantSlots.length} Terminen bestätigt · {totalHours.toFixed(1)} Std.
            </p>
            {unconfirmedCount > 0 && (
              <div className="flex items-center gap-1.5 text-amber-700 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Noch {unconfirmedCount} Termin{unconfirmedCount === 1 ? '' : 'e'} nicht bestätigt – bitte im Kalender die Ist-Zeit bestätigen, bevor Sie den Monat abschließen.
              </div>
            )}
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              size="sm"
              disabled={!canClose}
              onClick={() => setConfirmOpen(true)}
            >
              <Send className="h-3.5 w-3.5 mr-2" />
              Monat abschließen & senden
            </Button>
          </>
        )}

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Monat abschließen?</AlertDialogTitle>
              <AlertDialogDescription>
                Sie schließen {format(currentMonth, 'MMMM yyyy', { locale: de })} mit{' '}
                {totalHours.toFixed(1)} Stunden ({confirmedSlots.length} Termine) ab und der Admin wird benachrichtigt.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Zurück</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleClose}
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={submitting}
              >
                {submitting ? 'Wird gesendet...' : 'Bestätigen & Senden'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}

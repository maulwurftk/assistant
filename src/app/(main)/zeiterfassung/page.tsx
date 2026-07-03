'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TimeEntry, Activity, MonthlyReport } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Plus, Pencil, Trash2, Send, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'
import { de } from 'date-fns/locale'

interface EntryForm {
  date: string
  start_time: string
  end_time: string
  activity_id: string
  description: string
}

const emptyForm: EntryForm = {
  date: format(new Date(), 'yyyy-MM-dd'),
  start_time: '08:00',
  end_time: '12:00',
  activity_id: '',
  description: '',
}

export default function ZeiterfassungPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [report, setReport] = useState<MonthlyReport | null>(null)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [form, setForm] = useState<EntryForm>(emptyForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [monthlyConfirmOpen, setMonthlyConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })
    loadActivities()
  }, [])

  useEffect(() => {
    if (userId) {
      loadEntries()
      loadReport()
    }
  }, [userId, currentMonth])

  async function loadActivities() {
    const { data } = await supabase.from('activities').select('*').eq('active', true).order('sort_order')
    setActivities(data ?? [])
  }

  const loadEntries = useCallback(async () => {
    if (!userId) return
    const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
    const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('time_entries')
      .select('*, activity:activities(name)')
      .eq('assistant_id', userId)
      .gte('date', monthStart)
      .lte('date', monthEnd)
      .order('date', { ascending: false })
    setEntries(data ?? [])
  }, [userId, currentMonth])

  const loadReport = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('monthly_reports')
      .select('*')
      .eq('assistant_id', userId)
      .eq('year', currentMonth.getFullYear())
      .eq('month', currentMonth.getMonth() + 1)
      .single()
    setReport(data)
  }, [userId, currentMonth])

  function openNew() {
    setEditId(null)
    setForm({ ...emptyForm, date: format(new Date(), 'yyyy-MM-dd') })
    setDialogOpen(true)
  }

  function openEdit(entry: TimeEntry) {
    setEditId(entry.id)
    setForm({
      date: entry.date,
      start_time: entry.start_time.slice(0, 5),
      end_time: entry.end_time.slice(0, 5),
      activity_id: entry.activity_id ?? '',
      description: entry.description ?? '',
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!userId) return
    if (form.start_time >= form.end_time) {
      toast.error('Endzeit muss nach der Startzeit liegen')
      return
    }
    setLoading(true)

    const payload = {
      assistant_id: userId,
      date: form.date,
      start_time: form.start_time,
      end_time: form.end_time,
      activity_id: form.activity_id || null,
      description: form.description || null,
      updated_at: new Date().toISOString(),
    }

    let error
    if (editId) {
      const res = await supabase.from('time_entries').update(payload).eq('id', editId)
      error = res.error
    } else {
      const res = await supabase.from('time_entries').insert({ ...payload, month_status: 'draft' })
      error = res.error
    }

    if (error) {
      toast.error('Fehler beim Speichern: ' + error.message)
    } else {
      toast.success(editId ? 'Eintrag aktualisiert' : 'Eintrag gespeichert')
      setDialogOpen(false)
      loadEntries()
    }
    setLoading(false)
  }

  async function handleDelete() {
    if (!deleteTargetId) return
    const { error } = await supabase.from('time_entries').delete().eq('id', deleteTargetId)
    if (error) {
      toast.error('Fehler beim Löschen')
    } else {
      toast.success('Eintrag gelöscht')
      loadEntries()
    }
    setDeleteTargetId(null)
  }

  async function handleMonthlySubmit() {
    if (!userId) return
    setSubmitting(true)

    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth() + 1
    const now = new Date().toISOString()

    const { data: existing } = await supabase
      .from('monthly_reports')
      .select('id')
      .eq('assistant_id', userId)
      .eq('year', year)
      .eq('month', month)
      .single()

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
    setMonthlyConfirmOpen(false)
    loadReport()
    setSubmitting(false)
  }

  const totalHours = entries.reduce((acc, e) => {
    const [sh, sm] = e.start_time.split(':').map(Number)
    const [eh, em] = e.end_time.split(':').map(Number)
    return acc + (eh * 60 + em - sh * 60 - sm) / 60
  }, 0)

  const isSent = report?.status === 'sent'
  const isCurrentMonth = format(currentMonth, 'yyyy-MM') === format(new Date(), 'yyyy-MM')

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Month Navigator */}
      <div className="flex items-center justify-between">
        <PageHeader
          icon={<Clock className="h-5 w-5" />}
          title="Zeiterfassung"
          subtitle={`${totalHours.toFixed(1)} Std. · ${entries.length} Einträge`}
          tone="sky"
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[110px] text-center">
            {format(currentMonth, 'MMMM yyyy', { locale: de })}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            disabled={isCurrentMonth}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Status Banner */}
      {isSent && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <span className="text-green-700 font-medium text-sm">
            ✓ Monat abgeschlossen und gesendet am{' '}
            {report?.sent_at ? format(new Date(report.sent_at), 'dd.MM.yyyy', { locale: de }) : ''}
          </span>
        </div>
      )}

      {/* New Entry Button */}
      {!isSent && (
        <Button onClick={openNew} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          Neuer Eintrag
        </Button>
      )}

      {/* Entry Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="entry-date">Datum</Label>
              <Input
                id="entry-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="entry-start">Startzeit</Label>
                <Input
                  id="entry-start"
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="entry-end">Endzeit</Label>
                <Input
                  id="entry-end"
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="entry-activity">Tätigkeit</Label>
              <Select
                value={form.activity_id || undefined}
                onValueChange={(v) => setForm({ ...form, activity_id: v ?? '' })}
              >
                <SelectTrigger id="entry-activity">
                  <SelectValue placeholder="Tätigkeit wählen..." />
                </SelectTrigger>
                <SelectContent>
                  {activities.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="entry-desc">
                Beschreibung / Details{' '}
                <span className="text-gray-400 font-normal">(optional)</span>
              </Label>
              <Textarea
                id="entry-desc"
                placeholder="Weitere Details zur Tätigkeit..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                Abbrechen
              </Button>
              <Button onClick={handleSave} disabled={loading} className="flex-1">
                {loading ? 'Speichern...' : 'Speichern'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTargetId} onOpenChange={(o) => !o && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eintrag löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dieser Eintrag wird unwiderruflich gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Monthly Submit Confirmation */}
      <AlertDialog open={monthlyConfirmOpen} onOpenChange={setMonthlyConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Monat abschließen?</AlertDialogTitle>
            <AlertDialogDescription>
              Sie schließen {format(currentMonth, 'MMMM yyyy', { locale: de })} mit{' '}
              {totalHours.toFixed(1)} Stunden ({entries.length} Einträge) ab.
              Nach dem Senden können keine Änderungen mehr vorgenommen werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zurück</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMonthlySubmit}
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={submitting}
            >
              {submitting ? 'Wird gesendet...' : 'Bestätigen & Senden'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Entries List */}
      <div className="space-y-3">
        {entries.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-gray-500">
              Noch keine Einträge für {format(currentMonth, 'MMMM yyyy', { locale: de })}.
            </CardContent>
          </Card>
        ) : (
          entries.map((entry) => {
            const [sh, sm] = entry.start_time.split(':').map(Number)
            const [eh, em] = entry.end_time.split(':').map(Number)
            const hours = (eh * 60 + em - sh * 60 - sm) / 60

            return (
              <Card key={entry.id}>
                <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">
                        {format(new Date(entry.date), 'dd.MM.yyyy')}
                      </span>
                      <span className="text-gray-500 text-sm">
                        {entry.start_time.slice(0, 5)} – {entry.end_time.slice(0, 5)} Uhr
                      </span>
                      <Badge variant="outline" className="text-xs">{hours.toFixed(1)} h</Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {(entry.activity as any)?.name ?? (
                        <span className="italic">Keine Tätigkeit</span>
                      )}
                      {entry.description && <span> · {entry.description}</span>}
                    </div>
                  </div>
                  {!isSent && (
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(entry)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setDeleteTargetId(entry.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Monthly Submit */}
      {!isSent && entries.length > 0 && isCurrentMonth && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="pt-4">
            <p className="font-medium text-emerald-900 mb-1">Monat abschließen</p>
            <p className="text-sm text-emerald-700 mb-3">
              Bitte überprüfen Sie alle Einträge und schließen Sie den Monat ab.
              Nach dem Senden können Sie keine Änderungen mehr vornehmen.
            </p>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={submitting}
              onClick={() => setMonthlyConfirmOpen(true)}
            >
              <Send className="h-4 w-4 mr-2" />
              Monat abschließen & senden
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

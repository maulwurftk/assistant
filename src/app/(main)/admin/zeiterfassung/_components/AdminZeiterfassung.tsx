'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Activity, TimeEntry } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'
import { de } from 'date-fns/locale'

interface Assistant {
  id: string
  full_name: string
  email: string
}

interface MonthlyReport {
  status: string
  sent_at: string | null
}

interface Props {
  assistants: Assistant[]
}

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

export default function AdminZeiterfassung({ assistants }: Props) {
  const supabase = createClient()
  const [selectedId, setSelectedId] = useState(assistants[0]?.id ?? '')
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [report, setReport] = useState<MonthlyReport | null>(null)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [form, setForm] = useState<EntryForm>(emptyForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase
      .from('activities')
      .select('*')
      .eq('active', true)
      .order('sort_order')
      .then(({ data }) => setActivities(data ?? []))
  }, [])

  const loadEntries = useCallback(async () => {
    if (!selectedId) return
    const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
    const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('time_entries')
      .select('*, activity:activities(name)')
      .eq('assistant_id', selectedId)
      .gte('date', monthStart)
      .lte('date', monthEnd)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
    setEntries(data ?? [])
  }, [selectedId, currentMonth])

  const loadReport = useCallback(async () => {
    if (!selectedId) return
    const { data } = await supabase
      .from('monthly_reports')
      .select('status, sent_at')
      .eq('assistant_id', selectedId)
      .eq('year', currentMonth.getFullYear())
      .eq('month', currentMonth.getMonth() + 1)
      .single()
    setReport(data)
  }, [selectedId, currentMonth])

  useEffect(() => {
    loadEntries()
    loadReport()
  }, [loadEntries, loadReport])

  function openNew() {
    setEditId(null)
    setForm({ ...emptyForm, date: format(startOfMonth(currentMonth), 'yyyy-MM-dd') })
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
    if (form.start_time >= form.end_time) {
      toast.error('Endzeit muss nach der Startzeit liegen')
      return
    }
    setSaving(true)

    const url = editId ? `/api/admin/time-entries/${editId}` : '/api/admin/time-entries'
    const method = editId ? 'PATCH' : 'POST'
    const body = editId
      ? { date: form.date, start_time: form.start_time, end_time: form.end_time, activity_id: form.activity_id || null, description: form.description || null }
      : { assistant_id: selectedId, date: form.date, start_time: form.start_time, end_time: form.end_time, activity_id: form.activity_id || null, description: form.description || null }

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      toast.error(data.error ?? 'Fehler beim Speichern')
    } else {
      toast.success(editId ? 'Eintrag aktualisiert' : 'Eintrag hinzugefügt')
      setDialogOpen(false)
      loadEntries()
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!deleteTargetId) return
    const res = await fetch(`/api/admin/time-entries/${deleteTargetId}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error('Fehler beim Löschen')
    } else {
      toast.success('Eintrag gelöscht')
      loadEntries()
    }
    setDeleteTargetId(null)
  }

  const totalHours = entries.reduce((acc, e) => {
    const [sh, sm] = e.start_time.split(':').map(Number)
    const [eh, em] = e.end_time.split(':').map(Number)
    return acc + (eh * 60 + em - sh * 60 - sm) / 60
  }, 0)

  const selectedAssistant = assistants.find((a) => a.id === selectedId)

  return (
    <div className="max-w-2xl space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Zeiterfassung verwalten</h1>
        <p className="text-sm text-gray-500 mt-0.5">Einträge von Assistentinnen einsehen, bearbeiten und ergänzen</p>
      </div>

      {/* Controls row */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* Assistant selector */}
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Assistentin wählen..." />
          </SelectTrigger>
          <SelectContent>
            {assistants.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Month nav */}
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[110px] text-center">
            {format(currentMonth, 'MMMM yyyy', { locale: de })}
          </span>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Submitted banner */}
      {report?.status === 'sent' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex items-center justify-between">
          <span className="text-blue-800 text-sm font-medium">
            Monat wurde von {selectedAssistant?.full_name} eingereicht
            {report.sent_at && ` am ${format(new Date(report.sent_at), 'dd.MM.yyyy', { locale: de })}`}
          </span>
          <span className="text-blue-600 text-xs">Bearbeitung trotzdem möglich</span>
        </div>
      )}

      {/* Stats + Add button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {totalHours.toFixed(1)} Std. · {entries.length} Einträge
        </p>
        <Button onClick={openNew} size="sm" disabled={!selectedId}>
          <Plus className="h-4 w-4 mr-1.5" />
          Eintrag hinzufügen
        </Button>
      </div>

      {/* Entry Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editId ? 'Eintrag bearbeiten' : `Neuer Eintrag für ${selectedAssistant?.full_name ?? ''}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Datum</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Startzeit</Label>
                <Input
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Endzeit</Label>
                <Input
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tätigkeit</Label>
              <Select
                value={form.activity_id || undefined}
                onValueChange={(v) => setForm({ ...form, activity_id: v ?? '' })}
              >
                <SelectTrigger>
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
              <Label>Beschreibung <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Textarea
                placeholder="Weitere Details..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                Abbrechen
              </Button>
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? 'Speichern…' : 'Speichern'}
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

      {/* Entries List */}
      <div className="space-y-2">
        {entries.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl py-10 text-center text-gray-400 text-sm">
            {selectedId
              ? `Keine Einträge für ${format(currentMonth, 'MMMM yyyy', { locale: de })}`
              : 'Bitte Assistentin wählen'}
          </div>
        ) : (
          entries.map((entry) => {
            const [sh, sm] = entry.start_time.split(':').map(Number)
            const [eh, em] = entry.end_time.split(':').map(Number)
            const hours = (eh * 60 + em - sh * 60 - sm) / 60

            return (
              <div
                key={entry.id}
                className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-gray-900">
                      {format(new Date(entry.date), 'dd.MM.yyyy')}
                    </span>
                    <span className="text-gray-500 text-sm">
                      {entry.start_time.slice(0, 5)} – {entry.end_time.slice(0, 5)} Uhr
                    </span>
                    <Badge variant="outline" className="text-xs">{hours.toFixed(1)} h</Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {(entry.activity as any)?.name ?? <span className="italic">Keine Tätigkeit</span>}
                    {entry.description && <span> · {entry.description}</span>}
                  </div>
                </div>
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
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

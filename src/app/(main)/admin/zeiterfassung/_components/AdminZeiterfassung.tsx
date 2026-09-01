'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Activity, TimeEntry } from '@/lib/types'
import { cn } from '@/lib/utils'
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
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, CalendarPlus, Settings2, FileText, Clock, ArrowRightLeft } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'
import { de } from 'date-fns/locale'
import type { TemplateRow } from '@/lib/time-entry-template'
import { DEFAULT_TEMPLATE } from '@/lib/time-entry-template'

const TIME_PRESETS = ['07:00','07:30','08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','16:00','17:00']
const WEEKDAY_SHORT: Record<number, string> = { 0: 'So', 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa' }

interface Assistant { id: string; full_name: string; email: string }
interface MonthlyReport { status: string; sent_at: string | null }
interface CalendarSlot { id: string; date: string; start_time: string; end_time: string; title: string; status: string; is_private?: boolean }
interface Props { assistants: Assistant[] }

interface EntryForm {
  date: string; start_time: string; end_time: string
  activity_id: string; description: string; is_private: boolean
}
interface SlotForm {
  title: string; date: string; start_time: string; end_time: string; is_private: boolean
}

const emptyForm: EntryForm = {
  date: format(new Date(), 'yyyy-MM-dd'),
  start_time: '08:00', end_time: '12:00',
  activity_id: '', description: '', is_private: false,
}
const emptySlotForm: SlotForm = { title: '', date: format(new Date(), 'yyyy-MM-dd'), start_time: '08:00', end_time: '10:00', is_private: false }

function generatePreview(year: number, month: number, entries: TimeEntry[], template: TemplateRow[]) {
  const existingKeys = new Set(entries.map((e) => `${e.date}|${e.start_time.slice(0, 5)}`))
  const daysInMonth = new Date(year, month, 0).getDate()
  let toCreate = 0, toSkip = 0
  for (let day = 1; day <= daysInMonth; day++) {
    const jsDay = new Date(year, month - 1, day).getDay()
    for (const slot of template) {
      if (slot.jsDay !== jsDay) continue
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      existingKeys.has(`${dateStr}|${slot.start}`) ? toSkip++ : toCreate++
    }
  }
  return { toCreate, toSkip }
}

function durationHours(start: string, end: string) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return (eh * 60 + em - sh * 60 - sm) / 60
}

export default function AdminZeiterfassung({ assistants }: Props) {
  const supabase = createClient()
  const [selectedId, setSelectedId] = useState(assistants[0]?.id ?? '')
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [slots, setSlots] = useState<CalendarSlot[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [report, setReport] = useState<MonthlyReport | null>(null)
  const [currentMonth, setCurrentMonth] = useState(new Date())

  // Entry form state
  const [form, setForm] = useState<EntryForm>(emptyForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  // Slot edit state
  const [slotForm, setSlotForm] = useState<SlotForm>(emptySlotForm)
  const [editSlotId, setEditSlotId] = useState<string | null>(null)
  const [slotDialogOpen, setSlotDialogOpen] = useState(false)

  // Template state
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const [template, setTemplate] = useState<TemplateRow[]>(DEFAULT_TEMPLATE)
  const [editingTemplate, setEditingTemplate] = useState<TemplateRow[]>(DEFAULT_TEMPLATE)
  const [saving, setSaving] = useState(false)
  const [savingSlot, setSavingSlot] = useState(false)
  const [creatingTemplate, setCreatingTemplate] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [privateHoursBudget, setPrivateHoursBudget] = useState(0)
  const [countMode, setCountMode] = useState<'slots' | 'entries' | 'both'>('slots')
  const [transferring, setTransferring] = useState(false)

  useEffect(() => {
    supabase.from('activities').select('*').eq('active', true).order('sort_order')
      .then(({ data }) => setActivities(data ?? []))
    fetch('/api/admin/time-entries/template-config')
      .then((r) => r.json())
      .then(({ template: t }) => { if (t) { setTemplate(t); setEditingTemplate(t) } })
      .catch(() => {})
    supabase.from('payroll_settings').select('private_hours_budget, payroll_count_mode').limit(1).single()
      .then(({ data }) => {
        setPrivateHoursBudget(data?.private_hours_budget ?? 0)
        const mode = data?.payroll_count_mode
        setCountMode(mode === 'entries' || mode === 'both' ? mode : 'slots')
      })
  }, [])

  const loadEntries = useCallback(async () => {
    if (!selectedId) return
    const dateFrom = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
    const dateTo = format(endOfMonth(currentMonth), 'yyyy-MM-dd')

    const [entriesRes, slotsRes] = await Promise.all([
      supabase
        .from('time_entries')
        .select('*, activity:activities(name)')
        .eq('assistant_id', selectedId)
        .gte('date', dateFrom).lte('date', dateTo)
        .order('date').order('start_time'),
      supabase
        .from('calendar_slots')
        .select('id, date, start_time, end_time, title, status, is_private')
        .eq('assigned_to', selectedId)
        .gte('date', dateFrom).lte('date', dateTo)
        .order('date').order('start_time'),
    ])
    setEntries(entriesRes.data ?? [])
    setSlots(slotsRes.data ?? [])
  }, [selectedId, currentMonth])

  const loadReport = useCallback(async () => {
    if (!selectedId) return
    const { data } = await supabase
      .from('monthly_reports').select('status, sent_at')
      .eq('assistant_id', selectedId)
      .eq('year', currentMonth.getFullYear())
      .eq('month', currentMonth.getMonth() + 1)
      .single()
    setReport(data)
  }, [selectedId, currentMonth])

  useEffect(() => { loadEntries(); loadReport() }, [loadEntries, loadReport])

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
      is_private: entry.is_private ?? false,
    })
    setDialogOpen(true)
  }

  function openEditSlot(slot: CalendarSlot) {
    setEditSlotId(slot.id)
    setSlotForm({
      title: slot.title,
      date: slot.date,
      start_time: slot.start_time.slice(0, 5),
      end_time: slot.end_time.slice(0, 5),
      is_private: slot.is_private ?? false,
    })
    setSlotDialogOpen(true)
  }

  async function handleSave() {
    if (form.start_time >= form.end_time) { toast.error('Endzeit muss nach der Startzeit liegen'); return }
    setSaving(true)
    const url = editId ? `/api/admin/time-entries/${editId}` : '/api/admin/time-entries'
    const body = editId
      ? { date: form.date, start_time: form.start_time, end_time: form.end_time, activity_id: form.activity_id || null, description: form.description || null, is_private: form.is_private }
      : { assistant_id: selectedId, date: form.date, start_time: form.start_time, end_time: form.end_time, activity_id: form.activity_id || null, description: form.description || null, is_private: form.is_private }
    const res = await fetch(url, { method: editId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) toast.error(data.error ?? 'Fehler beim Speichern')
    else { toast.success(editId ? 'Eintrag aktualisiert' : 'Eintrag hinzugefügt'); setDialogOpen(false); loadEntries() }
    setSaving(false)
  }

  async function handleSaveSlot() {
    if (!editSlotId) return
    if (slotForm.start_time >= slotForm.end_time) { toast.error('Endzeit muss nach der Startzeit liegen'); return }
    setSavingSlot(true)
    const res = await fetch(`/api/admin/calendar-slots/${editSlotId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slotForm),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) toast.error(data.error ?? 'Fehler beim Speichern')
    else { toast.success('Slot aktualisiert'); setSlotDialogOpen(false); loadEntries() }
    setSavingSlot(false)
  }

  async function handleDelete() {
    if (!deleteTargetId) return
    const res = await fetch(`/api/admin/time-entries/${deleteTargetId}`, { method: 'DELETE' })
    if (!res.ok) toast.error('Fehler beim Löschen')
    else { toast.success('Eintrag gelöscht'); loadEntries() }
    setDeleteTargetId(null)
  }

  async function handleCreateTemplate() {
    setCreatingTemplate(true)
    const res = await fetch('/api/admin/time-entries/template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assistant_id: selectedId, year: currentMonth.getFullYear(), month: currentMonth.getMonth() + 1 }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) toast.error(data.error ?? 'Fehler')
    else {
      toast.success(data.skipped > 0 ? `${data.created} Einträge angelegt, ${data.skipped} übersprungen` : `${data.created} Einträge angelegt`)
      setTemplateDialogOpen(false); loadEntries()
    }
    setCreatingTemplate(false)
  }

  async function handleSaveConfig() {
    setSavingConfig(true)
    const res = await fetch('/api/admin/time-entries/template-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: editingTemplate }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) toast.error(data.error ?? 'Fehler beim Speichern')
    else { setTemplate(editingTemplate); toast.success('Vorlage gespeichert'); setConfigDialogOpen(false) }
    setSavingConfig(false)
  }

  async function handleTransferToSlots() {
    if (!selectedId) return
    setTransferring(true)
    const res = await fetch('/api/admin/time-entries/to-slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assistant_id: selectedId,
        year: currentMonth.getFullYear(),
        month: currentMonth.getMonth() + 1,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) toast.error(data.error ?? 'Fehler beim Übernehmen')
    else if (data.created === 0) toast.info('Nichts zu übernehmen – alle Einträge haben bereits einen Slot')
    else { toast.success(`${data.created} Eintrag${data.created === 1 ? '' : 'e'} als Kalender-Slot übernommen`); loadEntries() }
    setTransferring(false)
  }

  function updateRow(i: number, patch: Partial<TemplateRow>) {
    setEditingTemplate((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }
  function removeRow(i: number) { setEditingTemplate((prev) => prev.filter((_, idx) => idx !== i)) }
  function addRow() { setEditingTemplate((prev) => [...prev, { jsDay: 1, start: '08:00', end: '10:00', activityName: activities[0]?.name ?? '' }]) }

  const totalEntryHours = entries.filter(e => !e.is_private).reduce((acc, e) => acc + durationHours(e.start_time, e.end_time), 0)
  const totalSlotHours = slots.filter(s => !s.is_private).reduce((acc, s) => acc + durationHours(s.start_time, s.end_time), 0)
  const totalHours = totalEntryHours + totalSlotHours
  const totalPrivateHours =
    entries.filter(e => e.is_private).reduce((acc, e) => acc + durationHours(e.start_time, e.end_time), 0) +
    slots.filter(s => s.is_private).reduce((acc, s) => acc + durationHours(s.start_time, s.end_time), 0)

  const selectedAssistant = assistants.find((a) => a.id === selectedId)
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth() + 1
  const preview = selectedId ? generatePreview(year, month, entries, template) : { toCreate: 0, toSkip: 0 }

  // Einträge ohne passenden Kalender-Slot (gleiches Datum + gleiche Start-/Endzeit) –
  // diese fließen bei Zähl-Modus "Nur Kalender-Slots" nicht in die Lohnabrechnung ein.
  const slotKeys = new Set(slots.map((s) => `${s.date}|${s.start_time}|${s.end_time}`))
  const unmatchedEntryCount = countMode === 'entries' ? 0 : entries.filter(
    (e) => !e.is_private && !slotKeys.has(`${e.date}|${e.start_time}|${e.end_time}`)
  ).length

  // Combine and sort all items by date+start_time
  type ListItem = { kind: 'entry'; data: TimeEntry } | { kind: 'slot'; data: CalendarSlot }
  const allItems: ListItem[] = [
    ...entries.map((e): ListItem => ({ kind: 'entry', data: e })),
    ...slots.map((s): ListItem => ({ kind: 'slot', data: s })),
  ].sort((a, b) => {
    const d = a.data.date.localeCompare(b.data.date)
    return d !== 0 ? d : a.data.start_time.localeCompare(b.data.start_time)
  })

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader
        icon={<Clock className="h-5 w-5" />}
        title="Zeiterfassung verwalten"
        subtitle="Einträge und Kalender-Slots von Assistentinnen einsehen und bearbeiten"
        tone="sky"
      />

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <Select value={selectedId} onValueChange={(v) => setSelectedId(v ?? '')}>
          <SelectTrigger className="w-full sm:w-56">
            <span className={cn('flex-1 text-left text-sm truncate', !selectedId && 'text-muted-foreground')}>
              {assistants.find((a) => a.id === selectedId)?.full_name ?? 'Assistentin wählen...'}
            </span>
          </SelectTrigger>
          <SelectContent>
            {assistants.map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
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

      {report?.status === 'sent' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex items-center justify-between">
          <span className="text-blue-800 text-sm font-medium">
            Monat wurde von {selectedAssistant?.full_name} eingereicht
            {report.sent_at && ` am ${format(new Date(report.sent_at), 'dd.MM.yyyy', { locale: de })}`}
          </span>
          <span className="text-blue-600 text-xs">Bearbeitung trotzdem möglich</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-gray-500">
          {totalHours.toFixed(1)} Std. · {entries.filter(e => !e.is_private).length} Einträge · {slots.length} Slots
          {(totalPrivateHours > 0 || privateHoursBudget > 0) && (
            <span className="text-gray-400">
              {' '}· {totalPrivateHours.toFixed(1)}{privateHoursBudget > 0 ? ` / ${privateHoursBudget.toFixed(1)}` : ''} Std. privat
            </span>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => { setEditingTemplate(template); setConfigDialogOpen(true) }}>
            <Settings2 className="h-4 w-4 mr-1.5" />
            Vorlage anpassen
          </Button>
          <Button variant="outline" size="sm" onClick={() => setTemplateDialogOpen(true)} disabled={!selectedId}>
            <CalendarPlus className="h-4 w-4 mr-1.5" />
            Vorlage erstellen
          </Button>
          <Button variant="outline" size="sm" disabled={!selectedId}
            onClick={() => selectedId && window.open(`/admin/zeiterfassung/bericht/${selectedId}/${year}/${month}`, '_blank')}>
            <FileText className="h-4 w-4 mr-1.5" />
            Bericht drucken
          </Button>
          {countMode !== 'entries' && (
            <Button
              variant="outline"
              size="sm"
              disabled={!selectedId || transferring || unmatchedEntryCount === 0}
              onClick={handleTransferToSlots}
              title="Zeiterfassungs-Einträge ohne passenden Kalender-Slot als Slot anlegen, damit sie in die Lohnabrechnung einfließen"
            >
              <ArrowRightLeft className="h-4 w-4 mr-1.5" />
              {transferring
                ? 'Übernehme…'
                : unmatchedEntryCount > 0
                  ? `${unmatchedEntryCount} Eintrag${unmatchedEntryCount === 1 ? '' : 'e'} als Slots übernehmen`
                  : 'Alle Einträge haben schon einen Slot'}
            </Button>
          )}
          <Button onClick={openNew} size="sm" disabled={!selectedId}>
            <Plus className="h-4 w-4 mr-1.5" />
            Eintrag hinzufügen
          </Button>
        </div>
      </div>

      {/* Template Config Dialog */}
      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Wöchentliche Vorlage anpassen</DialogTitle>
            <DialogDescription>Legt fest, welche Einträge beim Klick auf „Vorlage erstellen" angelegt werden.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {editingTemplate.map((row, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2.5 bg-surface">
                <div className="flex gap-1">
                  {[{v:1,l:'Mo'},{v:2,l:'Di'},{v:3,l:'Mi'},{v:4,l:'Do'},{v:5,l:'Fr'},{v:6,l:'Sa'},{v:0,l:'So'}].map((d) => (
                    <button key={d.v} type="button" onClick={() => updateRow(i, { jsDay: d.v })}
                      className={cn('flex-1 h-7 rounded text-xs font-medium transition-colors',
                        row.jsDay === d.v ? 'bg-emerald-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      )}>{d.l}</button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Input type="time" className="h-8 w-24 text-sm shrink-0" value={row.start} onChange={(e) => updateRow(i, { start: e.target.value })} />
                  <span className="text-gray-400 text-xs shrink-0">–</span>
                  <Input type="time" className="h-8 w-24 text-sm shrink-0" value={row.end} onChange={(e) => updateRow(i, { end: e.target.value })} />
                  <Select value={row.activityName} onValueChange={(v) => updateRow(i, { activityName: v ?? '' })}>
                    <SelectTrigger className="h-8 flex-1 text-sm min-w-0">
                      <span className={cn('flex-1 text-left text-sm truncate', !row.activityName && 'text-muted-foreground')}>
                        {row.activityName || 'Tätigkeit…'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {activities.map((a) => <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => removeRow(i)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full border-dashed" onClick={addRow}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Zeile hinzufügen
            </Button>
          </div>
          <div className="flex gap-2 pt-2 border-t mt-2">
            <Button variant="outline" onClick={() => setConfigDialogOpen(false)} className="flex-1">Abbrechen</Button>
            <Button onClick={handleSaveConfig} disabled={savingConfig} className="flex-1">{savingConfig ? 'Speichern…' : 'Vorlage speichern'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Template Preview Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Monatsvorlage erstellen</DialogTitle>
            <DialogDescription>Wöchentliches Muster für <strong>{format(currentMonth, 'MMMM yyyy', { locale: de })}</strong></DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-gray-200 overflow-hidden text-sm">
            <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Aktuelles Muster</div>
            <table className="w-full">
              <tbody>
                {template.map((slot, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium text-gray-700 w-8">{WEEKDAY_SHORT[slot.jsDay]}</td>
                    <td className="px-3 py-2 text-gray-600">{slot.activityName}</td>
                    <td className="px-3 py-2 text-gray-500 text-right whitespace-nowrap font-mono text-xs">{slot.start}–{slot.end}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={`rounded-lg px-4 py-3 text-sm ${preview.toCreate > 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-50 border border-gray-200'}`}>
            {preview.toCreate > 0 ? (
              <p className="text-emerald-800"><strong>{preview.toCreate} Einträge</strong> werden angelegt{preview.toSkip > 0 && <span className="text-emerald-600"> · {preview.toSkip} bereits vorhanden</span>}</p>
            ) : (
              <p className="text-gray-500">Alle Einträge für diesen Monat sind bereits vorhanden.</p>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)} className="flex-1">Abbrechen</Button>
            <Button onClick={handleCreateTemplate} disabled={creatingTemplate || preview.toCreate === 0} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
              {creatingTemplate ? 'Wird erstellt…' : `${preview.toCreate} Einträge anlegen`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Entry Edit/Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Eintrag bearbeiten' : `Neuer Eintrag für ${selectedAssistant?.full_name ?? ''}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Datum</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Startzeit</Label>
              <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              <div className="flex flex-wrap gap-1">
                {TIME_PRESETS.map((t) => (
                  <button key={t} type="button" onClick={() => setForm((f) => ({ ...f, start_time: t }))}
                    className={cn('px-1.5 py-0.5 rounded text-xs font-mono transition-colors',
                      form.start_time === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    )}>{t}</button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Endzeit</Label>
              <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              <div className="flex flex-wrap gap-1">
                {TIME_PRESETS.map((t) => (
                  <button key={t} type="button" onClick={() => setForm((f) => ({ ...f, end_time: t }))}
                    className={cn('px-1.5 py-0.5 rounded text-xs font-mono transition-colors',
                      form.end_time === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    )}>{t}</button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tätigkeit</Label>
              <Select value={form.activity_id || undefined} onValueChange={(v) => setForm({ ...form, activity_id: v ?? '' })}>
                <SelectTrigger>
                  <span className={cn('flex-1 text-left text-sm truncate', !form.activity_id && 'text-muted-foreground')}>
                    {form.activity_id ? (activities.find((a) => a.id === form.activity_id)?.name ?? '–') : 'Tätigkeit wählen...'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {activities.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Beschreibung <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Textarea placeholder="Weitere Details..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <label className="flex items-start gap-2.5 bg-gray-50 border border-gray-200 rounded-lg p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_private}
                onChange={(e) => setForm({ ...form, is_private: e.target.checked })}
                className="mt-0.5 rounded border-gray-300"
              />
              <span className="text-sm">
                <span className="font-medium text-gray-700">Privat (unbezahlt)</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Zählt nicht zu Lohn, Anwesenheitsnachweis oder Bezirks-Budget – nur intern sichtbar.
                </p>
              </span>
            </label>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Abbrechen</Button>
              <Button onClick={handleSave} disabled={saving} className="flex-1">{saving ? 'Speichern…' : 'Speichern'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Slot Edit Dialog */}
      <Dialog open={slotDialogOpen} onOpenChange={setSlotDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Kalender-Slot bearbeiten</DialogTitle>
            <DialogDescription>Änderungen betreffen nur Datum, Zeit und Bezeichnung — der Slot bleibt der Assistentin zugewiesen.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Bezeichnung</Label>
              <Input value={slotForm.title} onChange={(e) => setSlotForm({ ...slotForm, title: e.target.value })} placeholder="Slot-Bezeichnung..." />
            </div>
            <div className="space-y-2">
              <Label>Datum</Label>
              <Input type="date" value={slotForm.date} onChange={(e) => setSlotForm({ ...slotForm, date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Startzeit</Label>
              <Input type="time" value={slotForm.start_time} onChange={(e) => setSlotForm({ ...slotForm, start_time: e.target.value })} />
              <div className="flex flex-wrap gap-1">
                {TIME_PRESETS.map((t) => (
                  <button key={t} type="button" onClick={() => setSlotForm((f) => ({ ...f, start_time: t }))}
                    className={cn('px-1.5 py-0.5 rounded text-xs font-mono transition-colors',
                      slotForm.start_time === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    )}>{t}</button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Endzeit</Label>
              <Input type="time" value={slotForm.end_time} onChange={(e) => setSlotForm({ ...slotForm, end_time: e.target.value })} />
              <div className="flex flex-wrap gap-1">
                {TIME_PRESETS.map((t) => (
                  <button key={t} type="button" onClick={() => setSlotForm((f) => ({ ...f, end_time: t }))}
                    className={cn('px-1.5 py-0.5 rounded text-xs font-mono transition-colors',
                      slotForm.end_time === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    )}>{t}</button>
                ))}
              </div>
            </div>
            <label className="flex items-start gap-2.5 bg-gray-50 border border-gray-200 rounded-lg p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={slotForm.is_private}
                onChange={(e) => setSlotForm({ ...slotForm, is_private: e.target.checked })}
                className="mt-0.5 rounded border-gray-300"
              />
              <span className="text-sm">
                <span className="font-medium text-gray-700">Privat (unbezahlt)</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Zählt nicht zu Lohn, Anwesenheitsnachweis oder Bezirks-Budget.
                </p>
              </span>
            </label>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setSlotDialogOpen(false)} className="flex-1">Abbrechen</Button>
              <Button onClick={handleSaveSlot} disabled={savingSlot} className="flex-1">{savingSlot ? 'Speichern…' : 'Speichern'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTargetId} onOpenChange={(o) => !o && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eintrag löschen?</AlertDialogTitle>
            <AlertDialogDescription>Dieser Eintrag wird unwiderruflich gelöscht.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Combined List */}
      <div className="space-y-2">
        {allItems.length === 0 ? (
          <div className="bg-surface border border-gray-200 rounded-xl py-10 text-center text-gray-400 text-sm">
            {selectedId ? `Keine Einträge für ${format(currentMonth, 'MMMM yyyy', { locale: de })}` : 'Bitte Assistentin wählen'}
          </div>
        ) : (
          allItems.map((item) => {
            if (item.kind === 'entry') {
              const entry = item.data
              const hours = durationHours(entry.start_time, entry.end_time)
              const hasSlot = slotKeys.has(`${entry.date}|${entry.start_time}|${entry.end_time}`)
              return (
                <div key={`e-${entry.id}`} className="bg-surface border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-gray-900">{format(new Date(entry.date), 'dd.MM.yyyy')}</span>
                      <span className="text-gray-500 text-sm">{entry.start_time.slice(0, 5)} – {entry.end_time.slice(0, 5)} Uhr</span>
                      <Badge variant="outline" className="text-xs">{hours.toFixed(1)} h</Badge>
                      <Badge variant="outline" className="text-xs bg-gray-50 text-gray-500">Eintrag</Badge>
                      {entry.is_private && (
                        <Badge className="text-xs bg-gray-200 text-gray-600 border-gray-300 hover:bg-gray-200">Privat</Badge>
                      )}
                      {!entry.is_private && !hasSlot && countMode !== 'entries' && (
                        <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
                          Kein Slot – zählt nicht für Lohn
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {(entry.activity as any)?.name ?? <span className="italic">Keine Tätigkeit</span>}
                      {entry.description && <span> · {entry.description}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(entry)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteTargetId(entry.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )
            } else {
              const slot = item.data
              const hours = durationHours(slot.start_time, slot.end_time)
              return (
                <div key={`s-${slot.id}`} className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-gray-900">{format(new Date(slot.date), 'dd.MM.yyyy')}</span>
                      <span className="text-gray-500 text-sm">{slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)} Uhr</span>
                      <Badge variant="outline" className="text-xs">{hours.toFixed(1)} h</Badge>
                      <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100">Kalender-Slot</Badge>
                      {slot.is_private && (
                        <Badge className="text-xs bg-gray-200 text-gray-600 border-gray-300 hover:bg-gray-200">Privat</Badge>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-blue-700 font-medium">{slot.title}</div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-800 hover:bg-blue-100" onClick={() => openEditSlot(slot)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )
            }
          })
        )}
      </div>
    </div>
  )
}

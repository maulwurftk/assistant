'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Activity } from '@/lib/types'
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
import { Plus, Pencil, X, Check, ChevronLeft, ChevronRight, CalendarPlus, Settings2, Clock, ArrowRightLeft, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'
import { de } from 'date-fns/locale'
import type { TemplateRow } from '@/lib/time-entry-template'
import { DEFAULT_TEMPLATE } from '@/lib/time-entry-template'

const TIME_PRESETS = ['07:00','07:30','08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','16:00','17:00']
const WEEKDAY_SHORT: Record<number, string> = { 0: 'So', 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa' }

interface Assistant { id: string; full_name: string; email: string }
interface Props { assistants: Assistant[] }

interface Slot {
  id: string
  date: string
  start_time: string
  end_time: string
  title: string
  description: string | null
  status: 'open' | 'pending' | 'assigned' | 'cancelled'
  is_private: boolean
  assigned_to: string | null
  pending_request_by: string | null
  confirmed_at: string | null
  actual_start_time: string | null
  actual_end_time: string | null
  activity_id: string | null
  self_reported: boolean | null
  activity?: { name: string } | null
}

interface SlotForm {
  title: string
  date: string
  start_time: string
  end_time: string
  activity_id: string
  description: string
  is_private: boolean
}

const emptySlotForm: SlotForm = {
  title: '', date: format(new Date(), 'yyyy-MM-dd'),
  start_time: '08:00', end_time: '10:00',
  activity_id: '', description: '', is_private: false,
}

function generatePreview(year: number, month: number, existingSlots: Slot[], template: TemplateRow[]) {
  const existingKeys = new Set(existingSlots.map((s) => `${s.date}|${s.start_time.slice(0, 5)}`))
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
  const [adminId, setAdminId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState(assistants[0]?.id ?? '')
  const [slots, setSlots] = useState<Slot[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [unmatchedEntryCount, setUnmatchedEntryCount] = useState(0)

  // Slot form (Anlegen/Bearbeiten)
  const [form, setForm] = useState<SlotForm>(emptySlotForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Template state
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const [template, setTemplate] = useState<TemplateRow[]>(DEFAULT_TEMPLATE)
  const [editingTemplate, setEditingTemplate] = useState<TemplateRow[]>(DEFAULT_TEMPLATE)
  const [creatingTemplate, setCreatingTemplate] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [transferring, setTransferring] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setAdminId(user.id) })
    supabase.from('activities').select('*').eq('active', true).order('sort_order')
      .then(({ data }) => setActivities(data ?? []))
    fetch('/api/admin/time-entries/template-config')
      .then((r) => r.json())
      .then(({ template: t }) => { if (t) { setTemplate(t); setEditingTemplate(t) } })
      .catch(() => {})
  }, [])

  const loadSlots = useCallback(async () => {
    if (!selectedId) return
    const dateFrom = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
    const dateTo = format(endOfMonth(currentMonth), 'yyyy-MM-dd')

    const [slotsRes, entriesRes] = await Promise.all([
      supabase
        .from('calendar_slots')
        .select('id, date, start_time, end_time, title, description, status, is_private, assigned_to, pending_request_by, confirmed_at, actual_start_time, actual_end_time, activity_id, self_reported, activity:activities(name)')
        .or(`assigned_to.eq.${selectedId},pending_request_by.eq.${selectedId}`)
        .neq('status', 'cancelled')
        .gte('date', dateFrom).lte('date', dateTo)
        .order('date').order('start_time'),
      supabase
        .from('time_entries')
        .select('date, start_time, end_time, is_private')
        .eq('assistant_id', selectedId)
        .eq('is_private', false)
        .gte('date', dateFrom).lte('date', dateTo),
    ])
    const slotRows = (slotsRes.data ?? []) as unknown as Slot[]
    setSlots(slotRows)

    // Legacy-Zeiterfassungseinträge ohne passenden Slot (gleiches Datum + Zeit) –
    // Altdaten aus der Zeit vor dem Slot-Bestätigungssystem, die noch übernommen werden können.
    const ownSlotKeys = new Set(
      slotRows.filter((s) => s.assigned_to === selectedId).map((s) => `${s.date}|${s.start_time}|${s.end_time}`)
    )
    const unmatched = (entriesRes.data ?? []).filter(
      (e) => !ownSlotKeys.has(`${e.date}|${e.start_time}|${e.end_time}`)
    ).length
    setUnmatchedEntryCount(unmatched)
  }, [selectedId, currentMonth])

  useEffect(() => { loadSlots() }, [loadSlots])

  function openNew() {
    setEditId(null)
    setForm({ ...emptySlotForm, date: format(startOfMonth(currentMonth), 'yyyy-MM-dd') })
    setDialogOpen(true)
  }

  function openEdit(slot: Slot) {
    setEditId(slot.id)
    setForm({
      title: slot.title,
      date: slot.date,
      start_time: slot.start_time.slice(0, 5),
      end_time: slot.end_time.slice(0, 5),
      activity_id: slot.activity_id ?? '',
      description: slot.description ?? '',
      is_private: slot.is_private,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (form.start_time >= form.end_time) { toast.error('Endzeit muss nach der Startzeit liegen'); return }
    if (!form.title.trim()) { toast.error('Bitte eine Bezeichnung eingeben'); return }
    setSaving(true)

    if (editId) {
      const res = await fetch(`/api/admin/calendar-slots/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title, date: form.date, start_time: form.start_time, end_time: form.end_time,
          is_private: form.is_private,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) toast.error(data.error ?? 'Fehler beim Speichern')
      else { toast.success('Einsatz aktualisiert'); setDialogOpen(false); loadSlots() }
    } else {
      if (!adminId) { toast.error('Bitte kurz warten und erneut versuchen'); setSaving(false); return }
      const now = new Date().toISOString()
      const { error } = await supabase.from('calendar_slots').insert({
        date: form.date,
        start_time: form.start_time,
        end_time: form.end_time,
        title: form.title.trim(),
        description: form.description || null,
        activity_id: form.activity_id || null,
        assigned_to: selectedId,
        created_by: adminId,
        status: 'assigned',
        is_private: form.is_private,
        // Manuell vom Admin erfasste Einsätze gelten als bereits geleistet und bestätigt.
        confirmed_at: now,
        confirmed_by: adminId,
        actual_start_time: form.start_time,
        actual_end_time: form.end_time,
      } as never)
      if (error) toast.error('Fehler beim Speichern: ' + error.message)
      else { toast.success('Einsatz hinzugefügt'); setDialogOpen(false); loadSlots() }
    }
    setSaving(false)
  }

  async function handleCancelSlot() {
    if (!cancelTargetId) return
    const { error } = await supabase.from('calendar_slots').update({ status: 'cancelled' } as never).eq('id', cancelTargetId)
    if (error) toast.error('Fehler beim Entfernen')
    else { toast.success('Einsatz entfernt'); loadSlots() }
    setCancelTargetId(null)
  }

  async function handleToggleConfirm(slot: Slot) {
    setBusyId(slot.id)
    try {
      if (slot.confirmed_at) {
        const res = await fetch(`/api/calendar-slots/${slot.id}/confirm`, { method: 'DELETE' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) toast.error(data.error ?? 'Fehler')
        else { toast.success('Bestätigung zurückgenommen'); loadSlots() }
      } else {
        const res = await fetch(`/api/calendar-slots/${slot.id}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actual_start_time: slot.actual_start_time || slot.start_time,
            actual_end_time: slot.actual_end_time || slot.end_time,
            activity_id: slot.activity_id,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) toast.error(data.error ?? 'Fehler')
        else { toast.success('Bestätigt – zählt jetzt zur Lohnabrechnung'); loadSlots() }
      }
    } finally {
      setBusyId(null)
    }
  }

  async function handleApproveDeny(slot: Slot, action: 'approve' | 'deny') {
    setBusyId(slot.id)
    try {
      const res = await fetch('/api/slot-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_id: slot.id, action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) toast.error(data.error ?? 'Fehler')
      else { toast.success(action === 'approve' ? 'Genehmigt' : 'Abgelehnt'); loadSlots() }
    } finally {
      setBusyId(null)
    }
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
      toast.success(data.skipped > 0 ? `${data.created} Einsätze angelegt, ${data.skipped} übersprungen` : `${data.created} Einsätze angelegt`)
      setTemplateDialogOpen(false); loadSlots()
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
    else { toast.success(`${data.created} Alteintrag${data.created === 1 ? '' : 'e'} als Einsatz übernommen`); loadSlots() }
    setTransferring(false)
  }

  function updateRow(i: number, patch: Partial<TemplateRow>) {
    setEditingTemplate((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }
  function removeRow(i: number) { setEditingTemplate((prev) => prev.filter((_, idx) => idx !== i)) }
  function addRow() { setEditingTemplate((prev) => [...prev, { jsDay: 1, start: '08:00', end: '10:00', activityName: activities[0]?.name ?? '' }]) }

  const relevantSlots = slots.filter((s) => s.status !== 'pending' && !s.is_private)
  const confirmedSlots = relevantSlots.filter((s) => s.confirmed_at)
  const totalHours = confirmedSlots.reduce(
    (acc, s) => acc + durationHours(s.actual_start_time || s.start_time, s.actual_end_time || s.end_time),
    0
  )
  const pendingSlots = slots.filter((s) => s.status === 'pending')

  const selectedAssistant = assistants.find((a) => a.id === selectedId)
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth() + 1
  const preview = selectedId ? generatePreview(year, month, slots.filter((s) => s.assigned_to === selectedId), template) : { toCreate: 0, toSkip: 0 }

  const sortedSlots = [...slots].sort((a, b) => {
    const d = a.date.localeCompare(b.date)
    return d !== 0 ? d : a.start_time.localeCompare(b.start_time)
  })

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader
        icon={<Clock className="h-5 w-5" />}
        title="Einsätze verwalten"
        subtitle="Kalender-Slots von Assistentinnen einsehen, bestätigen und bearbeiten"
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

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-gray-500">
          {totalHours.toFixed(1)} Std. bestätigt · {confirmedSlots.length}/{relevantSlots.length} Einsätze
          {pendingSlots.length > 0 && <span className="text-violet-600"> · {pendingSlots.length} wartend</span>}
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
          {unmatchedEntryCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={!selectedId || transferring}
              onClick={handleTransferToSlots}
              title="Alte Zeiterfassungs-Einträge ohne passenden Einsatz übernehmen (Altdaten vor dem Slot-System)"
            >
              <ArrowRightLeft className="h-4 w-4 mr-1.5" />
              {transferring ? 'Übernehme…' : `${unmatchedEntryCount} Alteintrag${unmatchedEntryCount === 1 ? '' : 'e'} übernehmen`}
            </Button>
          )}
          <Button onClick={openNew} size="sm" disabled={!selectedId}>
            <Plus className="h-4 w-4 mr-1.5" />
            Einsatz hinzufügen
          </Button>
        </div>
      </div>

      {/* Template Config Dialog */}
      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Wöchentliche Vorlage anpassen</DialogTitle>
            <DialogDescription>Legt fest, welche Einsätze beim Klick auf „Vorlage erstellen" angelegt werden.</DialogDescription>
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
                    <X className="h-3.5 w-3.5" />
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
              <p className="text-emerald-800"><strong>{preview.toCreate} Einsätze</strong> werden angelegt{preview.toSkip > 0 && <span className="text-emerald-600"> · {preview.toSkip} bereits vorhanden</span>}</p>
            ) : (
              <p className="text-gray-500">Alle Einsätze für diesen Monat sind bereits vorhanden.</p>
            )}
          </div>
          <p className="text-xs text-gray-400">
            Neu angelegte Einsätze sind noch nicht bestätigt – die Assistentin bestätigt die Ist-Zeit im Kalender.
          </p>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)} className="flex-1">Abbrechen</Button>
            <Button onClick={handleCreateTemplate} disabled={creatingTemplate || preview.toCreate === 0} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
              {creatingTemplate ? 'Wird erstellt…' : `${preview.toCreate} Einsätze anlegen`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Einsatz bearbeiten' : `Neuer Einsatz für ${selectedAssistant?.full_name ?? ''}`}</DialogTitle>
            {!editId && (
              <DialogDescription>Wird direkt als bestätigt angelegt (bereits geleistete Zeit).</DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Bezeichnung</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="z.B. Nachmittagsbetreuung" />
            </div>
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
            {!editId && (
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
            )}
            <div className="space-y-2">
              <Label>Notizen <span className="text-gray-400 font-normal">(optional)</span></Label>
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

      {/* Cancel Confirmation */}
      <AlertDialog open={!!cancelTargetId} onOpenChange={(o) => !o && setCancelTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Einsatz entfernen?</AlertDialogTitle>
            <AlertDialogDescription>Dieser Einsatz wird storniert und zählt nicht mehr zur Lohnabrechnung.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelSlot} className="bg-red-600 hover:bg-red-700">Entfernen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* List */}
      <div className="space-y-2">
        {sortedSlots.length === 0 ? (
          <div className="bg-surface border border-gray-200 rounded-xl py-10 text-center text-gray-400 text-sm">
            {selectedId ? `Keine Einsätze für ${format(currentMonth, 'MMMM yyyy', { locale: de })}` : 'Bitte Assistentin wählen'}
          </div>
        ) : (
          sortedSlots.map((slot) => {
            const hours = durationHours(slot.actual_start_time || slot.start_time, slot.actual_end_time || slot.end_time)
            const isPending = slot.status === 'pending'
            return (
              <div key={slot.id} className={cn(
                'border rounded-xl px-4 py-3 flex items-center justify-between gap-3',
                isPending ? 'bg-violet-50 border-violet-200' : 'bg-surface border-gray-200'
              )}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-gray-900">{format(new Date(slot.date), 'dd.MM.yyyy')}</span>
                    <span className="text-gray-500 text-sm">{slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)} Uhr</span>
                    <Badge variant="outline" className="text-xs">{hours.toFixed(1)} h</Badge>
                    {slot.is_private && (
                      <Badge className="text-xs bg-gray-200 text-gray-600 border-gray-300 hover:bg-gray-200">Privat</Badge>
                    )}
                    {isPending ? (
                      <Badge className="text-xs bg-violet-100 text-violet-700 border-violet-200 hover:bg-violet-100">
                        {slot.self_reported ? 'Meldung – wartet auf Freigabe' : 'Anfrage – wartet auf Freigabe'}
                      </Badge>
                    ) : slot.confirmed_at ? (
                      <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Bestätigt
                      </Badge>
                    ) : (
                      <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
                        Nicht bestätigt
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {slot.title}
                    {(slot.activity as any)?.name && <span> · {(slot.activity as any).name}</span>}
                    {slot.description && <span> · {slot.description}</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {isPending ? (
                    <>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100" disabled={busyId === slot.id} onClick={() => handleApproveDeny(slot, 'approve')} title="Genehmigen">
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" disabled={busyId === slot.id} onClick={() => handleApproveDeny(slot, 'deny')} title="Ablehnen">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(slot)} title="Bearbeiten">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className={cn('h-8 w-8', slot.confirmed_at ? 'text-amber-600 hover:text-amber-800 hover:bg-amber-50' : 'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50')}
                        disabled={busyId === slot.id}
                        onClick={() => handleToggleConfirm(slot)}
                        title={slot.confirmed_at ? 'Bestätigung zurücknehmen' : 'Bestätigen'}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setCancelTargetId(slot.id)} title="Entfernen">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

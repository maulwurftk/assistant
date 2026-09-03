'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Profile, CalendarSlot, Activity } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { Plus, X, CalendarPlus, Copy, RefreshCw, CalendarDays, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { MonthlyCloseCard } from './_components/MonthlyCloseCard'

import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import { EventClickArg, DateSelectArg } from '@fullcalendar/core'

interface SlotForm {
  date: string
  start_time: string
  end_time: string
  title: string
  description: string
  assigned_to: string
  is_private: boolean
}

const emptyForm: SlotForm = {
  date: format(new Date(), 'yyyy-MM-dd'),
  start_time: '09:00',
  end_time: '13:00',
  title: '',
  description: '',
  assigned_to: '',
  is_private: false,
}

interface ProposeForm {
  date: string
  start_time: string
  end_time: string
  title: string
  description: string
  self_reported: boolean
  activity_id: string
  actual_start_time: string
  actual_end_time: string
}

const emptyProposeForm: ProposeForm = {
  date: format(new Date(), 'yyyy-MM-dd'),
  start_time: '09:00',
  end_time: '13:00',
  title: '',
  description: '',
  self_reported: false,
  activity_id: '',
  actual_start_time: '',
  actual_end_time: '',
}

const statusColors: Record<string, string> = {
  open: '#f59e0b',
  pending: '#8b5cf6',
  assigned: '#3b82f6',
  cancelled: '#9ca3af',
}

export default function KalenderPage() {
  const supabase = createClient()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [slots, setSlots] = useState<CalendarSlot[]>([])
  const [assistants, setAssistants] = useState<Profile[]>([])
  const [form, setForm] = useState<SlotForm>(emptyForm)
  const [editSlot, setEditSlot] = useState<CalendarSlot | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [proposeDialogOpen, setProposeDialogOpen] = useState(false)
  const [proposeForm, setProposeForm] = useState<ProposeForm>(emptyProposeForm)
  const [proposing, setProposing] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [icalUrl, setIcalUrl] = useState<string | null>(null)
  const [icalDialogOpen, setIcalDialogOpen] = useState(false)
  const [icalResetting, setIcalResetting] = useState(false)
  const [googleEvents, setGoogleEvents] = useState<object[]>([])
  const [isMobile, setIsMobile] = useState(false)
  const [privateColor, setPrivateColor] = useState('#a855f7')
  const [activities, setActivities] = useState<Activity[]>([])
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmActualStart, setConfirmActualStart] = useState('')
  const [confirmActualEnd, setConfirmActualEnd] = useState('')
  const [confirmActivityId, setConfirmActivityId] = useState('')
  const calendarRef = useRef<any>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    init()
  }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(p as unknown as Profile)

    // Assistenten für alle laden (für Farben im Kalender)
    const { data: asst } = await supabase
      .from('profiles')
      .select('id, full_name, color')
      .eq('role', 'assistant')
      .eq('active', true)
    setAssistants((asst ?? []) as unknown as Profile[])

    const { data: acts } = await supabase.from('activities').select('*').eq('active', true).order('sort_order')
    setActivities((acts ?? []) as unknown as Activity[])

    loadSlots()

    supabase.from('payroll_settings').select('private_slot_color').limit(1).single()
      .then(({ data }) => { if (data?.private_slot_color) setPrivateColor(data.private_slot_color) })

    if ((p as any)?.role === 'admin') {
      fetch('/api/google-calendar').then(r => r.json()).then(data => {
        if (Array.isArray(data)) setGoogleEvents(data)
      }).catch(() => {})
    }

    supabase.channel('calendar').on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_slots' }, loadSlots).subscribe()
  }

  async function loadSlots() {
    const { data } = await supabase
      .from('calendar_slots')
      .select('*')
      .neq('status', 'cancelled')
      .order('date')
    setSlots((data ?? []) as unknown as CalendarSlot[])
  }

  function handleDateSelect(info: DateSelectArg) {
    const date = info.startStr.slice(0, 10)
    const start_time = info.startStr.includes('T') ? info.startStr.slice(11, 16) : '09:00'
    const end_time = info.endStr?.includes('T') ? info.endStr.slice(11, 16) : '13:00'

    if (profile?.role === 'admin') {
      setEditSlot(null)
      setForm({ ...emptyForm, date, start_time, end_time })
      setDialogOpen(true)
      return
    }

    if (profile?.role === 'assistant') {
      setProposeForm({ ...emptyProposeForm, date, start_time, end_time })
      setProposeDialogOpen(true)
    }
  }

  async function handleProposeSlot() {
    if (proposeForm.start_time >= proposeForm.end_time) { toast.error('Endzeit muss nach Startzeit liegen'); return }
    if (!proposeForm.title.trim()) { toast.error('Bitte einen Titel eingeben'); return }
    if (proposeForm.self_reported && proposeForm.actual_start_time && proposeForm.actual_end_time
        && proposeForm.actual_start_time >= proposeForm.actual_end_time) {
      toast.error('Ist-Endzeit muss nach Ist-Startzeit liegen'); return
    }
    setProposing(true)
    try {
      const res = await fetch('/api/slot-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', ...proposeForm, activity_id: proposeForm.activity_id || null }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Fehler beim Senden des Vorschlags')
      } else {
        toast.success(
          proposeForm.self_reported
            ? 'Meldung gesendet – wartet auf Freigabe durch den Admin'
            : 'Terminvorschlag gesendet – der Admin wird benachrichtigt'
        )
        setProposeDialogOpen(false)
        loadSlots()
      }
    } catch {
      toast.error('Verbindungsfehler')
    }
    setProposing(false)
  }

  async function handleRequestSlot() {
    if (!editSlot) return
    setRequesting(true)
    try {
      const res = await fetch('/api/slot-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_id: editSlot.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Fehler beim Senden der Anfrage')
      } else {
        toast.success('Anfrage gesendet – der Admin wird benachrichtigt')
        setDialogOpen(false)
        loadSlots()
      }
    } catch {
      toast.error('Verbindungsfehler')
    }
    setRequesting(false)
  }

  async function handleConfirmSlot() {
    if (!editSlot) return
    setConfirming(true)
    try {
      const res = await fetch(`/api/calendar-slots/${editSlot.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actual_start_time: confirmActualStart || null,
          actual_end_time: confirmActualEnd || null,
          activity_id: confirmActivityId || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Fehler beim Bestätigen')
      } else {
        toast.success('Termin bestätigt – zählt jetzt zur Lohnabrechnung')
        setConfirmDialogOpen(false)
        setDialogOpen(false)
        loadSlots()
      }
    } catch {
      toast.error('Verbindungsfehler')
    }
    setConfirming(false)
  }

  function handleEventClick(info: EventClickArg) {
    if (info.event.extendedProps?.source === 'google') return
    const slot = slots.find(s => s.id === info.event.id)
    if (!slot) return
    setEditSlot(slot)
    setForm({
      date: slot.date,
      start_time: slot.start_time.slice(0, 5),
      end_time: slot.end_time.slice(0, 5),
      title: slot.title,
      description: slot.description ?? '',
      assigned_to: slot.assigned_to ?? '',
      is_private: slot.is_private ?? false,
    })
    setConfirmActualStart(slot.actual_start_time?.slice(0, 5) || slot.start_time.slice(0, 5))
    setConfirmActualEnd(slot.actual_end_time?.slice(0, 5) || slot.end_time.slice(0, 5))
    setConfirmActivityId(slot.activity_id ?? '')
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!profile) return
    if (form.start_time >= form.end_time) { toast.error('Endzeit muss nach Startzeit liegen'); return }
    if (!form.title.trim()) { toast.error('Bitte einen Titel eingeben'); return }
    setLoading(true)

    const payload = {
      date: form.date,
      start_time: form.start_time,
      end_time: form.end_time,
      title: form.title,
      description: form.description || null,
      assigned_to: form.assigned_to || null,
      status: form.assigned_to ? 'assigned' : 'open',
      is_private: form.is_private,
    }

    let error
    if (editSlot) {
      const r = await supabase.from('calendar_slots').update(payload as any).eq('id', editSlot.id)
      error = r.error
    } else {
      const r = await supabase.from('calendar_slots').insert({ ...payload, created_by: profile.id } as any)
      error = r.error
    }

    if (error) { toast.error('Fehler: ' + error.message) }
    else { toast.success(editSlot ? 'Slot aktualisiert' : 'Slot erstellt'); setDialogOpen(false); loadSlots() }
    setLoading(false)
  }

  async function handleDelete() {
    if (!editSlot) return
    const { error } = await supabase.from('calendar_slots').update({ status: 'cancelled' } as any).eq('id', editSlot.id)
    if (error) { toast.error('Fehler beim Löschen') }
    else { toast.success('Slot entfernt'); setDeleteDialogOpen(false); setDialogOpen(false); loadSlots() }
  }

  async function openIcalDialog() {
    if (!icalUrl) {
      const res = await fetch('/api/ical-token')
      const data = await res.json()
      setIcalUrl(data.url)
    }
    setIcalDialogOpen(true)
  }

  async function resetIcalToken() {
    setIcalResetting(true)
    const res = await fetch('/api/ical-token', { method: 'POST' })
    const data = await res.json()
    setIcalUrl(data.url)
    setIcalResetting(false)
    toast.success('Link zurückgesetzt – bitte in Google Kalender neu eintragen')
  }

  function copyIcalUrl() {
    if (!icalUrl) return
    navigator.clipboard.writeText(icalUrl)
    toast.success('Link kopiert!')
  }

  function openGoogleCalendar() {
    if (!icalUrl) return
    const encoded = encodeURIComponent(icalUrl)
    window.open(`https://calendar.google.com/calendar/r?cid=${encoded}`, '_blank')
  }

  // Farb- und Namens-Map: Assistent-ID → Farbe/Name (aus bereits geladener Liste)
  const assistantColorMap: Record<string, string> = {}
  const assistantNameMap: Record<string, string> = {}
  assistants.forEach(a => {
    assistantColorMap[a.id] = (a as any).color ?? statusColors.assigned
    assistantNameMap[a.id] = a.full_name
  })

  const calendarEvents = [...googleEvents, ...slots.map(slot => {
    const bgColor = slot.assigned_to
      ? (assistantColorMap[slot.assigned_to] ?? statusColors.assigned)
      : statusColors[slot.status]
    const assignedName = slot.assigned_to ? (assistantNameMap[slot.assigned_to] ?? null) : null
    const privateSuffix = slot.is_private ? ' 🔒 Privat' : ''
    return {
      id: slot.id,
      title: slot.title + (assignedName ? ` (${assignedName})` : '') + privateSuffix,
      start: `${slot.date}T${slot.start_time}`,
      end: `${slot.date}T${slot.end_time}`,
      backgroundColor: slot.is_private ? privateColor : bgColor,
      borderColor: slot.is_private ? privateColor : bgColor,
      textColor: '#fff',
    }
  })]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeader
          icon={<CalendarDays className="h-5 w-5" />}
          title="Kalender"
          subtitle="Gemeinsame Planung und Verfügbarkeit"
        />
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={openIcalDialog}>
            <CalendarPlus className="h-4 w-4 mr-2" /> Google Kalender
          </Button>
          {profile?.role === 'admin' && (
            <Button onClick={() => { setEditSlot(null); setForm(emptyForm); setDialogOpen(true) }}>
              <Plus className="h-4 w-4 mr-2" /> Slot hinzufügen
            </Button>
          )}
          {profile?.role === 'assistant' && (
            <Button onClick={() => { setProposeForm(emptyProposeForm); setProposeDialogOpen(true) }}>
              <Plus className="h-4 w-4 mr-2" /> Termin vorschlagen
            </Button>
          )}
        </div>
      </div>

      {/* Legende */}
      <div className="flex gap-3 text-sm flex-wrap items-center">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-amber-400" /> Offen</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-violet-500" /> Angefragt</div>
        {profile?.role === 'admin' && assistants.length > 0 ? (
          assistants.map(a => (
            <div key={a.id} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: (a as any).color ?? '#3b82f6' }} />
              {a.full_name}
            </div>
          ))
        ) : (
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-blue-500" /> Besetzt</div>
        )}
        {googleEvents.length > 0 && (
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#4285F4' }} /> Google Kalender</div>
        )}
        {slots.some(s => s.is_private) && (
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: privateColor }} /> Privat</div>
        )}
      </div>

      <Card>
        <CardContent className="p-2 sm:p-4">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
            initialView={isMobile ? 'listWeek' : 'dayGridMonth'}
            locale="de"
            firstDay={1}
            selectable={profile?.role === 'admin' || profile?.role === 'assistant'}
            select={handleDateSelect}
            eventClick={handleEventClick}
            events={calendarEvents}
            headerToolbar={isMobile ? {
              left: 'prev,next',
              center: 'title',
              right: 'listWeek,dayGridMonth',
            } : {
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,listWeek',
            }}
            buttonText={{
              today: 'Heute',
              month: 'Monat',
              week: 'Woche',
              list: 'Liste',
            }}
            height="auto"
            eventDisplay="block"
          />
        </CardContent>
      </Card>

      {profile?.role === 'assistant' && <MonthlyCloseCard userId={profile.id} />}

      {/* Slot Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editSlot ? 'Slot bearbeiten' : 'Neuer Slot'}</DialogTitle>
          </DialogHeader>

          {profile?.role === 'admin' ? (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Titel</Label>
                <Input placeholder="z.B. Nachmittagsbetreuung" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Datum</Label>
                <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Von</Label>
                  <Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Bis</Label>
                  <Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Assistent zuweisen <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Select value={form.assigned_to || 'none'} onValueChange={v => setForm({ ...form, assigned_to: (v === 'none' || !v) ? '' : v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Noch offen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Noch offen —</SelectItem>
                    {assistants.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: (a as any).color ?? '#6366f1' }} />
                          {a.full_name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notizen <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Textarea placeholder="Zusätzliche Informationen..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
              </div>
              <label className="flex items-start gap-2.5 bg-gray-50 border border-gray-200 rounded-lg p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_private}
                  onChange={e => setForm({ ...form, is_private: e.target.checked })}
                  className="mt-0.5 rounded border-gray-300"
                />
                <span className="text-sm">
                  <span className="font-medium text-gray-700">Privat (unbezahlt)</span>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Zählt nicht zu Lohn, Anwesenheitsnachweis oder Bezirks-Budget – bleibt aber für
                    beide Seiten im Kalender sichtbar.
                  </p>
                </span>
              </label>
              <div className="flex gap-2 pt-2">
                {editSlot && (
                  <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
                    <X className="h-3.5 w-3.5 mr-1" /> Entfernen
                  </Button>
                )}
                <div className="flex gap-2 ml-auto">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
                  <Button onClick={handleSave} disabled={loading}>{loading ? 'Speichern...' : 'Speichern'}</Button>
                </div>
              </div>
            </div>
          ) : (
            editSlot && (
              <div className="space-y-3 pt-2">
                <div>
                  <p className="text-sm text-gray-500">Datum</p>
                  <p className="font-medium">{format(new Date(editSlot.date), 'EEEE, dd. MMMM yyyy', { locale: de })}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Zeit</p>
                  <p className="font-medium">{editSlot.start_time.slice(0, 5)} – {editSlot.end_time.slice(0, 5)} Uhr</p>
                </div>
                {editSlot.description && (
                  <div>
                    <p className="text-sm text-gray-500">Notizen</p>
                    <p className="text-sm">{editSlot.description}</p>
                  </div>
                )}
                <div className="flex gap-2 flex-wrap">
                  <Badge style={{ backgroundColor: (editSlot.assigned_profile as any)?.color ?? statusColors[editSlot.status] }} className="text-white">
                    {editSlot.status === 'open'
                      ? 'Offen'
                      : editSlot.status === 'pending'
                        ? (editSlot.pending_request_by === profile?.id ? 'Von Ihnen vorgeschlagen / angefragt' : 'Angefragt')
                        : 'Besetzt'}
                  </Badge>
                  {editSlot.is_private && (
                    <Badge className="bg-gray-200 text-gray-600 border-gray-300 hover:bg-gray-200">Privat</Badge>
                  )}
                  {editSlot.status === 'assigned' && (
                    editSlot.confirmed_at ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Bestätigt
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
                        Noch nicht bestätigt
                      </Badge>
                    )
                  )}
                </div>

                {editSlot.status === 'assigned' && editSlot.assigned_to === profile?.id && !editSlot.confirmed_at && (
                  confirmDialogOpen ? (
                    <div className="space-y-3 bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                      <p className="text-xs text-emerald-800">
                        Bitte die tatsächlich geleistete Zeit bestätigen – erst danach zählt der Termin
                        zur Lohnabrechnung.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Ist-Beginn</Label>
                          <Input type="time" value={confirmActualStart} onChange={e => setConfirmActualStart(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Ist-Ende</Label>
                          <Input type="time" value={confirmActualEnd} onChange={e => setConfirmActualEnd(e.target.value)} />
                        </div>
                      </div>
                      {activities.length > 0 && (
                        <div className="space-y-1">
                          <Label className="text-xs">Tätigkeit <span className="text-gray-400 font-normal">(optional)</span></Label>
                          <Select value={confirmActivityId || 'none'} onValueChange={v => setConfirmActivityId((v === 'none' || !v) ? '' : v)}>
                            <SelectTrigger><SelectValue placeholder="Keine Angabe" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— Keine Angabe —</SelectItem>
                              {activities.map(a => (
                                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => setConfirmDialogOpen(false)}>Abbrechen</Button>
                        <Button size="sm" onClick={handleConfirmSlot} disabled={confirming}>
                          {confirming ? 'Bestätige…' : 'Bestätigen'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setConfirmDialogOpen(true)} className="w-full text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Ist-Zeit bestätigen
                    </Button>
                  )
                )}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Schließen</Button>
                  {editSlot.status === 'open' && (
                    <Button onClick={handleRequestSlot} disabled={requesting} className="flex-1">
                      {requesting ? 'Sende…' : 'Anfragen'}
                    </Button>
                  )}
                </div>
              </div>
            )
          )}
        </DialogContent>
      </Dialog>

      {/* Termin vorschlagen (Assistent) */}
      <Dialog open={proposeDialogOpen} onOpenChange={setProposeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Termin vorschlagen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-gray-500">
              {proposeForm.self_reported
                ? 'Sie melden einen Termin, der bereits stattgefunden hat. Er zählt erst nach Freigabe durch den Admin zur Lohnabrechnung.'
                : 'Ihr Vorschlag geht als Anfrage an den Admin und erscheint erst nach Genehmigung als fester Termin.'}
            </p>
            <label className="flex items-start gap-2.5 bg-gray-50 border border-gray-200 rounded-lg p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={proposeForm.self_reported}
                onChange={e => {
                  const checked = e.target.checked
                  setProposeForm(f => ({
                    ...f,
                    self_reported: checked,
                    actual_start_time: checked ? (f.actual_start_time || f.start_time) : f.actual_start_time,
                    actual_end_time: checked ? (f.actual_end_time || f.end_time) : f.actual_end_time,
                  }))
                }}
                className="mt-0.5 rounded border-gray-300"
              />
              <span className="text-sm">
                <span className="font-medium text-gray-700">Termin hat bereits stattgefunden</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Für nachträglich erfasste, ungeplante Einsätze – z.B. spontane Vertretung.
                </p>
              </span>
            </label>
            <div className="space-y-2">
              <Label>Titel</Label>
              <Input
                placeholder="z.B. Nachmittagsbetreuung"
                value={proposeForm.title}
                onChange={e => setProposeForm({ ...proposeForm, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Datum</Label>
              <Input
                type="date"
                value={proposeForm.date}
                onChange={e => setProposeForm({ ...proposeForm, date: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{proposeForm.self_reported ? 'Geplant von' : 'Von'}</Label>
                <Input
                  type="time"
                  value={proposeForm.start_time}
                  onChange={e => setProposeForm({ ...proposeForm, start_time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{proposeForm.self_reported ? 'Geplant bis' : 'Bis'}</Label>
                <Input
                  type="time"
                  value={proposeForm.end_time}
                  onChange={e => setProposeForm({ ...proposeForm, end_time: e.target.value })}
                />
              </div>
            </div>
            {proposeForm.self_reported && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Ist-Beginn</Label>
                    <Input
                      type="time"
                      value={proposeForm.actual_start_time}
                      onChange={e => setProposeForm({ ...proposeForm, actual_start_time: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Ist-Ende</Label>
                    <Input
                      type="time"
                      value={proposeForm.actual_end_time}
                      onChange={e => setProposeForm({ ...proposeForm, actual_end_time: e.target.value })}
                    />
                  </div>
                </div>
                {activities.length > 0 && (
                  <div className="space-y-2">
                    <Label>Tätigkeit <span className="text-gray-400 font-normal">(optional)</span></Label>
                    <Select value={proposeForm.activity_id || 'none'} onValueChange={v => setProposeForm({ ...proposeForm, activity_id: (v === 'none' || !v) ? '' : v })}>
                      <SelectTrigger><SelectValue placeholder="Keine Angabe" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Keine Angabe —</SelectItem>
                        {activities.map(a => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
            <div className="space-y-2">
              <Label>Notizen <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Textarea
                placeholder="Zusätzliche Informationen..."
                value={proposeForm.description}
                onChange={e => setProposeForm({ ...proposeForm, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setProposeDialogOpen(false)}>Abbrechen</Button>
              <Button onClick={handleProposeSlot} disabled={proposing}>
                {proposing ? 'Senden...' : (proposeForm.self_reported ? 'Melden' : 'Vorschlagen')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slot entfernen?</AlertDialogTitle>
            <AlertDialogDescription>Dieser Kalendereintrag wird entfernt.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Entfernen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Google Kalender / iCal Dialog */}
      <Dialog open={icalDialogOpen} onOpenChange={setIcalDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-emerald-600" />
              Mit Google Kalender verbinden
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-gray-600">
              Abonnieren Sie diesen Kalender in Google Kalender — alle Slots werden automatisch synchronisiert und aktualisiert.
            </p>

            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ihr persönlicher Kalender-Link</p>
              <div className="flex gap-2">
                <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-md px-3 py-2 break-all text-gray-700">
                  {icalUrl ?? 'Wird geladen...'}
                </code>
                <Button variant="outline" size="icon" onClick={copyIcalUrl} title="Link kopieren" className="shrink-0">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-gray-400">
                Dieser Link ist persönlich — geben Sie ihn nicht weiter.
              </p>
            </div>

            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-4 space-y-3">
              <p className="text-sm font-medium text-emerald-900">So fügen Sie den Kalender hinzu:</p>
              <ol className="text-sm text-emerald-800 space-y-1.5 list-decimal list-inside">
                <li>Klicken Sie auf <strong>"In Google Kalender öffnen"</strong></li>
                <li>Google Kalender öffnet sich mit einem Bestätigungsdialog</li>
                <li>Auf <strong>"Hinzufügen"</strong> klicken</li>
                <li>✅ Die Slots erscheinen in Ihrem Google Kalender</li>
              </ol>
              <p className="text-xs text-emerald-600">
                Google aktualisiert den Kalender automatisch (ca. alle 12–24 Stunden).
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={resetIcalToken}
                disabled={icalResetting}
                className="text-gray-500 text-xs"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${icalResetting ? 'animate-spin' : ''}`} />
                Link zurücksetzen
              </Button>
              <div className="flex-1" />
              <Button variant="outline" onClick={() => setIcalDialogOpen(false)}>Schließen</Button>
              <Button onClick={openGoogleCalendar} disabled={!icalUrl}>
                <CalendarPlus className="h-4 w-4 mr-2" />
                In Google Kalender öffnen
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Profile, CalendarSlot } from '@/lib/types'
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
import { Plus, X, CalendarPlus, Copy, RefreshCw, CalendarDays } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

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
  const [icalUrl, setIcalUrl] = useState<string | null>(null)
  const [icalDialogOpen, setIcalDialogOpen] = useState(false)
  const [icalResetting, setIcalResetting] = useState(false)
  const [ownTimeEntries, setOwnTimeEntries] = useState<any[]>([])
  const [showOwnEntries, setShowOwnEntries] = useState(true)
  const [googleEvents, setGoogleEvents] = useState<object[]>([])
  const [isMobile, setIsMobile] = useState(false)
  const [privateColor, setPrivateColor] = useState('#a855f7')
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

    loadSlots()

    supabase.from('payroll_settings').select('private_slot_color').limit(1).single()
      .then(({ data }) => { if (data?.private_slot_color) setPrivateColor(data.private_slot_color) })

    // Load own time entries for assistants – shown in calendar to detect conflicts
    if ((p as any)?.role === 'assistant') {
      const { data: entries } = await supabase
        .from('time_entries')
        .select('id, date, start_time, end_time')
        .eq('assistant_id', user.id)
      setOwnTimeEntries(entries ?? [])
    }

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
    if (profile?.role !== 'admin') return
    setEditSlot(null)
    setForm({
      ...emptyForm,
      date: info.startStr.slice(0, 10),
      start_time: info.startStr.includes('T') ? info.startStr.slice(11, 16) : '09:00',
      end_time: info.endStr?.includes('T') ? info.endStr.slice(11, 16) : '13:00',
    })
    setDialogOpen(true)
  }

  function handleEventClick(info: EventClickArg) {
    if (info.event.extendedProps?.source === 'google') return
    if (info.event.extendedProps?.source === 'own-entry') return
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

  const ownEntryEvents = (profile?.role === 'assistant' && showOwnEntries)
    ? ownTimeEntries.map((e: any) => ({
        id: `own-${e.id}`,
        title: 'Eigener Eintrag',
        start: `${e.date}T${e.start_time}`,
        end: `${e.date}T${e.end_time}`,
        backgroundColor: '#d1d5db',
        borderColor: '#9ca3af',
        textColor: '#4b5563',
        extendedProps: { source: 'own-entry' },
      }))
    : []

  const calendarEvents = [...googleEvents, ...ownEntryEvents, ...slots.map(slot => {
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
        {profile?.role === 'assistant' && (
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showOwnEntries}
              onChange={e => setShowOwnEntries(e.target.checked)}
              className="rounded border-gray-300 text-gray-500 focus:ring-gray-400"
            />
            <div className="w-3 h-3 rounded-full bg-gray-400" />
            Eigene Einträge
          </label>
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
            selectable={profile?.role === 'admin'}
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
                <div className="flex gap-2">
                  <Badge style={{ backgroundColor: (editSlot.assigned_profile as any)?.color ?? statusColors[editSlot.status] }} className="text-white">
                    {editSlot.status === 'open' ? 'Offen' : 'Besetzt'}
                  </Badge>
                  {editSlot.is_private && (
                    <Badge className="bg-gray-200 text-gray-600 border-gray-300 hover:bg-gray-200">Privat</Badge>
                  )}
                </div>
                <Button variant="outline" onClick={() => setDialogOpen(false)} className="w-full">Schließen</Button>
              </div>
            )
          )}
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

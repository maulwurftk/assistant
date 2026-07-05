'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TodoTemplate, TodoRecurrence, Activity, Profile } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react'

// Wochentag-Beschriftung → Zahlenwert exakt wie Migration-Constraint
// todo_templates_weekday_ck (weekday between 0 and 6) und JS Date.getDay():
// 0=So, 1=Mo, 2=Di, 3=Mi, 4=Do, 5=Fr, 6=Sa.
const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Sonntag' },
  { value: 1, label: 'Montag' },
  { value: 2, label: 'Dienstag' },
  { value: 3, label: 'Mittwoch' },
  { value: 4, label: 'Donnerstag' },
  { value: 5, label: 'Freitag' },
  { value: 6, label: 'Samstag' },
]

const RECURRENCE_LABELS: Record<TodoRecurrence, string> = {
  per_shift: 'Pro Dienst',
  daily: 'Täglich',
  weekly: 'Wöchentlich',
}

interface FormState {
  title: string
  description: string
  recurrence: TodoRecurrence
  weekday: number | null
  activity_id: string
  assignee_id: string
  active: boolean
  sort_order: number
}

const emptyForm: FormState = {
  title: '',
  description: '',
  recurrence: 'per_shift',
  weekday: null,
  activity_id: '',
  assignee_id: '',
  active: true,
  sort_order: 0,
}

export function TemplatesTab() {
  const supabase = createClient()
  const [templates, setTemplates] = useState<TodoTemplate[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [assistants, setAssistants] = useState<Profile[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TodoTemplate | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadTemplates()
    loadActivities()
    loadAssistants()
  }, [])

  async function loadTemplates() {
    const { data } = await supabase
      .from('todo_templates')
      .select('*, activity:activities(name), assignee:profiles!assignee_id(full_name)')
      .order('sort_order')
    setTemplates((data ?? []) as unknown as TodoTemplate[])
  }

  async function loadActivities() {
    const { data } = await supabase.from('activities').select('*').eq('active', true).order('sort_order')
    setActivities(data ?? [])
  }

  async function loadAssistants() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'assistant')
      .eq('active', true)
      .order('full_name')
    setAssistants((data ?? []) as unknown as Profile[])
  }

  function openNew() {
    setEditId(null)
    setForm({ ...emptyForm, sort_order: templates.length > 0 ? Math.max(...templates.map((t) => t.sort_order)) + 1 : 0 })
    setDialogOpen(true)
  }

  function openEdit(t: TodoTemplate) {
    setEditId(t.id)
    setForm({
      title: t.title,
      description: t.description ?? '',
      recurrence: t.recurrence,
      weekday: t.weekday,
      activity_id: t.activity_id ?? '',
      assignee_id: t.assignee_id ?? '',
      active: t.active,
      sort_order: t.sort_order,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.title.trim()) { toast.error('Bitte einen Titel eingeben'); return }
    if (form.recurrence === 'weekly' && form.weekday === null) {
      toast.error('Bitte einen Wochentag wählen'); return
    }
    setLoading(true)

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      recurrence: form.recurrence,
      weekday: form.recurrence === 'weekly' ? form.weekday : null,
      activity_id: form.activity_id || null,
      assignee_id: form.assignee_id || null,
      active: form.active,
      sort_order: form.sort_order,
    }

    let error
    if (editId) {
      const r = await supabase.from('todo_templates').update(payload).eq('id', editId)
      error = r.error
    } else {
      const r = await supabase.from('todo_templates').insert(payload)
      error = r.error
    }

    if (error) { toast.error('Fehler: ' + error.message) }
    else { toast.success(editId ? 'Vorlage aktualisiert' : 'Vorlage angelegt'); setDialogOpen(false); loadTemplates() }
    setLoading(false)
  }

  async function handleToggleActive(t: TodoTemplate) {
    const { error } = await supabase.from('todo_templates').update({ active: !t.active }).eq('id', t.id)
    if (error) { toast.error('Fehler') }
    else { toast.success(t.active ? 'Vorlage deaktiviert' : 'Vorlage aktiviert'); loadTemplates() }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const { error } = await supabase.from('todo_templates').delete().eq('id', deleteTarget.id)
    if (error) { toast.error('Fehler beim Löschen: ' + error.message) }
    else { toast.success('Vorlage gelöscht'); setDeleteTarget(null); loadTemplates() }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" /> Neue Vorlage
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {templates.length === 0 ? (
            <p className="text-center py-8 text-gray-500">Noch keine Vorlagen angelegt.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-medium text-sm ${!t.active ? 'text-gray-400 line-through' : ''}`}>
                        {t.title}
                      </span>
                      <Badge variant="outline" className="text-xs">{RECURRENCE_LABELS[t.recurrence]}</Badge>
                      {t.recurrence === 'weekly' && t.weekday !== null && (
                        <Badge variant="secondary" className="text-xs">
                          {WEEKDAY_OPTIONS.find((w) => w.value === t.weekday)?.label}
                        </Badge>
                      )}
                      {!t.active && <Badge variant="secondary" className="text-xs">Inaktiv</Badge>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t.activity?.name ?? 'Keine Tätigkeit'} · {t.assignee?.full_name ?? 'Alle Assistenten'}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-500"
                      onClick={() => handleToggleActive(t)}
                      title={t.active ? 'Deaktivieren' : 'Aktivieren'}
                    >
                      {t.active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setDeleteTarget(t)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? 'Vorlage bearbeiten' : 'Neue Vorlage'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Titel</Label>
              <Input
                placeholder="z.B. Mistkübel ausräumen"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Beschreibung <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Textarea
                placeholder="Zusätzliche Hinweise..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Wiederholung</Label>
              <Select
                value={form.recurrence}
                onValueChange={(v) => setForm({ ...form, recurrence: (v as TodoRecurrence) ?? 'per_shift', weekday: v === 'weekly' ? form.weekday : null })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_shift">Pro Dienst</SelectItem>
                  <SelectItem value="daily">Täglich</SelectItem>
                  <SelectItem value="weekly">Wöchentlich</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.recurrence === 'weekly' && (
              <div className="space-y-2">
                <Label>Wochentag</Label>
                <Select
                  value={form.weekday !== null ? String(form.weekday) : undefined}
                  onValueChange={(v) => setForm({ ...form, weekday: v ? Number(v) : null })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Wochentag wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAY_OPTIONS.map((w) => (
                      <SelectItem key={w.value} value={String(w.value)}>{w.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Tätigkeit <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Select
                value={form.activity_id || 'none'}
                onValueChange={(v) => setForm({ ...form, activity_id: (v === 'none' || !v) ? '' : v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Keine Tätigkeit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Keine Tätigkeit —</SelectItem>
                  {activities.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Zuweisung <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Select
                value={form.assignee_id || 'none'}
                onValueChange={(v) => setForm({ ...form, assignee_id: (v === 'none' || !v) ? '' : v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Alle Assistenten" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Alle Assistenten —</SelectItem>
                  {assistants.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Reihenfolge</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Button
                  type="button"
                  variant={form.active ? 'default' : 'outline'}
                  className="w-full"
                  onClick={() => setForm({ ...form, active: !form.active })}
                >
                  {form.active ? 'Aktiv' : 'Inaktiv'}
                </Button>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Abbrechen</Button>
              <Button onClick={handleSave} disabled={loading} className="flex-1">
                {loading ? 'Speichern...' : 'Speichern'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vorlage löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.title}&quot; wird permanent gelöscht. Bereits erfasste Abhakungen bleiben erhalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

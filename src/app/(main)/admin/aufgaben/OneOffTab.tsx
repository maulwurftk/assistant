'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Todo, TodoStatus, Activity, Profile } from '@/lib/types'
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
import { toast } from 'sonner'
import { Plus, Ban, CheckCheck, CheckCircle2 } from 'lucide-react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

interface FormState {
  title: string
  description: string
  activity_id: string
  assignee_id: string
  due_date: string
}

const emptyForm: FormState = { title: '', description: '', activity_id: '', assignee_id: '', due_date: '' }

const STATUS_LABELS: Record<TodoStatus, string> = {
  open: 'Offen',
  done: 'Erledigt',
  cancelled: 'Storniert',
}

function isOverdue(todo: Todo) {
  if (!todo.due_date || todo.status !== 'open') return false
  return todo.due_date < format(new Date(), 'yyyy-MM-dd')
}

export function OneOffTab() {
  const supabase = createClient()
  const [todos, setTodos] = useState<Todo[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [assistants, setAssistants] = useState<Profile[]>([])
  const [statusFilter, setStatusFilter] = useState<TodoStatus | 'all'>('open')
  const [form, setForm] = useState<FormState>(emptyForm)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    loadTodos()
    loadActivities()
    loadAssistants()
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  async function loadTodos() {
    // Kein Embed-Hint für activity/assignee: seit Migration 0014 gibt es je
    // zwei FKs auf activities/profiles (Einzelspalte + Tenant-Composite),
    // PostgREST liefert dann 300 Multiple Choices statt Daten (siehe
    // TemplatesTab/MonitoringTab). Getrennte Query statt Embed.
    const { data, error } = await supabase
      .from('todos')
      .select('*')
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (error) { toast.error('Fehler beim Laden: ' + error.message); return }
    const rows = (data ?? []) as unknown as Todo[]

    const activityIds = Array.from(new Set(rows.map((r) => r.activity_id).filter(Boolean) as string[]))
    const assigneeIds = Array.from(new Set(rows.map((r) => r.assignee_id).filter(Boolean) as string[]))

    const [{ data: acts }, { data: assignees }] = await Promise.all([
      activityIds.length
        ? supabase.from('activities').select('id, name').in('id', activityIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      assigneeIds.length
        ? supabase.from('profiles').select('id, full_name').in('id', assigneeIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    ])
    const activityMap = new Map((acts ?? []).map((a) => [a.id, a]))
    const assigneeMap = new Map((assignees ?? []).map((a) => [a.id, a]))

    setTodos(
      rows.map((r) => ({
        ...r,
        activity: r.activity_id ? activityMap.get(r.activity_id) ?? null : null,
        assignee: r.assignee_id ? assigneeMap.get(r.assignee_id) ?? null : null,
      })) as unknown as Todo[]
    )
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
    setForm(emptyForm)
    setDialogOpen(true)
  }

  async function handleCreate() {
    if (!form.title.trim()) { toast.error('Bitte einen Titel eingeben'); return }
    if (!userId) { toast.error('Nicht angemeldet'); return }
    setLoading(true)

    const { error } = await supabase.from('todos').insert({
      title: form.title.trim(),
      description: form.description.trim() || null,
      activity_id: form.activity_id || null,
      assignee_id: form.assignee_id || null,
      due_date: form.due_date || null,
      created_by: userId,
    })

    if (error) { toast.error('Fehler: ' + error.message) }
    else { toast.success('Aufgabe angelegt'); setDialogOpen(false); loadTodos() }
    setLoading(false)
  }

  async function handleCancel(todo: Todo) {
    const { error } = await supabase.from('todos').update({ status: 'cancelled' }).eq('id', todo.id)
    if (error) { toast.error('Fehler: ' + error.message) }
    else { toast.success('Aufgabe storniert'); loadTodos() }
  }

  async function handleConfirm(todo: Todo) {
    if (!userId) return
    const { error } = await supabase
      .from('todos')
      .update({ confirmed_by: userId, confirmed_at: new Date().toISOString() })
      .eq('id', todo.id)
    if (error) { toast.error('Fehler: ' + error.message) }
    else { toast.success('Aufgabe abgenommen'); loadTodos() }
  }

  const filtered = statusFilter === 'all' ? todos : todos.filter((t) => t.status === statusFilter)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter((v as TodoStatus | 'all') ?? 'open')}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="open">Offen</SelectItem>
            <SelectItem value="done">Erledigt</SelectItem>
            <SelectItem value="cancelled">Storniert</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" /> Neue Einmalaufgabe
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="text-center py-8 text-gray-500">Keine Aufgaben in dieser Ansicht.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{t.title}</span>
                      <Badge
                        variant={t.status === 'open' ? 'outline' : t.status === 'done' ? 'secondary' : 'destructive'}
                        className="text-xs"
                      >
                        {STATUS_LABELS[t.status]}
                      </Badge>
                      {isOverdue(t) && <Badge variant="destructive" className="text-xs">Überfällig</Badge>}
                      {t.confirmed_at && (
                        <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1 text-xs">
                          <CheckCheck className="h-3 w-3" /> Abgenommen
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t.assignee?.full_name ?? 'Alle Assistenten'}
                      {t.activity?.name ? ` · ${t.activity.name}` : ''}
                      {t.due_date ? ` · Fällig ${format(new Date(t.due_date), 'dd.MM.yyyy', { locale: de })}` : ''}
                    </p>
                    {t.note && <p className="text-xs text-gray-500 mt-1 italic">„{t.note}“</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {t.status === 'done' && !t.confirmed_at && (
                      <Button size="sm" variant="outline" onClick={() => handleConfirm(t)}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Abnehmen
                      </Button>
                    )}
                    {t.status === 'open' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleCancel(t)}
                      >
                        <Ban className="h-3.5 w-3.5 mr-1" /> Stornieren
                      </Button>
                    )}
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
            <DialogTitle>Neue Einmalaufgabe</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Titel</Label>
              <Input
                placeholder="z.B. Kinotickets für Freitag besorgen"
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
                  <SelectValue placeholder="Wer zuerst kann" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Wer zuerst kann —</SelectItem>
                  {assistants.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fällig am <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Abbrechen</Button>
              <Button onClick={handleCreate} disabled={loading} className="flex-1">
                {loading ? 'Speichern...' : 'Anlegen'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

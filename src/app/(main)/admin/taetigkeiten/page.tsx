'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Activity } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { Plus, Pencil, Trash2, GripVertical, Eye, EyeOff, Tag } from 'lucide-react'
import { PageHeader } from '@/components/page-header'

export default function TaetigkeitenPage() {
  const supabase = createClient()
  const [activities, setActivities] = useState<Activity[]>([])
  const [form, setForm] = useState({ name: '', report_label: '', default_description: '' })
  const [editId, setEditId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Activity | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { loadActivities() }, [])

  async function loadActivities() {
    const { data } = await supabase.from('activities').select('*').order('sort_order').order('name')
    setActivities(data ?? [])
  }

  function openNew() {
    setEditId(null)
    setForm({ name: '', report_label: '', default_description: '' })
    setDialogOpen(true)
  }

  function openEdit(a: Activity) {
    setEditId(a.id)
    setForm({ name: a.name, report_label: a.report_label ?? '', default_description: a.default_description ?? '' })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Bitte einen Namen eingeben'); return }
    setLoading(true)
    const fields = {
      name: form.name.trim(),
      report_label: form.report_label.trim() || null,
      default_description: form.default_description.trim() || null,
    }

    let error
    if (editId) {
      const r = await supabase.from('activities').update({ ...fields }).eq('id', editId)
      error = r.error
    } else {
      const maxOrder = activities.length > 0 ? Math.max(...activities.map(a => a.sort_order)) + 1 : 0
      const r = await supabase.from('activities').insert({ ...fields, sort_order: maxOrder, active: true })
      error = r.error
    }

    if (error) { toast.error('Fehler: ' + error.message) }
    else { toast.success(editId ? 'Tätigkeit aktualisiert' : 'Tätigkeit hinzugefügt'); setDialogOpen(false); loadActivities() }
    setLoading(false)
  }

  async function handleToggleActive(a: Activity) {
    const { error } = await supabase.from('activities').update({ active: !a.active }).eq('id', a.id)
    if (error) { toast.error('Fehler') }
    else { toast.success(a.active ? 'Tätigkeit ausgeblendet' : 'Tätigkeit eingeblendet'); loadActivities() }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const { error } = await supabase.from('activities').delete().eq('id', deleteTarget.id)
    if (error) { toast.error('Kann nicht gelöscht werden (wird noch verwendet)') }
    else { toast.success('Tätigkeit gelöscht'); setDeleteTarget(null); loadActivities() }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          icon={<Tag className="h-5 w-5" />}
          title="Tätigkeiten"
          subtitle="Anpassbares Dropdown-Menü für die Zeiterfassung"
          tone="violet"
        />
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" /> Neue Tätigkeit
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-gray-500">
            {activities.filter(a => a.active).length} aktive · {activities.filter(a => !a.active).length} ausgeblendet
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {activities.length === 0 ? (
            <p className="text-center py-8 text-gray-500">Noch keine Tätigkeiten angelegt.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {activities.map(a => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <GripVertical className="h-4 w-4 text-gray-300 shrink-0" />
                  <span className={`flex-1 min-w-0 text-sm ${!a.active ? 'text-gray-400 line-through' : ''}`}>
                    <span className="font-medium">{a.name}</span>
                    {a.report_label && <span className="block text-xs text-gray-500">Im Bericht: {a.report_label}</span>}
                    {a.default_description && <span className="block text-xs text-gray-400 truncate">{a.default_description}</span>}
                  </span>
                  {!a.active && <Badge variant="secondary" className="text-xs">Ausgeblendet</Badge>}
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-500"
                      onClick={() => handleToggleActive(a)}
                      title={a.active ? 'Ausblenden' : 'Einblenden'}
                    >
                      {a.active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setDeleteTarget(a)}
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

      <Card className="bg-gray-50 border-dashed">
        <CardContent className="pt-4">
          <p className="text-sm text-gray-500">
            <strong>Tipp:</strong> Mit „Kategorie im Bericht“ lassen sich viele konkrete Tätigkeiten (z.B. „Spielplatz mit Kind“) einer Leistungsart aus dem Bescheid zuordnen. Der Vorschlagstext landet beim Auswählen im Kalender automatisch in den Notizen.
          </p>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? 'Tätigkeit bearbeiten' : 'Neue Tätigkeit'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Name der Tätigkeit</Label>
              <Input
                placeholder="z.B. Ausflug"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Kategorie im Bericht <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input
                placeholder="z.B. Elternassistenz – Freizeit mit Kind"
                value={form.report_label}
                onChange={e => setForm({ ...form, report_label: e.target.value })}
              />
              <p className="text-xs text-gray-500">Erscheint im Tätigkeitsbericht statt des Namens. Leer = Name.</p>
            </div>
            <div className="space-y-2">
              <Label>Vorschlagstext <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Textarea
                placeholder="Wird beim Auswählen in die Notizen übernommen"
                value={form.default_description}
                onChange={e => setForm({ ...form, default_description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Abbrechen</Button>
              <Button onClick={handleSave} disabled={loading} className="flex-1">
                {loading ? 'Speichern...' : 'Speichern'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tätigkeit löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.name}&quot; wird permanent gelöscht. Bestehende Einträge behalten die Bezeichnung.
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

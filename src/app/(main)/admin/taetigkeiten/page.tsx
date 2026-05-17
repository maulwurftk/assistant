'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Activity } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Plus, Pencil, Trash2, GripVertical, Eye, EyeOff } from 'lucide-react'

export default function TaetigkeitenPage() {
  const supabase = createClient()
  const [activities, setActivities] = useState<Activity[]>([])
  const [form, setForm] = useState({ name: '' })
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
    setForm({ name: '' })
    setDialogOpen(true)
  }

  function openEdit(a: Activity) {
    setEditId(a.id)
    setForm({ name: a.name })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Bitte einen Namen eingeben'); return }
    setLoading(true)

    let error
    if (editId) {
      const r = await supabase.from('activities').update({ name: form.name.trim() }).eq('id', editId)
      error = r.error
    } else {
      const maxOrder = activities.length > 0 ? Math.max(...activities.map(a => a.sort_order)) + 1 : 0
      const r = await supabase.from('activities').insert({ name: form.name.trim(), sort_order: maxOrder, active: true })
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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tätigkeiten</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Anpassbares Dropdown-Menü für die Zeiterfassung
          </p>
        </div>
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
                  <span className={`flex-1 font-medium text-sm ${!a.active ? 'text-gray-400 line-through' : ''}`}>
                    {a.name}
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
            <strong>Vorschläge:</strong> Ausflug, Kinderzimmer aufräumen, Hausaufgaben, Kochen/Mahlzeiten, Persönliche Pflege, Arztbegleitung, Einkaufen, Freizeit/Spiel
          </p>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editId ? 'Tätigkeit bearbeiten' : 'Neue Tätigkeit'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Name der Tätigkeit</Label>
              <Input
                placeholder="z.B. Ausflug"
                value={form.name}
                onChange={e => setForm({ name: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                autoFocus
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

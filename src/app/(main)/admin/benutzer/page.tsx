'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { Plus, UserCheck, UserX, Users } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { format } from 'date-fns'

interface NewUserForm {
  email: string
  full_name: string
  password: string
  role: 'assistant' | 'admin'
}

const emptyForm: NewUserForm = { email: '', full_name: '', password: '', role: 'assistant' }

export default function BenutzerPage() {
  const supabase = createClient()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [form, setForm] = useState<NewUserForm>(emptyForm)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [deactivateTarget, setDeactivateTarget] = useState<Profile | null>(null)

  useEffect(() => { loadProfiles() }, [])

  async function loadProfiles() {
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setProfiles((data ?? []) as unknown as Profile[])
  }

  async function handleCreate() {
    if (!form.email || !form.full_name || !form.password) {
      toast.error('Bitte alle Pflichtfelder ausfüllen')
      return
    }
    if (form.password.length < 8) {
      toast.error('Passwort muss mindestens 8 Zeichen haben')
      return
    }
    setLoading(true)

    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    const data = await res.json()
    if (!res.ok) {
      toast.error('Fehler: ' + (data.error ?? 'Unbekannter Fehler'))
    } else {
      toast.success(`Benutzer "${form.full_name}" wurde erstellt`)
      setDialogOpen(false)
      setForm(emptyForm)
      loadProfiles()
    }
    setLoading(false)
  }

  async function toggleActive(profile: Profile, active: boolean) {
    const { error } = await supabase.from('profiles').update({ active } as any).eq('id', profile.id)
    if (error) {
      toast.error('Fehler beim Aktualisieren')
    } else {
      toast.success(active ? `${profile.full_name} wurde aktiviert` : `${profile.full_name} wurde deaktiviert`)
      loadProfiles()
    }
    setDeactivateTarget(null)
  }

  async function updateColor(profileId: string, color: string) {
    await supabase.from('profiles').update({ color } as any).eq('id', profileId)
    setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, color } : p))
  }

  async function updateMinijobLimit(profileId: string, value: number | null) {
    setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, minijob_limit: value } : p))
    const res = await fetch('/api/payroll/assistant-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assistantId: profileId, minijob_limit: value }),
    })
    if (!res.ok) {
      toast.error('Fehler beim Speichern der Minijobgrenze')
      loadProfiles()
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          icon={<Users className="h-5 w-5" />}
          title="Benutzerverwaltung"
          subtitle={`${profiles.filter(p => p.active).length} aktive Benutzer`}
        />
        <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" /> Neuer Benutzer</Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Neuen Benutzer anlegen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Vollständiger Name</Label>
              <Input placeholder="Maria Muster" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>E-Mail-Adresse</Label>
              <Input type="email" placeholder="maria@beispiel.de" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Passwort (mind. 8 Zeichen)</Label>
              <Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Rolle</Label>
              <Select value={form.role} onValueChange={v => setForm({ ...form, role: (v ?? 'assistant') as any })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="assistant">Assistent</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Abbrechen</Button>
              <Button onClick={handleCreate} disabled={loading} className="flex-1">
                {loading ? 'Erstellen...' : 'Benutzer erstellen'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>E-Mail</TableHead>
                <TableHead>Rolle</TableHead>
                <TableHead>Farbe</TableHead>
                <TableHead>Minijobgrenze</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Erstellt</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map(p => (
                <TableRow key={p.id} className={!p.active ? 'opacity-50' : ''}>
                  <TableCell className="font-medium">{p.full_name}</TableCell>
                  <TableCell className="text-sm text-gray-600">{p.email}</TableCell>
                  <TableCell>
                    <Badge variant={p.role === 'admin' ? 'default' : 'secondary'} className="text-xs">
                      {p.role === 'admin' ? 'Admin' : 'Assistent'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {p.role === 'assistant' ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={p.color ?? '#6366f1'}
                          onChange={e => updateColor(p.id, e.target.value)}
                          className="w-8 h-8 rounded cursor-pointer border border-gray-200 p-0.5 bg-surface"
                          title="Kalenderfarbe ändern"
                        />
                        <span className="text-xs text-gray-400 font-mono">{p.color ?? '#6366f1'}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.role === 'assistant' ? (
                      <MinijobLimitInput
                        value={p.minijob_limit ?? null}
                        onSave={(v) => updateMinijobLimit(p.id, v)}
                      />
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.active ? 'outline' : 'secondary'} className={p.active ? 'text-green-700 border-green-300 bg-green-50' : 'text-gray-500'}>
                      {p.active ? 'Aktiv' : 'Inaktiv'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {format(new Date(p.created_at), 'dd.MM.yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    {p.active ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setDeactivateTarget(p)}
                      >
                        <UserX className="h-4 w-4 mr-1" /> Deaktivieren
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-green-600 hover:text-green-700 hover:bg-green-50"
                        onClick={() => toggleActive(p, true)}
                      >
                        <UserCheck className="h-4 w-4 mr-1" /> Aktivieren
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!deactivateTarget} onOpenChange={(o) => !o && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Benutzer deaktivieren?</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivateTarget?.full_name} kann sich nach der Deaktivierung nicht mehr anmelden. Die Daten bleiben erhalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deactivateTarget && toggleActive(deactivateTarget, false)}
              className="bg-red-600 hover:bg-red-700"
            >
              Deaktivieren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function MinijobLimitInput({
  value,
  onSave,
}: {
  value: number | null
  onSave: (value: number | null) => void
}) {
  const [text, setText] = useState(value != null ? String(value).replace('.', ',') : '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setText(value != null ? String(value).replace('.', ',') : '')
  }, [value])

  async function commit() {
    const trimmed = text.trim()
    const next = trimmed === '' ? null : parseFloat(trimmed.replace(',', '.'))
    if (next !== null && (isNaN(next) || next < 0)) {
      toast.error('Bitte einen gültigen Betrag eingeben')
      setText(value != null ? String(value).replace('.', ',') : '')
      return
    }
    if (next === value) return
    setSaving(true)
    await onSave(next)
    setSaving(false)
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        placeholder="kein Limit"
        disabled={saving}
        className="w-24 h-8 text-xs tabular-nums"
      />
      <span className="text-xs text-gray-400">€</span>
    </div>
  )
}

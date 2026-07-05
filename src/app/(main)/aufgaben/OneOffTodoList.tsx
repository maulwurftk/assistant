'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ClipboardList, CheckCheck } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import type { Todo } from '@/lib/types'

interface Props {
  todos: Todo[]
}

function isOverdue(todo: Todo) {
  if (!todo.due_date) return false
  const today = format(new Date(), 'yyyy-MM-dd')
  return todo.due_date < today
}

export function OneOffTodoList({ todos }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [target, setTarget] = useState<Todo | null>(null)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  if (todos.length === 0) return null

  function openComplete(todo: Todo) {
    setTarget(todo)
    setNote('')
  }

  async function handleComplete() {
    if (!target) return
    setLoading(true)
    const { error } = await supabase.rpc('complete_todo', {
      p_id: target.id,
      p_note: note.trim() || null,
    })
    setLoading(false)
    if (error) {
      toast.error('Fehler: ' + error.message)
      return
    }
    toast.success('Aufgabe erledigt')
    setTarget(null)
    router.refresh()
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-violet-500" />
            Einmalaufgaben
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
            {todos.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{t.title}</p>
                  {t.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {t.activity?.name && (
                      <span className="text-xs text-gray-400">{t.activity.name}</span>
                    )}
                    {t.due_date && (
                      <Badge variant={isOverdue(t) ? 'destructive' : 'outline'} className="text-xs">
                        Fällig {format(new Date(t.due_date), 'dd.MM.yyyy', { locale: de })}
                      </Badge>
                    )}
                  </div>
                </div>
                <Button size="sm" className="shrink-0" onClick={() => openComplete(t)}>
                  <CheckCheck className="h-3.5 w-3.5 mr-1" /> Erledigen
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Aufgabe erledigen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-gray-700">{target?.title}</p>
            <Textarea
              placeholder="Notiz (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setTarget(null)} className="flex-1">Abbrechen</Button>
              <Button onClick={handleComplete} disabled={loading} className="flex-1">
                {loading ? 'Speichern...' : 'Erledigen'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

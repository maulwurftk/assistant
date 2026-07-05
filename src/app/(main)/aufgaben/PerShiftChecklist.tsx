'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Circle, Undo2, CheckCheck, CalendarClock } from 'lucide-react'
import { toast } from 'sonner'
import type { CalendarSlot, TodoTemplate, TodoCheck } from '@/lib/types'

interface Props {
  slots: CalendarSlot[]
  templates: TodoTemplate[]
  checks: TodoCheck[]
  userId: string
}

function canUndo(check: TodoCheck, userId: string) {
  if (check.done_by !== userId) return false
  if (check.confirmed_at) return false
  return Date.now() - new Date(check.done_at).getTime() < 24 * 60 * 60 * 1000
}

export function PerShiftChecklist({ slots, templates, checks, userId }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [pending, setPending] = useState<Set<string>>(new Set())

  if (templates.length === 0) return null

  function checkFor(templateId: string, slotId: string) {
    return checks.find((c) => c.template_id === templateId && c.slot_id === slotId)
  }

  async function handleToggle(templateId: string, slotId: string, existing: TodoCheck | undefined) {
    const key = `${templateId}-${slotId}`
    setPending((prev) => new Set(prev).add(key))
    try {
      if (existing) {
        const { error } = await supabase.from('todo_checks').delete().eq('id', existing.id)
        if (error) { toast.error('Konnte nicht rückgängig gemacht werden: ' + error.message); return }
        toast.success('Rückgängig gemacht')
      } else {
        const { error } = await supabase.from('todo_checks').insert({
          template_id: templateId,
          slot_id: slotId,
          done_by: userId,
        })
        if (error) { toast.error('Fehler beim Abhaken: ' + error.message); return }
        toast.success('Abgehakt')
      }
      router.refresh()
    } finally {
      setPending((prev) => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-sky-500" />
          Heute im Dienst
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {slots.map((slot) => (
          <div key={slot.id} className="space-y-2">
            <p className="text-sm font-medium text-gray-700">
              {slot.title} · {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)} Uhr
            </p>
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
              {templates.map((t) => {
                const existing = checkFor(t.id, slot.id)
                const key = `${t.id}-${slot.id}`
                const isPending = pending.has(key)
                const undoable = existing ? canUndo(existing, userId) : false
                return (
                  <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                    <button
                      type="button"
                      disabled={isPending || (!!existing && !undoable)}
                      onClick={() => handleToggle(t.id, slot.id, existing)}
                      className="shrink-0 disabled:opacity-60"
                      title={existing ? (undoable ? 'Rückgängig machen' : 'Abgehakt') : 'Abhaken'}
                    >
                      {existing ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <Circle className="h-5 w-5 text-gray-300" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${existing ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                        {t.title}
                      </p>
                      {t.activity?.name && (
                        <p className="text-xs text-gray-400">{t.activity.name}</p>
                      )}
                    </div>
                    {existing?.confirmed_at && (
                      <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1 shrink-0">
                        <CheckCheck className="h-3 w-3" /> Abgenommen
                      </Badge>
                    )}
                    {existing && undoable && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0 text-gray-400"
                        disabled={isPending}
                        onClick={() => handleToggle(t.id, slot.id, existing)}
                        title="Rückgängig"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

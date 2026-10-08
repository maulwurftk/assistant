'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ABSENCE_STATUS_LABELS, ABSENCE_TYPE_LABELS, formatDays } from '@/lib/vacation'
import { formatMinutes } from '@/lib/payroll'

export type AbsenceListItem = {
  id: string
  assistant_id: string
  type: string
  status: string
  date_from: string
  date_to: string
  days: number
  minutes_per_day: number | null
  note: string | null
  decision_note: string | null
}

const de = (iso: string) => iso.split('-').reverse().join('.')

const statusTone: Record<string, string> = {
  requested: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  cancelled: 'bg-slate-100 text-slate-500',
}

export function AbsenceList({
  items,
  names,
  onAction,
  canDecide = false,
  canCancelApproved = false,
}: {
  items: AbsenceListItem[]
  names?: Record<string, string>
  onAction: (id: string, action: 'approve' | 'reject' | 'cancel') => void
  canDecide?: boolean
  canCancelApproved?: boolean
}) {
  if (!items.length) return <p className="text-sm text-slate-400">Keine Einträge.</p>
  return (
    <div className="divide-y divide-slate-100">
      {items.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-800">
              {names?.[a.assistant_id] ? `${names[a.assistant_id]} · ` : ''}
              {ABSENCE_TYPE_LABELS[a.type] ?? a.type} · {de(a.date_from)}{a.date_to !== a.date_from ? `–${de(a.date_to)}` : ''}
            </p>
            <p className="text-xs text-slate-500">
              {Number(a.days) > 0 && formatDays(Number(a.days))}
              {a.minutes_per_day ? ` · ${formatMinutes(a.minutes_per_day)} je Tag bezahlt` : ''}
              {a.note ? ` · „${a.note}"` : ''}
              {a.decision_note ? ` · Antwort: ${a.decision_note}` : ''}
            </p>
          </div>
          <Badge className={statusTone[a.status] ?? ''}>{ABSENCE_STATUS_LABELS[a.status] ?? a.status}</Badge>
          <div className="flex gap-1.5">
            {canDecide && a.status === 'requested' && (
              <>
                <Button size="sm" onClick={() => onAction(a.id, 'approve')}>Genehmigen</Button>
                <Button size="sm" variant="outline" onClick={() => onAction(a.id, 'reject')}>Ablehnen</Button>
              </>
            )}
            {(a.status === 'requested' || (canCancelApproved && a.status === 'approved')) && (
              <Button size="sm" variant="ghost" onClick={() => onAction(a.id, 'cancel')}>Stornieren</Button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export async function absenceAction(id: string, action: 'approve' | 'reject' | 'cancel', note?: string) {
  const res = await fetch(`/api/urlaub/absences/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, note }),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error ?? 'Aktion fehlgeschlagen')
  return d as { freedSlots?: number }
}

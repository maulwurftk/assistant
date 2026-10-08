'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { VacationRequestForm } from '@/components/urlaub/request-form'
import { AbsenceList, absenceAction, type AbsenceListItem } from '@/components/urlaub/absence-list'
import { BalanceOverview } from '@/components/urlaub/balance-overview'
import { balancesByYear, type YearBalance } from '@/lib/vacation'

type Notice = { id: string; leave_year: number; message: string; read_at: string | null }

export function UrlaubView({ userId }: { userId: string }) {
  const [supabase] = useState(() => createClient())
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [carryover, setCarryover] = useState('03-31')
  const [balances, setBalances] = useState<YearBalance[]>([])
  const [absences, setAbsences] = useState<AbsenceListItem[]>([])
  const [notices, setNotices] = useState<Notice[]>([])

  const load = useCallback(async () => {
    const [settingsRes, ledgerRes, absRes, noticeRes] = await Promise.all([
      supabase.from('payroll_settings').select('vacation_enabled, vacation_carryover_until').limit(1).maybeSingle(),
      supabase.from('leave_ledger').select('leave_year, kind, days').eq('assistant_id', userId),
      supabase.from('absences')
        .select('id, assistant_id, type, status, date_from, date_to, days, minutes_per_day, note, decision_note')
        .eq('assistant_id', userId).neq('type', 'vacation_payout')
        .order('date_from', { ascending: false }).limit(50),
      supabase.from('vacation_notices').select('id, leave_year, message, read_at').eq('assistant_id', userId).is('read_at', null),
    ])
    setEnabled(settingsRes.data?.vacation_enabled ?? false)
    setCarryover(settingsRes.data?.vacation_carryover_until ?? '03-31')
    setBalances(balancesByYear((ledgerRes.data ?? []).map((l) => ({ ...l, days: Number(l.days) }))))
    setAbsences((absRes.data ?? []) as unknown as AbsenceListItem[])
    setNotices((noticeRes.data ?? []) as Notice[])
  }, [supabase, userId])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- Daten beim Mount laden (setState erst nach await)
  useEffect(() => { load() }, [load])

  async function handleAction(id: string, action: 'approve' | 'reject' | 'cancel') {
    if (action !== 'cancel') return
    if (!confirm('Antrag wirklich zurückziehen?')) return
    try {
      await absenceAction(id, 'cancel')
      toast.success('Antrag zurückgezogen')
      load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function markRead(id: string) {
    const res = await fetch(`/api/urlaub/notices/${id}`, { method: 'POST' })
    if (res.ok) setNotices((n) => n.filter((x) => x.id !== id))
  }

  if (enabled === null) return <p className="text-sm text-slate-400">Lade …</p>
  if (!enabled) {
    return (
      <Card><CardContent className="py-8 text-center text-slate-500">
        Die Urlaubsverwaltung ist für euer Team noch nicht aktiviert.
      </CardContent></Card>
    )
  }

  return (
    <div className="space-y-6">
      {notices.map((n) => (
        <div key={n.id} className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-2">
          <p className="text-sm text-amber-900">{n.message}</p>
          <Button size="sm" variant="outline" onClick={() => markRead(n.id)}>Gelesen</Button>
        </div>
      ))}

      <Card>
        <CardHeader><CardTitle>Mein Urlaubskonto</CardTitle></CardHeader>
        <CardContent><BalanceOverview balances={balances} carryoverUntil={carryover} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Urlaub beantragen / krank melden</CardTitle></CardHeader>
        <CardContent><VacationRequestForm onDone={load} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Meine Anträge</CardTitle></CardHeader>
        <CardContent><AbsenceList items={absences} onAction={handleAction} /></CardContent>
      </Card>
    </div>
  )
}

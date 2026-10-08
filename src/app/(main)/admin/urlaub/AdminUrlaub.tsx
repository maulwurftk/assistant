'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { VacationRequestForm, selectClass } from '@/components/urlaub/request-form'
import { AbsenceList, absenceAction, type AbsenceListItem } from '@/components/urlaub/absence-list'
import { BalanceOverview } from '@/components/urlaub/balance-overview'
import { balancesByYear, formatDays, LEDGER_KIND_LABELS } from '@/lib/vacation'
import { formatCurrency } from '@/lib/payroll'
import { AlertTriangle, Printer } from 'lucide-react'

type Assistant = { id: string; full_name: string; active: boolean; employment_start: string | null; employment_end: string | null }
type LedgerRow = { id: string; assistant_id: string; leave_year: number; kind: string; days: number; note: string | null; created_at: string }
type Term = {
  id: string; assistant_id: string; valid_from: string; valid_until: string | null; days_per_week: number | null
  weekly_hours: number | null; base_days: number | null; extra_days: number; job_title: string | null; note: string | null
  notice_sent_at: string | null
}
type Notice = { assistant_id: string; leave_year: number; sent_at: string; read_at: string | null }
type Settings = {
  vacation_enabled: boolean; vacation_base_days: number; vacation_holiday_region: string; vacation_notice_month: number
  vacation_carryover_until: string; hourly_rate: number; bezirk_mode: boolean; currency: string
}

const de = (iso: string | null) => (iso ? iso.split('-').reverse().join('.') : '–')
const year = new Date().getFullYear()

async function post(url: string, body: unknown, method = 'POST') {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error ?? 'Fehler')
  return d
}

export function AdminUrlaub() {
  const [supabase] = useState(() => createClient())
  const [settings, setSettings] = useState<Settings | null>(null)
  const [assistants, setAssistants] = useState<Assistant[]>([])
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [absences, setAbsences] = useState<(AbsenceListItem & { workdays: string[] })[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const [personId, setPersonId] = useState('')
  const [tab, setTab] = useState('uebersicht')

  const load = useCallback(async () => {
    const since = `${year - 2}-01-01`
    const [s, a, l, ab, t, n] = await Promise.all([
      supabase.from('payroll_settings')
        .select('vacation_enabled, vacation_base_days, vacation_holiday_region, vacation_notice_month, vacation_carryover_until, hourly_rate, bezirk_mode, currency')
        .limit(1).maybeSingle(),
      supabase.from('profiles').select('id, full_name, active, employment_start, employment_end').eq('role', 'assistant').order('full_name'),
      supabase.from('leave_ledger').select('id, assistant_id, leave_year, kind, days, note, created_at').order('created_at'),
      supabase.from('absences')
        .select('id, assistant_id, type, status, date_from, date_to, workdays, days, minutes_per_day, note, decision_note')
        .gte('date_to', since).order('date_from', { ascending: false }),
      supabase.from('employment_terms').select('*').order('valid_from'),
      supabase.from('vacation_notices').select('assistant_id, leave_year, sent_at, read_at'),
    ])
    setSettings((s.data as unknown as Settings) ?? null)
    const as = (a.data ?? []) as Assistant[]
    setAssistants(as)
    setPersonId((p) => p || as.find((x) => x.active)?.id || as[0]?.id || '')
    setLedger(((l.data ?? []) as LedgerRow[]).map((r) => ({ ...r, days: Number(r.days) })))
    setAbsences((ab.data ?? []) as unknown as (AbsenceListItem & { workdays: string[] })[])
    setTerms(((t.data ?? []) as unknown as Term[]))
    setNotices((n.data ?? []) as Notice[])
  }, [supabase])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- Daten beim Mount laden (setState erst nach await)
  useEffect(() => { load() }, [load])

  const names = useMemo(() => Object.fromEntries(assistants.map((a) => [a.id, a.full_name])), [assistants])
  const activeAssistants = assistants.filter((a) => a.active)

  async function handleAction(id: string, action: 'approve' | 'reject' | 'cancel') {
    let note: string | undefined
    if (action === 'reject') {
      const n = prompt('Begründung für die Ablehnung (optional):')
      if (n === null) return
      note = n
    }
    if (action === 'cancel' && !confirm('Wirklich stornieren? Genommene Tage werden dem Konto wieder gutgeschrieben.')) return
    try {
      const d = await absenceAction(id, action, note)
      toast.success(action === 'approve'
        ? `Genehmigt${d.freedSlots ? ` – ${d.freedSlots} Dienst(e) freigegeben, Kolleginnen benachrichtigt` : ''}`
        : action === 'reject' ? 'Abgelehnt' : 'Storniert')
      load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (!settings) return <p className="text-sm text-slate-400">Lade …</p>

  const open = absences.filter((a) => a.status === 'requested')

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
      <TabsList>
        <TabsTrigger value="uebersicht">Übersicht{open.length ? ` (${open.length})` : ''}</TabsTrigger>
        <TabsTrigger value="person">Person</TabsTrigger>
        <TabsTrigger value="einstellungen">Einstellungen</TabsTrigger>
      </TabsList>

      <TabsContent value="uebersicht" className="pt-4 space-y-6">
        {!settings.vacation_enabled && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            Die Urlaubsverwaltung ist noch nicht aktiv. Unter <button className="underline" onClick={() => setTab('einstellungen')}>Einstellungen</button> einschalten –
            danach wird der Jahresanspruch für alle Assistentinnen automatisch gebucht.
          </div>
        )}
        <Card>
          <CardHeader><CardTitle>Offene Anträge</CardTitle></CardHeader>
          <CardContent><AbsenceList items={open} names={names} onAction={handleAction} canDecide /></CardContent>
        </Card>
        <Overview
          assistants={activeAssistants}
          ledger={ledger}
          absences={absences}
          terms={terms}
          notices={notices}
          settings={settings}
          onOpen={(id) => { setPersonId(id); setTab('person') }}
        />
        {settings.vacation_enabled && (
          <Card>
            <CardHeader><CardTitle>Abwesenheit eintragen</CardTitle>
              <CardDescription>Urlaub, Krankheit, Sonderurlaub oder unbezahlte Freistellung für eine Assistentin erfassen.</CardDescription>
            </CardHeader>
            <CardContent><VacationRequestForm admin assistants={activeAssistants} onDone={load} /></CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="person" className="pt-4 space-y-6">
        <div className="max-w-xs">
          <Label>Assistentin</Label>
          <select className={selectClass} value={personId} onChange={(e) => setPersonId(e.target.value)}>
            {assistants.map((a) => <option key={a.id} value={a.id}>{a.full_name}{a.active ? '' : ' (inaktiv)'}</option>)}
          </select>
        </div>
        {personId && (
          <Person
            key={personId}
            assistant={assistants.find((a) => a.id === personId)!}
            ledger={ledger.filter((l) => l.assistant_id === personId)}
            absences={absences.filter((a) => a.assistant_id === personId)}
            terms={terms.filter((t) => t.assistant_id === personId)}
            settings={settings}
            onChanged={load}
            onAction={handleAction}
          />
        )}
      </TabsContent>

      <TabsContent value="einstellungen" className="pt-4">
        <SettingsCard settings={settings} onSaved={load} />
      </TabsContent>
    </Tabs>
  )
}

// ── Übersicht ────────────────────────────────────────────────────────────────
function Overview({
  assistants, ledger, absences, terms, notices, settings, onOpen,
}: {
  assistants: Assistant[]; ledger: LedgerRow[]; absences: (AbsenceListItem & { workdays: string[] })[]; terms: Term[]
  notices: Notice[]; settings: Settings; onOpen: (id: string) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const rows = assistants.map((a) => {
    const own = ledger.filter((l) => l.assistant_id === a.id)
    const balances = balancesByYear(own)
    const rest = Math.round(balances.reduce((s, b) => s + b.balance, 0) * 100) / 100
    const ent = own.filter((l) => l.kind === 'entitlement' && l.leave_year === year).reduce((s, l) => s + l.days, 0)
    const taken = -own.filter((l) => l.kind === 'taken' && l.leave_year === year).reduce((s, l) => s + l.days, 0)
    const requested = absences.filter((x) => x.assistant_id === a.id && x.status === 'requested' && x.type === 'vacation')
      .reduce((s, x) => s + Number(x.days), 0)
    const term = terms.filter((t) => t.assistant_id === a.id && t.valid_from <= today && (!t.valid_until || t.valid_until >= today)).pop()
    // Rückstellung ≈ Resttage × Ø-Stunden/Tag (aus Vertrag) × Stundensatz (im Bezirk-Modus inkl. AG-Kosten)
    const hoursPerDay = term?.weekly_hours && term?.days_per_week ? Number(term.weekly_hours) / Number(term.days_per_week) : null
    const provision = hoursPerDay && rest > 0 ? rest * hoursPerDay * Number(settings.hourly_rate) : null
    const noticeThisYear = notices.find((n) => n.assistant_id === a.id && n.leave_year === year)
    return { a, rest, ent, taken, requested, term, provision, noticeThisYear }
  })
  const totalProvision = rows.reduce((sum, r) => sum + (r.provision ?? 0), 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Urlaubskonten {year}</CardTitle>
        <CardDescription>
          Rückstellung = offener Urlaub × Ø Stunden/Tag × {formatCurrency(Number(settings.hourly_rate), settings.currency)}/h
          {settings.bezirk_mode ? ' (Bezirkssatz inkl. AG-Kosten)' : ''} – das Geld, das für Urlaubsentgelt aus Budget/Schwankungsreserve bereitstehen sollte.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2 font-medium">Assistentin</th>
              <th className="py-2 font-medium text-right">Anspruch {year}</th>
              <th className="py-2 font-medium text-right">Genommen</th>
              <th className="py-2 font-medium text-right">Beantragt</th>
              <th className="py-2 font-medium text-right">Rest gesamt</th>
              <th className="py-2 font-medium text-right">Rückstellung</th>
              <th className="py-2 font-medium">Hinweise</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.a.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => onOpen(r.a.id)}>
                <td className="py-2 font-medium text-slate-800">{r.a.full_name}</td>
                <td className="py-2 text-right tabular-nums">{r.ent.toLocaleString('de-DE')}</td>
                <td className="py-2 text-right tabular-nums">{r.taken.toLocaleString('de-DE')}</td>
                <td className="py-2 text-right tabular-nums">{r.requested ? r.requested.toLocaleString('de-DE') : '–'}</td>
                <td className="py-2 text-right tabular-nums font-semibold">{r.rest.toLocaleString('de-DE')}</td>
                <td className="py-2 text-right tabular-nums">{r.provision ? formatCurrency(r.provision, settings.currency) : '–'}</td>
                <td className="py-2 text-xs">
                  {!r.term && <span className="inline-flex items-center gap-1 text-rose-600"><AlertTriangle className="h-3 w-3" />keine Arbeitsbedingungen</span>}
                  {r.term && !r.term.weekly_hours && <span className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3 w-3" />Wochenstunden fehlen</span>}
                  {r.term && !r.term.notice_sent_at && <span className="block text-amber-600">Nachweis nicht ausgehändigt</span>}
                  {r.noticeThisYear && <span className="block text-slate-500">Resturlaub-Hinweis {de(r.noticeThisYear.sent_at.slice(0, 10))}</span>}
                  {!r.a.employment_start && <span className="block text-slate-400">Eintrittsdatum fehlt</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200">
              <td colSpan={5} className="py-2 font-semibold">Summe Rückstellung</td>
              <td className="py-2 text-right font-semibold tabular-nums">{formatCurrency(totalProvision, settings.currency)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </CardContent>
    </Card>
  )
}

// ── Person ───────────────────────────────────────────────────────────────────
function Person({
  assistant, ledger, absences, terms, settings, onChanged, onAction,
}: {
  assistant: Assistant; ledger: LedgerRow[]; absences: AbsenceListItem[]; terms: Term[]; settings: Settings
  onChanged: () => void; onAction: (id: string, action: 'approve' | 'reject' | 'cancel') => void
}) {
  const balances = balancesByYear(ledger)
  const rest = Math.round(balances.reduce((s, b) => s + b.balance, 0) * 100) / 100
  const [start, setStart] = useState(assistant.employment_start ?? '')
  const [end, setEnd] = useState(assistant.employment_end ?? '')
  const emptyTerm = { id: '', valid_from: '', valid_until: '', days_per_week: '', weekly_hours: '', base_days: '', extra_days: '0', job_title: 'Persönliche Assistenz', note: '' }
  const [termForm, setTermForm] = useState(emptyTerm)
  const [book, setBook] = useState({ kind: 'opening_balance', leave_year: String(year), days: '', note: '' })
  const [payout, setPayout] = useState({ days: rest > 0 ? String(rest) : '', date: assistant.employment_end ?? new Date().toISOString().slice(0, 10) })

  async function run(fn: () => Promise<unknown>, ok: string) {
    try { await fn(); toast.success(ok); onChanged() } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Beschäftigung</CardTitle>
          <CardDescription>Ein- und Austritt bestimmen Wartezeit, Teilurlaub (1/12 je Monat) und Abgeltung.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5"><Label>Eintritt</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Austritt</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          <Button onClick={() => run(() => post('/api/urlaub/terms', { action: 'employment', assistant_id: assistant.id, employment_start: start || null, employment_end: end || null }), 'Gespeichert, Anspruch neu berechnet')}>Speichern</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Arbeitsbedingungen</CardTitle>
          <CardDescription>
            Ersetzen den fehlenden schriftlichen Vertrag: Grundlage für Urlaubsanspruch und den Nachweis nach Nachweisgesetz.
            Ohne vereinbarte Wochenstunden gelten gesetzlich 20 h/Woche (§ 12 TzBfG) – bei Minijobs unbedingt eintragen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {terms.length === 0 && <p className="text-sm text-rose-600">Noch keine Arbeitsbedingungen hinterlegt.</p>}
          {terms.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm">
              <div className="flex-1 min-w-0">
                <p className="font-medium">ab {de(t.valid_from)}{t.valid_until ? ` bis ${de(t.valid_until)}` : ''} · {t.job_title ?? '–'}</p>
                <p className="text-slate-500">
                  {t.days_per_week ? `${Number(t.days_per_week).toLocaleString('de-DE')} Tage/Woche` : 'unregelmäßige Tage'}
                  {' · '}{t.weekly_hours ? `${Number(t.weekly_hours).toLocaleString('de-DE')} h/Woche` : 'Wochenstunden fehlen'}
                  {' · '}Urlaubsbasis {t.base_days ?? settings.vacation_base_days}{t.extra_days ? ` + ${t.extra_days}` : ''} (5-Tage-Woche)
                </p>
                <p className="text-xs text-slate-400">{t.notice_sent_at ? `Nachweis ausgehändigt am ${de(t.notice_sent_at.slice(0, 10))}` : 'Nachweis noch nicht ausgehändigt'}</p>
              </div>
              <Link href={`/payroll/nachweis/${assistant.id}?term=${t.id}`} target="_blank" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                <Printer className="h-4 w-4" />Nachweis
              </Link>
              {!t.notice_sent_at && (
                <Button size="sm" variant="outline" onClick={() => run(() => post('/api/urlaub/terms', { action: 'notice_sent', id: t.id }), 'Als ausgehändigt markiert')}>Ausgehändigt</Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setTermForm({
                id: t.id, valid_from: t.valid_from, valid_until: t.valid_until ?? '', days_per_week: t.days_per_week?.toString() ?? '',
                weekly_hours: t.weekly_hours?.toString() ?? '', base_days: t.base_days?.toString() ?? '', extra_days: String(t.extra_days ?? 0),
                job_title: t.job_title ?? '', note: t.note ?? '',
              })}>Bearbeiten</Button>
              <Button size="sm" variant="ghost" onClick={() => confirm('Bedingung löschen?') && run(async () => {
                const r = await fetch(`/api/urlaub/terms?id=${t.id}`, { method: 'DELETE' })
                if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Fehler')
              }, 'Gelöscht')}>Löschen</Button>
            </div>
          ))}

          <div className="rounded-lg bg-slate-50 p-3 space-y-3">
            <p className="text-sm font-medium">{termForm.id ? 'Bedingung bearbeiten' : 'Neue Bedingung'}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5"><Label>Gültig ab</Label><Input type="date" value={termForm.valid_from} onChange={(e) => setTermForm({ ...termForm, valid_from: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Gültig bis <span className="text-slate-400 font-normal">(leer = offen)</span></Label><Input type="date" value={termForm.valid_until} onChange={(e) => setTermForm({ ...termForm, valid_until: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Tätigkeit</Label><Input value={termForm.job_title} onChange={(e) => setTermForm({ ...termForm, job_title: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Wochenstunden</Label><Input type="number" step="0.25" min="0" value={termForm.weekly_hours} onChange={(e) => setTermForm({ ...termForm, weekly_hours: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Tage/Woche <span className="text-slate-400 font-normal">(leer = unregelmäßig)</span></Label><Input type="number" step="0.5" min="0.5" max="6" value={termForm.days_per_week} onChange={(e) => setTermForm({ ...termForm, days_per_week: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Urlaubsbasis <span className="text-slate-400 font-normal">(leer = {settings.vacation_base_days})</span></Label><Input type="number" step="0.5" min="0" value={termForm.base_days} onChange={(e) => setTermForm({ ...termForm, base_days: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Zusatzurlaub <span className="text-slate-400 font-normal">(z. B. SB: 5)</span></Label><Input type="number" step="0.5" min="0" value={termForm.extra_days} onChange={(e) => setTermForm({ ...termForm, extra_days: e.target.value })} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Notiz</Label><Input value={termForm.note} onChange={(e) => setTermForm({ ...termForm, note: e.target.value })} /></div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => run(async () => {
                await post('/api/urlaub/terms', { action: 'save', assistant_id: assistant.id, ...termForm, id: termForm.id || undefined })
                setTermForm(emptyTerm)
              }, 'Gespeichert, Anspruch neu berechnet')}>Speichern</Button>
              {termForm.id && <Button variant="ghost" onClick={() => setTermForm(emptyTerm)}>Abbrechen</Button>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Urlaubskonto</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <BalanceOverview balances={balances} carryoverUntil={settings.vacation_carryover_until} />
          <div className="flex flex-wrap gap-2">
            {[year - 1, year, year + 1].map((y) => (
              <Button key={y} size="sm" variant="outline" onClick={() => run(() => post('/api/urlaub/ledger', { action: 'recompute', assistant_id: assistant.id, year: y }), `Anspruch ${y} neu berechnet`)}>
                Anspruch {y} berechnen
              </Button>
            ))}
          </div>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-1.5 font-medium">Datum</th><th className="py-1.5 font-medium">Jahr</th><th className="py-1.5 font-medium">Art</th>
              <th className="py-1.5 font-medium text-right">Tage</th><th className="py-1.5 font-medium">Notiz</th>
            </tr></thead>
            <tbody>
              {ledger.map((l) => (
                <tr key={l.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 text-slate-500">{de(l.created_at.slice(0, 10))}</td>
                  <td className="py-1.5">{l.leave_year}</td>
                  <td className="py-1.5">{LEDGER_KIND_LABELS[l.kind] ?? l.kind}</td>
                  <td className={`py-1.5 text-right tabular-nums ${l.days < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{l.days > 0 ? '+' : ''}{l.days.toLocaleString('de-DE')}</td>
                  <td className="py-1.5 text-slate-500 text-xs">{l.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="rounded-lg bg-slate-50 p-3 space-y-3">
            <p className="text-sm font-medium">Manuelle Buchung</p>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1.5"><Label>Art</Label>
                <select className={selectClass} value={book.kind} onChange={(e) => setBook({ ...book, kind: e.target.value })}>
                  <option value="opening_balance">Startsaldo (Resturlaub vor App)</option>
                  <option value="correction">Korrektur (+/−)</option>
                  <option value="parental_reduction">Kürzung Elternzeit (1/12 je Monat)</option>
                  <option value="expired">Verfall (manuell)</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label>Urlaubsjahr</Label><Input type="number" value={book.leave_year} onChange={(e) => setBook({ ...book, leave_year: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Tage</Label><Input type="number" step="0.5" value={book.days} onChange={(e) => setBook({ ...book, days: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Grund</Label><Input value={book.note} onChange={(e) => setBook({ ...book, note: e.target.value })} /></div>
            </div>
            <Button onClick={() => run(async () => {
              await post('/api/urlaub/ledger', { action: 'book', assistant_id: assistant.id, kind: book.kind, leave_year: Number(book.leave_year), days: Number(book.days), note: book.note })
              setBook({ ...book, days: '', note: '' })
            }, 'Gebucht')}>Buchen</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Abwesenheiten</CardTitle></CardHeader>
        <CardContent><AbsenceList items={absences} onAction={onAction} canDecide canCancelApproved /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Urlaubsabgeltung</CardTitle>
          <CardDescription>
            Bei Ende des Arbeitsverhältnisses wird nicht genommener Urlaub ausbezahlt (§ 7 Abs. 4 BUrlG).
            Die Abgeltung erscheint als eigene Zeile in der Lohnabrechnung des gewählten Monats. Aktuell offen: {formatDays(rest)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5"><Label>Tage</Label><Input type="number" step="0.5" min="0.5" value={payout.days} onChange={(e) => setPayout({ ...payout, days: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Abrechnen zum</Label><Input type="date" value={payout.date} onChange={(e) => setPayout({ ...payout, date: e.target.value })} /></div>
          <Button variant="outline" onClick={() => confirm(`${payout.days} Tage zum ${de(payout.date)} abgelten?`) && run(() => post('/api/urlaub/absences', {
            assistant_id: assistant.id, type: 'vacation_payout', date_from: payout.date, date_to: payout.date, days: Number(payout.days), approve: true, note: 'Urlaubsabgeltung',
          }), 'Abgeltung gebucht')}>Abgeltung buchen</Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Einstellungen ────────────────────────────────────────────────────────────
function SettingsCard({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [form, setForm] = useState({
    vacation_enabled: settings.vacation_enabled,
    vacation_base_days: String(settings.vacation_base_days),
    vacation_holiday_region: settings.vacation_holiday_region,
    vacation_notice_month: String(settings.vacation_notice_month),
  })
  const [saving, setSaving] = useState(false)
  async function save() {
    setSaving(true)
    try {
      await post('/api/urlaub/settings', { ...form, vacation_base_days: Number(form.vacation_base_days), vacation_notice_month: Number(form.vacation_notice_month) })
      toast.success('Gespeichert')
      onSaved()
    } catch (e) { toast.error((e as Error).message) } finally { setSaving(false) }
  }
  return (
    <Card>
      <CardHeader><CardTitle>Einstellungen Urlaub</CardTitle>
        <CardDescription>
          Gesetzlicher Mindesturlaub: 20 Arbeitstage bei 5-Tage-Woche (DE), 25 (AT) – Teilzeit/Minijob anteilig nach Arbeitstagen.
          Urlaubsentgelt = Ø der letzten 13 Wochen; es zählt zum Lohn und zur Minijob-Grenze, aber nicht als geleistete Stunden im Bezirks-Nachweis.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-xl">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={form.vacation_enabled} onChange={(e) => setForm({ ...form, vacation_enabled: e.target.checked })} />
          Urlaubsverwaltung aktiv
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label>Urlaubstage (5-Tage-Woche)</Label><Input type="number" step="0.5" value={form.vacation_base_days} onChange={(e) => setForm({ ...form, vacation_base_days: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Feiertage</Label>
            <select className={selectClass} value={form.vacation_holiday_region} onChange={(e) => setForm({ ...form, vacation_holiday_region: e.target.value })}>
              <option value="BY">Bayern</option>
              <option value="DE">Deutschland (bundesweit)</option>
              <option value="AT">Österreich</option>
            </select>
          </div>
          <div className="space-y-1.5"><Label>Resturlaub-Hinweis ab</Label>
            <select className={selectClass} value={form.vacation_notice_month} onChange={(e) => setForm({ ...form, vacation_notice_month: e.target.value })}>
              {['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'].map((m, i) => (
                <option key={m} value={String(i + 1)}>{m}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Der Hinweis auf Resturlaub und Verfall wird automatisch per E-Mail und in der App verschickt und protokolliert.
          Ohne diesen Hinweis verfällt Urlaub nicht (BAG-Rechtsprechung) – das Protokoll ist dein Nachweis.
        </p>
        <Button onClick={save} disabled={saving}>{saving ? 'Speichere …' : 'Speichern'}</Button>
      </CardContent>
    </Card>
  )
}

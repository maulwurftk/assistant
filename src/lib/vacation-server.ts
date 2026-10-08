// Urlaub – serverseitige Bausteine (DB-Zugriff). Nur in Route-Handlern /
// Server Components verwenden. Reine Rechenlogik: src/lib/vacation.ts
import { createClient as createSbClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import { entryDurationMinutes, timeToMinutes } from '@/lib/payroll'
import {
  addDays,
  allocateTaken,
  balancesByYear,
  distinctWorkdays,
  entitlementForYear,
  expiryDate,
  vacationPayBasis,
  type HolidayRegion,
  type VacationTerm,
  type WorkedSlot,
} from '@/lib/vacation'

export type Db = SupabaseClient<Database>

export function createServiceDb(): Db {
  return createSbClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface VacationSettings {
  enabled: boolean
  baseDays: number
  region: HolidayRegion
  carryoverUntil: string
  referenceWeeks: number
  noticeMonth: number
}

export async function loadVacationSettings(db: Db, tenantId: string): Promise<VacationSettings> {
  const { data } = await db
    .from('payroll_settings')
    .select('vacation_enabled, vacation_base_days, vacation_holiday_region, vacation_carryover_until, vacation_reference_weeks, vacation_notice_month')
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle()
  return {
    enabled: data?.vacation_enabled ?? false,
    baseDays: Number(data?.vacation_base_days ?? 20),
    region: (data?.vacation_holiday_region ?? 'BY') as HolidayRegion,
    carryoverUntil: data?.vacation_carryover_until ?? '03-31',
    referenceWeeks: data?.vacation_reference_weeks ?? 13,
    noticeMonth: data?.vacation_notice_month ?? 10,
  }
}

/** Bestätigte, lohnrelevante Dienste (wie Lohnabrechnung: assigned, confirmed, nicht privat). */
export async function loadWorkedSlots(
  db: Db,
  tenantId: string,
  assistantId: string,
  from: string,
  to: string
): Promise<WorkedSlot[]> {
  const { data } = await db
    .from('calendar_slots')
    .select('date, start_time, end_time, actual_start_time, actual_end_time')
    .eq('tenant_id', tenantId)
    .eq('assigned_to', assistantId)
    .eq('status', 'assigned')
    .eq('is_private', false)
    .not('confirmed_at', 'is', null)
    .gte('date', from)
    .lte('date', to)
  return (data ?? []).map((s) => ({
    date: s.date,
    minutes: entryDurationMinutes(s.actual_start_time || s.start_time, s.actual_end_time || s.end_time),
  }))
}

export async function loadTerms(db: Db, tenantId: string, assistantId: string) {
  const { data } = await db
    .from('employment_terms')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('assistant_id', assistantId)
    .order('valid_from')
  return data ?? []
}

export function termAt<T extends VacationTerm>(terms: T[], iso: string): T | null {
  return terms.find((t) => t.valid_from <= iso && (!t.valid_until || t.valid_until >= iso))
    ?? terms.filter((t) => t.valid_from <= iso).pop()
    ?? null
}

export async function loadLedger(db: Db, tenantId: string, assistantId: string) {
  const { data } = await db
    .from('leave_ledger')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('assistant_id', assistantId)
    .order('created_at')
  return data ?? []
}

/**
 * Jahresanspruch berechnen und als Buchung 'entitlement' (dedup ent:<jahr>:<id>)
 * anlegen bzw. aktualisieren. Idempotent – kann nach jeder Vertragsänderung
 * erneut aufgerufen werden.
 */
export async function recomputeEntitlement(
  db: Db,
  tenantId: string,
  assistantId: string,
  year: number,
  settings: VacationSettings,
  createdBy: string | null = null
) {
  const [{ data: profile }, terms] = await Promise.all([
    db.from('profiles').select('employment_start, employment_end, created_at')
      .eq('id', assistantId).eq('tenant_id', tenantId).single(),
    loadTerms(db, tenantId, assistantId),
  ])
  if (!profile) throw new Error('Assistentin nicht gefunden')

  // Unregelmäßige Verträge: Arbeitstage der letzten 12 Monate vor Jahresende
  // (laufendes Jahr: bis heute) aus bestätigten Diensten.
  const today = new Date().toISOString().slice(0, 10)
  const refTo = `${year}-12-31` < today ? `${year}-12-31` : today
  const refFrom = addDays(refTo, -364)
  const slots = terms.some((t) => t.days_per_week == null) || terms.length === 0
    ? await loadWorkedSlots(db, tenantId, assistantId, refFrom, refTo)
    : []
  const workdays = distinctWorkdays(slots, refFrom, refTo)

  const result = entitlementForYear({
    year,
    terms: terms.map((t) => ({
      valid_from: t.valid_from,
      valid_until: t.valid_until,
      days_per_week: t.days_per_week == null ? null : Number(t.days_per_week),
      base_days: t.base_days == null ? null : Number(t.base_days),
      extra_days: Number(t.extra_days ?? 0),
    })),
    baseDefault: settings.baseDays,
    employmentStart: profile.employment_start,
    employmentEnd: profile.employment_end,
    irregularWorkdaysPerYear: workdays,
  })

  const dedup = `ent:${year}:${assistantId}`
  const note = `${result.mode === 'partial' ? `Teilurlaub ${result.fullMonths}/12` : 'Voller Jahresanspruch'}` +
    ` · Ø ${result.avgAnnualRate} Tage/Jahr` +
    (terms.some((t) => t.days_per_week == null) || terms.length === 0 ? ` · ${workdays} Arbeitstage in 12 Mon.` : '')

  const { data: existing } = await db
    .from('leave_ledger')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('dedup_key', dedup)
    .maybeSingle()

  if (existing) {
    await db.from('leave_ledger').update({ days: result.days, note }).eq('id', existing.id).eq('tenant_id', tenantId)
  } else {
    await db.from('leave_ledger').insert({
      tenant_id: tenantId,
      assistant_id: assistantId,
      leave_year: year,
      kind: 'entitlement',
      days: result.days,
      note,
      dedup_key: dedup,
      created_by: createdBy,
    })
  }
  return result
}

export interface VacationPreview {
  days: number
  minutesPerDay: number
  paidMinutes: number
  basis: ReturnType<typeof vacationPayBasis>
  allocation: { leave_year: number; days: number }[]
  shortfall: number
  balanceBefore: number
}

/** Berechnet Tage, Urlaubsentgelt-Minuten und Kontobelastung (ohne zu speichern). */
export async function previewVacation(
  db: Db,
  tenantId: string,
  assistantId: string,
  dateFrom: string,
  days: number,
  settings: VacationSettings,
  excludeAbsenceId?: string
): Promise<VacationPreview> {
  const refFrom = addDays(dateFrom, -7 * settings.referenceWeeks)
  const [slots, terms, ledger] = await Promise.all([
    loadWorkedSlots(db, tenantId, assistantId, refFrom, addDays(dateFrom, -1)),
    loadTerms(db, tenantId, assistantId),
    loadLedger(db, tenantId, assistantId),
  ])
  const term = termAt(terms, dateFrom)
  const basis = vacationPayBasis(slots, dateFrom, settings.referenceWeeks, term
    ? { weekly_hours: term.weekly_hours == null ? null : Number(term.weekly_hours), days_per_week: term.days_per_week == null ? null : Number(term.days_per_week) }
    : undefined)
  const relevant = ledger.filter((l) => !excludeAbsenceId || l.absence_id !== excludeAbsenceId)
  const balances = balancesByYear(relevant.map((l) => ({ leave_year: l.leave_year, kind: l.kind, days: Number(l.days) })))
  const { allocation, shortfall } = allocateTaken(balances, days, Number(dateFrom.slice(0, 4)))
  return {
    days,
    minutesPerDay: basis.minutesPerDay,
    paidMinutes: Math.round(basis.minutesPerDay * days),
    basis,
    allocation,
    shortfall,
    balanceBefore: balances.reduce((s, b) => s + b.balance, 0),
  }
}

/** Monate (YYYY-MM), deren Lohnabrechnung für die Assistentin schon versendet wurde. */
export async function sentPayrollMonths(db: Db, tenantId: string, assistantId: string): Promise<Set<string>> {
  const { data } = await db
    .from('payroll_runs')
    .select('year, month, email_sent_at')
    .eq('tenant_id', tenantId)
    .eq('assistant_id', assistantId)
    .not('email_sent_at', 'is', null)
  return new Set((data ?? []).map((r) => `${r.year}-${String(r.month).padStart(2, '0')}`))
}

export async function notify(
  db: Db,
  tenantId: string,
  userIds: string[],
  title: string,
  message: string,
  type: 'info' | 'warning' | 'success' | 'error' = 'info',
  relatedId?: string
) {
  if (!userIds.length) return
  await db.from('notifications').insert(
    userIds.map((id) => ({
      tenant_id: tenantId,
      user_id: id,
      title,
      message,
      type,
      related_type: 'absence',
      related_id: relatedId ?? null,
    }))
  )
  try {
    const { sendPushToUsers } = await import('@/lib/push')
    await sendPushToUsers(userIds, title, message, '/urlaub')
  } catch (e) {
    console.error('Push error (Urlaub):', e)
  }
}

export async function adminIds(db: Db, tenantId: string): Promise<string[]> {
  const { data } = await db
    .from('profiles')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('role', 'admin')
    .eq('active', true)
  return (data ?? []).map((a) => a.id)
}

export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.FROM_EMAIL ?? 'noreply@charmely.cloud', to, subject, html }),
    })
    return res.ok
  } catch (e) {
    console.error('Mail error (Urlaub):', e)
    return false
  }
}

// ── Lohnabrechnung ─────────────────────────────────────────────────────────

export interface VacationPayrollRow {
  assistant_id: string
  absence_id: string
  date: string
  start_time: string
  end_time: string
  label: string
}

function minutesToTime(min: number): string {
  const m = Math.max(0, Math.round(min))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`
}

/**
 * Urlaubsentgelt als synthetische Zeilen für die Lohnabrechnung eines Monats
 * [dateFrom, dateToExclusive). Je genehmigtem Urlaubstag eine Zeile
 * 00:00–(Ø-Minuten); Abgeltung als Zeilen am Abgeltungsdatum.
 * Diese Zeilen landen bewusst NICHT im Tätigkeitsbericht/Leistungsnachweis
 * für den Bezirk (der liest weiterhin nur calendar_slots).
 */
export async function vacationPayrollRows(
  db: Db,
  dateFrom: string,
  dateToExclusive: string,
  assistantId?: string
): Promise<VacationPayrollRow[]> {
  let q = db
    .from('absences')
    .select('id, assistant_id, type, date_from, date_to, workdays, days, minutes_per_day, paid_minutes')
    .eq('status', 'approved')
    .in('type', ['vacation', 'vacation_payout'])
    .lt('date_from', dateToExclusive)
    .gte('date_to', dateFrom)
  if (assistantId) q = q.eq('assistant_id', assistantId)
  const { data, error } = await q
  if (error) {
    // Tabelle evtl. noch nicht migriert → Lohnabrechnung nicht blockieren
    console.error('vacationPayrollRows:', error.message)
    return []
  }

  const rows: VacationPayrollRow[] = []
  for (const a of data ?? []) {
    const mpd = a.minutes_per_day ?? 0
    if (mpd <= 0) continue
    if (a.type === 'vacation') {
      for (const d of a.workdays ?? []) {
        if (d < dateFrom || d >= dateToExclusive) continue
        rows.push({
          assistant_id: a.assistant_id, absence_id: a.id, date: d,
          start_time: '00:00:00', end_time: minutesToTime(mpd), label: 'Urlaub (Urlaubsentgelt)',
        })
      }
    } else {
      if (a.date_from < dateFrom || a.date_from >= dateToExclusive) continue
      let remaining = a.paid_minutes ?? Math.round(Number(a.days) * mpd)
      while (remaining > 0) {
        const chunk = Math.min(mpd, remaining)
        rows.push({
          assistant_id: a.assistant_id, absence_id: a.id, date: a.date_from,
          start_time: '00:00:00', end_time: minutesToTime(chunk), label: 'Urlaubsabgeltung',
        })
        remaining -= chunk
      }
    }
  }
  return rows.sort((x, y) => x.date.localeCompare(y.date))
}

export function rowMinutes(r: { start_time: string; end_time: string }) {
  return timeToMinutes(r.end_time) - timeToMinutes(r.start_time)
}

export { expiryDate }
export type { Json }

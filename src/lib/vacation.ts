// Urlaub – reine Rechenfunktionen (keine DB, keine Seiteneffekte).
// Rechtsgrundlage & Entscheidungen: docs/urlaub-architektur.md
//
// Alle Datumswerte sind ISO-Strings 'YYYY-MM-DD'. Intern wird in UTC
// gerechnet, damit Zeitzonen/Sommerzeit keine Tage verschieben.

export type HolidayRegion = 'BY' | 'DE' | 'AT'

export interface VacationTerm {
  valid_from: string
  valid_until: string | null
  days_per_week: number | null
  base_days: number | null
  extra_days: number
}

// ── Datums-Helfer ──────────────────────────────────────────────────────────
export function toDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(iso: string, n: number): string {
  const d = toDate(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return toIso(d)
}

export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + n, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, lastDay))
  return toIso(target)
}

export function daysBetweenInclusive(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86400000) + 1
}

export function datesInRange(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

/** 0 = Sonntag … 6 = Samstag */
export function weekday(iso: string): number {
  return toDate(iso).getUTCDay()
}

const maxIso = (a: string, b: string) => (a > b ? a : b)
const minIso = (a: string, b: string) => (a < b ? a : b)
const round2 = (n: number) => Math.round(n * 100) / 100

// ── Feiertage ──────────────────────────────────────────────────────────────
export function easterSunday(year: number): string {
  // Anonymer gregorianischer Algorithmus (Meeus/Jones/Butcher)
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Gesetzliche Feiertage (Name je Datum). BY inkl. Mariä Himmelfahrt (gilt in überwiegend katholischen Gemeinden). */
export function holidays(year: number, region: HolidayRegion): Map<string, string> {
  const e = easterSunday(year)
  const y = String(year)
  const map = new Map<string, string>()
  const add = (iso: string, name: string) => map.set(iso, name)

  add(`${y}-01-01`, 'Neujahr')
  add(addDays(e, 1), 'Ostermontag')
  add(addDays(e, 39), 'Christi Himmelfahrt')
  add(addDays(e, 50), 'Pfingstmontag')
  add(`${y}-12-25`, '1. Weihnachtstag')
  add(`${y}-12-26`, region === 'AT' ? 'Stefanitag' : '2. Weihnachtstag')

  if (region === 'AT') {
    add(`${y}-01-06`, 'Heilige Drei Könige')
    add(`${y}-05-01`, 'Staatsfeiertag')
    add(addDays(e, 60), 'Fronleichnam')
    add(`${y}-08-15`, 'Mariä Himmelfahrt')
    add(`${y}-10-26`, 'Nationalfeiertag')
    add(`${y}-11-01`, 'Allerheiligen')
    add(`${y}-12-08`, 'Mariä Empfängnis')
    return map
  }

  add(addDays(e, -2), 'Karfreitag')
  add(`${y}-05-01`, 'Tag der Arbeit')
  add(`${y}-10-03`, 'Tag der Deutschen Einheit')
  if (region === 'BY') {
    add(`${y}-01-06`, 'Heilige Drei Könige')
    add(addDays(e, 60), 'Fronleichnam')
    add(`${y}-08-15`, 'Mariä Himmelfahrt')
    add(`${y}-11-01`, 'Allerheiligen')
  }
  return map
}

/** Kann der Tag überhaupt ein Urlaubstag sein? (kein Sonntag, kein Feiertag) */
export function isVacationEligibleDay(iso: string, region: HolidayRegion): boolean {
  if (weekday(iso) === 0) return false
  return !holidays(Number(iso.slice(0, 4)), region).has(iso)
}

// ── Anspruch ───────────────────────────────────────────────────────────────

/** Volle Beschäftigungsmonate zwischen from und to (inklusive). */
export function fullMonths(from: string, toInclusive: string): number {
  let n = 0
  while (addDays(addMonths(from, n + 1), -1) <= toInclusive) n++
  return n
}

/**
 * Jahresurlaub (Arbeitstage) für EINE Vertragsbedingung, aufs volle Jahr gerechnet.
 * Regelmäßig: (Basis + Zusatz) × Tage/Woche ÷ 5.
 * Unregelmäßig (days_per_week = null): Tage/Woche = Arbeitstage im Jahr ÷ 52
 *   (entspricht 24 × AT ÷ 312 bzw. 20 × AT ÷ 260).
 */
export function annualRate(term: VacationTerm | null, baseDefault: number, irregularWorkdaysPerYear: number): number {
  const base = term?.base_days ?? baseDefault
  const extra = term?.extra_days ?? 0
  const dpw = term?.days_per_week ?? Math.min(6, Math.max(0, irregularWorkdaysPerYear) / 52)
  return ((base + extra) * dpw) / 5
}

export interface EntitlementInput {
  year: number
  terms: VacationTerm[]
  baseDefault: number
  employmentStart: string | null
  employmentEnd: string | null
  /** Für unregelmäßige Verträge: Arbeitstage der letzten 12 Monate (aus bestätigten Diensten). */
  irregularWorkdaysPerYear: number
}

export interface EntitlementResult {
  days: number
  mode: 'none' | 'full' | 'partial'
  employedFrom: string | null
  employedTo: string | null
  fullMonths: number
  avgAnnualRate: number
  segments: { from: string; to: string; annualRate: number }[]
}

/**
 * Urlaubsanspruch für ein Kalenderjahr nach BUrlG:
 *  - Wartezeit 6 Monate (§ 4); wird sie im Jahr erfüllt und besteht das
 *    Arbeitsverhältnis über den 30.06. hinaus, entsteht der volle Anspruch.
 *  - Sonst 1/12 je vollem Beschäftigungsmonat (§ 5 Abs. 1), Bruchteile
 *    ab einem halben Tag aufgerundet (§ 5 Abs. 2).
 *  - Mehrere Vertragsbedingungen im Jahr werden zeitanteilig gewichtet.
 */
export function entitlementForYear(input: EntitlementInput): EntitlementResult {
  const yStart = `${input.year}-01-01`
  const yEnd = `${input.year}-12-31`
  const empStart = input.employmentStart
  const empEnd = input.employmentEnd
  const from = maxIso(yStart, empStart ?? yStart)
  const to = minIso(yEnd, empEnd ?? yEnd)

  const none: EntitlementResult = {
    days: 0, mode: 'none', employedFrom: null, employedTo: null, fullMonths: 0, avgAnnualRate: 0, segments: [],
  }
  if (from > to) return none

  // Zeitanteilig gewichtete Jahresrate über die Beschäftigungstage im Jahr
  const terms = [...input.terms].sort((a, b) => a.valid_from.localeCompare(b.valid_from))
  const segments: { from: string; to: string; annualRate: number }[] = []
  const termAt = (iso: string): VacationTerm | null => {
    const hit = terms.find((t) => t.valid_from <= iso && (!t.valid_until || t.valid_until >= iso))
    if (hit) return hit
    // Lücke: nächstliegende Bedingung (vorher, sonst nachher) verwenden
    const before = terms.filter((t) => t.valid_from <= iso).pop()
    return before ?? terms[0] ?? null
  }
  let segStart = from
  let current = termAt(from)
  for (let d = addDays(from, 1); d <= addDays(to, 1); d = addDays(d, 1)) {
    const t = d <= to ? termAt(d) : undefined
    if (d > to || t !== current) {
      segments.push({
        from: segStart,
        to: addDays(d, -1),
        annualRate: annualRate(current, input.baseDefault, input.irregularWorkdaysPerYear),
      })
      segStart = d
      current = t ?? null
    }
  }
  const totalDays = daysBetweenInclusive(from, to)
  const avgAnnualRate = segments.reduce((s, g) => s + g.annualRate * daysBetweenInclusive(g.from, g.to), 0) / totalDays

  // Voller Anspruch oder Zwölftelung?
  const waitingEnd = empStart ? addMonths(empStart, 6) : null // erster Tag nach erfüllter Wartezeit
  const startedThisYear = !!empStart && empStart > yStart
  const endsThisYear = !!empEnd && empEnd < yEnd
  let full = true
  if (startedThisYear && waitingEnd && waitingEnd > addDays(yEnd, 1)) full = false
  if (endsThisYear) {
    if (empEnd! <= `${input.year}-06-30`) full = false
    else if (waitingEnd && waitingEnd > addDays(empEnd!, 1)) full = false
  }

  const months = fullMonths(from, to)
  let days: number
  if (full) {
    days = round2(avgAnnualRate)
  } else {
    const raw = (avgAnnualRate * months) / 12
    const frac = raw - Math.floor(raw)
    days = frac >= 0.5 ? Math.ceil(raw) : round2(raw)
  }

  return {
    days,
    mode: full ? 'full' : 'partial',
    employedFrom: from,
    employedTo: to,
    fullMonths: months,
    avgAnnualRate: round2(avgAnnualRate),
    segments,
  }
}

// ── Urlaubsentgelt (Referenzprinzip § 11 BUrlG) ───────────────────────────

export interface WorkedSlot {
  date: string
  minutes: number
}

export interface PayBasis {
  refFrom: string
  refTo: string
  refMinutes: number
  refWorkdays: number
  minutesPerDay: number
  method: 'reference_13w' | 'fallback_terms' | 'none'
}

/**
 * Ø bezahlte Minuten je Arbeitstag in den `weeks` Wochen vor `startDate`.
 * Fallback ohne Referenzdaten: Wochenstunden ÷ Tage/Woche aus dem Vertrag.
 */
export function vacationPayBasis(
  slots: WorkedSlot[],
  startDate: string,
  weeks = 13,
  fallback?: { weekly_hours: number | null; days_per_week: number | null }
): PayBasis {
  const refTo = addDays(startDate, -1)
  const refFrom = addDays(startDate, -7 * weeks)
  const inRef = slots.filter((s) => s.date >= refFrom && s.date <= refTo && s.minutes > 0)
  const refMinutes = inRef.reduce((sum, s) => sum + s.minutes, 0)
  const refWorkdays = new Set(inRef.map((s) => s.date)).size
  if (refWorkdays > 0) {
    return { refFrom, refTo, refMinutes, refWorkdays, minutesPerDay: Math.round(refMinutes / refWorkdays), method: 'reference_13w' }
  }
  if (fallback?.weekly_hours && fallback.days_per_week) {
    return {
      refFrom, refTo, refMinutes: 0, refWorkdays: 0,
      minutesPerDay: Math.round((fallback.weekly_hours * 60) / fallback.days_per_week),
      method: 'fallback_terms',
    }
  }
  return { refFrom, refTo, refMinutes: 0, refWorkdays: 0, minutesPerDay: 0, method: 'none' }
}

/** Arbeitstage (distinct) in einem Zeitraum – Basis für unregelmäßige Verträge. */
export function distinctWorkdays(slots: WorkedSlot[], from: string, to: string): number {
  return new Set(slots.filter((s) => s.date >= from && s.date <= to && s.minutes > 0).map((s) => s.date)).size
}

// ── Konto ──────────────────────────────────────────────────────────────────

export interface LedgerRow {
  leave_year: number
  kind: string
  days: number
}

export interface YearBalance {
  leave_year: number
  credited: number
  taken: number
  balance: number
}

export function balancesByYear(rows: LedgerRow[]): YearBalance[] {
  const map = new Map<number, YearBalance>()
  for (const r of rows) {
    const b = map.get(r.leave_year) ?? { leave_year: r.leave_year, credited: 0, taken: 0, balance: 0 }
    const d = Number(r.days)
    if (r.kind === 'taken') b.taken += -d
    else if (d > 0) b.credited += d
    b.balance += d
    map.set(r.leave_year, b)
  }
  return [...map.values()]
    .map((b) => ({ ...b, credited: round2(b.credited), taken: round2(b.taken), balance: round2(b.balance) }))
    .sort((a, b) => a.leave_year - b.leave_year)
}

/** Verbrauch zuerst aus dem ältesten Jahr mit Guthaben (FIFO), Rest aufs Jahr des Urlaubs. */
export function allocateTaken(
  balances: YearBalance[],
  days: number,
  vacationYear: number
): { allocation: { leave_year: number; days: number }[]; shortfall: number } {
  const allocation: { leave_year: number; days: number }[] = []
  let rest = days
  for (const b of balances.filter((x) => x.leave_year <= vacationYear && x.balance > 0)) {
    if (rest <= 0) break
    const use = Math.min(b.balance, rest)
    allocation.push({ leave_year: b.leave_year, days: round2(use) })
    rest = round2(rest - use)
  }
  if (rest > 0) {
    const existing = allocation.find((a) => a.leave_year === vacationYear)
    if (existing) existing.days = round2(existing.days + rest)
    else allocation.push({ leave_year: vacationYear, days: rest })
  }
  return { allocation, shortfall: rest }
}

/** Ablaufdatum des Urlaubs eines Jahres (Übertrag bis MM-DD im Folgejahr). */
export function expiryDate(leaveYear: number, carryoverUntil = '03-31'): string {
  return `${leaveYear + 1}-${carryoverUntil}`
}

// ── Darstellung ────────────────────────────────────────────────────────────
export const ABSENCE_TYPE_LABELS: Record<string, string> = {
  vacation: 'Urlaub',
  vacation_payout: 'Urlaubsabgeltung',
  sick: 'Krank',
  sick_child: 'Kind krank',
  special: 'Sonderurlaub',
  unpaid: 'Unbezahlt frei',
}

export const ABSENCE_STATUS_LABELS: Record<string, string> = {
  requested: 'Beantragt',
  approved: 'Genehmigt',
  rejected: 'Abgelehnt',
  cancelled: 'Storniert',
}

export const LEDGER_KIND_LABELS: Record<string, string> = {
  entitlement: 'Jahresanspruch',
  opening_balance: 'Startsaldo',
  taken: 'Genommen',
  expired: 'Verfallen',
  payout: 'Abgegolten',
  parental_reduction: 'Kürzung Elternzeit',
  correction: 'Korrektur',
}

export function formatDays(n: number): string {
  return `${Number(n).toLocaleString('de-DE', { maximumFractionDigits: 2 })} ${Math.abs(n) === 1 ? 'Tag' : 'Tage'}`
}

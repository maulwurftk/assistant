// Arbeitgeberzuschuss zum Mutterschaftsgeld (§ 20 MuSchG).
// Zuschuss je Kalendertag = durchschnittliches kalendertägliches Netto der
// letzten 3 abgeschlossenen Kalendermonate vor Beginn des Mutterschutzes − 13 €.
// Steuer- und sozialversicherungsfrei; Erstattung über die U2-Umlage.
import type { LeaveInfo } from './leave'

export const MUTTERSCHAFTSGELD_TAGESSATZ = 13

export interface RefRun {
  year: number
  month: number
  total_pay: number
}

export interface MaternitySubsidy {
  days: number               // Kalendertage im Abrechnungsmonat mit Mutterschutz
  avgNetPerDay: number       // Ø Netto je Kalendertag im Referenzzeitraum
  dailySubsidy: number       // max(0, avg − 13)
  amount: number             // days × dailySubsidy (gerundet)
  refMonths: string[]        // z.B. ['06/2026','07/2026','08/2026']
  refNetSum: number
  refDays: number
  hasReference: boolean
}

export function isMaternityLeave(p: LeaveInfo | null | undefined): boolean {
  return !!p?.leave_from && /mutterschutz/i.test(p.leave_reason ?? '')
}

function pad(n: number) { return String(n).padStart(2, '0') }
function daysInMonth(y: number, m: number) { return new Date(y, m, 0).getDate() }

// Kalendertage des Monats, die im Mutterschutz-Zeitraum liegen
export function leaveDaysInMonth(p: LeaveInfo, year: number, month: number): number {
  if (!p.leave_from) return 0
  const first = `${year}-${pad(month)}-01`
  const last = `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`
  const from = p.leave_from > first ? p.leave_from : first
  const to = p.leave_until && p.leave_until < last ? p.leave_until : last
  if (from > to) return 0
  const d1 = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))
  const d2 = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10))
  return Math.round((d2 - d1) / 86400000) + 1
}

// Die 3 abgeschlossenen Kalendermonate vor Beginn des Mutterschutzes
export function referenceMonths(leaveFrom: string): Array<{ year: number; month: number }> {
  let y = +leaveFrom.slice(0, 4)
  let m = +leaveFrom.slice(5, 7)
  const out: Array<{ year: number; month: number }> = []
  for (let i = 0; i < 3; i++) {
    m -= 1
    if (m === 0) { m = 12; y -= 1 }
    out.unshift({ year: y, month: m })
  }
  return out
}

export function computeSubsidy(
  p: LeaveInfo,
  year: number,
  month: number,
  sentRuns: RefRun[]
): MaternitySubsidy | null {
  if (!isMaternityLeave(p)) return null
  const days = leaveDaysInMonth(p, year, month)
  if (days <= 0) return null

  const refs = referenceMonths(p.leave_from!)
  let sum = 0
  let refDays = 0
  const used: string[] = []
  for (const r of refs) {
    const run = sentRuns.find((x) => x.year === r.year && x.month === r.month)
    if (!run) continue
    sum += Number(run.total_pay) || 0
    refDays += daysInMonth(r.year, r.month)
    used.push(`${pad(r.month)}/${r.year}`)
  }
  const avg = refDays > 0 ? sum / refDays : 0
  const daily = Math.max(0, Math.round((avg - MUTTERSCHAFTSGELD_TAGESSATZ) * 100) / 100)
  return {
    days,
    avgNetPerDay: Math.round(avg * 100) / 100,
    dailySubsidy: daily,
    amount: Math.round(days * daily * 100) / 100,
    refMonths: used,
    refNetSum: Math.round(sum * 100) / 100,
    refDays,
    hasReference: refDays > 0,
  }
}

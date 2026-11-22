// Wiederkehrende Termine – reine Rechenfunktionen (keine DB, keine Seiteneffekte).
// Datumswerte sind ISO-Strings 'YYYY-MM-DD', gerechnet wird in UTC, damit
// Sommerzeit keine Tage verschiebt.

export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly'

export interface RecurrenceRule {
  freq: RecurrenceFreq
  /** Alle n Tage/Wochen/Monate (≥ 1) */
  interval: number
  /** Nur bei weekly: 0 = Sonntag … 6 = Samstag. Leer = Wochentag des Startdatums. */
  weekdays?: number[]
  /** Ablaufdatum (inklusive) */
  until: string
}

/** Obergrenze, damit eine Serie nicht versehentlich tausende Slots anlegt. */
export const MAX_OCCURRENCES = 400

const toDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const toIso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (iso: string, n: number) => {
  const d = toDate(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return toIso(d)
}
const weekday = (iso: string) => toDate(iso).getUTCDay()

export function validateRule(start: string, rule: RecurrenceRule): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rule.until ?? '')) return 'Bitte ein Ablaufdatum angeben'
  if (rule.until < start) return 'Das Ablaufdatum liegt vor dem ersten Termin'
  if (!Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > 52) return 'Intervall muss zwischen 1 und 52 liegen'
  if (rule.weekdays?.some((w) => !Number.isInteger(w) || w < 0 || w > 6)) return 'Ungültiger Wochentag'
  return null
}

/**
 * Alle Termin-Daten einer Serie ab `start` bis einschließlich `rule.until`.
 * Monatlich: gleicher Tag im Monat; Monate ohne diesen Tag (z.B. 31.) werden übersprungen.
 */
export function generateOccurrences(start: string, rule: RecurrenceRule): { dates: string[]; truncated: boolean } {
  const dates: string[] = []
  const push = (d: string) => {
    if (d < start || d > rule.until) return true
    if (dates.length >= MAX_OCCURRENCES) return false
    dates.push(d)
    return true
  }
  const interval = Math.max(1, Math.floor(rule.interval || 1))
  let truncated = false

  if (rule.freq === 'daily') {
    for (let d = start; d <= rule.until; d = addDays(d, interval)) {
      if (!push(d)) { truncated = true; break }
    }
  } else if (rule.freq === 'weekly') {
    const days = [...new Set(rule.weekdays?.length ? rule.weekdays : [weekday(start)])]
    // Wochen beginnen montags; Offset 0 = Mo … 6 = So
    const offsets = days.map((w) => (w + 6) % 7).sort((a, b) => a - b)
    const monday = addDays(start, -((weekday(start) + 6) % 7))
    outer: for (let wk = monday; wk <= rule.until; wk = addDays(wk, 7 * interval)) {
      for (const o of offsets) {
        if (!push(addDays(wk, o))) { truncated = true; break outer }
      }
    }
  } else {
    const [y, m, day] = start.split('-').map(Number)
    for (let i = 0; ; i += interval) {
      const first = new Date(Date.UTC(y, m - 1 + i, 1))
      if (toIso(first) > rule.until) break
      const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
      if (day > lastDay) continue
      first.setUTCDate(day)
      if (!push(toIso(first))) { truncated = true; break }
    }
  }
  return { dates, truncated }
}

const WEEKDAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const fmt = (iso: string) => iso.split('-').reverse().join('.')

/** Menschenlesbare Beschreibung, z.B. "Alle 2 Wochen am Mo, Mi bis 31.03.2027" */
export function describeRule(rule: RecurrenceRule, start?: string): string {
  const n = rule.interval || 1
  let base: string
  if (rule.freq === 'daily') base = n === 1 ? 'Täglich' : `Alle ${n} Tage`
  else if (rule.freq === 'weekly') {
    const days = rule.weekdays?.length ? rule.weekdays : start ? [weekday(start)] : []
    const sorted = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    base = (n === 1 ? 'Jede Woche' : `Alle ${n} Wochen`) + (sorted.length ? ` am ${sorted.map((w) => WEEKDAY_SHORT[w]).join(', ')}` : '')
  } else {
    base = (n === 1 ? 'Jeden Monat' : `Alle ${n} Monate`) + (start ? ` am ${Number(start.slice(8, 10))}.` : '')
  }
  return `${base} bis ${fmt(rule.until)}`
}

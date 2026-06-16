export function timeToMinutes(time: string): number {
  const parts = time.split(':').map(Number)
  return parts[0] * 60 + parts[1]
}

export function entryDurationMinutes(startTime: string, endTime: string): number {
  return Math.max(0, timeToMinutes(endTime) - timeToMinutes(startTime))
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m.toString().padStart(2, '0')}min`
}

export function minutesToDecimalHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100
}

export function calculatePay(totalMinutes: number, hourlyRate: number): number {
  return Math.round((totalMinutes / 60) * hourlyRate * 100) / 100
}

export function formatCurrency(amount: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
  }).format(amount)
}

export function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${d.toString().padStart(2, '0')}.${m.toString().padStart(2, '0')}.${y}`
}

export function monthName(month: number): string {
  const names = [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
  ]
  return names[month - 1] ?? ''
}

export function prevMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 }
  return { year, month: month - 1 }
}

export function nextMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) return { year: year + 1, month: 1 }
  return { year, month: month + 1 }
}

// ── Minijob-Berechnung ────────────────────────────────────────────────────────
// Pauschalbeitragssätze 2025 (Arbeitgeber, via Minijob-Zentrale)
export const MINIJOB_RATES = {
  kvAG: 13.00,          // Krankenversicherung AG
  rvAG: 15.00,          // Rentenversicherung AG
  pauschsteuer: 2.00,   // Lohnsteuerpauschale
  u2: 0.24,             // Umlage 2 (Mutterschaft)
  insolvenzgeld: 0.06,  // Insolvenzgeldumlage
  rvAN: 3.60,           // Aufstockungsbetrag AN (wenn RV-pflichtig)
} as const

export interface MinijobBreakdown {
  brutto: number
  rvAN: number              // AN-Anteil RV (0 wenn befreit)
  netto: number             // brutto − rvAN
  kvAGAmount: number
  rvAGAmount: number
  pauschsteuerAmount: number
  u2Amount: number
  insolvenzgeldAmount: number
  uvAmount: number          // Unfallversicherung (konfigurierbar)
  totalAGAbgaben: number    // Summe aller AG-Beiträge
  totalKosten: number       // Gesamtkosten AG = brutto + AG-Abgaben
}

export function calculateMinijob(
  brutto: number,
  rvPflicht: boolean,
  uvRate: number = 1.60,
  kvPflicht: boolean = true
): MinijobBreakdown {
  const pct = (p: number) => Math.round(brutto * p) / 100

  const kvAGAmount = kvPflicht ? pct(MINIJOB_RATES.kvAG) : 0
  const rvAGAmount = pct(MINIJOB_RATES.rvAG)
  const pauschsteuerAmount = pct(MINIJOB_RATES.pauschsteuer)
  const u2Amount = pct(MINIJOB_RATES.u2)
  const insolvenzgeldAmount = pct(MINIJOB_RATES.insolvenzgeld)
  const uvAmount = pct(uvRate)

  const rvAN = rvPflicht ? pct(MINIJOB_RATES.rvAN) : 0
  const netto = Math.round((brutto - rvAN) * 100) / 100

  const totalAGAbgaben = Math.round(
    (kvAGAmount + rvAGAmount + pauschsteuerAmount + u2Amount + insolvenzgeldAmount + uvAmount) * 100
  ) / 100
  const totalKosten = Math.round((brutto + totalAGAbgaben) * 100) / 100

  return {
    brutto,
    rvAN,
    netto,
    kvAGAmount,
    rvAGAmount,
    pauschsteuerAmount,
    u2Amount,
    insolvenzgeldAmount,
    uvAmount,
    totalAGAbgaben,
    totalKosten,
  }
}

// ── Bezirk-Rückrechnung ──────────────────────────────────────────────────────
// Der Bezirk zahlt einen Pauschalpreis inkl. aller AG-Abgaben (z.B. 20 €/h).
// Daraus wird der tatsächliche Bruttolohn zurückgerechnet.
export function agTotalPercent(uvRate: number, kvPflicht: boolean = true): number {
  const kv = kvPflicht ? MINIJOB_RATES.kvAG : 0
  return kv + MINIJOB_RATES.rvAG + MINIJOB_RATES.pauschsteuer +
    MINIJOB_RATES.u2 + MINIJOB_RATES.insolvenzgeld + uvRate
}

export function grossFromBezirkRate(bezirkRate: number, uvRate: number = 1.60, kvPflicht: boolean = true): number {
  return Math.round((bezirkRate / (1 + agTotalPercent(uvRate, kvPflicht) / 100)) * 10000) / 10000
}

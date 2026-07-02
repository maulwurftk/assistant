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
export interface MinijobRates {
  kvAG: number          // Krankenversicherung AG
  rvAG: number          // Rentenversicherung AG
  pauschsteuer: number  // Lohnsteuerpauschale
  u2: number            // Umlage 2 (Mutterschaft)
  insolvenzgeld: number // Insolvenzgeldumlage
  rvAN: number          // Aufstockungsbetrag AN (wenn RV-pflichtig)
}

// Pauschalbeitragssätze 2025 (Arbeitgeber, via Minijob-Zentrale) – Default/Fallback.
// Können pro Instanz in den Einstellungen überschrieben werden.
export const MINIJOB_RATES: MinijobRates = {
  kvAG: 13.00,
  rvAG: 15.00,
  pauschsteuer: 2.00,
  u2: 0.24,
  insolvenzgeld: 0.06,
  rvAN: 3.60,
}

// Sätze aus den (evtl. teilweise gesetzten) payroll_settings-Spalten auflösen.
// Fehlt eine Spalte oder ist null, greift der Default-Satz.
export function ratesFromSettings(
  s:
    | {
        mj_kv_ag?: number | null
        mj_rv_ag?: number | null
        mj_pauschsteuer?: number | null
        mj_u2?: number | null
        mj_insolvenzgeld?: number | null
        mj_rv_an?: number | null
      }
    | null
    | undefined
): MinijobRates {
  const num = (v: number | null | undefined, fallback: number) =>
    typeof v === 'number' && !isNaN(v) ? v : fallback
  return {
    kvAG: num(s?.mj_kv_ag, MINIJOB_RATES.kvAG),
    rvAG: num(s?.mj_rv_ag, MINIJOB_RATES.rvAG),
    pauschsteuer: num(s?.mj_pauschsteuer, MINIJOB_RATES.pauschsteuer),
    u2: num(s?.mj_u2, MINIJOB_RATES.u2),
    insolvenzgeld: num(s?.mj_insolvenzgeld, MINIJOB_RATES.insolvenzgeld),
    rvAN: num(s?.mj_rv_an, MINIJOB_RATES.rvAN),
  }
}

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
  kvPflicht: boolean = true,
  rates: MinijobRates = MINIJOB_RATES
): MinijobBreakdown {
  const pct = (p: number) => Math.round(brutto * p) / 100

  const kvAGAmount = kvPflicht ? pct(rates.kvAG) : 0
  const rvAGAmount = pct(rates.rvAG)
  const pauschsteuerAmount = pct(rates.pauschsteuer)
  const u2Amount = pct(rates.u2)
  const insolvenzgeldAmount = pct(rates.insolvenzgeld)
  const uvAmount = pct(uvRate)

  const rvAN = rvPflicht ? pct(rates.rvAN) : 0
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
export function agTotalPercent(
  uvRate: number,
  kvPflicht: boolean = true,
  rates: MinijobRates = MINIJOB_RATES
): number {
  const kv = kvPflicht ? rates.kvAG : 0
  return kv + rates.rvAG + rates.pauschsteuer + rates.u2 + rates.insolvenzgeld + uvRate
}

export function grossFromBezirkRate(
  bezirkRate: number,
  uvRate: number = 1.60,
  kvPflicht: boolean = true,
  rates: MinijobRates = MINIJOB_RATES
): number {
  return Math.round((bezirkRate / (1 + agTotalPercent(uvRate, kvPflicht, rates) / 100)) * 10000) / 10000
}

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

// Zähl-Modus: welche erfassten Zeiten in die Lohnabrechnung einfließen.
export type PayrollCountMode = 'slots' | 'entries' | 'both'

export function normalizeCountMode(v: unknown): PayrollCountMode {
  return v === 'entries' || v === 'both' ? v : 'slots'
}

export function countedMinutes(
  mode: PayrollCountMode,
  entryMinutes: number,
  slotMinutes: number
): number {
  if (mode === 'entries') return entryMinutes
  if (mode === 'both') return entryMinutes + slotMinutes
  return slotMinutes
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
  u1: number            // Umlage 1 (Krankheit/Kur)
  u2: number            // Umlage 2 (Mutterschaft)
  insolvenzgeld: number // Insolvenzgeldumlage (im Haushaltsscheck-Verfahren i.d.R. 0)
  rvAN: number          // Aufstockungsbetrag AN (wenn RV-pflichtig)
}

// Pauschalbeitragssätze Haushaltsscheck-Verfahren, gültig seit 01.01.2026
// (Arbeitgeber, via Minijob-Zentrale) – Default/Fallback.
// Können pro Instanz in den Einstellungen überschrieben werden.
export const MINIJOB_RATES: MinijobRates = {
  kvAG: 5.00,
  rvAG: 5.00,
  pauschsteuer: 2.00,
  u1: 0.80,
  u2: 0.22,
  insolvenzgeld: 0.00,
  rvAN: 13.60,
}

// Sätze aus den (evtl. teilweise gesetzten) payroll_settings-Spalten auflösen.
// Fehlt eine Spalte oder ist null, greift der Default-Satz.
export function ratesFromSettings(
  s:
    | {
        mj_kv_ag?: number | null
        mj_rv_ag?: number | null
        mj_pauschsteuer?: number | null
        mj_u1?: number | null
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
    u1: num(s?.mj_u1, MINIJOB_RATES.u1),
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
  u1Amount: number
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
  const u1Amount = pct(rates.u1)
  const u2Amount = pct(rates.u2)
  const insolvenzgeldAmount = pct(rates.insolvenzgeld)
  const uvAmount = pct(uvRate)

  const rvAN = rvPflicht ? pct(rates.rvAN) : 0
  const netto = Math.round((brutto - rvAN) * 100) / 100

  const totalAGAbgaben = Math.round(
    (kvAGAmount + rvAGAmount + pauschsteuerAmount + u1Amount + u2Amount + insolvenzgeldAmount + uvAmount) * 100
  ) / 100
  const totalKosten = Math.round((brutto + totalAGAbgaben) * 100) / 100

  return {
    brutto,
    rvAN,
    netto,
    kvAGAmount,
    rvAGAmount,
    pauschsteuerAmount,
    u1Amount,
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
  return kv + rates.rvAG + rates.pauschsteuer + rates.u1 + rates.u2 + rates.insolvenzgeld + uvRate
}

export function grossFromBezirkRate(
  bezirkRate: number,
  uvRate: number = 1.60,
  kvPflicht: boolean = true,
  rates: MinijobRates = MINIJOB_RATES
): number {
  return Math.round((bezirkRate / (1 + agTotalPercent(uvRate, kvPflicht, rates) / 100)) * 10000) / 10000
}

// ── Österreich: geringfügige Beschäftigung ──────────────────────────────────
// Strukturell schlanker als das deutsche Minijob-Verfahren: im Normalfall
// (eine Assistenzperson) fallen AG-seitig nur UV + MVK an. Dienstgeberabgabe
// und Kommunalsteuer sind Sonderfälle (Mehrfachbeschäftigung bzw. Gemeinde-
// Freibetrag überschritten) und defaulten auf 0. 13./14. Gehalt nur, wenn
// ein Kollektivvertrag/Einzelvertrag das vorsieht — daher als Optionen in
// der Funktionssignatur, nicht als impliziter Aufschlag.
// Stand der Sätze: siehe docs/payroll-at-architektur.md (Recherche 2026-07-24).
export type CountryMode = 'de' | 'at'

export function normalizeCountryMode(v: unknown): CountryMode {
  return v === 'at' ? 'at' : 'de'
}

export interface AtRates {
  uvBeitrag: number         // Unfallversicherung AG (Pflicht, alle geringfügig Beschäftigten)
  mvkBeitrag: number        // Betriebliche Vorsorge "Abfertigung neu" (Pflicht ab 2. Monat)
  dgAbgabe: number          // Dienstgeberabgabe (nur bei Mehrfachbeschäftigung über Schwelle)
  kommunalsteuer: number    // Kommunalsteuer (nur bei Überschreiten Gemeinde-Freibetrag)
}

// Defaults 2026 (Quelle: docs/payroll-at-architektur.md). Geringfügigkeitsgrenze
// separat, da sie kein Abgabensatz, sondern eine Schwelle in € ist.
export const AT_RATES: AtRates = {
  uvBeitrag: 1.10,
  mvkBeitrag: 1.53,
  dgAbgabe: 0,
  kommunalsteuer: 0,
}

export const AT_GERINGFUEGIGKEITSGRENZE_2026 = 551.10

export function atRatesFromSettings(
  s:
    | {
        at_uv_beitrag?: number | null
        at_mvk_beitrag?: number | null
        at_dg_abgabe?: number | null
        at_kommunalsteuer?: number | null
      }
    | null
    | undefined
): AtRates {
  const num = (v: number | null | undefined, fallback: number) =>
    typeof v === 'number' && !isNaN(v) ? v : fallback
  return {
    uvBeitrag: num(s?.at_uv_beitrag, AT_RATES.uvBeitrag),
    mvkBeitrag: num(s?.at_mvk_beitrag, AT_RATES.mvkBeitrag),
    dgAbgabe: num(s?.at_dg_abgabe, AT_RATES.dgAbgabe),
    kommunalsteuer: num(s?.at_kommunalsteuer, AT_RATES.kommunalsteuer),
  }
}

export interface AtSonderzahlungOptions {
  includeUrlaubsgeld: boolean
  includeWeihnachtsgeld: boolean
}

export interface AtBreakdown {
  brutto: number
  urlaubsgeldAnteil: number   // aliquot: 1/12 des Brutto, falls aktiviert
  weihnachtsgeldAnteil: number
  bruttoGesamt: number        // brutto + Sonderzahlungsanteile
  netto: number                // unterhalb Geringfügigkeitsgrenze i.d.R. = bruttoGesamt (keine AN-Abzüge)
  uvAmount: number
  mvkAmount: number
  dgAbgabeAmount: number
  kommunalsteuerAmount: number
  totalAGAbgaben: number
  totalKosten: number          // bruttoGesamt + AG-Abgaben
}

// Sonderzahlungen (13./14.) werden hier als monatlicher aliquoter Anteil
// (1/12 pro Sonderzahlung) angenähert, nicht als Jahresendauszahlung -
// passend zur monatlichen Lohnzettel-Logik der App. Bei tatsächlicher
// Auszahlung im Juni/November muss das gesondert abgebildet werden; diese
// Funktion bildet nur die laufende monatliche Rückstellung ab.
export function calculateGeringfuegigAT(
  brutto: number,
  options: AtSonderzahlungOptions = { includeUrlaubsgeld: false, includeWeihnachtsgeld: false },
  rates: AtRates = AT_RATES
): AtBreakdown {
  const urlaubsgeldAnteil = options.includeUrlaubsgeld ? Math.round((brutto / 12) * 100) / 100 : 0
  const weihnachtsgeldAnteil = options.includeWeihnachtsgeld ? Math.round((brutto / 12) * 100) / 100 : 0
  const bruttoGesamt = Math.round((brutto + urlaubsgeldAnteil + weihnachtsgeldAnteil) * 100) / 100

  const pct = (p: number) => Math.round(brutto * p) / 100

  const uvAmount = pct(rates.uvBeitrag)
  const mvkAmount = pct(rates.mvkBeitrag)
  const dgAbgabeAmount = pct(rates.dgAbgabe)
  const kommunalsteuerAmount = pct(rates.kommunalsteuer)

  const totalAGAbgaben = Math.round((uvAmount + mvkAmount + dgAbgabeAmount + kommunalsteuerAmount) * 100) / 100
  const totalKosten = Math.round((bruttoGesamt + totalAGAbgaben) * 100) / 100

  // Unterhalb der Geringfügigkeitsgrenze fallen für die AN-Seite i.d.R. keine
  // Lohnsteuer/SV-Abzüge an (anders als bei DE-Minijob mit RV-Aufstockung).
  // netto = bruttoGesamt, solange keine freiwillige Selbstversicherung greift
  // (die läuft ohnehin separat/jährlich direkt AN <-> ÖGK, nicht über die
  // Lohnabrechnung des Arbeitgebers).
  const netto = bruttoGesamt

  return {
    brutto,
    urlaubsgeldAnteil,
    weihnachtsgeldAnteil,
    bruttoGesamt,
    netto,
    uvAmount,
    mvkAmount,
    dgAbgabeAmount,
    kommunalsteuerAmount,
    totalAGAbgaben,
    totalKosten,
  }
}

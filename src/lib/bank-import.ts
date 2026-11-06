// Kontoauszug-Import: CSV parsen (C24 & ähnliche Banken) und Buchungen
// den Lohn-/Bezirk-Positionen des virtuellen Kontos zuordnen.

export interface BankTx {
  date: string        // YYYY-MM-DD
  amount: number      // signiert: Eingang +, Ausgang −
  recipient: string
  purpose: string
  type: string
}

// ── CSV ──────────────────────────────────────────────────────────────────────
function splitCsv(text: string, delim: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else q = false
      } else cell += c
    } else if (c === '"') q = true
    else if (c === delim) { row.push(cell); cell = '' }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (c === '\r') { /* ignorieren */ }
    else cell += c
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[€\s ]|EUR/gi, '')
  if (!s) return null
  const neg = s.startsWith('-') || s.endsWith('-') || (s.startsWith('(') && s.endsWith(')'))
  s = s.replace(/[-+()]/g, '')
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(s)
  if (isNaN(n)) return null
  return neg ? -n : n
}

export function parseDate(raw: string): string | null {
  const s = raw.trim()
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/)
  if (m) return `20${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}

const norm = (h: string) => h.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z]/g, '')

function findCol(headers: string[], names: string[]): number {
  const h = headers.map(norm)
  for (const n of names) {
    const i = h.indexOf(n)
    if (i >= 0) return i
  }
  return -1
}

export function parseBankCsv(input: string): { txs: BankTx[]; error?: string } {
  const text = input.replace(/^﻿/, '')
  const firstLine = text.split('\n')[0] ?? ''
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows = splitCsv(text, delim)
  if (rows.length < 2) return { txs: [], error: 'Die Datei enthält keine Buchungen.' }

  const headers = rows[0]
  const iDate = findCol(headers, ['buchungsdatum', 'buchungstag', 'datum', 'bookingdate', 'valuta', 'wertstellung'])
  const iAmount = findCol(headers, ['betrag', 'umsatz', 'amount', 'betrageur'])
  const iRecipient = findCol(headers, ['zahlungsempfaenger', 'empfaenger', 'name', 'beguenstigterzahlungspflichtiger', 'auftraggeberempfaenger', 'zahlungspflichtiger'])
  const iPurpose = findCol(headers, ['verwendungszweck', 'buchungstext', 'verwendungszweckzeile'])
  const iDesc = findCol(headers, ['beschreibung'])
  const iType = findCol(headers, ['transaktionstyp', 'umsatzart', 'buchungsart', 'typ'])
  if (iDate < 0 || iAmount < 0) {
    return { txs: [], error: 'Spalten „Buchungsdatum" und „Betrag" nicht gefunden – bitte die CSV-Datei der Bank unverändert hochladen.' }
  }

  const txs: BankTx[] = []
  for (const r of rows.slice(1)) {
    const date = parseDate(r[iDate] ?? '')
    const amount = parseAmount(r[iAmount] ?? '')
    if (!date || amount == null) continue
    txs.push({
      date,
      amount: Math.round(amount * 100) / 100,
      recipient: (iRecipient >= 0 ? r[iRecipient] : '')?.trim() ?? '',
      purpose: [iPurpose >= 0 ? r[iPurpose] : '', iDesc >= 0 ? r[iDesc] : ''].map((x) => (x ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' · '),
      type: (iType >= 0 ? r[iType] : '')?.trim() ?? '',
    })
  }
  if (txs.length === 0) return { txs: [], error: 'Keine gültigen Buchungszeilen gefunden.' }
  return { txs }
}

// ── Zuordnung ────────────────────────────────────────────────────────────────
export interface Classified {
  direction: 'in' | 'out'
  category: string
  kind: 'bezirk' | 'lohn' | 'mutterschutz' | 'minijob' | 'other'
  assistantId?: string
  month?: string          // YYYY-MM (Abrechnungsmonat)
  halfKey?: string        // Minijob: YYYY-07-31 / YYYY-12-31
  uncertain?: boolean
}

const MONTHS: Record<string, number> = {
  januar: 1, jan: 1, februar: 2, feb: 2, maerz: 3, marz: 3, mrz: 3, april: 4, apr: 4, mai: 5,
  juni: 6, jun: 6, juli: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9,
  oktober: 10, okt: 10, november: 11, nov: 11, dezember: 12, dez: 12,
}

const fold = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')

function monthFromPurpose(purpose: string, bookingDate: string): { month: string; uncertain: boolean } {
  const [by, bm] = bookingDate.split('-').map(Number)
  const words = fold(purpose).match(/[a-z]+/g) ?? []
  for (const w of words) {
    const mm = MONTHS[w === 'maerz' ? 'maerz' : w]
    if (mm) {
      const y = mm > bm ? by - 1 : by
      return { month: `${y}-${String(mm).padStart(2, '0')}`, uncertain: false }
    }
  }
  // kein Monat im Verwendungszweck: Vormonat der Buchung annehmen
  const py = bm === 1 ? by - 1 : by
  const pm = bm === 1 ? 12 : bm - 1
  return { month: `${py}-${String(pm).padStart(2, '0')}`, uncertain: true }
}

export function classifyTx(
  tx: BankTx,
  assistants: Array<{ id: string; full_name: string }>
): Classified {
  const direction: 'in' | 'out' = tx.amount >= 0 ? 'in' : 'out'
  const rec = fold(tx.recipient)
  const purpose = fold(tx.purpose)
  const [by, bm] = tx.date.split('-').map(Number)

  if (/bezirk/.test(rec)) {
    if (/rueckzahlung|erstattung/.test(purpose)) {
      return { direction, category: 'Bezirk-Rückzahlung', kind: 'other' }
    }
    if (direction === 'in') {
      return { direction, category: 'Bezirkszahlung', kind: 'bezirk', month: tx.date.slice(0, 7) }
    }
    return { direction, category: 'Bezirk-Rückzahlung', kind: 'other' }
  }

  if (/haushaltsscheck/.test(purpose) || (direction === 'out' && /(drv|knappschaft|minijob)/.test(rec))) {
    const halfKey = bm >= 6 && bm <= 8 ? `${by}-07-31` : bm === 12 ? `${by}-12-31` : bm === 1 ? `${by - 1}-12-31` : undefined
    return { direction, category: 'Minijobgebühren', kind: 'minijob', halfKey }
  }
  if (direction === 'in' && /(drv|knappschaft|minijob)/.test(rec)) {
    return { direction, category: 'Erstattung Minijob-Zentrale (U1/U2)', kind: 'other' }
  }

  const a = assistants.find((x) => {
    const parts = fold(x.full_name).split(/\s+/).filter(Boolean)
    return parts.length > 0 && parts.every((p) => rec.includes(p))
  })
  if (a && direction === 'out') {
    if (/nachzahlung/.test(purpose)) {
      return { direction, category: `Nachzahlung – ${a.full_name}`, kind: 'other', assistantId: a.id }
    }
    const { month, uncertain } = monthFromPurpose(tx.purpose, tx.date)
    if (/mutterschutz/.test(purpose)) {
      return { direction, category: `Mutterschutz-Zuschuss – ${a.full_name}`, kind: 'mutterschutz', assistantId: a.id, month, uncertain }
    }
    return { direction, category: `Nettolohn – ${a.full_name}`, kind: 'lohn', assistantId: a.id, month, uncertain }
  }

  if (/(zins|steuerabrechnung)/.test(purpose) || /c24/.test(rec)) {
    return { direction, category: 'Zinsen / Steuer', kind: 'other' }
  }
  return { direction, category: direction === 'in' ? 'Sonstige Einnahme' : 'Sonstige Ausgabe', kind: 'other' }
}

// Mögliche dedup_keys (in Prioritätsreihenfolge) des erwarteten Kontobuch-Eintrags
export function candidateKeys(c: Classified): string[] {
  const shift = (ym: string, d: number) => {
    const [y, m] = ym.split('-').map(Number)
    const t = new Date(y, m - 1 + d, 1)
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
  }
  if (c.kind === 'bezirk' && c.month) return [c.month, shift(c.month, 1), shift(c.month, -1)].map((m) => `bezirk-${m}`)
  if (c.kind === 'lohn' && c.month && c.assistantId) return [`lohn-${c.month}-${c.assistantId}`]
  if (c.kind === 'mutterschutz' && c.month && c.assistantId) {
    return [`mutterschutz-${c.month}-${c.assistantId}`, `lohn-${c.month}-${c.assistantId}`]
  }
  if (c.kind === 'minijob' && c.halfKey) return [`minijobgebuehren-${c.halfKey}`]
  return []
}

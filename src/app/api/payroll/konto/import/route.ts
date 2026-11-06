import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { resolveTenantAdmin } from '@/lib/tenant'
import type { Database } from '@/types/database'
import { parseBankCsv, classifyTx, candidateKeys, type BankTx } from '@/lib/bank-import'

function adminDb() {
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type LedgerRow = {
  id: string
  booking_date: string
  direction: 'in' | 'out'
  category: string
  amount: number
  status: 'pending' | 'confirmed'
  dedup_key: string | null
  bank_ref: string | null
  description: string | null
}

export type ImportItem = {
  ref: string
  date: string
  amount: number            // immer positiv
  direction: 'in' | 'out'
  recipient: string
  purpose: string
  category: string
  action: 'attach' | 'insert' | 'skip'
  skipReason?: string
  match?: { id: string; expected: number; status: 'pending' | 'confirmed'; category: string }
  diff?: number             // Bank − erwartet
  warning?: string
  uncertain?: boolean
}

export type MissingItem = { id: string; booking_date: string; category: string; amount: number; direction: 'in' | 'out'; status: string }

function refOf(tx: BankTx, n: number) {
  return createHash('sha1').update(`${tx.date}|${tx.amount}|${tx.recipient}|${tx.purpose}`).digest('hex').slice(0, 20) + `-${n}`
}

function addDays(d: string, n: number) {
  const t = new Date(d + 'T00:00:00Z')
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

async function analyze(tenantId: string, csv: string, from?: string) {
  const parsed = parseBankCsv(csv)
  if (parsed.error) return { error: parsed.error } as const

  const db = adminDb()
  const [settingsRes, assistantsRes, ledgerRes] = await Promise.all([
    db.from('payroll_settings').select('monthly_budget').eq('tenant_id', tenantId).single(),
    db.from('profiles').select('id, full_name').eq('tenant_id', tenantId).eq('role', 'assistant'),
    db.from('account_ledger').select('id, booking_date, direction, category, amount, status, dedup_key, bank_ref, description').eq('tenant_id', tenantId),
  ])
  const budget = Number((settingsRes.data as { monthly_budget?: number } | null)?.monthly_budget ?? 0)
  const assistants = (assistantsRes.data ?? []) as Array<{ id: string; full_name: string }>
  const ledger = (ledgerRes.data ?? []) as unknown as LedgerRow[]

  const existingRefs = new Set(ledger.map((l) => l.bank_ref).filter(Boolean) as string[])
  const byKey = new Map(ledger.filter((l) => l.dedup_key).map((l) => [l.dedup_key as string, l]))
  const used = new Set<string>()

  const txs = parsed.txs
    .filter((t) => !from || t.date >= from)
    .sort((a, b) => a.date.localeCompare(b.date))

  const counter = new Map<string, number>()
  const items: ImportItem[] = []

  for (const tx of txs) {
    const base = `${tx.date}|${tx.amount}|${tx.recipient}|${tx.purpose}`
    const n = (counter.get(base) ?? 0) + 1
    counter.set(base, n)
    const ref = refOf(tx, n)
    const abs = Math.abs(tx.amount)
    const common = { ref, date: tx.date, amount: abs, direction: (tx.amount >= 0 ? 'in' : 'out') as 'in' | 'out', recipient: tx.recipient, purpose: tx.purpose }

    if (existingRefs.has(ref)) {
      items.push({ ...common, category: '', action: 'skip', skipReason: 'bereits importiert' })
      continue
    }

    const c = classifyTx(tx, assistants)
    // Mehrmonatszahlung des Bezirks (z.B. 3 × Monatsbudget) nicht einem Monat zuordnen
    if (c.kind === 'bezirk' && budget > 0 && abs / budget >= 1.99 && Math.abs(abs / budget - Math.round(abs / budget)) < 0.01) {
      c.kind = 'other'
      c.category = `Bezirkszahlung (${Math.round(abs / budget)} Monate)`
    }

    let match: LedgerRow | undefined
    for (const key of candidateKeys(c)) {
      const row = byKey.get(key)
      if (row && !used.has(row.id) && !row.bank_ref && row.direction === c.direction) { match = row; break }
    }

    if (match) {
      used.add(match.id)
      const expected = Number(match.amount)
      const diff = Math.round((abs - expected) * 100) / 100
      let warning: string | undefined
      if (Math.abs(diff) > 0.005) warning = `Abweichung ${diff > 0 ? '+' : ''}${diff.toFixed(2).replace('.', ',')} € gegenüber dem Konto (${expected.toFixed(2).replace('.', ',')} €)`
      items.push({
        ...common, category: match.category, action: 'attach', uncertain: c.uncertain,
        match: { id: match.id, expected, status: match.status, category: match.category }, diff, warning,
      })
    } else {
      items.push({ ...common, category: c.category, action: 'insert', uncertain: c.uncertain })
    }
  }

  // Erwartete Buchungen ohne Gegenstück auf dem Kontoauszug
  const dates = txs.map((t) => t.date)
  const minD = dates[0]
  const maxD = dates[dates.length - 1]
  const missing: MissingItem[] = minD
    ? ledger
        .filter((l) => l.dedup_key && /^(lohn|bezirk|mutterschutz)-/.test(l.dedup_key) && !l.bank_ref && !used.has(l.id))
        .filter((l) => l.booking_date >= addDays(minD, -31) && l.booking_date <= maxD)
        .map((l) => ({ id: l.id, booking_date: l.booking_date, category: l.category, amount: Number(l.amount), direction: l.direction, status: l.status }))
        .sort((a, b) => b.booking_date.localeCompare(a.booking_date))
    : []

  return { items: items.reverse(), missing, txs } as const
}

export async function POST(req: Request) {
  const ctx = await resolveTenantAdmin()
  if (!ctx) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const csv = typeof body.csv === 'string' ? body.csv : ''
  if (!csv || csv.length > 2_000_000) return NextResponse.json({ error: 'Datei fehlt oder ist zu groß' }, { status: 400 })
  const from = typeof body.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.from) ? body.from : undefined

  const result = await analyze(ctx.tenantId, csv, from)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })

  if (body.action === 'preview') {
    return NextResponse.json({ ok: true, items: result.items, missing: result.missing })
  }

  if (body.action === 'commit') {
    const selected = new Set<string>(Array.isArray(body.refs) ? body.refs : [])
    const db = adminDb()
    const now = new Date().toISOString()
    let attached = 0
    let inserted = 0

    for (const it of result.items) {
      if (!selected.has(it.ref) || it.action === 'skip') continue
      const desc = `Bank: ${it.purpose || it.recipient}`.slice(0, 240)
      if (it.action === 'attach' && it.match) {
        const { error } = await db.from('account_ledger').update({
          booking_date: it.date,
          amount: it.amount,
          status: 'confirmed',
          confirmed_at: now,
          bank_ref: it.ref,
          description: desc,
        } as never).eq('id', it.match.id).eq('tenant_id', ctx.tenantId)
        if (error) return NextResponse.json({ error: error.message, attached, inserted }, { status: 500 })
        attached++
      } else if (it.action === 'insert') {
        const { error } = await db.from('account_ledger').insert({
          tenant_id: ctx.tenantId,
          booking_date: it.date,
          direction: it.direction,
          category: it.category,
          amount: it.amount,
          description: desc,
          status: 'confirmed',
          source: 'bank',
          created_by: ctx.userId,
          confirmed_at: now,
          bank_ref: it.ref,
        } as never)
        if (error) return NextResponse.json({ error: error.message, attached, inserted }, { status: 500 })
        inserted++
      }
    }
    return NextResponse.json({ ok: true, attached, inserted })
  }

  return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 })
}

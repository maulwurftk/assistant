import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import {
  entryDurationMinutes,
  calculatePay,
  calculateMinijob,
  grossFromBezirkRate,
  ratesFromSettings,
  normalizeCountMode,
  countedMinutes,
} from '@/lib/payroll'

function adminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const, userId: null }
  const db = adminDb()
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Kein Zugriff', status: 403 as const, userId: null }
  return { error: null, status: 200 as const, userId: user.id }
}

// Neue manuelle Buchung (direkt bestätigt)
export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json()

  // Vorschläge aus Lohndaten generieren
  if (body.action === 'generate') {
    return generateSuggestions(auth.userId!)
  }

  const { booking_date, direction, category, amount, description } = body
  if (!booking_date || !['in', 'out'].includes(direction) || !category || amount == null) {
    return NextResponse.json({ error: 'Ungültige Eingabe' }, { status: 400 })
  }

  const db = adminDb()
  const { error } = await db.from('account_ledger').insert({
    booking_date,
    direction,
    category,
    amount: Math.abs(Number(amount)),
    description: description ?? null,
    status: 'confirmed',
    source: 'manual',
    created_by: auth.userId,
    confirmed_at: new Date().toISOString(),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

async function generateSuggestions(userId: string) {
  const db = adminDb()

  const [settingsRes, assistantsRes, slotsRes, entriesRes] = await Promise.all([
    db.from('payroll_settings').select('*').limit(1).single(),
    db.from('profiles').select('id, rv_pflicht, kv_pflicht').eq('role', 'assistant').eq('active', true),
    db.from('calendar_slots').select('assigned_to, date, start_time, end_time').eq('status', 'assigned'),
    db.from('time_entries').select('assistant_id, date, start_time, end_time'),
  ])

  const settings = settingsRes.data as any
  if (!settings) return NextResponse.json({ error: 'Keine Einstellungen' }, { status: 400 })

  const assistants = assistantsRes.data ?? []
  const slots = slotsRes.data ?? []
  const entries = (entriesRes.data ?? []) as Array<{
    assistant_id: string
    date: string
    start_time: string
    end_time: string
  }>

  const monthlyBudget = settings.monthly_budget ?? 0
  const hourlyRate = settings.hourly_rate ?? 0
  const minijobMode = settings.minijob_mode ?? false
  const bezirkMode = settings.bezirk_mode ?? false
  const uvRate = settings.uv_rate ?? 1.6
  const countMode = normalizeCountMode(settings.payroll_count_mode)
  const rates = ratesFromSettings(settings)

  // Slots + Einträge nach Monat gruppieren (alle Monate mit Aktivität)
  const months = new Set<string>()
  const slotsByMonth = new Map<string, typeof slots>()
  for (const s of slots) {
    const key = s.date.slice(0, 7)
    months.add(key)
    if (!slotsByMonth.has(key)) slotsByMonth.set(key, [])
    slotsByMonth.get(key)!.push(s)
  }
  const entriesByMonth = new Map<string, typeof entries>()
  for (const e of entries) {
    const key = e.date.slice(0, 7)
    months.add(key)
    if (!entriesByMonth.has(key)) entriesByMonth.set(key, [])
    entriesByMonth.get(key)!.push(e)
  }

  const suggestions: Array<{
    booking_date: string
    direction: 'in' | 'out'
    category: string
    amount: number
    description: string
    dedup_key: string
  }> = []

  for (const ym of [...months].sort()) {
    const [y, m] = ym.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    const monthSlots = slotsByMonth.get(ym) ?? []
    const monthEntries = entriesByMonth.get(ym) ?? []

    // Einnahme: Bezirkszahlung (Monatsbudget)
    if (monthlyBudget > 0) {
      suggestions.push({
        booking_date: `${ym}-01`,
        direction: 'in',
        category: 'Bezirkszahlung',
        amount: monthlyBudget,
        description: `Monatsbudget ${ym}`,
        dedup_key: `bezirk-${ym}`,
      })
    }

    // Ausgabe: Nettolöhne des Monats (gemäß Zähl-Modus)
    let netTotal = 0
    for (const a of assistants) {
      const slotMinutes = monthSlots
        .filter((s) => s.assigned_to === a.id)
        .reduce((sum, s) => sum + entryDurationMinutes(s.start_time, s.end_time), 0)
      const entryMinutes = monthEntries
        .filter((e) => e.assistant_id === a.id)
        .reduce((sum, e) => sum + entryDurationMinutes(e.start_time, e.end_time), 0)
      const minutes = countedMinutes(countMode, entryMinutes, slotMinutes)
      if (minutes === 0) continue
      const rvPflicht = a.rv_pflicht !== false
      const kvPflicht = a.kv_pflicht !== false
      const bruttoRate = bezirkMode ? grossFromBezirkRate(hourlyRate, uvRate, kvPflicht, rates) : hourlyRate
      const brutto = calculatePay(minutes, bruttoRate)
      const netto = minijobMode ? calculateMinijob(brutto, rvPflicht, uvRate, kvPflicht, rates).netto : brutto
      netTotal += netto
    }
    netTotal = Math.round(netTotal * 100) / 100
    if (netTotal > 0) {
      suggestions.push({
        booking_date: `${ym}-${lastDay.toString().padStart(2, '0')}`,
        direction: 'out',
        category: 'Nettolöhne',
        amount: netTotal,
        description: `Netto-Auszahlung ${ym}`,
        dedup_key: `loehne-${ym}`,
      })
    }
  }

  if (suggestions.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 })
  }

  // Nur einfügen was noch nicht existiert (dedup_key unique, ignoreDuplicates)
  const { error } = await db.from('account_ledger').upsert(
    suggestions.map((s) => ({
      ...s,
      status: 'pending',
      source: 'auto',
      created_by: userId,
    })),
    { onConflict: 'dedup_key', ignoreDuplicates: true }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, generated: suggestions.length })
}

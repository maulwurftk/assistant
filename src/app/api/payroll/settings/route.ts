import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase.from('payroll_settings').select('*').limit(1).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const body = await request.json()
  const {
    hourly_rate,
    currency,
    payroll_enabled,
    payroll_count_mode,
    minijob_mode,
    bezirk_mode,
    uv_rate,
    employer_name,
    employer_address,
    employer_tax_number,
    monthly_budget,
    account_fee,
    weekly_hours_target,
    private_hours_budget,
    private_slot_color,
    mj_kv_ag,
    mj_rv_ag,
    mj_pauschsteuer,
    mj_u1,
    mj_u2,
    mj_insolvenzgeld,
    mj_rv_an,
  } = body

  if (typeof hourly_rate !== 'number' || hourly_rate <= 0) {
    return NextResponse.json({ error: 'Ungültiger Stundensatz' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if ((caller as { role?: string } | null)?.role !== 'admin') {
    return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })
  }

  // Beitragssatz: nur übernehmen wenn valide Zahl 0..100, sonst weglassen (DB-Default greift)
  const rate = (v: unknown) =>
    typeof v === 'number' && !isNaN(v) && v >= 0 && v <= 100 ? v : undefined

  const payload = {
    hourly_rate,
    currency: currency ?? 'EUR',
    updated_by: user.id,
    payroll_enabled: payroll_enabled !== false,
    payroll_count_mode:
      payroll_count_mode === 'entries' || payroll_count_mode === 'both'
        ? payroll_count_mode
        : 'slots',
    minijob_mode: minijob_mode ?? false,
    bezirk_mode: bezirk_mode ?? false,
    uv_rate: typeof uv_rate === 'number' ? uv_rate : 1.6,
    employer_name: employer_name ?? '',
    employer_address: employer_address ?? '',
    employer_tax_number: employer_tax_number ?? '',
    monthly_budget: typeof monthly_budget === 'number' ? monthly_budget : 0,
    account_fee: typeof account_fee === 'number' ? account_fee : 10,
    weekly_hours_target: typeof weekly_hours_target === 'number' ? weekly_hours_target : 15,
    private_hours_budget: typeof private_hours_budget === 'number' ? private_hours_budget : 0,
    private_slot_color: typeof private_slot_color === 'string' && /^#[0-9a-fA-F]{6}$/.test(private_slot_color)
      ? private_slot_color
      : '#a855f7',
    mj_kv_ag: rate(mj_kv_ag),
    mj_rv_ag: rate(mj_rv_ag),
    mj_pauschsteuer: rate(mj_pauschsteuer),
    mj_u1: rate(mj_u1),
    mj_u2: rate(mj_u2),
    mj_insolvenzgeld: rate(mj_insolvenzgeld),
    mj_rv_an: rate(mj_rv_an),
  }

  const { data: existing } = await supabase.from('payroll_settings').select('id').limit(1).single()

  let result
  if (existing?.id) {
    result = await supabase
      .from('payroll_settings')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single()
  } else {
    result = await supabase.from('payroll_settings').insert(payload).select().single()
  }

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })
  return NextResponse.json(result.data)
}

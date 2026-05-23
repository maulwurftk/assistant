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
    minijob_mode,
    uv_rate,
    employer_name,
    employer_address,
    employer_tax_number,
  } = body

  if (typeof hourly_rate !== 'number' || hourly_rate <= 0) {
    return NextResponse.json({ error: 'Ungültiger Stundensatz' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const payload = {
    hourly_rate,
    currency: currency ?? 'EUR',
    updated_by: user.id,
    minijob_mode: minijob_mode ?? false,
    uv_rate: typeof uv_rate === 'number' ? uv_rate : 1.6,
    employer_name: employer_name ?? '',
    employer_address: employer_address ?? '',
    employer_tax_number: employer_tax_number ?? '',
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

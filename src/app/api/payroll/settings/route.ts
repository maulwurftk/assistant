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
  const { hourly_rate, currency } = body

  if (typeof hourly_rate !== 'number' || hourly_rate <= 0) {
    return NextResponse.json({ error: 'Ungültiger Stundensatz' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  // Prüfen ob Zeile existiert
  const { data: existing } = await supabase.from('payroll_settings').select('id').limit(1).single()

  let result
  if (existing?.id) {
    result = await supabase
      .from('payroll_settings')
      .update({ hourly_rate, currency: currency ?? 'EUR', updated_by: user.id })
      .eq('id', existing.id)
      .select()
      .single()
  } else {
    result = await supabase
      .from('payroll_settings')
      .insert({ hourly_rate, currency: currency ?? 'EUR', updated_by: user.id })
      .select()
      .single()
  }

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })
  return NextResponse.json(result.data)
}

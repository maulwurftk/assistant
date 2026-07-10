import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Schließt den Onboarding-Wizard ab (Plan: docs/onboarding-plan.md).
// Assistenzkräfte (Wizard-Schritt 2) laufen bewusst NICHT hier durch,
// sondern einzeln über /api/admin/create-user (eigene Fehlerbehandlung
// pro Person, ein ungültiger Eintrag soll den Rest nicht blockieren).
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if ((caller as { role?: string } | null)?.role !== 'admin') {
    return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })
  }

  const body = await request.json()
  const {
    full_name,
    minijob_mode,
    hourly_rate,
    monthly_budget,
    weekly_hours_target,
    reserve_months,
    activities,
  } = body

  if (typeof full_name !== 'string' || full_name.trim().length < 2) {
    return NextResponse.json({ error: 'Bitte einen gültigen Namen angeben.' }, { status: 400 })
  }
  const rate = typeof hourly_rate === 'number' ? hourly_rate : NaN
  if (isNaN(rate) || rate <= 0) {
    return NextResponse.json({ error: 'Ungültiger Stundensatz' }, { status: 400 })
  }

  // 1 · eigener Name
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ full_name: full_name.trim() })
    .eq('id', user.id)
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

  // 2 · payroll_settings (insert oder update, wie /api/payroll/settings)
  const payload = {
    hourly_rate: rate,
    minijob_mode: minijob_mode === true,
    monthly_budget: typeof monthly_budget === 'number' ? monthly_budget : 0,
    weekly_hours_target: typeof weekly_hours_target === 'number' ? weekly_hours_target : 15,
    reserve_months: typeof reserve_months === 'number' && reserve_months >= 0 ? reserve_months : 2,
  }
  const { data: existing } = await supabase.from('payroll_settings').select('id').limit(1).single()
  const settingsResult = existing?.id
    ? await supabase.from('payroll_settings').update(payload).eq('id', existing.id)
    : await supabase.from('payroll_settings').insert(payload)
  if (settingsResult.error) {
    return NextResponse.json({ error: settingsResult.error.message }, { status: 500 })
  }

  // 3 · Tätigkeiten (Schritt 5) — freibleibend, Wizard blockiert nicht bei leerer Liste
  const activityNames: string[] = Array.isArray(activities)
    ? [...new Set(activities.map((a: unknown) => String(a).trim()).filter((a: string) => a.length > 0))]
    : []
  if (activityNames.length > 0) {
    const { error: activitiesError } = await supabase
      .from('activities')
      .insert(activityNames.map((name, i) => ({ name, sort_order: i })))
    if (activitiesError) {
      return NextResponse.json({ error: activitiesError.message }, { status: 500 })
    }
  }

  // 4 · Abschluss-Flag (organizations hat keine User-Update-Policy → RPC, siehe 0017)
  const { error: rpcError } = await supabase.rpc('complete_onboarding')
  if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

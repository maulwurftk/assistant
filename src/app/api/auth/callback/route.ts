import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Nur interne Pfade zulassen — verhindert Open-Redirect via next=//evil (M2)
  const rawNext = searchParams.get('next') ?? '/payroll'
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/payroll'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}

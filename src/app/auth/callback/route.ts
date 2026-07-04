import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Nur interne Pfade zulassen — verhindert Open-Redirect via next=//evil (M2)
  const rawNext = searchParams.get('next') ?? '/dashboard'
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    // Fehler nicht verschlucken (L7) — sonst landet der User ausgeloggt im Dashboard
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=auth`)
    }
  }

  return NextResponse.redirect(`${origin}${next}`)
}

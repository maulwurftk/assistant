import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (pathname.startsWith('/api/auth')) return supabaseResponse

  // Token-basierte oder Cron-API-Routes: Eigene Auth, kein Session-Cookie nötig
  const publicTokenPaths = [
    '/api/ha/',
    '/api/calendar.ics',
    '/api/send-monthly-reminders',
    '/api/remind-open-slots',
  ]
  if (publicTokenPaths.some((p) => pathname.startsWith(p))) {
    return supabaseResponse
  }

  // Ohne Session erreichbare Seiten: Login, Registrierung (inkl. /abschliessen,
  // das clientseitig selbst auf /login umleitet), Auth-Callback (E-Mail-
  // Bestätigungslinks!), Rechtsseiten und die Sperrseite (muss auch bei
  // Session-Randfällen erreichbar sein, z. B. abgelaufene Session direkt
  // nach Sperrung).
  const publicPaths = [
    '/login',
    '/passwort-vergessen',
    '/registrieren',
    '/auth/callback',
    '/datenschutz',
    '/nutzungsbedingungen',
    '/gesperrt',
  ]
  const isPublic = publicPaths.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  )
  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

import { notFound } from 'next/navigation'
import { resolvePlatformAdmin } from '@/lib/platform'
import MandantenClient from './mandanten-client'

// Superadmin-Sicht: Mandanten verwalten (docs/mandanten-verwaltung-plan.md).
// Kein Nav-Eintrag — bewusst nur per Direkt-URL. Nicht-Platform-Admins
// bekommen 404 (Existenz der Seite wird nicht verraten).
export const metadata = { title: 'Mandanten verwalten · Assistenten-App' }
export const dynamic = 'force-dynamic'

export default async function SuperadminMandantenPage() {
  const ctx = await resolvePlatformAdmin()
  if (!ctx) notFound()

  return <MandantenClient />
}

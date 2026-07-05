import { notFound } from 'next/navigation'
import { resolvePlatformAdmin } from '@/lib/platform'
import RegistrierungClient from './registrierung-client'

// Superadmin-Sicht: Registrierungs-Gating verwalten (Architektur §1.6).
// Kein Nav-Eintrag — bewusst nur per Direkt-URL. Nicht-Platform-Admins
// bekommen 404 (Existenz der Seite wird nicht verraten).
export const metadata = { title: 'Registrierung verwalten · Assistenten-App' }
export const dynamic = 'force-dynamic'

export default async function SuperadminRegistrierungPage() {
  const ctx = await resolvePlatformAdmin()
  if (!ctx) notFound()

  return <RegistrierungClient />
}

'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

// Registrierung neuer Arbeitgeber (Architektur §4.1):
// signUp → provision_tenant-RPC legt Org + Admin-Profil transaktional an.
// Falls E-Mail-Bestätigung aktiv ist (kein Session-Objekt nach signUp), wird
// der Org-Name in user_metadata geparkt und die Provisionierung beim ersten
// Login über /registrieren/abschliessen nachgeholt — kein Zombie-Account.
export default function RegistrierenPage() {
  const router = useRouter()
  const supabase = createClient()
  const [orgName, setOrgName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (orgName.trim().length < 3) {
      setError('Bitte einen Organisationsnamen mit mindestens 3 Zeichen angeben.')
      return
    }
    if (password.length < 8) {
      setError('Das Passwort muss mindestens 8 Zeichen lang sein.')
      return
    }
    if (password !== password2) {
      setError('Die Passwörter stimmen nicht überein.')
      return
    }

    setLoading(true)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { org_name: orgName.trim() } },
    })

    if (signUpError) {
      setError(
        signUpError.message.includes('already registered')
          ? 'Diese E-Mail-Adresse ist bereits registriert.'
          : 'Registrierung fehlgeschlagen: ' + signUpError.message
      )
      setLoading(false)
      return
    }

    if (!data.session) {
      // E-Mail-Bestätigung aktiv: Einrichtung wird beim ersten Login abgeschlossen.
      setInfo(
        'Fast geschafft! Bitte bestätigen Sie Ihre E-Mail-Adresse über den zugesandten Link und melden Sie sich danach an — die Einrichtung wird dann automatisch abgeschlossen.'
      )
      setLoading(false)
      return
    }

    // Session vorhanden → Org + Admin-Profil sofort transaktional anlegen
    const { error: provisionError } = await supabase.rpc('provision_tenant', {
      p_org_name: orgName.trim(),
      p_slug: orgName.trim(),
    })

    if (provisionError) {
      setError(
        provisionError.message.includes('slug already taken')
          ? 'Dieser Organisationsname ist bereits vergeben — bitte einen anderen wählen.'
          : 'Einrichtung fehlgeschlagen: ' + provisionError.message
      )
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm bg-surface rounded-xl shadow-sm border border-slate-200 p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Konto erstellen</h1>
          <p className="text-sm text-slate-500 mt-1">
            Für Arbeitgeber: eigene Organisation anlegen
          </p>
        </div>

        {info ? (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg">
            {info}
          </p>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label htmlFor="reg-org" className="block text-sm font-medium text-slate-700 mb-1.5">
                Name der Organisation
              </label>
              <input
                id="reg-org"
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                minLength={3}
                placeholder="z. B. Assistenz Müller"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="reg-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                E-Mail
              </label>
              <input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="reg-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                Passwort
              </label>
              <input
                id="reg-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="reg-password2" className="block text-sm font-medium text-slate-700 mb-1.5">
                Passwort wiederholen
              </label>
              <input
                id="reg-password2"
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Konto wird erstellt…' : 'Konto erstellen'}
            </button>
          </form>
        )}

        <p className="text-sm text-slate-500 mt-6">
          Bereits ein Konto?{' '}
          <a href="/login" className="text-blue-600 hover:underline">Anmelden</a>
        </p>
      </div>
    </div>
  )
}

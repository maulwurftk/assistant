'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Passwort-vergessen-Flow: sendet einen Supabase-Recovery-Link per E-Mail.
// Der Link führt über /auth/callback (code exchange) zu /passwort-zuruecksetzen,
// wo das neue Passwort gesetzt wird. redirectTo basiert bewusst auf
// window.location.origin (nicht auf einer festen Domain), damit der Flow
// während der Domain-Migration auf beiden Domains funktioniert.
export default function PasswortVergessenPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/passwort-zuruecksetzen')}`,
    })

    setLoading(false)
    if (error) {
      setError('Anfrage fehlgeschlagen. Bitte versuchen Sie es später erneut.')
      return
    }
    // Aus Datenschutzgründen (kein Erraten registrierter E-Mails) immer denselben
    // Erfolgshinweis zeigen, unabhängig davon, ob die E-Mail existiert.
    setSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm bg-surface rounded-xl shadow-sm border border-slate-200 p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Passwort vergessen</h1>
          <p className="text-sm text-slate-500 mt-1">
            Wir senden Ihnen einen Link zum Zurücksetzen
          </p>
        </div>

        {sent ? (
          <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg">
            Falls ein Konto zu dieser E-Mail-Adresse existiert, wurde soeben eine
            E-Mail mit einem Link zum Zurücksetzen des Passworts verschickt.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="pv-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                E-Mail
              </label>
              <input
                id="pv-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
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
              {loading ? 'Wird gesendet…' : 'Link senden'}
            </button>
          </form>
        )}

        <p className="text-sm text-slate-500 mt-6">
          <a href="/login" className="text-blue-600 hover:underline">Zurück zur Anmeldung</a>
        </p>
      </div>
    </div>
  )
}

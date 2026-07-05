'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

// Abschluss der Registrierung (Architektur §4.1, Zombie-Schutz):
// Eingeloggte User OHNE Profil landen hier (Redirect aus dem Layout) und
// bekommen ihre Org + Admin-Profil via provision_tenant angelegt — mit dem
// bei der Registrierung in user_metadata geparkten Org-Namen und
// Einladungscode (reg_code, 0013), oder per Eingabe.
export default function RegistrierungAbschliessenPage() {
  const router = useRouter()
  const supabase = createClient()
  const [orgName, setOrgName] = useState('')
  const [code, setCode] = useState('')
  const [needsInput, setNeedsInput] = useState(false)
  const [needsCode, setNeedsCode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const provision = useCallback(async (name: string, regCode: string | null) => {
    setLoading(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('provision_tenant', {
      p_org_name: name,
      p_slug: name,
      p_code: regCode,
    })
    if (rpcError) {
      if (rpcError.message.includes('already provisioned')) {
        router.push('/dashboard')
        return
      }
      if (
        rpcError.message.includes('registration code required') ||
        rpcError.message.includes('invalid registration code')
      ) {
        setError(
          rpcError.message.includes('required')
            ? 'Für die Einrichtung wird ein Einladungscode benötigt.'
            : 'Dieser Einladungscode ist ungültig, abgelaufen oder bereits verbraucht.'
        )
        setNeedsCode(true)
      } else if (rpcError.message.includes('registration closed')) {
        setError('Die Registrierung ist derzeit geschlossen. Bitte wenden Sie sich an den Betreiber.')
      } else {
        setError(
          rpcError.message.includes('slug already taken')
            ? 'Dieser Organisationsname ist bereits vergeben — bitte einen anderen wählen.'
            : 'Einrichtung fehlgeschlagen: ' + rpcError.message
        )
      }
      setNeedsInput(true)
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }, [router, supabase])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      // Schon provisioniert? → weiter zur App
      const { data: tenant } = await supabase.rpc('current_tenant')
      if (tenant) {
        router.push('/dashboard')
        return
      }
      const stored = (user.user_metadata?.org_name as string | undefined)?.trim()
      const storedCode = (user.user_metadata?.reg_code as string | undefined)?.trim() || null
      if (storedCode) setCode(storedCode)
      if (stored && stored.length >= 3) {
        setOrgName(stored)
        await provision(stored, storedCode)
      } else {
        setNeedsInput(true)
        setLoading(false)
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (orgName.trim().length < 3) {
      setError('Bitte einen Organisationsnamen mit mindestens 3 Zeichen angeben.')
      return
    }
    await provision(orgName.trim(), code.trim() || null)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm bg-surface rounded-xl shadow-sm border border-slate-200 p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Einrichtung abschließen</h1>
          <p className="text-sm text-slate-500 mt-1">Ihre Organisation wird angelegt</p>
        </div>

        {loading && !needsInput ? (
          <p className="text-sm text-slate-500">Einen Moment…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="fin-org" className="block text-sm font-medium text-slate-700 mb-1.5">
                Name der Organisation
              </label>
              <input
                id="fin-org"
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                minLength={3}
                placeholder="z. B. Assistenz Müller"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {needsCode && (
              <div>
                <label htmlFor="fin-code" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Einladungscode
                </label>
                <input
                  id="fin-code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  autoComplete="off"
                  placeholder="Code aus Ihrer Einladung"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}

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
              {loading ? 'Wird angelegt…' : 'Organisation anlegen'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

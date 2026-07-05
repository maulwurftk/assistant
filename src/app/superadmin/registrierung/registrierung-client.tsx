'use client'

import { useEffect, useState } from 'react'

type RegMode = 'open' | 'code' | 'closed'
type Code = {
  id: string
  code: string
  max_uses: number
  used_count: number
  expires_at: string | null
  note: string | null
  created_at: string
}
type State = { mode: RegMode; codes: Code[] }

const MODE_LABELS: Record<RegMode, { label: string; hint: string }> = {
  open: { label: 'Offen', hint: 'Jeder kann sich registrieren' },
  code: { label: 'Nur mit Code', hint: 'Registrierung nur mit gültigem Einladungscode' },
  closed: { label: 'Geschlossen', hint: 'Niemand kann sich registrieren' },
}

function codeStatus(c: Code): { text: string; active: boolean } {
  if (c.expires_at && new Date(c.expires_at) <= new Date())
    return { text: 'abgelaufen/gesperrt', active: false }
  if (c.used_count >= c.max_uses) return { text: 'verbraucht', active: false }
  return { text: 'aktiv', active: true }
}

export default function RegistrierungClient() {
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  // Formular „neuer Code"
  const [newCode, setNewCode] = useState('')
  const [maxUses, setMaxUses] = useState(1)
  const [expiresAt, setExpiresAt] = useState('')
  const [note, setNote] = useState('')

  async function api(body?: object) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/superadmin/registrierung', {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Fehler')
        return
      }
      setState(json)
    } catch {
      setError('Netzwerkfehler')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    api()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    await api({
      action: 'create_code',
      code: newCode.trim() || undefined,
      max_uses: maxUses,
      expires_at: expiresAt || null,
      note: note.trim() || null,
    })
    setNewCode('')
    setMaxUses(1)
    setExpiresAt('')
    setNote('')
  }

  async function copyLink(code: string) {
    const link = `${window.location.origin}/registrieren?code=${encodeURIComponent(code)}`
    try {
      await navigator.clipboard.writeText(link)
      setCopied(code)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      setError('Kopieren fehlgeschlagen — Link: ' + link)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Registrierung verwalten</h1>
          <p className="text-sm text-slate-500 mt-1">
            Plattform-Einstellung — gilt für alle Organisationen
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        {!state ? (
          <p className="text-sm text-slate-500">Einen Moment…</p>
        ) : (
          <>
            {/* Modus */}
            <section className="bg-surface rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-3">Registrierungs-Modus</h2>
              <div className="flex flex-col sm:flex-row gap-2">
                {(Object.keys(MODE_LABELS) as RegMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={busy || state.mode === m}
                    onClick={() => api({ action: 'set_mode', mode: m })}
                    className={
                      'flex-1 text-left px-4 py-3 rounded-lg border text-sm transition-colors ' +
                      (state.mode === m
                        ? 'border-blue-600 bg-blue-50 text-blue-900'
                        : 'border-slate-200 bg-surface text-slate-600 hover:border-slate-300 disabled:opacity-50')
                    }
                  >
                    <span className="font-medium block">{MODE_LABELS[m].label}</span>
                    <span className="text-xs text-slate-500">{MODE_LABELS[m].hint}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* Neuer Code */}
            <section className="bg-surface rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-3">Neuen Einladungscode anlegen</h2>
              <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="sa-code" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Code <span className="text-slate-400">(leer = automatisch)</span>
                  </label>
                  <input
                    id="sa-code"
                    type="text"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    pattern="[A-Za-z0-9-]{4,64}"
                    placeholder="z. B. PARTNER-2026"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label htmlFor="sa-uses" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Max. Nutzungen
                  </label>
                  <input
                    id="sa-uses"
                    type="number"
                    min={1}
                    max={10000}
                    value={maxUses}
                    onChange={(e) => setMaxUses(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label htmlFor="sa-expires" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Ablaufdatum <span className="text-slate-400">(optional)</span>
                  </label>
                  <input
                    id="sa-expires"
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label htmlFor="sa-note" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Notiz <span className="text-slate-400">(optional)</span>
                  </label>
                  <input
                    id="sa-note"
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={200}
                    placeholder="z. B. Für Kunde X"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="py-2.5 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {busy ? 'Bitte warten…' : 'Code anlegen'}
                  </button>
                </div>
              </form>
            </section>

            {/* Liste */}
            <section className="bg-surface rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-3">
                Codes ({state.codes.length})
              </h2>
              {state.codes.length === 0 ? (
                <p className="text-sm text-slate-500">Noch keine Codes angelegt.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {state.codes.map((c) => {
                    const st = codeStatus(c)
                    return (
                      <div key={c.id} className="py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                        <code className="text-sm font-mono font-medium text-slate-900">{c.code}</code>
                        <span
                          className={
                            'text-xs px-2 py-0.5 rounded-full ' +
                            (st.active
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border border-slate-200')
                          }
                        >
                          {st.text}
                        </span>
                        <span className="text-xs text-slate-500">
                          {c.used_count}/{c.max_uses} genutzt
                          {c.expires_at &&
                            ' · bis ' + new Date(c.expires_at).toLocaleDateString('de-DE')}
                          {c.note && ' · ' + c.note}
                        </span>
                        <span className="ml-auto flex gap-2">
                          <button
                            type="button"
                            onClick={() => copyLink(c.code)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            {copied === c.code ? 'Kopiert!' : 'Link kopieren'}
                          </button>
                          {st.active && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => api({ action: 'lock_code', id: c.id })}
                              className="text-xs text-red-600 hover:underline disabled:opacity-50"
                            >
                              Sperren
                            </button>
                          )}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
              <p className="text-xs text-slate-400 mt-4">
                Einladungslink-Format: /registrieren?code=… · Sperren setzt das
                Ablaufdatum auf jetzt (bereits erfolgte Registrierungen bleiben
                unberührt).
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

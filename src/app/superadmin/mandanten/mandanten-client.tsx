'use client'

import { useEffect, useState } from 'react'

type Status = 'active' | 'suspended' | 'deleted'
type Plan = 'free' | 'paid'
type Org = {
  id: string
  name: string
  slug: string
  status: Status
  plan: string
  notes: string | null
  created_at: string
  user_count: number
}
type State = { orgs: Org[] }

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE')
}

export default function MandantenClient() {
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Sperren erfordert eine zweistufige Bestätigung (Org-ID des zu bestätigenden Vorgangs).
  const [confirmSuspendId, setConfirmSuspendId] = useState<string | null>(null)

  // Inline-Bearbeitung der Notiz je Org.
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')

  async function api(body?: object) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/superadmin/mandanten', {
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

  async function handleSetPlan(id: string, plan: Plan) {
    await api({ action: 'set_plan', id, plan })
  }

  async function handleSuspend(id: string) {
    setConfirmSuspendId(null)
    await api({ action: 'set_status', id, status: 'suspended' })
  }

  async function handleUnsuspend(id: string) {
    await api({ action: 'set_status', id, status: 'active' })
  }

  function startEditNote(org: Org) {
    setEditingNoteId(org.id)
    setNoteDraft(org.notes ?? '')
  }

  async function saveNote(id: string) {
    await api({ action: 'set_note', id, notes: noteDraft.trim() || null })
    setEditingNoteId(null)
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Mandanten verwalten</h1>
            <p className="text-sm text-slate-500 mt-1">
              Alle Organisationen — Status, Plan und Notizen
            </p>
          </div>
          <a href="/superadmin/registrierung" className="text-sm text-blue-600 hover:underline">
            Registrierung →
          </a>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        {!state ? (
          <p className="text-sm text-slate-500">Einen Moment…</p>
        ) : (
          <section className="bg-surface rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-3">
              Organisationen ({state.orgs.length})
            </h2>
            {state.orgs.length === 0 ? (
              <p className="text-sm text-slate-500">Keine Organisationen vorhanden.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {state.orgs.map((org) => {
                  const isSuspended = org.status === 'suspended'
                  const isConfirming = confirmSuspendId === org.id
                  const isEditingNote = editingNoteId === org.id
                  return (
                    <div key={org.id} className="py-4 space-y-2">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <div className="min-w-[10rem]">
                          <span className="text-sm font-medium text-slate-900 block">{org.name}</span>
                          <span className="text-xs text-slate-400">{org.slug}</span>
                        </div>

                        <select
                          value={org.plan}
                          disabled={busy}
                          onChange={(e) => handleSetPlan(org.id, e.target.value as Plan)}
                          className="text-sm border border-slate-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                        >
                          <option value="free">Free</option>
                          <option value="paid">Paid</option>
                        </select>

                        <span
                          className={
                            'text-xs px-2 py-0.5 rounded-full border ' +
                            (org.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-red-50 text-red-700 border-red-200')
                          }
                        >
                          {org.status === 'active' ? 'Aktiv' : org.status === 'suspended' ? 'Gesperrt' : 'Gelöscht'}
                        </span>

                        <span className="text-xs text-slate-500">
                          {org.user_count} Nutzer
                        </span>

                        <span className="text-xs text-slate-500">
                          angelegt am {formatDate(org.created_at)}
                        </span>

                        <span className="ml-auto flex gap-2">
                          {isSuspended ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleUnsuspend(org.id)}
                              className="text-xs text-emerald-600 hover:underline disabled:opacity-50"
                            >
                              Entsperren
                            </button>
                          ) : !isConfirming ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setConfirmSuspendId(org.id)}
                              className="text-xs text-red-600 hover:underline disabled:opacity-50"
                            >
                              Sperren
                            </button>
                          ) : null}
                        </span>
                      </div>

                      {isConfirming && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                          <p className="text-xs text-amber-800">
                            User können sich sofort nicht mehr anmelden, Daten bleiben erhalten.
                          </p>
                          <span className="ml-auto flex gap-3">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleSuspend(org.id)}
                              className="text-xs text-red-600 font-medium hover:underline disabled:opacity-50"
                            >
                              Bestätigen
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setConfirmSuspendId(null)}
                              className="text-xs text-slate-500 hover:underline disabled:opacity-50"
                            >
                              Abbrechen
                            </button>
                          </span>
                        </div>
                      )}

                      {isEditingNote ? (
                        <div className="space-y-1.5">
                          <textarea
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            maxLength={2000}
                            rows={2}
                            placeholder="Notiz zu diesem Mandanten…"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <div className="flex gap-3">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => saveNote(org.id)}
                              className="text-xs text-blue-600 font-medium hover:underline disabled:opacity-50"
                            >
                              Speichern
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setEditingNoteId(null)}
                              className="text-xs text-slate-500 hover:underline disabled:opacity-50"
                            >
                              Abbrechen
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditNote(org)}
                          className="text-xs text-left text-slate-500 hover:text-slate-700"
                        >
                          {org.notes ? org.notes : <span className="text-slate-400">Notiz hinzufügen…</span>}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

// Pflicht-Wizard nach Erstregistrierung (Plan: docs/onboarding-plan.md).
// Guard sitzt in (main)/layout.tsx: organizations.onboarding_completed_at
// = null → hierher. Fünf Schritte, letzter Schritt ruft /api/onboarding/complete.

const STEP_LABELS = ['Name', 'Team', 'Minijob', 'Budget', 'Tätigkeiten']

const SUGGESTED_ACTIVITIES = [
  'Haushalt',
  'Einkaufen',
  'Behördengänge',
  'Freizeitbegleitung',
  'Pflege',
  'Fahrdienst',
  'Dokumentation',
]

type AssistantRow = {
  full_name: string
  email: string
  password: string
  status: 'idle' | 'saving' | 'done' | 'error'
  error?: string
}

const emptyAssistant: AssistantRow = { full_name: '', email: '', password: '', status: 'idle' }

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(true)
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Schritt 1
  const [fullName, setFullName] = useState('')

  // Schritt 2
  const [assistants, setAssistants] = useState<AssistantRow[]>([{ ...emptyAssistant }])

  // Schritt 3
  const [minijobMode, setMinijobMode] = useState(false)

  // Schritt 4
  const [hourlyRate, setHourlyRate] = useState('20')
  const [monthlyBudget, setMonthlyBudget] = useState('1310')
  const [weeklyHoursTarget, setWeeklyHoursTarget] = useState('15')
  const [reserveMonths, setReserveMonths] = useState('2')

  // Schritt 5
  const [selectedActivities, setSelectedActivities] = useState<Set<string>>(new Set())
  const [customActivity, setCustomActivity] = useState('')

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: tenant } = await supabase.rpc('current_tenant')
      if (!tenant) { router.push('/registrieren/abschliessen'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()
      if (profile?.full_name) setFullName(profile.full_name)
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateAssistant(i: number, patch: Partial<AssistantRow>) {
    setAssistants(prev => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))
  }

  async function createAssistant(i: number) {
    const row = assistants[i]
    if (!row.full_name || !row.email || !row.password) {
      updateAssistant(i, { status: 'error', error: 'Bitte Name, E-Mail und Passwort ausfüllen.' })
      return
    }
    if (row.password.length < 8) {
      updateAssistant(i, { status: 'error', error: 'Passwort muss mindestens 8 Zeichen haben.' })
      return
    }
    updateAssistant(i, { status: 'saving', error: undefined })
    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...row, role: 'assistant' }),
    })
    const data = await res.json()
    if (!res.ok) {
      updateAssistant(i, { status: 'error', error: data.error ?? 'Unbekannter Fehler' })
      return
    }
    updateAssistant(i, { status: 'done' })
  }

  function toggleActivity(name: string) {
    setSelectedActivities(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function addCustomActivity() {
    const name = customActivity.trim()
    if (!name) return
    setSelectedActivities(prev => new Set(prev).add(name))
    setCustomActivity('')
  }

  function num(v: string, fallback = 0) {
    const n = parseFloat(v.replace(',', '.'))
    return isNaN(n) ? fallback : n
  }

  async function finish() {
    setFinishing(true)
    setError(null)
    const res = await fetch('/api/onboarding/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: fullName.trim(),
        minijob_mode: minijobMode,
        hourly_rate: num(hourlyRate),
        monthly_budget: num(monthlyBudget),
        weekly_hours_target: num(weeklyHoursTarget),
        reserve_months: num(reserveMonths),
        activities: [...selectedActivities],
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Einrichtung fehlgeschlagen')
      setFinishing(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  function next() {
    setError(null)
    if (step === 1 && fullName.trim().length < 2) {
      setError('Bitte einen Namen mit mindestens 2 Zeichen angeben.')
      return
    }
    if (step === 4 && num(hourlyRate) <= 0) {
      setError('Bitte einen gültigen Stundensatz angeben.')
      return
    }
    if (step < 5) setStep(step + 1)
    else finish()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Einen Moment…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-8">
      <div className="w-full max-w-lg bg-surface rounded-xl shadow-sm border border-slate-200 p-8">
        <div className="mb-6">
          <p className="text-xs font-medium text-blue-600 mb-1">
            Schritt {step} von 5 · {STEP_LABELS[step - 1]}
          </p>
          <div className="flex gap-1">
            {STEP_LABELS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full ${i < step ? 'bg-blue-600' : 'bg-slate-200'}`}
              />
            ))}
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold text-slate-900">Wie heißen Sie?</h1>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Ihr Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-bold text-slate-900">Assistenzkräfte anlegen</h1>
              <p className="text-sm text-slate-500 mt-1">
                Optional — kann auch später unter „Benutzerverwaltung" nachgeholt werden.
              </p>
            </div>
            <div className="space-y-3">
              {assistants.map((row, i) => (
                <div key={i} className="border border-slate-200 rounded-lg p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      placeholder="Name"
                      value={row.full_name}
                      onChange={(e) => updateAssistant(i, { full_name: e.target.value })}
                      disabled={row.status === 'done'}
                      className="px-2.5 py-1.5 border border-slate-300 rounded-md text-sm disabled:bg-slate-50"
                    />
                    <input
                      placeholder="E-Mail"
                      type="email"
                      value={row.email}
                      onChange={(e) => updateAssistant(i, { email: e.target.value })}
                      disabled={row.status === 'done'}
                      className="px-2.5 py-1.5 border border-slate-300 rounded-md text-sm disabled:bg-slate-50"
                    />
                  </div>
                  {row.status !== 'done' && (
                    <div className="flex gap-2">
                      <input
                        placeholder="Passwort (min. 8 Zeichen)"
                        type="password"
                        value={row.password}
                        onChange={(e) => updateAssistant(i, { password: e.target.value })}
                        className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded-md text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => createAssistant(i)}
                        disabled={row.status === 'saving'}
                        className="px-3 py-1.5 bg-slate-900 text-white rounded-md text-sm disabled:opacity-50"
                      >
                        {row.status === 'saving' ? '…' : 'Anlegen'}
                      </button>
                    </div>
                  )}
                  {row.status === 'done' && (
                    <p className="text-xs text-emerald-700">✓ Angelegt</p>
                  )}
                  {row.status === 'error' && (
                    <p className="text-xs text-red-600">{row.error}</p>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAssistants(prev => [...prev, { ...emptyAssistant }])}
              className="text-sm text-blue-600 hover:underline"
            >
              + Weitere Assistenzkraft
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold text-slate-900">Minijob-Funktion</h1>
            <p className="text-sm text-slate-500">
              Minijob-konforme Abrechnung inkl. UV-Umlage aktivieren? Beitragssätze sind mit
              Standardwerten vorbelegt und später unter „Einstellungen" feinjustierbar.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setMinijobMode(true)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium border ${
                  minijobMode ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300 text-slate-700'
                }`}
              >
                Ja
              </button>
              <button
                type="button"
                onClick={() => setMinijobMode(false)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium border ${
                  !minijobMode ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300 text-slate-700'
                }`}
              >
                Nein
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold text-slate-900">Budget</h1>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Stundensatz (€)</label>
              <input
                inputMode="decimal"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Monatliches Budget (€)</label>
              <input
                inputMode="decimal"
                value={monthlyBudget}
                onChange={(e) => setMonthlyBudget(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Ziel-Wochenstunden</label>
              <input
                inputMode="decimal"
                value={weeklyHoursTarget}
                onChange={(e) => setWeeklyHoursTarget(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Rücklage (in Monatsbudgets)
              </label>
              <input
                inputMode="decimal"
                value={reserveMonths}
                onChange={(e) => setReserveMonths(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
              <p className="text-xs text-slate-500 mt-1">
                Wie viele Monatsbudgets sollen als Puffer auf dem Konto bleiben, bevor Geld
                zurücküberwiesen wird?
              </p>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-bold text-slate-900">Tätigkeiten</h1>
              <p className="text-sm text-slate-500 mt-1">
                Zur Auswahl gestellt — jederzeit später unter „Tätigkeiten" anpassbar.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_ACTIVITIES.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleActivity(name)}
                  className={`px-3 py-1.5 rounded-full text-sm border ${
                    selectedActivities.has(name)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-slate-300 text-slate-700'
                  }`}
                >
                  {name}
                </button>
              ))}
              {[...selectedActivities]
                .filter((n) => !SUGGESTED_ACTIVITIES.includes(n))
                .map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleActivity(name)}
                    className="px-3 py-1.5 rounded-full text-sm border bg-blue-600 text-white border-blue-600"
                  >
                    {name} ×
                  </button>
                ))}
            </div>
            <div className="flex gap-2">
              <input
                placeholder="+ eigene Tätigkeit"
                value={customActivity}
                onChange={(e) => setCustomActivity(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomActivity() } }}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
              <button
                type="button"
                onClick={addCustomActivity}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700"
              >
                Hinzufügen
              </button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        <div className="mt-8 flex justify-between">
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            disabled={step === 1}
            className="px-4 py-2 text-sm text-slate-600 disabled:opacity-0"
          >
            Zurück
          </button>
          <button
            type="button"
            onClick={next}
            disabled={finishing}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {step < 5 ? 'Weiter' : finishing ? 'Wird abgeschlossen…' : 'Fertig'}
          </button>
        </div>
      </div>
    </div>
  )
}

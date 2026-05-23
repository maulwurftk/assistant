'use client'

import { useState } from 'react'

type Props = {
  currentRate: number
  currentCurrency: string
  hasSettings: boolean
}

export default function SettingsForm({ currentRate, currentCurrency, hasSettings }: Props) {
  const [rate, setRate] = useState(currentRate.toString())
  const [currency, setCurrency] = useState(currentCurrency)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    const parsedRate = parseFloat(rate.replace(',', '.'))
    if (isNaN(parsedRate) || parsedRate <= 0) {
      setMessage({ type: 'error', text: 'Bitte einen gültigen Stundensatz eingeben.' })
      setSaving(false)
      return
    }

    try {
      const res = await fetch('/api/payroll/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hourly_rate: parsedRate, currency }),
      })
      if (!res.ok) throw new Error('Fehler beim Speichern')
      setMessage({ type: 'success', text: 'Einstellungen gespeichert.' })
    } catch {
      setMessage({ type: 'error', text: 'Fehler beim Speichern. Bitte erneut versuchen.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Stundensatz (€/h)
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            step="0.01"
            min="0.01"
            required
            className="w-36 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="z.B. 15.50"
          />
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="EUR">EUR (€)</option>
            <option value="CHF">CHF</option>
          </select>
        </div>
        <p className="text-xs text-slate-400 mt-1.5">
          Gilt für alle Assistenten gleichmäßig
        </p>
      </div>

      {message && (
        <div
          className={`px-4 py-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? 'Speichern…' : hasSettings ? 'Aktualisieren' : 'Erstmalig speichern'}
      </button>
    </form>
  )
}

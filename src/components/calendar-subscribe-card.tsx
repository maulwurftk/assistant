'use client'

import { useState } from 'react'
import { CalendarDays, Copy, Check, ExternalLink, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

export function CalendarSubscribeCard() {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [copied, setCopied] = useState(false)

  async function reveal() {
    if (url) return
    setLoading(true)
    try {
      const res = await fetch('/api/ical-token')
      const data = await res.json()
      setUrl(data.url)
    } catch {
      toast.error('Link konnte nicht geladen werden')
    }
    setLoading(false)
  }

  async function reset() {
    setResetting(true)
    try {
      const res = await fetch('/api/ical-token', { method: 'POST' })
      const data = await res.json()
      setUrl(data.url)
      toast.success('Neuer Link erzeugt – alte Abos werden ungültig')
    } catch {
      toast.error('Zurücksetzen fehlgeschlagen')
    }
    setResetting(false)
  }

  function copy() {
    if (!url) return
    navigator.clipboard.writeText(url)
    setCopied(true)
    toast.success('Link kopiert')
    setTimeout(() => setCopied(false), 2000)
  }

  function openGoogle() {
    if (!url) return
    window.open(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url)}`, '_blank')
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-surface p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
          <CalendarDays className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900">Meinen Kalender abonnieren</h3>
          <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">
            Deine Einsätze automatisch in Google Kalender, Apple Kalender oder Outlook –
            nur deine eigenen Termine, immer aktuell.
          </p>

          {!url ? (
            <button
              onClick={reveal}
              disabled={loading}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              <CalendarDays className="h-4 w-4" />
              {loading ? 'Lädt…' : 'Meinen Kalender-Link anzeigen'}
            </button>
          ) : (
            <div className="mt-3 space-y-2">
              <div className="flex gap-2">
                <code className="flex-1 min-w-0 truncate rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs text-slate-600">
                  {url}
                </code>
                <button
                  onClick={copy}
                  title="Link kopieren"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={openGoogle}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> In Google Kalender öffnen
                </button>
                <button
                  onClick={reset}
                  disabled={resetting}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${resetting ? 'animate-spin' : ''}`} /> Link zurücksetzen
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

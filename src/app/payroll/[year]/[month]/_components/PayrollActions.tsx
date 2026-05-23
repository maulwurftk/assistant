'use client'

import { useState } from 'react'
import Link from 'next/link'

type Props = {
  assistantId: string
  assistantName: string
  assistantEmail: string
  year: number
  month: number
  totalMinutes: number
  totalPay: number
  hourlyRate: number
  currency: string
  emailSentAt: string | null
}

export default function PayrollActions({
  assistantId,
  assistantName,
  assistantEmail,
  year,
  month,
  totalMinutes,
  totalPay,
  hourlyRate,
  currency,
  emailSentAt,
}: Props) {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(!!emailSentAt)
  const [error, setError] = useState<string | null>(null)

  async function sendEmail() {
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/payroll/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistantId,
          assistantName,
          assistantEmail,
          year,
          month,
          totalMinutes,
          totalPay,
          hourlyRate,
          currency,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Unbekannter Fehler')
      }
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Senden')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Link
        href={`/payroll/${year}/${month}/${assistantId}/print`}
        target="_blank"
        className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-slate-700 whitespace-nowrap"
      >
        Lohnzettel
      </Link>

      <div className="flex flex-col items-end">
        <button
          onClick={sendEmail}
          disabled={sending || totalMinutes === 0}
          title={
            totalMinutes === 0
              ? 'Keine Stunden erfasst'
              : sent
                ? 'Erneut senden'
                : 'E-Mail senden'
          }
          className={`px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
            sent
              ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {sending ? 'Sende…' : sent ? '✓ Gesendet' : 'E-Mail senden'}
        </button>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        {sent && emailSentAt && (
          <p className="text-xs text-slate-400 mt-1">
            {new Date(emailSentAt).toLocaleDateString('de-DE')}
          </p>
        )}
      </div>
    </div>
  )
}

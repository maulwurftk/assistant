import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'
import {
  entryDurationMinutes,
  formatMinutes,
  calculatePay,
  formatCurrency,
  formatDate,
  monthName,
} from '@/lib/payroll'

const resend = new Resend(process.env.RESEND_API_KEY)

type Body = {
  assistantId: string
  assistantName: string
  assistantEmail: string
  year: number
  month: number
  totalMinutes: number
  totalPay: number
  hourlyRate: number
  currency: string
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const body: Body = await request.json()
  const { assistantId, assistantName, assistantEmail, year, month, hourlyRate, currency } = body

  // Einträge für den Monat laden
  const { data: entries } = await supabase
    .from('time_entries')
    .select('date, start_time, end_time, activity_id, description')
    .eq('assistant_id', assistantId)
    .gte('date', `${year}-${month.toString().padStart(2, '0')}-01`)
    .lt(
      'date',
      month === 12
        ? `${year + 1}-01-01`
        : `${year}-${(month + 1).toString().padStart(2, '0')}-01`
    )
    .order('date')
    .order('start_time')

  const { data: activities } = await supabase.from('activities').select('id, name')
  const activityMap = Object.fromEntries((activities ?? []).map((a) => [a.id, a.name]))

  const allEntries = entries ?? []
  const totalMinutes = allEntries.reduce(
    (sum, e) => sum + entryDurationMinutes(e.start_time, e.end_time),
    0
  )
  const totalPay = calculatePay(totalMinutes, hourlyRate)

  if (totalMinutes === 0) {
    return NextResponse.json({ error: 'Keine Stunden für diesen Monat erfasst' }, { status: 400 })
  }

  const fromEmail = process.env.FROM_EMAIL ?? 'noreply@example.com'

  // Zeilen-HTML für die Tabelle
  const rowsHtml = allEntries
    .map((e) => {
      const minutes = entryDurationMinutes(e.start_time, e.end_time)
      const activity = e.activity_id ? (activityMap[e.activity_id] ?? '–') : '–'
      return `
        <tr style="border-bottom:1px solid #e2e8f0">
          <td style="padding:8px 12px;color:#334155">${formatDate(e.date)}</td>
          <td style="padding:8px 12px;color:#334155">${activity}</td>
          <td style="padding:8px 12px;color:#64748b;font-family:monospace">${e.start_time.slice(0, 5)}</td>
          <td style="padding:8px 12px;color:#64748b;font-family:monospace">${e.end_time.slice(0, 5)}</td>
          <td style="padding:8px 12px;text-align:right;color:#0f172a;font-weight:500">${formatMinutes(minutes)}</td>
        </tr>
      `
    })
    .join('')

  const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif">
  <div style="max-width:640px;margin:32px auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden">

    <!-- Header -->
    <div style="background:#1e40af;padding:32px;color:#fff">
      <h1 style="margin:0;font-size:24px;font-weight:700">Lohnabrechnung</h1>
      <p style="margin:4px 0 0;font-size:16px;opacity:.85">${monthName(month)} ${year}</p>
    </div>

    <!-- Anrede -->
    <div style="padding:32px 32px 0">
      <p style="color:#334155;margin:0 0 24px">Hallo ${assistantName},<br><br>
      anbei Ihre Lohnabrechnung für ${monthName(month)} ${year}.</p>
    </div>

    <!-- Tabelle -->
    <div style="padding:0 32px">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="border-bottom:2px solid #cbd5e1;background:#f8fafc">
            <th style="text-align:left;padding:10px 12px;color:#64748b;font-weight:600">Datum</th>
            <th style="text-align:left;padding:10px 12px;color:#64748b;font-weight:600">Tätigkeit</th>
            <th style="text-align:left;padding:10px 12px;color:#64748b;font-weight:600">Von</th>
            <th style="text-align:left;padding:10px 12px;color:#64748b;font-weight:600">Bis</th>
            <th style="text-align:right;padding:10px 12px;color:#64748b;font-weight:600">Dauer</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr style="border-top:2px solid #cbd5e1;background:#f8fafc">
            <td colspan="4" style="padding:12px;font-weight:700;color:#0f172a">Gesamt</td>
            <td style="padding:12px;text-align:right;font-weight:700;color:#0f172a">${formatMinutes(totalMinutes)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Vergütungsbox -->
    <div style="margin:24px 32px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:20px">
      <p style="margin:0 0 8px;font-size:13px;color:#0369a1;text-transform:uppercase;font-weight:600;letter-spacing:.05em">Vergütung</p>
      <table style="width:100%;font-size:14px">
        <tr>
          <td style="color:#334155;padding:4px 0">Gearbeitete Stunden</td>
          <td style="text-align:right;color:#0f172a;font-weight:500">${formatMinutes(totalMinutes)}</td>
        </tr>
        <tr>
          <td style="color:#334155;padding:4px 0">Stundensatz</td>
          <td style="text-align:right;color:#0f172a;font-weight:500">${formatCurrency(hourlyRate, currency)}/h</td>
        </tr>
        <tr style="border-top:1px solid #bae6fd;margin-top:8px">
          <td style="color:#0f172a;font-weight:700;padding:10px 0 4px;font-size:16px">Gesamtvergütung (brutto)</td>
          <td style="text-align:right;font-weight:700;font-size:20px;color:#1e40af;padding:10px 0 4px">${formatCurrency(totalPay, currency)}</td>
        </tr>
      </table>
    </div>

    <!-- Footer -->
    <div style="padding:24px 32px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px">
      <p style="margin:0">Diese E-Mail wurde automatisch generiert. Bei Fragen wenden Sie sich bitte an Ihren Arbeitgeber.</p>
    </div>
  </div>
</body>
</html>
`

  const { error: sendError } = await resend.emails.send({
    from: fromEmail,
    to: assistantEmail,
    subject: `Lohnabrechnung ${monthName(month)} ${year}`,
    html,
  })

  if (sendError) {
    console.error('Resend error:', sendError)
    return NextResponse.json({ error: 'E-Mail konnte nicht gesendet werden' }, { status: 500 })
  }

  // Lohnlauf dokumentieren
  await supabase.from('payroll_runs').upsert(
    {
      year,
      month,
      assistant_id: assistantId,
      total_minutes: totalMinutes,
      hourly_rate: hourlyRate,
      total_pay: totalPay,
      email_sent_at: new Date().toISOString(),
    },
    { onConflict: 'year,month,assistant_id' }
  )

  return NextResponse.json({ ok: true })
}

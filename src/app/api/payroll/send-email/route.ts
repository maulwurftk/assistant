import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'
import {
  entryDurationMinutes,
  formatMinutes,
  calculatePay,
  calculateMinijob,
  formatCurrency,
  formatDate,
  monthName,
  MINIJOB_RATES,
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

  // Einträge, Tätigkeiten, Settings und Assistent-Profil parallel laden
  const [entriesRes, activitiesRes, settingsRes, assistantRes] = await Promise.all([
    supabase
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
      .order('start_time'),
    supabase.from('activities').select('id, name'),
    supabase.from('payroll_settings').select('*').limit(1).single(),
    supabase.from('profiles').select('rv_pflicht').eq('id', assistantId).single(),
  ])

  const activityMap = Object.fromEntries((activitiesRes.data ?? []).map((a) => [a.id, a.name]))
  const allEntries = entriesRes.data ?? []
  const settings = settingsRes.data as {
    minijob_mode?: boolean
    uv_rate?: number
    employer_name?: string
  } | null
  const rvPflicht = (assistantRes.data as { rv_pflicht?: boolean } | null)?.rv_pflicht !== false

  const minijobMode = settings?.minijob_mode ?? false
  const uvRate = settings?.uv_rate ?? 1.6

  const totalMinutes = allEntries.reduce(
    (sum, e) => sum + entryDurationMinutes(e.start_time, e.end_time),
    0
  )
  const brutto = calculatePay(totalMinutes, hourlyRate)
  const minijob = minijobMode ? calculateMinijob(brutto, rvPflicht, uvRate) : null

  if (totalMinutes === 0) {
    return NextResponse.json({ error: 'Keine Stunden für diesen Monat erfasst' }, { status: 400 })
  }

  const fromEmail = process.env.FROM_EMAIL ?? 'noreply@example.com'

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

  // Vergütungsbox: Standard oder Minijob
  const payBoxHtml = minijob
    ? `
    <!-- Entgeltabrechnung Minijob -->
    <div style="margin:24px 32px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px">
      <p style="margin:0 0 12px;font-size:13px;color:#15803d;text-transform:uppercase;font-weight:600;letter-spacing:.05em">Entgeltabrechnung</p>
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr>
          <td style="color:#334155;padding:4px 0">Gearbeitete Stunden</td>
          <td style="text-align:right;color:#0f172a;font-weight:500">${formatMinutes(totalMinutes)}</td>
        </tr>
        <tr>
          <td style="color:#334155;padding:4px 0">Stundensatz</td>
          <td style="text-align:right;color:#0f172a;font-weight:500">${formatCurrency(hourlyRate, currency)}/h</td>
        </tr>
        <tr style="border-top:1px solid #bbf7d0">
          <td style="color:#334155;padding:8px 0 4px;font-weight:600">Bruttoentgelt</td>
          <td style="text-align:right;color:#0f172a;font-weight:600;padding:8px 0 4px">${formatCurrency(minijob.brutto, currency)}</td>
        </tr>
        ${minijob.rvAN > 0
          ? `<tr>
          <td style="color:#dc2626;padding:4px 0">− RV-Aufstockungsbetrag AN (${MINIJOB_RATES.rvAN.toFixed(2)} %)</td>
          <td style="text-align:right;color:#dc2626;padding:4px 0">−${formatCurrency(minijob.rvAN, currency)}</td>
        </tr>`
          : `<tr>
          <td style="color:#94a3b8;padding:4px 0;font-style:italic">RV-Aufstockungsbetrag (befreit)</td>
          <td style="text-align:right;color:#94a3b8">–</td>
        </tr>`}
        <tr style="border-top:2px solid #86efac">
          <td style="color:#15803d;font-weight:700;padding:12px 0 4px;font-size:16px">Auszahlungsbetrag (Netto)</td>
          <td style="text-align:right;font-weight:700;font-size:22px;color:#15803d;padding:12px 0 4px">${formatCurrency(minijob.netto, currency)}</td>
        </tr>
      </table>
    </div>

    <!-- AG-Abgaben Info -->
    <div style="margin:0 32px 24px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px">
      <p style="margin:0 0 10px;font-size:12px;color:#1d4ed8;text-transform:uppercase;font-weight:600;letter-spacing:.05em">Arbeitgeberabgaben (Info)</p>
      <table style="width:100%;font-size:13px;border-collapse:collapse">
        <tr><td style="color:#1e40af;padding:2px 0">KV-Pauschalbeitrag (${MINIJOB_RATES.kvAG.toFixed(2)} %)</td><td style="text-align:right;color:#1e3a8a">${formatCurrency(minijob.kvAGAmount, currency)}</td></tr>
        <tr><td style="color:#1e40af;padding:2px 0">RV-Pauschalbeitrag (${MINIJOB_RATES.rvAG.toFixed(2)} %)</td><td style="text-align:right;color:#1e3a8a">${formatCurrency(minijob.rvAGAmount, currency)}</td></tr>
        <tr><td style="color:#1e40af;padding:2px 0">Lohnsteuerpauschale (${MINIJOB_RATES.pauschsteuer.toFixed(2)} %)</td><td style="text-align:right;color:#1e3a8a">${formatCurrency(minijob.pauschsteuerAmount, currency)}</td></tr>
        <tr><td style="color:#1e40af;padding:2px 0">Umlage 2 / Insolvenzgeldumlage</td><td style="text-align:right;color:#1e3a8a">${formatCurrency(minijob.u2Amount + minijob.insolvenzgeldAmount, currency)}</td></tr>
        <tr><td style="color:#1e40af;padding:2px 0">Unfallversicherung (${uvRate.toFixed(2)} %)</td><td style="text-align:right;color:#1e3a8a">${formatCurrency(minijob.uvAmount, currency)}</td></tr>
        <tr style="border-top:1px solid #bfdbfe"><td style="color:#1e3a8a;font-weight:700;padding:6px 0 2px">Gesamtkosten Arbeitgeber</td><td style="text-align:right;font-weight:700;color:#1e3a8a">${formatCurrency(minijob.totalKosten, currency)}</td></tr>
      </table>
    </div>`
    : `
    <!-- Standard Vergütungsbox -->
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
          <td style="text-align:right;font-weight:700;font-size:20px;color:#1e40af;padding:10px 0 4px">${formatCurrency(brutto, currency)}</td>
        </tr>
      </table>
    </div>`

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

    ${payBoxHtml}

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

  const totalPay = minijob ? minijob.netto : brutto

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

import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'
import {
  entryDurationMinutes,
  formatMinutes,
  calculatePay,
  calculateMinijob,
  calculateGeringfuegigAT,
  formatCurrency,
  formatDate,
  monthName,
  grossFromBezirkRate,
  ratesFromSettings,
  atRatesFromSettings,
  normalizeCountryMode,
} from '@/lib/payroll'
import { escapeHtml } from '@/lib/utils'

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

  // Nur Admins dürfen Lohnabrechnungen versenden
  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if ((caller as { role?: string } | null)?.role !== 'admin') {
    return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })
  }

  const body: Body = await request.json()
  const { assistantId, year, month, hourlyRate, currency } = body

  const dateFrom = `${year}-${month.toString().padStart(2, '0')}-01`
  const dateTo = month === 12 ? `${year + 1}-01-01` : `${year}-${(month + 1).toString().padStart(2, '0')}-01`

  // Slots, Settings und Assistent-Profil parallel laden
  const [slotsRes, settingsRes, assistantRes] = await Promise.all([
    supabase
      .from('calendar_slots')
      .select('date, start_time, end_time, title, actual_start_time, actual_end_time')
      .eq('assigned_to', assistantId)
      .eq('status', 'assigned')
      .eq('is_private', false)
      .not('confirmed_at', 'is', null)
      .gte('date', dateFrom)
      .lt('date', dateTo)
      .order('date')
      .order('start_time'),
    supabase.from('payroll_settings').select('*').limit(1).single(),
    supabase.from('profiles').select('full_name, email, rv_pflicht, kv_pflicht').eq('id', assistantId).single(),
  ])

  // Empfänger IMMER aus der DB (nie aus dem Request-Body) – verhindert
  // beliebige Empfänger/HTML-Injection über body-Werte
  const assistantRow = assistantRes.data as { full_name?: string; email?: string } | null
  if (!assistantRow?.email) {
    return NextResponse.json({ error: 'Assistent nicht gefunden' }, { status: 404 })
  }
  const assistantName = assistantRow.full_name ?? ''
  const assistantEmail = assistantRow.email

  const calendarSlots = (slotsRes.data ?? []) as Array<{ date: string; start_time: string; end_time: string; title: string; actual_start_time: string | null; actual_end_time: string | null }>

  const settings = settingsRes.data as {
    minijob_mode?: boolean
    bezirk_mode?: boolean
    uv_rate?: number
    employer_name?: string
    mj_kv_ag?: number | null
    mj_rv_ag?: number | null
    mj_pauschsteuer?: number | null
    mj_u1?: number | null
    mj_u2?: number | null
    mj_insolvenzgeld?: number | null
    mj_rv_an?: number | null
    country_mode?: 'de' | 'at'
    at_geringfuegig_mode?: boolean
    at_uv_beitrag?: number | null
    at_mvk_beitrag?: number | null
    at_dg_abgabe?: number | null
    at_kommunalsteuer?: number | null
    at_include_urlaubsgeld?: boolean
    at_include_weihnachtsgeld?: boolean
  } | null
  // Nur bestätigte Slots (siehe Migration 0024_slot_confirmation.sql) – die
  // tatsächlich geleistete Zeit (Ist) hat Vorrang vor der geplanten Zeit.
  type WorkRow = { date: string; start_time: string; end_time: string; label: string }
  const allEntries: WorkRow[] = calendarSlots
    .map((s) => ({
      date: s.date,
      start_time: s.actual_start_time || s.start_time,
      end_time: s.actual_end_time || s.end_time,
      label: s.title,
    }))
    .sort((a, b) => {
      const d = a.date.localeCompare(b.date)
      return d !== 0 ? d : a.start_time.localeCompare(b.start_time)
    })
  const assistantProfile = assistantRes.data as { rv_pflicht?: boolean; kv_pflicht?: boolean } | null
  const rvPflicht = assistantProfile?.rv_pflicht !== false
  const kvPflicht = assistantProfile?.kv_pflicht !== false

  const minijobMode = settings?.minijob_mode ?? false
  const bezirkMode = settings?.bezirk_mode ?? false
  const uvRate = settings?.uv_rate ?? 1.6
  const rates = ratesFromSettings(settings)

  // When bezirk_mode: hourlyRate is the Bezirk flat rate; derive actual employee brutto
  const effectiveBruttoRate = bezirkMode ? grossFromBezirkRate(hourlyRate, uvRate, kvPflicht, rates) : hourlyRate

  const totalMinutes = allEntries.reduce(
    (sum, e) => sum + entryDurationMinutes(e.start_time, e.end_time),
    0
  )
  const brutto = calculatePay(totalMinutes, effectiveBruttoRate)
  const countryMode = normalizeCountryMode(settings?.country_mode)
  const atGeringfuegigMode = countryMode === 'at' && (settings?.at_geringfuegig_mode ?? false)
  const atRates = atRatesFromSettings(settings)
  const minijob = minijobMode && countryMode === 'de' ? calculateMinijob(brutto, rvPflicht, uvRate, kvPflicht, rates) : null
  const atBreakdown = atGeringfuegigMode
    ? calculateGeringfuegigAT(
        brutto,
        {
          includeUrlaubsgeld: settings?.at_include_urlaubsgeld ?? false,
          includeWeihnachtsgeld: settings?.at_include_weihnachtsgeld ?? false,
        },
        atRates
      )
    : null

  if (totalMinutes === 0) {
    return NextResponse.json({ error: 'Keine Stunden für diesen Monat erfasst' }, { status: 400 })
  }

  const fromEmail = process.env.FROM_EMAIL ?? 'noreply@charmely.cloud'

  const rowsHtml = allEntries
    .map((e) => {
      const minutes = entryDurationMinutes(e.start_time, e.end_time)
      return `
        <tr style="border-bottom:1px solid #e2e8f0">
          <td style="padding:8px 12px;color:#334155">${formatDate(e.date)}</td>
          <td style="padding:8px 12px;color:#334155">${escapeHtml(e.label)}</td>
          <td style="padding:8px 12px;color:#64748b;font-family:monospace">${e.start_time.slice(0, 5)}</td>
          <td style="padding:8px 12px;color:#64748b;font-family:monospace">${e.end_time.slice(0, 5)}</td>
          <td style="padding:8px 12px;text-align:right;color:#0f172a;font-weight:500">${formatMinutes(minutes)}</td>
        </tr>
      `
    })
    .join('')

  // Vergütungsbox: Standard, Minijob (DE) oder geringfügige Beschäftigung (AT)
  const payBoxHtml = atBreakdown
    ? `
    <!-- Entgeltabrechnung AT -->
    <div style="margin:24px 32px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px">
      <p style="margin:0 0 12px;font-size:13px;color:#15803d;text-transform:uppercase;font-weight:600;letter-spacing:.05em">Entgeltabrechnung</p>
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr>
          <td style="color:#334155;padding:4px 0">Gearbeitete Stunden</td>
          <td style="text-align:right;color:#0f172a;font-weight:500">${formatMinutes(totalMinutes)}</td>
        </tr>
        <tr>
          <td style="color:#334155;padding:4px 0">Stundensatz</td>
          <td style="text-align:right;color:#0f172a;font-weight:500">${formatCurrency(effectiveBruttoRate, currency)}/h</td>
        </tr>
        <tr>
          <td style="color:#334155;padding:4px 0">Bruttoentgelt</td>
          <td style="text-align:right;color:#0f172a;font-weight:500">${formatCurrency(atBreakdown.brutto, currency)}</td>
        </tr>
        ${atBreakdown.urlaubsgeldAnteil > 0 ? `
        <tr>
          <td style="color:#334155;padding:4px 0">+ Urlaubsgeld-Anteil (1/12, aliquot)</td>
          <td style="text-align:right;color:#0f172a">${formatCurrency(atBreakdown.urlaubsgeldAnteil, currency)}</td>
        </tr>` : ''}
        ${atBreakdown.weihnachtsgeldAnteil > 0 ? `
        <tr>
          <td style="color:#334155;padding:4px 0">+ Weihnachtsgeld-Anteil (1/12, aliquot)</td>
          <td style="text-align:right;color:#0f172a">${formatCurrency(atBreakdown.weihnachtsgeldAnteil, currency)}</td>
        </tr>` : ''}
        <tr style="border-top:2px solid #86efac">
          <td style="color:#15803d;font-weight:700;padding:12px 0 4px;font-size:16px">Auszahlungsbetrag (Netto)</td>
          <td style="text-align:right;font-weight:700;font-size:22px;color:#15803d;padding:12px 0 4px">${formatCurrency(atBreakdown.netto, currency)}</td>
        </tr>
      </table>
      <p style="margin:12px 0 0;font-size:11px;color:#94a3b8;font-style:italic">Netto = Brutto (inkl. Sonderzahlungsanteile) — unterhalb der Geringfügigkeitsgrenze fallen i.d.R. keine Lohnsteuer-/SV-Abzüge auf Arbeitnehmerseite an. Eine freiwillige Selbstversicherung läuft separat und jährlich direkt mit der ÖGK ab.</p>
    </div>

    <!-- AG-Abgaben Info -->
    <div style="margin:0 32px 24px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px">
      <p style="margin:0 0 10px;font-size:12px;color:#1d4ed8;text-transform:uppercase;font-weight:600;letter-spacing:.05em">Arbeitgeberabgaben (Info)</p>
      <table style="width:100%;font-size:13px;border-collapse:collapse">
        <tr><td style="color:#1e40af;padding:2px 0">Unfallversicherung (${atRates.uvBeitrag.toFixed(2)} %)</td><td style="text-align:right;color:#1e3a8a">${formatCurrency(atBreakdown.uvAmount, currency)}</td></tr>
        <tr><td style="color:#1e40af;padding:2px 0">Betriebliche Vorsorge / MVK (${atRates.mvkBeitrag.toFixed(2)} %)</td><td style="text-align:right;color:#1e3a8a">${formatCurrency(atBreakdown.mvkAmount, currency)}</td></tr>
        ${atRates.dgAbgabe > 0 ? `<tr><td style="color:#1e40af;padding:2px 0">Dienstgeberabgabe (${atRates.dgAbgabe.toFixed(2)} %)</td><td style="text-align:right;color:#1e3a8a">${formatCurrency(atBreakdown.dgAbgabeAmount, currency)}</td></tr>` : ''}
        ${atRates.kommunalsteuer > 0 ? `<tr><td style="color:#1e40af;padding:2px 0">Kommunalsteuer (${atRates.kommunalsteuer.toFixed(2)} %)</td><td style="text-align:right;color:#1e3a8a">${formatCurrency(atBreakdown.kommunalsteuerAmount, currency)}</td></tr>` : ''}
        <tr style="border-top:1px solid #bfdbfe"><td style="color:#1e3a8a;font-weight:700;padding:6px 0 2px">Gesamtkosten Arbeitgeber</td><td style="text-align:right;font-weight:700;color:#1e3a8a">${formatCurrency(atBreakdown.totalKosten, currency)}</td></tr>
      </table>
    </div>`
    : minijob
    ? `
    <!-- Entgeltabrechnung Minijob -->
    <div style="margin:24px 32px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px">
      <p style="margin:0 0 12px;font-size:13px;color:#15803d;text-transform:uppercase;font-weight:600;letter-spacing:.05em">Entgeltabrechnung</p>
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr>
          <td style="color:#334155;padding:4px 0">Gearbeitete Stunden</td>
          <td style="text-align:right;color:#0f172a;font-weight:500">${formatMinutes(totalMinutes)}</td>
        </tr>
        ${bezirkMode ? `
        <tr>
          <td style="color:#334155;padding:4px 0">Bezirkssatz (inkl. AG-Kosten)</td>
          <td style="text-align:right;color:#0f172a;font-weight:500">${formatCurrency(hourlyRate, currency)}/h</td>
        </tr>
        <tr>
          <td style="color:#334155;padding:4px 0">Stundensatz (Brutto AN)</td>
          <td style="text-align:right;color:#0f172a;font-weight:500">${formatCurrency(effectiveBruttoRate, currency)}/h</td>
        </tr>` : `
        <tr>
          <td style="color:#334155;padding:4px 0">Stundensatz</td>
          <td style="text-align:right;color:#0f172a;font-weight:500">${formatCurrency(effectiveBruttoRate, currency)}/h</td>
        </tr>`}
        <tr style="border-top:1px solid #bbf7d0">
          <td style="color:#334155;padding:8px 0 4px;font-weight:600">Bruttoentgelt</td>
          <td style="text-align:right;color:#0f172a;font-weight:600;padding:8px 0 4px">${formatCurrency(minijob.brutto, currency)}</td>
        </tr>
        ${minijob.rvAN > 0
          ? `<tr>
          <td style="color:#dc2626;padding:4px 0">− RV-Aufstockungsbetrag AN (${rates.rvAN.toFixed(2)} %)</td>
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
        ${kvPflicht
          ? `<tr><td style="color:#1e40af;padding:2px 0">KV-Pauschalbeitrag (${rates.kvAG.toFixed(2)} %)</td><td style="text-align:right;color:#1e3a8a">${formatCurrency(minijob.kvAGAmount, currency)}</td></tr>`
          : `<tr><td style="color:#94a3b8;padding:2px 0;font-style:italic">Krankenversicherung (KV)</td><td style="text-align:right;color:#94a3b8;font-style:italic">entfällt (PKV)</td></tr>`}
        <tr><td style="color:#1e40af;padding:2px 0">RV-Pauschalbeitrag (${rates.rvAG.toFixed(2)} %)</td><td style="text-align:right;color:#1e3a8a">${formatCurrency(minijob.rvAGAmount, currency)}</td></tr>
        <tr><td style="color:#1e40af;padding:2px 0">Lohnsteuerpauschale (${rates.pauschsteuer.toFixed(2)} %)</td><td style="text-align:right;color:#1e3a8a">${formatCurrency(minijob.pauschsteuerAmount, currency)}</td></tr>
        <tr><td style="color:#1e40af;padding:2px 0">Umlage 1 (Krankheit/Kur)</td><td style="text-align:right;color:#1e3a8a">${formatCurrency(minijob.u1Amount, currency)}</td></tr>
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
        ${bezirkMode ? `
        <tr>
          <td style="color:#334155;padding:4px 0">Bezirkssatz (inkl. AG-Kosten)</td>
          <td style="text-align:right;color:#0f172a;font-weight:500">${formatCurrency(hourlyRate, currency)}/h</td>
        </tr>
        <tr>
          <td style="color:#334155;padding:4px 0">Stundensatz (Brutto AN)</td>
          <td style="text-align:right;color:#0f172a;font-weight:500">${formatCurrency(effectiveBruttoRate, currency)}/h</td>
        </tr>` : `
        <tr>
          <td style="color:#334155;padding:4px 0">Stundensatz</td>
          <td style="text-align:right;color:#0f172a;font-weight:500">${formatCurrency(effectiveBruttoRate, currency)}/h</td>
        </tr>`}
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
      <p style="color:#334155;margin:0 0 24px">Hallo ${escapeHtml(assistantName)},<br><br>
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
      <p style="margin:8px 0 0">Unverbindlich und ohne Gewähr – keine Steuer- oder Lohnabrechnungsberatung. Verbindlich sind allein die Abrechnungen ${countryMode === 'at' ? 'der ÖGK und des Finanzamts' : 'der Minijob-Zentrale und des Finanzamts'}.</p>
    </div>
  </div>
</body>
</html>
`

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: 'E-Mail-Versand ist nicht konfiguriert (RESEND_API_KEY fehlt).' },
      { status: 503 }
    )
  }
  const resend = new Resend(process.env.RESEND_API_KEY)

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

  const totalPay = atBreakdown ? atBreakdown.netto : minijob ? minijob.netto : brutto

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

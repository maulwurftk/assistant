import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency, grossFromBezirkRate, ratesFromSettings } from '@/lib/payroll'
import { annualRate } from '@/lib/vacation'
import PrintButton from '../../[year]/[month]/[assistantId]/print/_components/PrintButton'

// Nachweis der wesentlichen Arbeitsbedingungen nach § 2 Nachweisgesetz
// (Textform seit 01.01.2025 zulässig). Ersetzt keinen Vertrag, dokumentiert
// aber die tatsächlich gelebten Bedingungen – Vorlage, vor Aushändigung prüfen.

type Props = {
  params: Promise<{ assistantId: string }>
  searchParams: Promise<{ term?: string }>
}

const de = (iso: string | null | undefined) => (iso ? iso.split('-').reverse().join('.') : '')

function Row({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[2rem_12rem_1fr] gap-2 py-2.5 border-b border-slate-200 text-sm print:break-inside-avoid">
      <span className="text-slate-400">{n}.</span>
      <span className="font-medium text-slate-700">{title}</span>
      <div className="text-slate-900 space-y-1">{children}</div>
    </div>
  )
}

export default async function NachweisPage({ params, searchParams }: Props) {
  const { assistantId } = await params
  const { term: termId } = await searchParams
  const supabase = await createClient()

  const [assistantRes, settingsRes, termsRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, rv_pflicht, kv_pflicht, employment_start, employment_end')
      .eq('id', assistantId).eq('role', 'assistant').single(),
    supabase.from('payroll_settings').select('*').limit(1).single(),
    supabase.from('employment_terms').select('*').eq('assistant_id', assistantId).order('valid_from'),
  ])
  const a = assistantRes.data
  if (!a) notFound()
  const s = settingsRes.data
  const terms = termsRes.data ?? []
  const today = new Date().toISOString().slice(0, 10)
  const term = terms.find((t) => t.id === termId)
    ?? terms.find((t) => t.valid_from <= today && (!t.valid_until || t.valid_until >= today))
    ?? terms[terms.length - 1]

  const currency = s?.currency ?? 'EUR'
  const hourly = Number(s?.hourly_rate ?? 0)
  const gross = s?.bezirk_mode
    ? grossFromBezirkRate(hourly, Number(s?.uv_rate ?? 1.6), a.kv_pflicht !== false, ratesFromSettings(s))
    : hourly
  const base = Number(term?.base_days ?? s?.vacation_base_days ?? 20)
  const extra = Number(term?.extra_days ?? 0)
  const dpw = term?.days_per_week == null ? null : Number(term.days_per_week)
  const vacationDays = dpw ? annualRate({ valid_from: '', valid_until: null, days_per_week: dpw, base_days: base, extra_days: extra }, base, 0) : null
  const weekly = term?.weekly_hours == null ? null : Number(term.weekly_hours)
  const isMinijob = !!s?.minijob_mode
  const end = term?.valid_until ?? a.employment_end

  return (
    <div className="min-h-screen bg-surface">
      <div className="no-print fixed top-4 right-4 flex gap-2"><PrintButton /></div>
      <div className="no-print max-w-3xl mx-auto mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        Vorlage aus der App, keine Rechtsberatung. Bitte vor Aushändigung prüfen, Anschrift ergänzen, unterschreiben
        und den Empfang bestätigen lassen (bzw. per E-Mail/PDF in Textform senden). Danach in der App „Ausgehändigt“ markieren.
        {!term && ' ⚠ Für diese Person sind noch keine Arbeitsbedingungen hinterlegt.'}
        {term && !weekly && ' ⚠ Wochenstunden fehlen – ohne Vereinbarung gelten 20 h/Woche (§ 12 TzBfG).'}
      </div>

      <div className="max-w-3xl mx-auto px-8 py-10">
        <h1 className="text-xl font-bold text-slate-900">Nachweis der wesentlichen Arbeitsbedingungen</h1>
        <p className="text-sm text-slate-500 mb-6">gemäß § 2 Nachweisgesetz (NachwG)</p>

        <Row n={1} title="Arbeitgeber">
          <p>{s?.employer_name || '________________________'}</p>
          <p className="whitespace-pre-line">{s?.employer_address || 'Anschrift: ________________________'}</p>
          {s?.employer_tax_number && <p className="text-slate-500">Betriebsnummer: {s.employer_tax_number}</p>}
        </Row>
        <Row n={2} title="Arbeitnehmerin">
          <p>{a.full_name}</p>
          <p className="text-slate-500">Anschrift: ______________________________________</p>
        </Row>
        <Row n={3} title="Beginn">
          <p>{a.employment_start ? de(a.employment_start) : '__________'}</p>
        </Row>
        <Row n={4} title="Dauer">
          <p>{end ? `Befristet bis ${de(end)}` : 'Unbefristet'}</p>
        </Row>
        <Row n={5} title="Arbeitsort">
          <p>Im Haushalt der Arbeitgeberin/des Arbeitgebers sowie an wechselnden Orten im Rahmen der Begleitung (Assistenz).</p>
        </Row>
        <Row n={6} title="Tätigkeit">
          <p>{term?.job_title || 'Persönliche Assistenz'} im Arbeitgebermodell (Persönliches Budget). Unterstützung nach Anleitung im Alltag.</p>
        </Row>
        <Row n={7} title="Probezeit">
          <p>Keine vereinbart.</p>
        </Row>
        <Row n={8} title="Arbeitsentgelt">
          <p>{formatCurrency(gross, currency)} brutto je Stunde. Keine Zuschläge, Prämien oder Sonderzahlungen.</p>
          <p>Abrechnung monatlich nach den bestätigten Einsätzen; Auszahlung bargeldlos auf das angegebene Konto nach Monatsabschluss.</p>
          <p>Urlaubsentgelt nach § 11 BUrlG (Durchschnitt der letzten 13 Wochen).</p>
        </Row>
        <Row n={9} title="Arbeitszeit">
          <p>
            {weekly ? `${weekly.toLocaleString('de-DE')} Stunden pro Woche` : '____ Stunden pro Woche'}
            {dpw ? `, verteilt auf ${dpw.toLocaleString('de-DE')} Tage` : ''}.
          </p>
          {!dpw && (
            <p>
              Arbeit nach Bedarf (§ 12 TzBfG): Lage der Arbeitszeit nach gemeinsamem Dienstplan, Mitteilung mindestens
              4 Tage im Voraus. Zeitrahmen (Tage/Uhrzeiten, in denen Einsätze liegen können): ______________________.
            </p>
          )}
          <p>Ruhepausen und Ruhezeiten nach dem Arbeitszeitgesetz. Mehrarbeit nur nach vorheriger Absprache.</p>
        </Row>
        <Row n={10} title="Urlaub">
          <p>
            {vacationDays != null
              ? `${vacationDays.toLocaleString('de-DE', { maximumFractionDigits: 2 })} Arbeitstage bezahlter Erholungsurlaub pro Kalenderjahr`
              : `Bezahlter Erholungsurlaub anteilig nach den tatsächlichen Arbeitstagen (${base}${extra ? ` + ${extra}` : ''} Tage bei 5-Tage-Woche × Arbeitstage im Jahr ÷ 260)`}
            {' '}(gesetzlicher Mindesturlaub nach BUrlG{extra ? ', inkl. Zusatzurlaub' : ''}).
          </p>
        </Row>
        <Row n={11} title="Fortbildung / bAV">
          <p>Kein Anspruch auf vom Arbeitgeber bereitgestellte Fortbildung. Keine betriebliche Altersversorgung über einen Versorgungsträger.</p>
        </Row>
        <Row n={12} title="Kündigung">
          <p>Schriftform (§ 623 BGB). Fristen nach § 622 BGB: vier Wochen zum 15. oder zum Ende eines Kalendermonats, verlängert nach Beschäftigungsdauer.</p>
          <p>Eine Kündigungsschutzklage muss innerhalb von drei Wochen nach Zugang der schriftlichen Kündigung erhoben werden (§ 4 KSchG).</p>
        </Row>
        <Row n={13} title="Kollektivverträge">
          <p>Es finden keine Tarifverträge, Betriebs- oder Dienstvereinbarungen Anwendung.</p>
        </Row>
        {isMinijob && (
          <Row n={14} title="Hinweis Minijob">
            <p>
              Geringfügig entlohnte Beschäftigung. {a.rv_pflicht !== false
                ? 'Die Beschäftigung ist rentenversicherungspflichtig; auf Antrag ist eine Befreiung möglich.'
                : 'Es wurde eine Befreiung von der Rentenversicherungspflicht beantragt.'}
            </p>
          </Row>
        )}

        <div className="mt-14 grid grid-cols-2 gap-10 text-sm text-slate-600">
          <div><div className="border-t border-slate-400 pt-1">Ort, Datum, Arbeitgeber/in</div></div>
          <div><div className="border-t border-slate-400 pt-1">Erhalten am / Arbeitnehmerin</div></div>
        </div>
        <p className="mt-8 text-xs text-slate-400">Erstellt am {de(today)}{term ? ` · Arbeitsbedingungen gültig ab ${de(term.valid_from)}` : ''}</p>
      </div>
    </div>
  )
}

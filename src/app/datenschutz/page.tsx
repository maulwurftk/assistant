// ⚠️ ENTWURF — Diese Datenschutzerklärung ist eine von einer KI erstellte
// Vorlage und MUSS vor dem Onboarding fremder Nutzer juristisch geprüft und
// mit den echten Angaben (Verantwortlicher, Auftragsverarbeiter, Fristen)
// befüllt werden. Platzhalter sind mit ⟨…⟩ markiert.

export const metadata = { title: 'Datenschutzerklärung · Assistenten-App' }

export default function DatenschutzPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-2xl mx-auto bg-surface rounded-xl shadow-sm border border-slate-200 p-8 space-y-6">
        <div className="text-xs font-semibold uppercase tracking-wide text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
          Entwurf — Vorlage ohne rechtliche Prüfung. Vor Veröffentlichung
          juristisch prüfen lassen und Platzhalter ersetzen.
        </div>

        <h1 className="text-2xl font-bold text-slate-900">Datenschutzerklärung</h1>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">1. Verantwortlicher</h2>
          <p className="text-sm text-slate-600">
            Verantwortlich für die Datenverarbeitung in dieser Anwendung ist:
            ⟨Name / Firma⟩, ⟨Anschrift⟩, ⟨E-Mail-Adresse⟩. Für die Daten der in
            einer Organisation verwalteten Beschäftigten (Assistentinnen und
            Assistenten) ist der jeweilige Arbeitgeber als eigenständig
            Verantwortlicher im Sinne der DSGVO zuständig; der Betreiber der
            Anwendung handelt insoweit als Auftragsverarbeiter (Art. 28 DSGVO,
            Abschluss eines Auftragsverarbeitungsvertrags erforderlich).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">2. Zwecke und Rechtsgrundlagen</h2>
          <p className="text-sm text-slate-600">
            Die Anwendung verarbeitet personenbezogene Daten zur Verwaltung von
            Arbeitszeiten, Dienstplänen, Abwesenheiten und Lohnabrechnungen im
            Rahmen persönlicher Assistenz. Rechtsgrundlagen sind die
            Durchführung des Beschäftigungsverhältnisses (Art. 6 Abs. 1 lit. b
            DSGVO, § 26 BDSG), rechtliche Verpflichtungen des Arbeitgebers
            (Art. 6 Abs. 1 lit. c DSGVO, z. B. Aufzeichnungspflichten) sowie
            für den Betrieb des Nutzerkontos die Vertragserfüllung gegenüber
            dem registrierten Arbeitgeber (Art. 6 Abs. 1 lit. b DSGVO).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">3. Verarbeitete Daten</h2>
          <p className="text-sm text-slate-600">
            Kontodaten (Name, E-Mail-Adresse, Rolle), Beschäftigtendaten
            (Name, E-Mail, IBAN, Sozialversicherungsmerkmale wie RV-/KV-Pflicht),
            Arbeitszeit- und Dienstplandaten (Zeiteinträge, Kalender-Slots,
            Abwesenheiten), Abrechnungsdaten (Lohnläufe, Kontobewegungen) sowie
            technische Daten (Push-Benachrichtigungs-Abonnements,
            Protokolldaten des Hostings).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">4. Empfänger und Auftragsverarbeiter</h2>
          <p className="text-sm text-slate-600">
            Die Anwendung wird bei folgenden Dienstleistern betrieben, mit
            denen Auftragsverarbeitungsverträge bestehen bzw. abzuschließen
            sind: Supabase (Datenbank und Authentifizierung, Region ⟨EU-Region
            angeben⟩), Vercel (Hosting), Resend (E-Mail-Versand). ⟨Prüfen:
            Drittlandtransfers, Standardvertragsklauseln, ggf. Google Calendar
            (iCal-Abruf) ergänzen.⟩ Eine Weitergabe an sonstige Dritte findet
            nicht statt, außer es besteht eine gesetzliche Pflicht.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">5. Speicherdauer</h2>
          <p className="text-sm text-slate-600">
            Daten werden gespeichert, solange das Nutzerkonto bzw. das
            Beschäftigungsverhältnis besteht, und danach gemäß den
            gesetzlichen Aufbewahrungsfristen (z. B. lohnsteuer- und
            sozialversicherungsrechtliche Fristen von bis zu ⟨6/10⟩ Jahren)
            aufbewahrt und anschließend gelöscht. ⟨Löschkonzept ergänzen.⟩
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">6. Ihre Rechte</h2>
          <p className="text-sm text-slate-600">
            Betroffene haben das Recht auf Auskunft (Art. 15 DSGVO),
            Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der
            Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und
            Widerspruch (Art. 21). Außerdem besteht ein Beschwerderecht bei
            einer Datenschutz-Aufsichtsbehörde. Anfragen richten Sie an
            ⟨Kontakt des Verantwortlichen⟩.
          </p>
        </section>

        <p className="text-xs text-slate-400">
          Stand: ⟨Datum einsetzen⟩ · <a href="/registrieren" className="text-blue-600 hover:underline">Zurück zur Registrierung</a>
        </p>
      </div>
    </div>
  )
}

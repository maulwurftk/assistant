// ⚠️ ENTWURF — Diese Nutzungsbedingungen sind eine von einer KI erstellte
// Vorlage und MÜSSEN vor dem Onboarding fremder Nutzer juristisch geprüft
// und angepasst werden. Platzhalter sind mit ⟨…⟩ markiert.

export const metadata = { title: 'Nutzungsbedingungen · Assistenten-App' }

export default function NutzungsbedingungenPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-2xl mx-auto bg-surface rounded-xl shadow-sm border border-slate-200 p-8 space-y-6">
        <div className="text-xs font-semibold uppercase tracking-wide text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
          Entwurf — Vorlage ohne rechtliche Prüfung. Vor Veröffentlichung
          juristisch prüfen lassen und Platzhalter ersetzen.
        </div>

        <h1 className="text-2xl font-bold text-slate-900">Nutzungsbedingungen</h1>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">1. Leistungsbeschreibung</h2>
          <p className="text-sm text-slate-600">
            Die Assistenten-App unterstützt Arbeitgeber persönlicher Assistenz
            bei Dienstplanung, Zeiterfassung und Lohnabrechnung. Betreiber ist
            ⟨Name / Firma⟩. Die Anwendung befindet sich in laufender
            Entwicklung; Funktionsumfang und Verfügbarkeit können sich ändern.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">2. Konto und Organisation</h2>
          <p className="text-sm text-slate-600">
            Ein Konto darf nur mit gültigem Einladungscode und wahrheitsgemäßen
            Angaben angelegt werden. Der registrierende Arbeitgeber ist für
            alle Aktivitäten innerhalb seiner Organisation verantwortlich,
            insbesondere für die Verwaltung der Zugänge seiner Beschäftigten
            und die Geheimhaltung der Zugangsdaten.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">3. Pflichten der Nutzer</h2>
          <p className="text-sm text-slate-600">
            Nutzer verpflichten sich, nur Daten einzugeben, zu deren
            Verarbeitung sie berechtigt sind, keine Rechte Dritter zu
            verletzen und die Anwendung nicht missbräuchlich zu verwenden
            (z. B. Umgehung der Zugriffskontrollen, automatisiertes Auslesen).
            Der Arbeitgeber bleibt für die Richtigkeit der Abrechnungsdaten
            und die Einhaltung arbeits-, steuer- und
            sozialversicherungsrechtlicher Pflichten selbst verantwortlich —
            die Anwendung ersetzt keine Steuer- oder Rechtsberatung.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">4. Verfügbarkeit und Haftung</h2>
          <p className="text-sm text-slate-600">
            Es besteht kein Anspruch auf ununterbrochene Verfügbarkeit.
            Datensicherungen über die Export-Funktion liegen in der
            Verantwortung des Arbeitgebers. Der Betreiber haftet unbeschränkt
            bei Vorsatz und grober Fahrlässigkeit; bei einfacher Fahrlässigkeit
            nur für die Verletzung wesentlicher Vertragspflichten und begrenzt
            auf den vorhersehbaren, vertragstypischen Schaden. ⟨Haftungsklausel
            juristisch prüfen.⟩
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">5. Laufzeit und Beendigung</h2>
          <p className="text-sm text-slate-600">
            Das Konto kann jederzeit durch den Arbeitgeber beendet werden
            (⟨Kontakt/Verfahren angeben⟩). Der Betreiber kann Konten bei
            erheblichen Verstößen gegen diese Bedingungen sperren. Bei
            Beendigung werden die Daten der Organisation nach Ablauf
            gesetzlicher Aufbewahrungsfristen gelöscht; zuvor besteht die
            Möglichkeit des Exports. ⟨Etwaige Entgelte/Kündigungsfristen bei
            kostenpflichtigem Betrieb ergänzen.⟩
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">6. Schlussbestimmungen</h2>
          <p className="text-sm text-slate-600">
            Es gilt deutsches Recht. Sollten einzelne Bestimmungen unwirksam
            sein, bleibt die Wirksamkeit der übrigen unberührt. Änderungen
            dieser Bedingungen werden registrierten Nutzern in Textform
            mitgeteilt. Datenschutzhinweise: siehe{' '}
            <a href="/datenschutz" className="text-blue-600 hover:underline">Datenschutzerklärung</a>.
          </p>
        </section>

        <p className="text-xs text-slate-400">
          Stand: ⟨Datum einsetzen⟩ · <a href="/registrieren" className="text-blue-600 hover:underline">Zurück zur Registrierung</a>
        </p>
      </div>
    </div>
  )
}

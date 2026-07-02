export function Disclaimer({ className = '' }: { className?: string }) {
  return (
    <div
      className={`text-xs text-slate-500 leading-relaxed border-t border-slate-200 pt-4 ${className}`}
    >
      <p className="font-medium text-slate-600 mb-1">Rechtlicher Hinweis</p>
      <p>
        Diese Anwendung dient der eigenen Organisation und Übersicht. Die angezeigten
        Lohn-, Beitrags- und Rücklagenberechnungen sind <strong>unverbindlich und ohne
        Gewähr</strong> und stellen <strong>keine Steuer-, Rechts- oder Lohnabrechnungsberatung</strong>{' '}
        im Sinne des Steuerberatungsgesetzes dar. Verbindlich sind allein die Bescheide und
        Abrechnungen der Minijob-Zentrale, des Finanzamts und des jeweiligen Kostenträgers
        (Bezirk). Beitragssätze ändern sich; prüfe die hinterlegten Werte regelmäßig selbst.
        Für Entscheidungen mit rechtlicher oder finanzieller Wirkung ziehe eine
        Steuerberatung oder einen Lohnabrechnungsdienst hinzu.
      </p>
    </div>
  )
}

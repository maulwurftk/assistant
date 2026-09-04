import { entryDurationMinutes, formatMinutes, formatDate, monthName } from '@/lib/payroll'

export type ReportRow = { id: string; date: string; start_time: string; end_time: string; label: string }

type Props = {
  assistant: { full_name: string; email: string }
  employer: { name: string | null; address: string | null } | null
  year: number
  month: number
  rows: ReportRow[]
  today: string
  /** In der Sammel-Druckansicht soll jeder Bericht auf einer eigenen Seite beginnen. */
  pageBreak?: boolean
}

/** Ein einzelner Tätigkeitsbericht (Kopf, Einsätze, Bestätigungstext, Unterschriften) –
 * wird sowohl auf der Einzel- als auch der Sammel-Druckseite verwendet. */
export function ReportBlock({ assistant, employer, year, month, rows, today, pageBreak }: Props) {
  const totalMinutes = rows.reduce((sum, e) => sum + entryDurationMinutes(e.start_time, e.end_time), 0)

  return (
    <div className={`max-w-3xl mx-auto p-12 print:p-8 ${pageBreak ? 'print:break-after-page' : ''}`}>
      <div className="flex justify-between items-start mb-8 print:break-inside-avoid">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Tätigkeitsbericht</h1>
          <p className="text-xl text-slate-600 mt-1">{monthName(month)} {year}</p>
        </div>
        <div className="text-right text-sm text-slate-400">
          <p>Erstellt am {today}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8 print:break-inside-avoid">
        {employer?.name && (
          <div className="p-4 border border-slate-200 rounded-xl">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Auftraggeber</h2>
            <p className="text-sm font-semibold text-slate-900">{employer.name}</p>
            {employer.address && (
              <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-line">{employer.address}</p>
            )}
          </div>
        )}
        <div className={`p-4 border border-slate-200 rounded-xl ${!employer?.name ? 'col-span-2' : ''}`}>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Assistenz</h2>
          <p className="text-sm font-semibold text-slate-900">{assistant.full_name}</p>
          <p className="text-xs text-slate-500">{assistant.email}</p>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Bestätigte Einsätze</h2>
        {rows.length === 0 ? (
          <p className="text-slate-400 text-sm py-6">Keine bestätigten Einsätze für diesen Monat.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-200">
                <th className="text-left py-2 pr-4 font-semibold text-slate-600">Datum</th>
                <th className="text-left py-2 pr-4 font-semibold text-slate-600">Tätigkeit</th>
                <th className="text-left py-2 pr-3 font-semibold text-slate-600">Von</th>
                <th className="text-left py-2 pr-3 font-semibold text-slate-600">Bis</th>
                <th className="text-right py-2 font-semibold text-slate-600">Dauer</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const mins = entryDurationMinutes(e.start_time, e.end_time)
                return (
                  <tr key={e.id} className="border-b border-slate-100 print:break-inside-avoid">
                    <td className="py-2 pr-4 text-slate-800">{formatDate(e.date)}</td>
                    <td className="py-2 pr-4 text-slate-700">{e.label}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-slate-600">{e.start_time.slice(0, 5)}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-slate-600">{e.end_time.slice(0, 5)}</td>
                    <td className="py-2 text-right text-slate-800">{formatMinutes(mins)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300">
                <td colSpan={4} className="py-3 font-semibold text-slate-800">Gesamt</td>
                <td className="py-3 text-right font-bold text-slate-900">{formatMinutes(totalMinutes)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <div className="border border-slate-200 rounded-xl p-5 mb-10 bg-slate-50 print:bg-slate-50 print:border-slate-300 print:break-inside-avoid">
        <p className="text-sm text-slate-700 leading-relaxed">
          Hiermit bestätigen beide Parteien, dass die oben aufgeführten Tätigkeiten für{' '}
          <strong>{monthName(month)} {year}</strong> ordnungsgemäß und wie beschrieben durchgeführt wurden.
          Dieser Bericht dient ausschließlich dem Tätigkeitsnachweis und enthält keine Vergütungsangaben.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-16 mt-8 print:break-inside-avoid">
        <div>
          <div className="border-b-2 border-slate-300 mb-3" style={{ height: '48px' }} />
          <p className="text-xs text-slate-500">Datum, Unterschrift</p>
          <p className="text-sm font-medium text-slate-700 mt-0.5">{assistant.full_name}</p>
        </div>
        <div>
          <div className="border-b-2 border-slate-300 mb-3" style={{ height: '48px' }} />
          <p className="text-xs text-slate-500">Datum, Unterschrift</p>
          {employer?.name && (
            <p className="text-sm font-medium text-slate-700 mt-0.5">{employer.name}</p>
          )}
        </div>
      </div>
    </div>
  )
}

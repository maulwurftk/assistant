import { expiryDate, formatDays, type YearBalance } from '@/lib/vacation'

const de = (iso: string) => iso.split('-').reverse().join('.')

export function BalanceOverview({
  balances,
  carryoverUntil = '03-31',
  today = new Date().toISOString().slice(0, 10),
}: {
  balances: YearBalance[]
  carryoverUntil?: string
  today?: string
}) {
  const total = Math.round(balances.reduce((s, b) => s + b.balance, 0) * 100) / 100
  const shown = balances.filter((b) => b.credited !== 0 || b.taken !== 0 || b.balance !== 0)
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
        <p className="text-sm text-emerald-700">Resturlaub gesamt</p>
        <p className="text-3xl font-bold text-emerald-900 tabular-nums">{formatDays(total)}</p>
      </div>
      {shown.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-1.5 font-medium">Urlaubsjahr</th>
              <th className="py-1.5 font-medium text-right">Gutschrift</th>
              <th className="py-1.5 font-medium text-right">Genommen</th>
              <th className="py-1.5 font-medium text-right">Rest</th>
              <th className="py-1.5 font-medium text-right">Verfällt</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((b) => {
              const exp = expiryDate(b.leave_year, carryoverUntil)
              const soon = b.balance > 0 && exp >= today
              return (
                <tr key={b.leave_year} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5">{b.leave_year}</td>
                  <td className="py-1.5 text-right tabular-nums">{b.credited.toLocaleString('de-DE')}</td>
                  <td className="py-1.5 text-right tabular-nums">{b.taken.toLocaleString('de-DE')}</td>
                  <td className="py-1.5 text-right tabular-nums font-semibold">{b.balance.toLocaleString('de-DE')}</td>
                  <td className={`py-1.5 text-right ${soon ? 'text-amber-700' : 'text-slate-400'}`}>
                    {b.balance > 0 ? `${de(exp)}*` : '–'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <p className="text-xs text-slate-400">
        * Resturlaub verfällt nur, wenn vorher rechtzeitig ein Hinweis verschickt wurde.
      </p>
    </div>
  )
}

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

type Tone = 'emerald' | 'amber' | 'violet' | 'sky' | 'rose' | 'slate'

const chip: Record<Tone, string> = {
  emerald: 'bg-gradient-to-br from-emerald-500 to-emerald-600',
  amber: 'bg-gradient-to-br from-amber-400 to-amber-500',
  violet: 'bg-gradient-to-br from-violet-400 to-violet-500',
  sky: 'bg-gradient-to-br from-sky-400 to-sky-500',
  rose: 'bg-gradient-to-br from-rose-400 to-rose-500',
  slate: 'bg-gradient-to-br from-slate-400 to-slate-500',
}

export function KpiTile({
  href,
  icon,
  label,
  value,
  sub,
  subTone = 'muted',
  tone = 'emerald',
}: {
  href: string
  icon: ReactNode
  label: string
  value: ReactNode
  sub?: ReactNode
  subTone?: 'muted' | 'up' | 'down' | 'warn'
  tone?: Tone
}) {
  const subColor =
    subTone === 'up'
      ? 'text-emerald-600'
      : subTone === 'down'
      ? 'text-red-600'
      : subTone === 'warn'
      ? 'text-amber-600'
      : 'text-slate-400'

  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-xl border border-slate-200 bg-surface p-4 shadow-sm transition-all hover:shadow-md hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-white ${chip[tone]}`}>
          {icon}
        </span>
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums leading-none">{value}</div>
      {sub && <div className={`mt-1.5 text-xs font-medium ${subColor}`}>{sub}</div>}
      <ArrowUpRight className="absolute bottom-3 right-3 h-4 w-4 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  )
}

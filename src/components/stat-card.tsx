import type { ReactNode } from 'react'

type Tone = 'emerald' | 'amber' | 'rose' | 'slate'

const toneChip: Record<Tone, string> = {
  emerald: 'bg-emerald-100 text-emerald-600',
  amber: 'bg-amber-100 text-amber-600',
  rose: 'bg-red-100 text-red-600',
  slate: 'bg-slate-100 text-slate-600',
}

export function StatCard({
  icon,
  label,
  value,
  hint,
  tone = 'emerald',
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: Tone
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneChip[tone]}`}>
          {icon}
        </div>
        <p className="text-sm font-medium text-slate-500 leading-tight">{label}</p>
      </div>
      <div className="mt-4 text-3xl font-bold text-slate-900 tabular-nums leading-none">{value}</div>
      {hint && <div className="mt-2 text-xs text-slate-400">{hint}</div>}
    </div>
  )
}

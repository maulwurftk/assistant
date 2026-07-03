import type { ReactNode } from 'react'

type Tone = 'emerald' | 'amber' | 'rose' | 'slate' | 'violet' | 'sky'

const tones: Record<Tone, { chip: string; wash: string }> = {
  emerald: { chip: 'bg-gradient-to-br from-emerald-500 to-emerald-600', wash: 'from-emerald-500/15' },
  amber: { chip: 'bg-gradient-to-br from-amber-400 to-amber-500', wash: 'from-amber-500/15' },
  rose: { chip: 'bg-gradient-to-br from-rose-400 to-rose-500', wash: 'from-rose-500/15' },
  violet: { chip: 'bg-gradient-to-br from-violet-400 to-violet-500', wash: 'from-violet-500/15' },
  slate: { chip: 'bg-gradient-to-br from-slate-400 to-slate-500', wash: 'from-slate-500/10' },
  sky: { chip: 'bg-gradient-to-br from-sky-400 to-sky-500', wash: 'from-sky-500/15' },
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
  const t = tones[tone] ?? tones.emerald
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm transition-shadow hover:shadow-md">
      {/* farbiger Verlauf-Schleier */}
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${t.wash} to-transparent`} />
      <div className="relative">
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm ${t.chip}`}>
            {icon}
          </div>
          <p className="text-sm font-medium text-slate-500 leading-tight">{label}</p>
        </div>
        <div className="mt-4 text-3xl font-bold text-slate-900 tabular-nums leading-none">{value}</div>
        {hint && <div className="mt-2 text-xs text-slate-400">{hint}</div>}
      </div>
    </div>
  )
}

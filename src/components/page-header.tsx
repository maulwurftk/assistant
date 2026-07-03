import type { ReactNode } from 'react'

type Tone = 'emerald' | 'amber' | 'violet' | 'sky' | 'rose' | 'slate'

const chip: Record<Tone, string> = {
  emerald: 'bg-gradient-to-br from-emerald-500 to-emerald-600',
  amber: 'bg-gradient-to-br from-amber-400 to-amber-500',
  violet: 'bg-gradient-to-br from-violet-400 to-violet-500',
  sky: 'bg-gradient-to-br from-sky-400 to-sky-500',
  rose: 'bg-gradient-to-br from-rose-400 to-rose-500',
  slate: 'bg-gradient-to-br from-slate-400 to-slate-500',
}

/** Icon-Chip + Titel + Untertitel. In bestehende Header-Zeilen als erstes
 *  Kind einsetzen (Aktionen bleiben als Geschwister daneben). */
export function PageHeader({
  icon,
  title,
  subtitle,
  tone = 'emerald',
}: {
  icon: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  tone?: Tone
}) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm ${chip[tone]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-slate-900 leading-tight">{title}</h1>
        {subtitle && <div className="text-sm text-slate-500 mt-0.5">{subtitle}</div>}
      </div>
    </div>
  )
}

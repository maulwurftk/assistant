// Abwesenheits-Zeitraum (z.B. Mutterschutz, Elternzeit) je Profil.
// leave_until = null bedeutet: Ende noch offen, gilt bis auf Weiteres.

export interface LeaveInfo {
  leave_reason?: string | null
  leave_from?: string | null
  leave_until?: string | null
}

// Ist das Profil an einem bestimmten Datum (YYYY-MM-DD) in Abwesenheit?
export function isOnLeaveAt(p: LeaveInfo | null | undefined, dateStr: string): boolean {
  if (!p?.leave_from) return false
  if (dateStr < p.leave_from) return false
  if (p.leave_until && dateStr > p.leave_until) return false
  return true
}

// Ist das Profil gerade (heute) in Abwesenheit?
export function isOnLeaveNow(p: LeaveInfo | null | undefined): boolean {
  const today = new Date().toISOString().slice(0, 10)
  return isOnLeaveAt(p, today)
}

export function formatLeaveBadge(p: LeaveInfo | null | undefined): string | null {
  if (!p?.leave_from) return null
  const from = formatDateDe(p.leave_from)
  const reason = p.leave_reason?.trim() || 'Abwesend'
  if (p.leave_until) {
    return `${reason} (${from} – ${formatDateDe(p.leave_until)})`
  }
  return `${reason} seit ${from}`
}

function formatDateDe(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}.${m}.${y}`
}

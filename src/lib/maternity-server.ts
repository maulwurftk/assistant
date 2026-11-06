import { computeSubsidy, isMaternityLeave, type MaternitySubsidy } from './maternity'
import type { LeaveInfo } from './leave'

// Lädt die bereits versendeten Abrechnungen der Assistentin und berechnet den
// Arbeitgeberzuschuss für den Monat. null = kein Mutterschutz in diesem Monat.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function maternitySubsidyFor(
  supabase: any,
  assistantId: string,
  leave: LeaveInfo | null | undefined,
  year: number,
  month: number
): Promise<MaternitySubsidy | null> {
  if (!isMaternityLeave(leave)) return null
  const { data } = await supabase
    .from('payroll_runs')
    .select('year, month, total_pay')
    .eq('assistant_id', assistantId)
    .not('email_sent_at', 'is', null)
  return computeSubsidy(leave as LeaveInfo, year, month, (data ?? []) as Array<{ year: number; month: number; total_pay: number }>)
}

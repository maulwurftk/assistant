// Urlaub – schreibende Abläufe (Genehmigen, Stornieren). Service-Role-Client,
// IMMER mit explizitem tenant_id-Scope (Architektur §5.1).
import type { Database, Json } from '@/types/database'
import {
  type Db,
  type VacationSettings,
  adminIds,
  notify,
  previewVacation,
  sentPayrollMonths,
} from '@/lib/vacation-server'
import { ABSENCE_TYPE_LABELS, formatDays } from '@/lib/vacation'

type AbsenceRow = Database['public']['Tables']['absences']['Row']

export class VacationError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

const deDate = (iso: string) => iso.split('-').reverse().join('.')

/** Prüft, ob ein Datum in einem bereits versendeten Lohnmonat liegt. */
function lockedMonth(locked: Set<string>, dates: string[]): string | null {
  for (const d of dates) if (locked.has(d.slice(0, 7))) return d.slice(0, 7)
  return null
}

export async function approveAbsence(
  db: Db,
  tenantId: string,
  absence: AbsenceRow,
  deciderId: string,
  settings: VacationSettings,
  decisionNote?: string | null
) {
  if (absence.status !== 'requested') throw new VacationError('Nur beantragte Abwesenheiten können genehmigt werden.', 409)

  const update: Database['public']['Tables']['absences']['Update'] = {
    status: 'approved',
    decided_by: deciderId,
    decided_at: new Date().toISOString(),
    decision_note: decisionNote ?? null,
  }

  const paysVacation = absence.type === 'vacation' || absence.type === 'vacation_payout'
  if (paysVacation) {
    const payDates = absence.type === 'vacation' ? absence.workdays : [absence.date_from]
    const locked = lockedMonth(await sentPayrollMonths(db, tenantId, absence.assistant_id), payDates)
    if (locked) throw new VacationError(`Die Lohnabrechnung ${locked} ist bereits versendet – Urlaub in diesem Monat kann nicht mehr genehmigt werden.`, 409)

    const days = Number(absence.days)
    const p = await previewVacation(db, tenantId, absence.assistant_id, absence.date_from, days, settings, absence.id)
    update.minutes_per_day = p.minutesPerDay
    update.paid_minutes = p.paidMinutes
    update.calc_snapshot = {
      method: p.basis.method,
      refFrom: p.basis.refFrom,
      refTo: p.basis.refTo,
      refMinutes: p.basis.refMinutes,
      refWorkdays: p.basis.refWorkdays,
      allocation: p.allocation,
      shortfall: p.shortfall,
      balanceBefore: p.balanceBefore,
    } as unknown as Json

    // Kontobuchungen (je Urlaubsjahr, FIFO)
    const kind = absence.type === 'vacation' ? 'taken' : 'payout'
    const { error: ledErr } = await db.from('leave_ledger').insert(
      p.allocation.map((a) => ({
        tenant_id: tenantId,
        assistant_id: absence.assistant_id,
        leave_year: a.leave_year,
        kind,
        days: -a.days,
        absence_id: absence.id,
        dedup_key: `${kind}:${absence.id}:${a.leave_year}`,
        created_by: deciderId,
        note: `${ABSENCE_TYPE_LABELS[absence.type]} ${deDate(absence.date_from)}–${deDate(absence.date_to)}`,
      }))
    )
    if (ledErr) throw new VacationError('Kontobuchung fehlgeschlagen: ' + ledErr.message, 500)
  }

  const { error } = await db.from('absences').update(update).eq('id', absence.id).eq('tenant_id', tenantId)
  if (error) throw new VacationError(error.message, 500)

  // Geplante, noch nicht bestätigte Dienste im Zeitraum freigeben → Vertretung
  let freed = 0
  if (absence.type !== 'vacation_payout') {
    const { data: slots } = await db
      .from('calendar_slots')
      .update({ status: 'open', assigned_to: null })
      .eq('tenant_id', tenantId)
      .eq('assigned_to', absence.assistant_id)
      .eq('status', 'assigned')
      .is('confirmed_at', null)
      .gte('date', absence.date_from)
      .lte('date', absence.date_to)
      .select('id')
    freed = slots?.length ?? 0
    if (freed > 0) {
      const { data: others } = await db
        .from('profiles').select('id')
        .eq('tenant_id', tenantId).eq('role', 'assistant').eq('active', true)
        .neq('id', absence.assistant_id)
      await notify(db, tenantId, (others ?? []).map((o) => o.id), 'Dienste frei geworden',
        `${freed} Dienst(e) zwischen ${deDate(absence.date_from)} und ${deDate(absence.date_to)} brauchen eine Vertretung.`, 'info')
    }
  }

  await notify(db, tenantId, [absence.assistant_id],
    `${ABSENCE_TYPE_LABELS[absence.type]} genehmigt`,
    `${deDate(absence.date_from)}–${deDate(absence.date_to)}` +
      (paysVacation ? ` · ${formatDays(Number(absence.days))}` : '') +
      (decisionNote ? ` · ${decisionNote}` : ''),
    'success', absence.id)

  return { freedSlots: freed, minutesPerDay: update.minutes_per_day ?? null }
}

export async function rejectAbsence(db: Db, tenantId: string, absence: AbsenceRow, deciderId: string, decisionNote?: string | null) {
  if (absence.status !== 'requested') throw new VacationError('Nur beantragte Abwesenheiten können abgelehnt werden.', 409)
  const { error } = await db.from('absences').update({
    status: 'rejected', decided_by: deciderId, decided_at: new Date().toISOString(), decision_note: decisionNote ?? null,
  }).eq('id', absence.id).eq('tenant_id', tenantId)
  if (error) throw new VacationError(error.message, 500)
  await notify(db, tenantId, [absence.assistant_id], `${ABSENCE_TYPE_LABELS[absence.type]} abgelehnt`,
    `${deDate(absence.date_from)}–${deDate(absence.date_to)}${decisionNote ? ` · ${decisionNote}` : ''}`, 'warning', absence.id)
}

export async function cancelAbsence(db: Db, tenantId: string, absence: AbsenceRow, actorId: string, isAdmin: boolean) {
  if (absence.status === 'cancelled' || absence.status === 'rejected') throw new VacationError('Bereits erledigt.', 409)
  if (!isAdmin && absence.status !== 'requested') {
    throw new VacationError('Genehmigte Abwesenheiten kann nur der Arbeitgeber stornieren.', 403)
  }

  if (absence.status === 'approved' && (absence.type === 'vacation' || absence.type === 'vacation_payout')) {
    const payDates = absence.type === 'vacation' ? absence.workdays : [absence.date_from]
    const locked = lockedMonth(await sentPayrollMonths(db, tenantId, absence.assistant_id), payDates)
    if (locked) throw new VacationError(`Die Lohnabrechnung ${locked} ist bereits versendet – bitte stattdessen eine Korrekturbuchung anlegen.`, 409)

    // Gegenbuchung je Urlaubsjahr
    const { data: booked } = await db
      .from('leave_ledger').select('leave_year, days')
      .eq('tenant_id', tenantId).eq('absence_id', absence.id).in('kind', ['taken', 'payout'])
    if (booked?.length) {
      const { error: ledErr } = await db.from('leave_ledger').insert(booked.map((b) => ({
        tenant_id: tenantId,
        assistant_id: absence.assistant_id,
        leave_year: b.leave_year,
        kind: 'correction' as const,
        days: -Number(b.days),
        absence_id: absence.id,
        dedup_key: `storno:${absence.id}:${b.leave_year}`,
        created_by: actorId,
        note: `Storno ${ABSENCE_TYPE_LABELS[absence.type]} ${deDate(absence.date_from)}–${deDate(absence.date_to)}`,
      })))
      if (ledErr) throw new VacationError('Gegenbuchung fehlgeschlagen: ' + ledErr.message, 500)
    }
  }

  const { error } = await db.from('absences').update({ status: 'cancelled' }).eq('id', absence.id).eq('tenant_id', tenantId)
  if (error) throw new VacationError(error.message, 500)

  const recipients = isAdmin ? [absence.assistant_id] : await adminIds(db, tenantId)
  await notify(db, tenantId, recipients, `${ABSENCE_TYPE_LABELS[absence.type]} storniert`,
    `${deDate(absence.date_from)}–${deDate(absence.date_to)}`, 'info', absence.id)
}

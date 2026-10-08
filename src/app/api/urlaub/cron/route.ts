import { NextResponse } from 'next/server'
import { escapeHtml } from '@/lib/utils'
import {
  adminIds,
  createServiceDb,
  expiryDate,
  loadVacationSettings,
  notify,
  recomputeEntitlement,
  sendMail,
} from '@/lib/vacation-server'
import { balancesByYear, formatDays } from '@/lib/vacation'

// Vercel Cron (täglich). Pro aktivem Mandant mit Urlaubsmodul:
//  1. Jahresanspruch buchen, falls fürs laufende Jahr noch nicht vorhanden
//  2. Hinweis auf Resturlaub + Verfall (BAG-Mitwirkungsobliegenheit) – einmal je Urlaubsjahr
//  3. Verfall nach Übertragungsfrist – NUR wenn ein Hinweis nachweislich verschickt wurde
//     und keine Krankheit über das Fristende läuft
//  4. Austritt gestern + Resturlaub → Admin-Hinweis zur Abgeltung
// Alle Schritte idempotent (dedup_key / unique-Constraints).

async function run(request: Request) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = createServiceDb()
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://assistenz.charmely.cloud'
  const stats = { orgs: 0, entitlements: 0, notices: 0, expired: 0, skippedExpiry: 0 }

  const { data: orgs } = await db.from('organizations').select('id').eq('status', 'active')
  for (const org of orgs ?? []) {
    const settings = await loadVacationSettings(db, org.id)
    if (!settings.enabled) continue
    stats.orgs++

    const { data: assistants } = await db.from('profiles')
      .select('id, full_name, email, employment_end, active')
      .eq('tenant_id', org.id).eq('role', 'assistant')
    const admins = await adminIds(db, org.id)

    for (const a of assistants ?? []) {
      const employed = a.active && (!a.employment_end || a.employment_end >= `${year}-01-01`)

      // 1) Jahresanspruch
      if (employed) {
        const { data: ent } = await db.from('leave_ledger').select('id')
          .eq('tenant_id', org.id).eq('dedup_key', `ent:${year}:${a.id}`).maybeSingle()
        if (!ent) {
          await recomputeEntitlement(db, org.id, a.id, year, settings, null)
          stats.entitlements++
        }
      }

      const { data: ledger } = await db.from('leave_ledger').select('leave_year, kind, days')
        .eq('tenant_id', org.id).eq('assistant_id', a.id)
      const balances = balancesByYear((ledger ?? []).map((l) => ({ ...l, days: Number(l.days) })))
      const { data: notices } = await db.from('vacation_notices').select('leave_year')
        .eq('tenant_id', org.id).eq('assistant_id', a.id)
      const noticed = new Set((notices ?? []).map((n) => n.leave_year))

      for (const b of balances) {
        if (b.balance <= 0) continue
        const expires = expiryDate(b.leave_year, settings.carryoverUntil)

        // 2) Hinweis: laufendes Jahr ab Hinweis-Monat; Vorjahre sofort (solange nicht abgelaufen)
        const due = b.leave_year < year || (b.leave_year === year && month >= settings.noticeMonth)
        if (employed && due && today <= expires && !noticed.has(b.leave_year)) {
          const deadline = b.leave_year < year ? expires : `${b.leave_year}-12-31`
          const fmt = (d: string) => d.split('-').reverse().join('.')
          const message =
            `Hinweis zu deinem Urlaub ${b.leave_year}: Du hast noch ${formatDays(b.balance)} Urlaub. ` +
            `Bitte beantrage ihn rechtzeitig bis ${fmt(deadline)}. ` +
            (b.leave_year === year
              ? `Nicht genommener Urlaub wird ins nächste Jahr übertragen und verfällt am ${fmt(expires)}, wenn er bis dahin nicht genommen wird.`
              : `Danach verfällt der Resturlaub ersatzlos.`)
          const mailed = a.email
            ? await sendMail(a.email, `Dein Resturlaub ${b.leave_year}`,
                `<p>Hallo ${escapeHtml(a.full_name)},</p><p>${escapeHtml(message)}</p>` +
                `<p><a href="${APP_URL}/urlaub">Urlaub beantragen</a></p>`)
            : false
          const { error } = await db.from('vacation_notices').insert({
            tenant_id: org.id,
            assistant_id: a.id,
            leave_year: b.leave_year,
            remaining_days: b.balance,
            expires_on: expires,
            channel: mailed ? 'email+app' : 'app',
            message,
          })
          if (!error) {
            await notify(db, org.id, [a.id], `Resturlaub ${b.leave_year}`, message, 'warning')
            noticed.add(b.leave_year)
            stats.notices++
          }
        }

        // 3) Verfall
        if (today > expires) {
          const { data: sick } = await db.from('absences').select('id')
            .eq('tenant_id', org.id).eq('assistant_id', a.id).eq('status', 'approved')
            .in('type', ['sick']).lte('date_from', expires).gte('date_to', expires).limit(1)
          if (noticed.has(b.leave_year) && !sick?.length) {
            const { error } = await db.from('leave_ledger').insert({
              tenant_id: org.id,
              assistant_id: a.id,
              leave_year: b.leave_year,
              kind: 'expired',
              days: -b.balance,
              dedup_key: `exp:${b.leave_year}:${a.id}`,
              note: `Verfallen zum ${expires.split('-').reverse().join('.')} (Hinweis erfolgt)`,
            })
            if (!error) stats.expired++
          } else {
            stats.skippedExpiry++
          }
        }
      }

      // 4) Austritt gestern mit Resturlaub → Abgeltung anstoßen
      if (a.employment_end === yesterday) {
        const total = balances.reduce((s, b) => s + b.balance, 0)
        if (total > 0) {
          await notify(db, org.id, admins, `Resturlaub abgelten: ${a.full_name}`,
            `Arbeitsverhältnis endete am ${yesterday.split('-').reverse().join('.')}. Offen: ${formatDays(total)} – bitte unter Urlaub › Abgeltung buchen.`, 'warning')
        }
      }
    }
  }
  return NextResponse.json({ ok: true, ...stats })
}

export async function GET(request: Request) { return run(request) }
export async function POST(request: Request) { return run(request) }

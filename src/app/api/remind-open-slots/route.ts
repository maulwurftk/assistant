import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { format, addHours } from 'date-fns'
import { de } from 'date-fns/locale'
import { sendPushToUsers } from '@/lib/push'
import { escapeHtml } from '@/lib/utils'
import type { Database } from '@/types/database'

// Vercel Cron: alle 6 Stunden
// Prüft ob Slots in den nächsten 48h noch unbesetzt sind → erinnert die
// Assistenten DES JEWEILIGEN TENANTS (Architektur §5.3: pro Tenant gruppiert,
// nur status='active'-Orgs — nie Empfänger/Inhalte über Mandanten mischen).

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const now = new Date()
  // Fenster: Slots die zwischen jetzt+24h und jetzt+48h beginnen
  // (täglicher Cron um 08:00 — reminder_sent_at verhindert Duplikate)
  const windowStart = addHours(now, 24)
  const windowEnd = addHours(now, 48)

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://assistenz.charmely.cloud'
  const FROM = process.env.FROM_EMAIL ?? 'noreply@charmely.cloud'

  const { data: orgs } = await db.from('organizations').select('id').eq('status', 'active')
  let remindedTotal = 0

  for (const org of orgs ?? []) {
    // Offene, nicht-erinnerte Slots der nächsten Tage — NUR dieses Tenants
    const { data: slots } = await db
      .from('calendar_slots')
      .select('*')
      .eq('tenant_id', org.id)
      .in('status', ['open'])
      .is('reminder_sent_at', null)
      .gte('date', format(windowStart, 'yyyy-MM-dd'))
      .lte('date', format(windowEnd, 'yyyy-MM-dd'))

    if (!slots?.length) continue

    // In JS genau filtern: Slot-Startzeit liegt im Fenster
    const dueSlots = slots.filter(slot => {
      const [h, m] = slot.start_time.split(':').map(Number)
      const slotStart = new Date(`${slot.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`)
      return slotStart >= windowStart && slotStart <= windowEnd
    })
    if (!dueSlots.length) continue

    const { data: assistants } = await db
      .from('profiles')
      .select('id, email, full_name')
      .eq('tenant_id', org.id)
      .eq('role', 'assistant')
      .eq('active', true)
    if (!assistants?.length) continue

    for (const slot of dueSlots) {
      const dateStr = format(new Date(slot.date), 'EEEE, dd. MMMM', { locale: de })
      const timeStr = `${slot.start_time.slice(0, 5)}–${slot.end_time.slice(0, 5)} Uhr`
      const title = 'Offener Slot – noch verfügbar'
      const message = `„${slot.title}" am ${dateStr} (${timeStr}) ist noch nicht besetzt. Jetzt übernehmen?`

      // In-App-Benachrichtigung für die Assistenten dieses Tenants
      await db.from('notifications').insert(
        assistants.map(a => ({
          tenant_id: org.id,
          user_id: a.id,
          title,
          message,
          type: 'warning',
          related_type: 'slot_reminder',
          related_id: slot.id,
        })) as never[]
      )
      await sendPushToUsers(assistants.map(a => a.id), title, message, '/dashboard')

      // E-Mail an die Assistenten dieses Tenants
      if (process.env.RESEND_API_KEY) {
        for (const assistant of assistants) {
          try {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: FROM,
                to: assistant.email,
                subject: `[Assistenten-App] Offener Slot in 48h`,
                html: `
                  <h2 style="color:#d97706">⚠️ Offener Slot – noch verfügbar</h2>
                  <p>Hallo ${escapeHtml(assistant.full_name)},</p>
                  <p>folgender Slot ist in ca. 48 Stunden und noch nicht besetzt:</p>
                  <table style="border-collapse:collapse;margin:16px 0">
                    <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Slot</td><td><strong>${escapeHtml(slot.title)}</strong></td></tr>
                    <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Datum</td><td>${dateStr}</td></tr>
                    <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Uhrzeit</td><td>${timeStr}</td></tr>
                  </table>
                  ${slot.description ? `<p style="color:#6b7280">${escapeHtml(slot.description)}</p>` : ''}
                  <p>
                    <a href="${APP_URL}/dashboard"
                       style="display:inline-block;padding:10px 20px;background:#d97706;color:#fff;border-radius:6px;text-decoration:none">
                      Slot jetzt übernehmen
                    </a>
                  </p>
                `,
              }),
            })
          } catch (e) {
            console.error('Email error for', assistant.email, e)
          }
        }
      }

      // Als erinnert markieren damit keine Duplikate entstehen
      await db
        .from('calendar_slots')
        .update({ reminder_sent_at: now.toISOString() } as never)
        .eq('id', slot.id)
        .eq('tenant_id', org.id)
    }
    remindedTotal += dueSlots.length
  }

  return NextResponse.json({ success: true, reminded: remindedTotal })
}

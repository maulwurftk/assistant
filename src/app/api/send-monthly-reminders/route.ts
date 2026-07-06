import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { sendPushToUser } from '@/lib/push'
import type { Database } from '@/types/database'

// Called by a cron job on the last day of each month
// Set up in Vercel as: 0 8 28-31 * * (runs at 8:00 on days 28-31)
// Pro Tenant gruppiert (Architektur §5.3), nur status='active'-Orgs.
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminClient = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const monthName = format(now, 'MMMM yyyy', { locale: de })

  const { data: orgs } = await adminClient.from('organizations').select('id').eq('status', 'active')
  let remindedTotal = 0

  for (const org of orgs ?? []) {
    const { data: assistants } = await adminClient
      .from('profiles')
      .select('id, email, full_name')
      .eq('tenant_id', org.id)
      .eq('role', 'assistant')
      .eq('active', true)
    if (!assistants?.length) continue

    const sentReports = await adminClient
      .from('monthly_reports')
      .select('assistant_id')
      .eq('tenant_id', org.id)
      .eq('year', year)
      .eq('month', month)
      .eq('status', 'sent')

    const sentIds = new Set((sentReports.data ?? []).map(r => r.assistant_id))

    for (const assistant of assistants) {
      if (sentIds.has(assistant.id)) continue

      await adminClient.from('notifications').insert({
        tenant_id: org.id,
        user_id: assistant.id,
        title: 'Monatsabschluss ausstehend',
        message: `Bitte schließen Sie Ihren Monatsbericht für ${monthName} ab und senden Sie ihn.`,
        type: 'warning',
        related_type: 'monthly_reminder',
        related_id: null,
      } as never)
      await sendPushToUser(assistant.id, 'Monatsabschluss ausstehend', `Bitte den Monatsbericht für ${monthName} abschließen.`, '/zeiterfassung')

      if (process.env.RESEND_API_KEY) {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: process.env.FROM_EMAIL ?? 'noreply@charmely.cloud',
              to: assistant.email,
              subject: `[Assistenten-App] Monatsabschluss ${monthName} ausstehend`,
              html: `
                <h2>Monatsabschluss ${monthName}</h2>
                <p>Hallo ${assistant.full_name},</p>
                <p>bitte überprüfen und schließen Sie Ihren Monatsbericht für ${monthName} ab.</p>
                <p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://assistenz.charmely.cloud'}/zeiterfassung">Zur Zeiterfassung</a></p>
              `,
            }),
          })
        } catch (e) {
          console.error('Email error for', assistant.email, e)
        }
      }
      remindedTotal++
    }
  }

  return NextResponse.json({ success: true, reminded: remindedTotal })
}

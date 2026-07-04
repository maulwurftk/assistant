import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { sendPushToUsers } from '@/lib/push'
import { resolveTenant } from '@/lib/tenant'
import type { Database } from '@/types/database'

export async function POST(request: Request) {
  const ctx = await resolveTenant()
  if (!ctx) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  const { reportId, assistantId, year, month } = await request.json()

  const adminClient = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Assistent muss zum Tenant des Aufrufers gehören (kein Spoofing über Body)
  const { data: assistantProfile } = await adminClient
    .from('profiles')
    .select('full_name')
    .eq('id', assistantId)
    .eq('tenant_id', ctx.tenantId)
    .single()
  if (!assistantProfile) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })

  // Nur Admins des EIGENEN Tenants benachrichtigen
  const { data: admins } = await adminClient
    .from('profiles')
    .select('id, email')
    .eq('tenant_id', ctx.tenantId)
    .eq('role', 'admin')
    .eq('active', true)

  const monthName = format(new Date(year, month - 1), 'MMMM yyyy', { locale: de })
  const title = `Monatsbericht von ${assistantProfile.full_name}`
  const message = `${assistantProfile.full_name} hat den Monatsbericht für ${monthName} abgeschlossen und gesendet.`

  for (const admin of (admins ?? [])) {
    await adminClient.from('notifications').insert({
      tenant_id: ctx.tenantId,
      user_id: admin.id,
      title,
      message,
      type: 'success',
      related_type: 'monthly_report',
      related_id: reportId,
    })
  }
  await sendPushToUsers((admins ?? []).map(a => a.id), title, message)

  // Send email if Resend is configured
  if (process.env.RESEND_API_KEY && process.env.ADMIN_EMAIL) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.FROM_EMAIL ?? 'noreply@assistenten-app.de',
          to: process.env.ADMIN_EMAIL,
          subject: `[Assistenten-App] ${title}`,
          html: `
            <h2>Neuer Monatsbericht</h2>
            <p>${message}</p>
            <p>Bitte melden Sie sich an, um den Bericht einzusehen und zu exportieren.</p>
            <p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? ''}/admin/berichte">Zum Bericht</a></p>
          `,
        }),
      })
    } catch (e) {
      console.error('Email send error:', e)
    }
  }

  return NextResponse.json({ success: true })
}

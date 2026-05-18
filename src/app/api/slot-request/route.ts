import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

const adminDb = () => createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://karas.pro'
const FROM = process.env.FROM_EMAIL ?? 'noreply@karas.pro'

async function sendEmail(to: string, subject: string, html: string) {
  if (!process.env.RESEND_API_KEY) return
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to, subject: `[Assistenten-App] ${subject}`, html }),
    })
  } catch (e) {
    console.error('Email error:', e)
  }
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { slot_id, action, notification_id, reason } = body

  if (action === 'approve' || action === 'deny') {
    return handleAdminAction(user.id, slot_id, action, notification_id, reason ?? null)
  }
  return handleRequest(user.id, slot_id)
}

async function handleRequest(assistantId: string, slotId: string) {
  const db = adminDb()

  const { data: assistant } = await db.from('profiles').select('full_name, role').eq('id', assistantId).single()
  if (assistant?.role !== 'assistant') {
    return NextResponse.json({ error: 'Nur Assistenten können Slots anfragen' }, { status: 403 })
  }

  const { data: slot } = await db.from('calendar_slots').select('*').eq('id', slotId).single()
  if (!slot) return NextResponse.json({ error: 'Slot nicht gefunden' }, { status: 404 })
  if (slot.status !== 'open') return NextResponse.json({ error: 'Slot ist nicht mehr verfügbar' }, { status: 409 })

  const { error: updateError } = await db
    .from('calendar_slots')
    .update({ status: 'pending', pending_request_by: assistantId })
    .eq('id', slotId)

  if (updateError) {
    console.error('slot update error:', updateError)
    return NextResponse.json({ error: 'Datenbankfehler: ' + updateError.message }, { status: 500 })
  }

  const { data: admins } = await db.from('profiles').select('id, email').eq('role', 'admin').eq('active', true)
  if (admins?.length) {
    const dateStr = format(new Date(slot.date), 'EEEE, dd. MMMM', { locale: de })
    const timeStr = `${slot.start_time.slice(0, 5)}–${slot.end_time.slice(0, 5)} Uhr`
    const msg = `${assistant.full_name} möchte „${slot.title}" am ${dateStr} (${timeStr}) übernehmen.`

    await db.from('notifications').insert(
      admins.map(a => ({
        user_id: a.id,
        title: 'Neue Slot-Anfrage',
        message: msg,
        type: 'warning',
        related_type: 'slot_request',
        related_id: slotId,
      }))
    )

    for (const admin of admins) {
      await sendEmail(
        admin.email,
        'Neue Slot-Anfrage',
        `
          <h2 style="color:#059669">Neue Slot-Anfrage</h2>
          <p>${msg}</p>
          <p>
            <a href="${APP_URL}/benachrichtigungen"
               style="display:inline-block;padding:10px 20px;background:#059669;color:#fff;border-radius:6px;text-decoration:none">
              Jetzt genehmigen oder ablehnen
            </a>
          </p>
        `
      )
    }
  }

  return NextResponse.json({ ok: true })
}

async function handleAdminAction(
  adminId: string,
  slotId: string,
  action: 'approve' | 'deny',
  notificationId: string,
  reason: string | null
) {
  const db = adminDb()

  const { data: adminProfile } = await db.from('profiles').select('role').eq('id', adminId).single()
  if (adminProfile?.role !== 'admin') {
    return NextResponse.json({ error: 'Nur Admins können Anfragen bearbeiten' }, { status: 403 })
  }

  const { data: slot } = await db.from('calendar_slots').select('*').eq('id', slotId).single()
  if (!slot) return NextResponse.json({ error: 'Slot nicht gefunden' }, { status: 404 })

  const requesterId = slot.pending_request_by
  if (!requesterId) return NextResponse.json({ error: 'Keine ausstehende Anfrage' }, { status: 409 })

  const { data: requester } = await db.from('profiles').select('email, full_name').eq('id', requesterId).single()

  const dateStr = format(new Date(slot.date), 'EEEE, dd. MMMM', { locale: de })
  const timeStr = `${slot.start_time.slice(0, 5)}–${slot.end_time.slice(0, 5)} Uhr`
  const reasonSuffix = reason ? ` <strong>${reason}</strong>` : ''

  if (action === 'approve') {
    const { error } = await db.from('calendar_slots').update({
      status: 'assigned',
      assigned_to: requesterId,
      pending_request_by: null,
    }).eq('id', slotId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const msg = `Ihre Anfrage für „${slot.title}" am ${dateStr} (${timeStr}) wurde genehmigt.${reason ? ` Hinweis: ${reason}` : ''}`
    await db.from('notifications').insert({
      user_id: requesterId,
      title: 'Slot bestätigt ✓',
      message: msg,
      type: 'success',
      related_type: 'slot_confirmed',
      related_id: slotId,
    })

    if (requester?.email) {
      await sendEmail(
        requester.email,
        'Slot bestätigt',
        `
          <h2 style="color:#059669">Ihr Slot wurde bestätigt ✓</h2>
          <p>Hallo ${requester.full_name},</p>
          <p>Ihre Anfrage für <strong>„${slot.title}"</strong> am <strong>${dateStr}</strong> (${timeStr}) wurde genehmigt.</p>
          ${reason ? `<p><strong>Hinweis vom Admin:</strong>${reasonSuffix}</p>` : ''}
          <p>
            <a href="${APP_URL}/kalender"
               style="display:inline-block;padding:10px 20px;background:#059669;color:#fff;border-radius:6px;text-decoration:none">
              Im Kalender ansehen
            </a>
          </p>
        `
      )
    }
  } else {
    const { error } = await db.from('calendar_slots').update({
      status: 'open',
      pending_request_by: null,
    }).eq('id', slotId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const msg = `Ihre Anfrage für „${slot.title}" am ${dateStr} (${timeStr}) wurde leider abgelehnt.${reason ? ` Grund: ${reason}` : ''}`
    await db.from('notifications').insert({
      user_id: requesterId,
      title: 'Slot abgelehnt',
      message: msg,
      type: 'error',
      related_type: 'slot_denied',
      related_id: slotId,
    })

    if (requester?.email) {
      await sendEmail(
        requester.email,
        'Slot abgelehnt',
        `
          <h2 style="color:#dc2626">Ihr Slot wurde abgelehnt</h2>
          <p>Hallo ${requester.full_name},</p>
          <p>Ihre Anfrage für <strong>„${slot.title}"</strong> am <strong>${dateStr}</strong> (${timeStr}) wurde leider abgelehnt.</p>
          ${reason ? `<p><strong>Grund:</strong>${reasonSuffix}</p>` : ''}
          <p>
            <a href="${APP_URL}/dashboard"
               style="display:inline-block;padding:10px 20px;background:#6b7280;color:#fff;border-radius:6px;text-decoration:none">
              Andere Slots ansehen
            </a>
          </p>
        `
      )
    }
  }

  if (notificationId) {
    await db.from('notifications').update({ read: true }).eq('id', notificationId)
  }

  return NextResponse.json({ ok: true })
}

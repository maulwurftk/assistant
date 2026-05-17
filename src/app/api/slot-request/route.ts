import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

const adminDb = () => createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { slot_id, action, notification_id } = body

  if (action === 'approve' || action === 'deny') {
    return handleAdminAction(user.id, slot_id, action, notification_id)
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

  const { data: admins } = await db.from('profiles').select('id').eq('role', 'admin').eq('active', true)
  if (admins?.length) {
    const dateStr = format(new Date(slot.date), 'EEEE, dd. MMMM', { locale: de })
    const { error: notifError } = await db.from('notifications').insert(
      admins.map(a => ({
        user_id: a.id,
        title: 'Neue Slot-Anfrage',
        message: `${assistant.full_name} möchte "${slot.title}" am ${dateStr} (${slot.start_time.slice(0, 5)}–${slot.end_time.slice(0, 5)} Uhr) übernehmen.`,
        type: 'warning',
        related_type: 'slot_request',
        related_id: slotId,
      }))
    )
    if (notifError) console.error('notification insert error:', notifError)
  }

  return NextResponse.json({ ok: true })
}

async function handleAdminAction(
  adminId: string,
  slotId: string,
  action: 'approve' | 'deny',
  notificationId: string
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

  const dateStr = format(new Date(slot.date), 'EEEE, dd. MMMM', { locale: de })

  if (action === 'approve') {
    const { error } = await db.from('calendar_slots').update({
      status: 'assigned',
      assigned_to: requesterId,
      pending_request_by: null,
    }).eq('id', slotId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await db.from('notifications').insert({
      user_id: requesterId,
      title: 'Slot bestätigt',
      message: `Ihre Anfrage für „${slot.title}" am ${dateStr} wurde genehmigt.`,
      type: 'success',
      related_type: 'slot_confirmed',
      related_id: slotId,
    })
  } else {
    const { error } = await db.from('calendar_slots').update({
      status: 'open',
      pending_request_by: null,
    }).eq('id', slotId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await db.from('notifications').insert({
      user_id: requesterId,
      title: 'Slot abgelehnt',
      message: `Ihre Anfrage für „${slot.title}" am ${dateStr} wurde leider abgelehnt.`,
      type: 'error',
      related_type: 'slot_denied',
      related_id: slotId,
    })
  }

  if (notificationId) {
    await db.from('notifications').update({ read: true }).eq('id', notificationId)
  }

  return NextResponse.json({ ok: true })
}

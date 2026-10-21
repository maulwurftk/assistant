import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { sendPushToUser, sendPushToUsers } from '@/lib/push'
import { resolveTenant, type TenantContext } from '@/lib/tenant'
import { escapeHtml } from '@/lib/utils'
import type { Database } from '@/types/database'

const adminDb = () => createAdminClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://assistenz.charmely.cloud'
const FROM = process.env.FROM_EMAIL ?? 'noreply@charmely.cloud'

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
  const ctx = await resolveTenant()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { slot_id, action, notification_id, reason } = body

  if (action === 'approve' || action === 'deny') {
    return handleAdminAction(ctx, slot_id, action, notification_id, reason ?? null)
  }
  if (action === 'create') {
    return handleCreateRequest(ctx, body)
  }
  if (action === 'update') {
    return handleUpdateRequest(ctx, body)
  }
  if (action === 'withdraw') {
    return handleWithdrawRequest(ctx, slot_id)
  }
  return handleRequest(ctx, slot_id)
}

async function handleRequest(ctx: TenantContext, slotId: string) {
  const db = adminDb()

  if (ctx.role !== 'assistant') {
    return NextResponse.json({ error: 'Nur Assistenten können Slots anfragen' }, { status: 403 })
  }
  const { data: assistant } = await db.from('profiles')
    .select('full_name').eq('id', ctx.userId).eq('tenant_id', ctx.tenantId).single()
  if (!assistant) return NextResponse.json({ error: 'Profil nicht gefunden' }, { status: 404 })

  // Slot muss zum Tenant des Aufrufers gehören (Architektur §5.2)
  const { data: slot } = await db.from('calendar_slots')
    .select('*').eq('id', slotId).eq('tenant_id', ctx.tenantId).single()
  if (!slot) return NextResponse.json({ error: 'Slot nicht gefunden' }, { status: 404 })
  if (slot.status !== 'open') return NextResponse.json({ error: 'Slot ist nicht mehr verfügbar' }, { status: 409 })

  const { error: updateError } = await db
    .from('calendar_slots')
    .update({ status: 'pending', pending_request_by: ctx.userId } as never)
    .eq('id', slotId)
    .eq('tenant_id', ctx.tenantId)

  if (updateError) {
    console.error('slot update error:', updateError)
    return NextResponse.json({ error: 'Datenbankfehler: ' + updateError.message }, { status: 500 })
  }

  const { data: admins } = await db.from('profiles').select('id, email')
    .eq('tenant_id', ctx.tenantId).eq('role', 'admin').eq('active', true)
  if (admins?.length) {
    const dateStr = format(new Date(slot.date), 'EEEE, dd. MMMM', { locale: de })
    const timeStr = `${slot.start_time.slice(0, 5)}–${slot.end_time.slice(0, 5)} Uhr`
    const msg = `${assistant.full_name} möchte „${slot.title}" am ${dateStr} (${timeStr}) übernehmen.`

    await db.from('notifications').insert(
      admins.map(a => ({
        tenant_id: ctx.tenantId,
        user_id: a.id,
        title: 'Neue Slot-Anfrage',
        message: msg,
        type: 'warning',
        related_type: 'slot_request',
        related_id: slotId,
      })) as never[]
    )
    await sendPushToUsers(admins.map(a => a.id), 'Neue Slot-Anfrage', msg)

    for (const admin of admins) {
      await sendEmail(
        admin.email,
        'Neue Slot-Anfrage',
        `
          <h2 style="color:#059669">Neue Slot-Anfrage</h2>
          <p>${escapeHtml(msg)}</p>
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

async function handleCreateRequest(ctx: TenantContext, body: any) {
  const db = adminDb()

  if (ctx.role !== 'assistant') {
    return NextResponse.json({ error: 'Nur Assistenten können neue Termine vorschlagen' }, { status: 403 })
  }

  const {
    date, start_time, end_time, title, description,
    self_reported, activity_id, actual_start_time, actual_end_time,
  } = body

  if (!date || !start_time || !end_time || !title?.trim()) {
    return NextResponse.json({ error: 'Bitte Datum, Uhrzeit und Titel angeben' }, { status: 400 })
  }
  if (start_time >= end_time) {
    return NextResponse.json({ error: 'Endzeit muss nach der Startzeit liegen' }, { status: 400 })
  }

  const { data: assistant } = await db.from('profiles')
    .select('full_name').eq('id', ctx.userId).eq('tenant_id', ctx.tenantId).single()
  if (!assistant) return NextResponse.json({ error: 'Profil nicht gefunden' }, { status: 404 })

  // Nachträglich gemeldete, bereits geleistete Termine (self_reported): die
  // Assistentin bestätigt die Ist-Zeit direkt bei der Meldung – der Slot ist
  // damit schon "confirmed", zählt aber erst nach Admin-Freigabe (status
  // 'pending' -> 'assigned') zur Lohnabrechnung, da payroll nur assigned+
  // confirmed Slots berücksichtigt.
  const isSelfReported = self_reported === true

  const { data: slot, error: insertError } = await db
    .from('calendar_slots')
    .insert({
      tenant_id: ctx.tenantId,
      date,
      start_time,
      end_time,
      title: title.trim(),
      description: description?.trim() || null,
      created_by: ctx.userId,
      pending_request_by: ctx.userId,
      status: 'pending',
      self_reported: isSelfReported,
      activity_id: activity_id || null,
      ...(isSelfReported
        ? {
            confirmed_at: new Date().toISOString(),
            confirmed_by: ctx.userId,
            actual_start_time: actual_start_time || start_time,
            actual_end_time: actual_end_time || end_time,
          }
        : {}),
    } as never)
    .select('*')
    .single()

  if (insertError || !slot) {
    console.error('slot create error:', insertError)
    return NextResponse.json({ error: 'Datenbankfehler: ' + (insertError?.message ?? 'unbekannt') }, { status: 500 })
  }

  const { data: admins } = await db.from('profiles').select('id, email')
    .eq('tenant_id', ctx.tenantId).eq('role', 'admin').eq('active', true)
  if (admins?.length) {
    const dateStr = format(new Date((slot as any).date), 'EEEE, dd. MMMM', { locale: de })
    const timeStr = `${(slot as any).start_time.slice(0, 5)}–${(slot as any).end_time.slice(0, 5)} Uhr`
    const msg = isSelfReported
      ? `${assistant.full_name} meldet einen bereits geleisteten Termin „${(slot as any).title}" am ${dateStr} (${timeStr}) – wartet auf Freigabe.`
      : `${assistant.full_name} schlägt einen neuen Termin „${(slot as any).title}" am ${dateStr} (${timeStr}) vor.`
    const notifTitle = isSelfReported ? 'Nachträgliche Meldung wartet auf Freigabe' : 'Neuer Terminvorschlag'

    await db.from('notifications').insert(
      admins.map(a => ({
        tenant_id: ctx.tenantId,
        user_id: a.id,
        title: notifTitle,
        message: msg,
        type: 'warning',
        related_type: 'slot_request',
        related_id: (slot as any).id,
      })) as never[]
    )
    await sendPushToUsers(admins.map(a => a.id), notifTitle, msg)

    for (const admin of admins) {
      await sendEmail(
        admin.email,
        notifTitle,
        `
          <h2 style="color:#059669">${notifTitle}</h2>
          <p>${escapeHtml(msg)}</p>
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

  return NextResponse.json({ ok: true, slot })
}

// Eigene, noch nicht genehmigte Anfrage/Meldung nachbessern (nur solange pending)
async function handleUpdateRequest(ctx: TenantContext, body: any) {
  const db = adminDb()
  if (ctx.role !== 'assistant') {
    return NextResponse.json({ error: 'Nur Assistenten können eigene Anfragen bearbeiten' }, { status: 403 })
  }
  const {
    slot_id, date, start_time, end_time, title, description,
    self_reported, activity_id, actual_start_time, actual_end_time,
  } = body
  if (!slot_id || !date || !start_time || !end_time || !title?.trim()) {
    return NextResponse.json({ error: 'Bitte Datum, Uhrzeit und Titel angeben' }, { status: 400 })
  }
  if (start_time >= end_time) {
    return NextResponse.json({ error: 'Endzeit muss nach der Startzeit liegen' }, { status: 400 })
  }
  const isSelfReported = self_reported === true
  const aStart = actual_start_time || start_time
  const aEnd = actual_end_time || end_time
  if (isSelfReported && aStart >= aEnd) {
    return NextResponse.json({ error: 'Ist-Endzeit muss nach Ist-Startzeit liegen' }, { status: 400 })
  }

  const { data: slot } = await db.from('calendar_slots')
    .select('id, status, created_by, pending_request_by')
    .eq('id', slot_id).eq('tenant_id', ctx.tenantId).single()
  if (!slot) return NextResponse.json({ error: 'Termin nicht gefunden' }, { status: 404 })
  const s = slot as { status: string; created_by: string; pending_request_by: string | null }
  if (s.status !== 'pending') {
    return NextResponse.json({ error: 'Termin ist bereits entschieden und kann nicht mehr geändert werden' }, { status: 409 })
  }
  if (s.pending_request_by !== ctx.userId || s.created_by !== ctx.userId) {
    return NextResponse.json({ error: 'Nur eigene Vorschläge können bearbeitet werden' }, { status: 403 })
  }

  const { data: updated, error } = await db.from('calendar_slots')
    .update({
      date,
      start_time,
      end_time,
      title: title.trim(),
      description: description?.trim() || null,
      activity_id: activity_id || null,
      self_reported: isSelfReported,
      ...(isSelfReported
        ? { confirmed_at: new Date().toISOString(), confirmed_by: ctx.userId, actual_start_time: aStart, actual_end_time: aEnd }
        : { confirmed_at: null, confirmed_by: null, actual_start_time: null, actual_end_time: null }),
    } as never)
    .eq('id', slot_id)
    .eq('tenant_id', ctx.tenantId)
    .eq('status', 'pending') // Race mit gleichzeitiger Genehmigung abfangen
    .select('id')
  if (error) return NextResponse.json({ error: 'Datenbankfehler: ' + error.message }, { status: 500 })
  if (!updated?.length) {
    return NextResponse.json({ error: 'Termin wurde inzwischen entschieden' }, { status: 409 })
  }

  const [{ data: assistant }, { data: admins }] = await Promise.all([
    db.from('profiles').select('full_name').eq('id', ctx.userId).eq('tenant_id', ctx.tenantId).single(),
    db.from('profiles').select('id').eq('tenant_id', ctx.tenantId).eq('role', 'admin').eq('active', true),
  ])
  if (admins?.length) {
    const dateStr = format(new Date(date), 'EEEE, dd. MMMM', { locale: de })
    const msg = `${assistant?.full_name ?? 'Eine Assistentin'} hat „${title.trim()}" geändert: ${dateStr}, ${start_time.slice(0, 5)}–${end_time.slice(0, 5)} Uhr.`
    await db.from('notifications').insert(
      admins.map(a => ({
        tenant_id: ctx.tenantId, user_id: a.id, title: 'Anfrage geändert', message: msg,
        type: 'info', related_type: 'slot_request', related_id: slot_id,
      })) as never[]
    )
  }
  return NextResponse.json({ ok: true })
}

// Eigene, noch offene Anfrage zurückziehen
async function handleWithdrawRequest(ctx: TenantContext, slotId: string) {
  const db = adminDb()
  if (ctx.role !== 'assistant') {
    return NextResponse.json({ error: 'Nur Assistenten können eigene Anfragen zurückziehen' }, { status: 403 })
  }
  const { data: slot } = await db.from('calendar_slots')
    .select('id, status, created_by, pending_request_by')
    .eq('id', slotId).eq('tenant_id', ctx.tenantId).single()
  if (!slot) return NextResponse.json({ error: 'Termin nicht gefunden' }, { status: 404 })
  const s = slot as { status: string; created_by: string; pending_request_by: string | null }
  if (s.status !== 'pending' || s.pending_request_by !== ctx.userId) {
    return NextResponse.json({ error: 'Anfrage kann nicht mehr zurückgezogen werden' }, { status: 409 })
  }
  // Eigener Vorschlag → verwerfen; Anfrage auf offenen Admin-Slot → wieder offen
  const patch = s.created_by === ctx.userId
    ? { status: 'cancelled' }
    : { status: 'open', pending_request_by: null }
  const { data: updated, error } = await db.from('calendar_slots')
    .update(patch as never)
    .eq('id', slotId).eq('tenant_id', ctx.tenantId).eq('status', 'pending')
    .select('id')
  if (error) return NextResponse.json({ error: 'Datenbankfehler: ' + error.message }, { status: 500 })
  if (!updated?.length) return NextResponse.json({ error: 'Termin wurde inzwischen entschieden' }, { status: 409 })
  return NextResponse.json({ ok: true })
}

async function handleAdminAction(
  ctx: TenantContext,
  slotId: string,
  action: 'approve' | 'deny',
  notificationId: string,
  reason: string | null
) {
  const db = adminDb()

  if (ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Nur Admins können Anfragen bearbeiten' }, { status: 403 })
  }

  // Slot muss zum Tenant des Admins gehören
  const { data: slot } = await db.from('calendar_slots')
    .select('*').eq('id', slotId).eq('tenant_id', ctx.tenantId).single()
  if (!slot) return NextResponse.json({ error: 'Slot nicht gefunden' }, { status: 404 })

  const requesterId = slot.pending_request_by
  if (!requesterId) return NextResponse.json({ error: 'Keine ausstehende Anfrage' }, { status: 409 })

  const { data: requester } = await db.from('profiles')
    .select('email, full_name').eq('id', requesterId).eq('tenant_id', ctx.tenantId).single()

  const dateStr = format(new Date(slot.date), 'EEEE, dd. MMMM', { locale: de })
  const timeStr = `${slot.start_time.slice(0, 5)}–${slot.end_time.slice(0, 5)} Uhr`
  const reasonSuffix = reason ? ` <strong>${escapeHtml(reason)}</strong>` : ''

  if (action === 'approve') {
    const { error } = await db.from('calendar_slots').update({
      status: 'assigned',
      assigned_to: requesterId,
      pending_request_by: null,
    } as never).eq('id', slotId).eq('tenant_id', ctx.tenantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const msg = `Ihre Anfrage für „${slot.title}" am ${dateStr} (${timeStr}) wurde genehmigt.${reason ? ` Hinweis: ${reason}` : ''}`
    await db.from('notifications').insert({
      tenant_id: ctx.tenantId,
      user_id: requesterId,
      title: 'Slot bestätigt ✓',
      message: msg,
      type: 'success',
      related_type: 'slot_confirmed',
      related_id: slotId,
    } as never)
    await sendPushToUser(requesterId, 'Slot bestätigt ✓', msg, '/kalender')

    if (requester?.email) {
      await sendEmail(
        requester.email,
        'Slot bestätigt',
        `
          <h2 style="color:#059669">Ihr Slot wurde bestätigt ✓</h2>
          <p>Hallo ${escapeHtml(requester.full_name)},</p>
          <p>Ihre Anfrage für <strong>„${escapeHtml(slot.title)}"</strong> am <strong>${dateStr}</strong> (${timeStr}) wurde genehmigt.</p>
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
    // Selbst vorgeschlagene Termine (created_by === requester) gab es vorher nicht als
    // "offen" – bei Ablehnung werden sie storniert statt für andere freigegeben.
    const isSelfProposed = slot.created_by === requesterId
    const { error } = await db.from('calendar_slots').update({
      status: isSelfProposed ? 'cancelled' : 'open',
      pending_request_by: null,
    } as never).eq('id', slotId).eq('tenant_id', ctx.tenantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const msg = `Ihre Anfrage für „${slot.title}" am ${dateStr} (${timeStr}) wurde leider abgelehnt.${reason ? ` Grund: ${reason}` : ''}`
    await db.from('notifications').insert({
      tenant_id: ctx.tenantId,
      user_id: requesterId,
      title: 'Slot abgelehnt',
      message: msg,
      type: 'error',
      related_type: 'slot_denied',
      related_id: slotId,
    } as never)
    await sendPushToUser(requesterId, 'Slot abgelehnt', msg)

    if (requester?.email) {
      await sendEmail(
        requester.email,
        'Slot abgelehnt',
        `
          <h2 style="color:#dc2626">Ihr Slot wurde abgelehnt</h2>
          <p>Hallo ${escapeHtml(requester.full_name)},</p>
          <p>Ihre Anfrage für <strong>„${escapeHtml(slot.title)}"</strong> am <strong>${dateStr}</strong> (${timeStr}) wurde leider abgelehnt.</p>
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
    // Nur eigene Benachrichtigungen im eigenen Tenant als gelesen markieren
    await db.from('notifications').update({ read: true } as never)
      .eq('id', notificationId)
      .eq('tenant_id', ctx.tenantId)
      .eq('user_id', ctx.userId)
  }

  return NextResponse.json({ ok: true })
}

import webpush from 'web-push'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function adminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export function isPushConfigured() {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

function initWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return null
  // VAPID-Subject muss eine mailto:- oder https-URL sein
  let subject = process.env.VAPID_EMAIL ?? 'mailto:admin@example.com'
  if (!subject.startsWith('mailto:') && !subject.startsWith('http')) {
    subject = `mailto:${subject}`
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  return webpush
}

export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  url = '/benachrichtigungen'
) {
  const wp = initWebPush()
  if (!wp) return

  const db = adminDb()
  const { data: subs } = await db
    .from('push_subscriptions')
    .select('id, subscription')
    .eq('user_id', userId)

  if (!subs?.length) return

  const payload = JSON.stringify({ title, body, url })

  await Promise.all(
    subs.map(async (row) => {
      try {
        await wp.sendNotification(row.subscription, payload)
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.from('push_subscriptions').delete().eq('id', row.id)
        } else {
          console.error('Push error:', err.statusCode, err.message)
        }
      }
    })
  )
}

export async function sendPushToUsers(
  userIds: string[],
  title: string,
  body: string,
  url = '/benachrichtigungen'
) {
  await Promise.all(userIds.map((id) => sendPushToUser(id, title, body, url)))
}

// Diagnose + Test-Push an einen Nutzer. Gibt Klartext-Status zurück.
export async function sendTestPush(userId: string): Promise<{
  ok: boolean
  reason: 'not_configured' | 'no_subscription' | 'send_failed' | 'sent'
  sent: number
  subscriptions: number
  errors: string[]
}> {
  if (!isPushConfigured()) {
    return { ok: false, reason: 'not_configured', sent: 0, subscriptions: 0, errors: [] }
  }

  const db = adminDb()
  const { data: subs } = await db
    .from('push_subscriptions')
    .select('id, subscription')
    .eq('user_id', userId)

  if (!subs?.length) {
    return { ok: false, reason: 'no_subscription', sent: 0, subscriptions: 0, errors: [] }
  }

  const wp = initWebPush()!
  const payload = JSON.stringify({
    title: 'Test-Benachrichtigung ✓',
    body: 'Push funktioniert! Du erhältst ab jetzt Benachrichtigungen.',
    url: '/benachrichtigungen',
  })

  let sent = 0
  const errors: string[] = []
  for (const row of subs) {
    try {
      await wp.sendNotification(row.subscription, payload)
      sent++
    } catch (err: any) {
      errors.push(`${err.statusCode ?? '?'}: ${err.body ?? err.message ?? 'unbekannt'}`)
      if (err.statusCode === 410 || err.statusCode === 404) {
        await db.from('push_subscriptions').delete().eq('id', row.id)
      }
    }
  }

  return {
    ok: sent > 0,
    reason: sent > 0 ? 'sent' : 'send_failed',
    sent,
    subscriptions: subs.length,
    errors,
  }
}

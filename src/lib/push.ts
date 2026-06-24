import webpush from 'web-push'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function adminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function initWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return null
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL ?? 'mailto:admin@example.com',
    publicKey,
    privateKey
  )
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

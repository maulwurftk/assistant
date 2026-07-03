'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Notification } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { CheckCheck, Bell, Check, X } from 'lucide-react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { toast } from 'sonner'

const typeStyles: Record<string, string> = {
  info: 'bg-emerald-50 border-emerald-200',
  success: 'bg-green-50 border-green-200',
  warning: 'bg-amber-50 border-amber-200',
  error: 'bg-red-50 border-red-200',
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return new Uint8Array([...rawData].map((c) => c.charCodeAt(0)))
}

interface ActionState {
  notificationId: string
  action: 'approve' | 'deny'
  reason: string
}

export default function BenachrichtigungenPage() {
  const supabase = createClient()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [activeAction, setActiveAction] = useState<ActionState | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) { setUserId(user.id); loadNotifications(user.id) }
    })
  }, [])

  async function loadNotifications(uid: string) {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(50)
    setNotifications(data ?? [])
  }

  async function markAllRead() {
    if (!userId) return
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false)
    loadNotifications(userId)
    toast.success('Alle als gelesen markiert')
  }

  async function markRead(id: string) {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  function startAction(n: Notification, action: 'approve' | 'deny') {
    setActiveAction({ notificationId: n.id, action, reason: '' })
  }

  function cancelAction() {
    setActiveAction(null)
  }

  async function submitAction(n: Notification) {
    if (!activeAction || !n.related_id) return
    setSubmitting(n.id)
    try {
      const res = await fetch('/api/slot-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot_id: n.related_id,
          action: activeAction.action,
          notification_id: n.id,
          reason: activeAction.reason.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Fehler')
      } else {
        toast.success(activeAction.action === 'approve' ? 'Slot genehmigt' : 'Slot abgelehnt')
        setNotifications(prev => prev.map(x =>
          x.id === n.id
            ? { ...x, read: true, related_type: activeAction.action === 'approve' ? 'slot_approved' : 'slot_rejected' }
            : x
        ))
        setActiveAction(null)
      }
    } catch {
      toast.error('Verbindungsfehler')
    }
    setSubmitting(null)
  }

  const [pushBusy, setPushBusy] = useState(false)

  // Abonniert (falls nötig) und schickt eine Test-Benachrichtigung mit Klartext-Diagnose
  async function testPush() {
    setPushBusy(true)
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        toast.error('Dieser Browser unterstützt keine Push-Benachrichtigungen.')
        return
      }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        toast.error('Server nicht konfiguriert: VAPID-Schlüssel fehlt (Env-Variablen + Redeploy nötig).')
        return
      }

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        toast.error('Benachrichtigungen im Browser nicht erlaubt. Bitte in den Website-Einstellungen freigeben.')
        return
      }

      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        })
      }
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: JSON.parse(JSON.stringify(sub)) }),
      })

      const res = await fetch('/api/push/test', { method: 'POST' })
      const data = await res.json().catch(() => ({}))

      if (data.ok) {
        toast.success('Test gesendet – die Benachrichtigung sollte gleich erscheinen.')
      } else if (data.reason === 'not_configured') {
        toast.error('Server nicht konfiguriert: VAPID-Schlüssel fehlen in den Env-Variablen.')
      } else if (data.reason === 'no_subscription') {
        toast.error('Keine Subscription gespeichert – Migration ausgeführt? (supabase-migration-push.sql)')
      } else if (data.reason === 'send_failed') {
        toast.error(`Senden fehlgeschlagen: ${(data.errors ?? []).join(' · ') || 'unbekannt'}`)
      } else {
        toast.error('Push-Test fehlgeschlagen.')
      }
    } catch (err: any) {
      toast.error(`Fehler: ${err?.message ?? 'unbekannt'}`)
    } finally {
      setPushBusy(false)
    }
  }

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Benachrichtigungen</h1>
          {unreadCount > 0 && (
            <p className="text-gray-500 text-sm mt-0.5">{unreadCount} ungelesen</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={testPush} disabled={pushBusy}>
            <Bell className="h-4 w-4 mr-2" /> {pushBusy ? 'Teste…' : 'Push testen'}
          </Button>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead}>
              <CheckCheck className="h-4 w-4 mr-2" /> Alle gelesen
            </Button>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Keine Benachrichtigungen</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map(n => {
            const isSlotRequest = n.related_type === 'slot_request' && !n.read
            const isThisActive = activeAction?.notificationId === n.id

            return (
              <Card
                key={n.id}
                className={`border transition-opacity ${typeStyles[n.type]} ${n.read && !isThisActive ? 'opacity-60' : ''}`}
                onClick={() => !n.read && !isSlotRequest && markRead(n.id)}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-medium text-sm">{n.title}</p>
                        {!n.read && <Badge className="text-xs bg-emerald-500 text-white px-1.5 py-0">Neu</Badge>}
                      </div>
                      <p className="text-sm text-gray-600">{n.message}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {format(new Date(n.created_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                      </p>
                    </div>
                  </div>

                  {/* Aktionsbereich für Slot-Anfragen */}
                  {isSlotRequest && !isThisActive && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-amber-200">
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                        onClick={() => startAction(n, 'approve')}
                      >
                        <Check className="h-3.5 w-3.5" /> Genehmigen
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                        onClick={() => startAction(n, 'deny')}
                      >
                        <X className="h-3.5 w-3.5" /> Ablehnen
                      </Button>
                    </div>
                  )}

                  {/* Begründungsfeld */}
                  {isThisActive && (
                    <div className="mt-3 pt-3 border-t border-amber-200 space-y-2">
                      <p className="text-xs font-medium text-gray-600">
                        {activeAction.action === 'approve' ? 'Begründung (optional)' : 'Begründung (optional)'}
                      </p>
                      <Textarea
                        placeholder={
                          activeAction.action === 'approve'
                            ? 'z.B. Bitte pünktlich um 9 Uhr erscheinen.'
                            : 'z.B. Dieser Slot ist bereits anderweitig vergeben.'
                        }
                        value={activeAction.reason}
                        onChange={e => setActiveAction(prev => prev ? { ...prev, reason: e.target.value } : null)}
                        rows={2}
                        className="text-sm bg-surface"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        {activeAction.action === 'approve' ? (
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                            disabled={submitting === n.id}
                            onClick={() => submitAction(n)}
                          >
                            <Check className="h-3.5 w-3.5" />
                            {submitting === n.id ? 'Sende…' : 'Bestätigen & Genehmigen'}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                            disabled={submitting === n.id}
                            onClick={() => submitAction(n)}
                          >
                            <X className="h-3.5 w-3.5" />
                            {submitting === n.id ? 'Sende…' : 'Bestätigen & Ablehnen'}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-gray-500"
                          disabled={submitting === n.id}
                          onClick={cancelAction}
                        >
                          Abbrechen
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

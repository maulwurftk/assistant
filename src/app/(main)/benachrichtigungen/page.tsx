'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Notification } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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

export default function BenachrichtigungenPage() {
  const supabase = createClient()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState<Set<string>>(new Set())

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

  async function handleSlotAction(n: Notification, action: 'approve' | 'deny') {
    if (!n.related_id) return
    setActionPending(prev => new Set([...prev, n.id]))
    try {
      const res = await fetch('/api/slot-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_id: n.related_id, action, notification_id: n.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Fehler')
      } else {
        toast.success(action === 'approve' ? 'Slot genehmigt' : 'Slot abgelehnt')
        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true, related_type: action === 'approve' ? 'slot_approved' : 'slot_rejected' } : x))
      }
    } catch {
      toast.error('Verbindungsfehler')
    }
    setActionPending(prev => { const s = new Set(prev); s.delete(n.id); return s })
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
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <CheckCheck className="h-4 w-4 mr-2" /> Alle gelesen
          </Button>
        )}
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
            const isActioned = n.related_type === 'slot_approved' || n.related_type === 'slot_rejected'

            return (
              <Card
                key={n.id}
                className={`border transition-opacity ${typeStyles[n.type]} ${n.read && !isActioned ? 'opacity-60' : ''}`}
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

                  {isSlotRequest && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-amber-200">
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                        disabled={actionPending.has(n.id)}
                        onClick={() => handleSlotAction(n, 'approve')}
                      >
                        <Check className="h-3.5 w-3.5" /> Genehmigen
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                        disabled={actionPending.has(n.id)}
                        onClick={() => handleSlotAction(n, 'deny')}
                      >
                        <X className="h-3.5 w-3.5" /> Ablehnen
                      </Button>
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

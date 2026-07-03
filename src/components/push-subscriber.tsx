'use client'

import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return new Uint8Array([...rawData].map((c) => c.charCodeAt(0)))
}

export function PushSubscriber() {
  const [showBanner, setShowBanner] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => reg.pushManager.getSubscription())
      .then((existing) => {
        if (existing) return
        if (Notification.permission === 'granted') {
          subscribeSilently()
        } else if (
          Notification.permission === 'default' &&
          !localStorage.getItem('push-dismissed')
        ) {
          setShowBanner(true)
        }
      })
      .catch(console.error)
  }, [])

  async function subscribeSilently() {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidKey) return
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: JSON.parse(JSON.stringify(sub)) }),
      })
    } catch (err) {
      console.error('Silent push subscription failed:', err)
    }
  }

  async function handleEnable() {
    setLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        await subscribeSilently()
      }
      setShowBanner(false)
      localStorage.setItem('push-dismissed', '1')
    } catch (err) {
      console.error('Push enable failed:', err)
    }
    setLoading(false)
  }

  function dismiss() {
    setShowBanner(false)
    localStorage.setItem('push-dismissed', '1')
  }

  if (!showBanner) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 bg-surface border border-gray-200 rounded-xl shadow-lg p-4 flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100">
        <Bell className="h-4 w-4 text-emerald-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">Push-Benachrichtigungen</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
          Erhalte Benachrichtigungen direkt auf dem Handy — auch wenn die App im Hintergrund ist.
        </p>
        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
            onClick={handleEnable}
            disabled={loading}
          >
            {loading ? 'Aktiviere…' : 'Aktivieren'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-gray-500"
            onClick={dismiss}
          >
            Nicht jetzt
          </Button>
        </div>
      </div>
      <button
        className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
        onClick={dismiss}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

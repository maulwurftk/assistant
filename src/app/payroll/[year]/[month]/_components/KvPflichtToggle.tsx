'use client'

import { useState } from 'react'

type Props = {
  assistantId: string
  kvPflicht: boolean
}

export default function KvPflichtToggle({ assistantId, kvPflicht: initial }: Props) {
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)

  async function toggle() {
    setSaving(true)
    const next = !value
    setValue(next)
    try {
      await fetch('/api/payroll/assistant-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assistantId, kv_pflicht: next }),
      })
    } catch {
      setValue(!next)
    } finally {
      setSaving(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      title={value ? 'GKV-pflichtig (klicken für PKV)' : 'PKV-versichert (klicken für GKV)'}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
        value ? 'bg-blue-600' : 'bg-slate-300'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-surface transition-transform ${
          value ? 'translate-x-4' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

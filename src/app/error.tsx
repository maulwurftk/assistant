'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: 20, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 20 }}>
        <p style={{ fontWeight: 700, color: '#991b1b', margin: 0 }}>
          Diagnose: Fehler beim Laden
        </p>
        <p style={{ fontSize: 12, color: '#b91c1c', margin: '6px 0 14px' }}>
          Bitte diesen Text kopieren und schicken.
        </p>
        <div style={{ fontSize: 12, color: '#7f1d1d' }}>
          <p style={{ margin: '4px 0' }}><b>Nachricht:</b> {error?.message || '—'}</p>
          <p style={{ margin: '4px 0' }}><b>Digest:</b> {error?.digest || '—'}</p>
        </div>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, marginTop: 10, background: '#fff', padding: 12, borderRadius: 6, overflow: 'auto', maxHeight: 420, color: '#7f1d1d' }}>
          {error?.stack || '—'}
        </pre>
        <button
          onClick={reset}
          style={{ marginTop: 12, padding: '8px 14px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fff', color: '#991b1b', cursor: 'pointer' }}
        >
          Erneut versuchen
        </button>
      </div>
    </div>
  )
}

'use client'

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center bg-surface border border-slate-200 rounded-2xl p-8 shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 text-2xl">
          !
        </div>
        <h1 className="text-lg font-bold text-slate-900">Etwas ist schiefgelaufen</h1>
        <p className="text-sm text-slate-500 mt-1.5">
          Die Seite konnte nicht geladen werden. Bitte versuche es erneut.
        </p>
        <button
          onClick={reset}
          className="mt-5 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
        >
          Erneut versuchen
        </button>
      </div>
    </div>
  )
}

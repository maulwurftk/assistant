'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Download, Upload, AlertTriangle, ShieldCheck, Save } from 'lucide-react'
import { PageHeader } from '@/components/page-header'

// Datensicherung (Fachdaten) — Backup-Spec §5.
// Export: JSON-Download. Import: Datei → Server-Dry-Run (Vorschau) → Modus
// wählen (Ergänzen vorausgewählt) → bei „Ersetzen" Tippbestätigung → Ausführen
// → Report + Pre-Restore-Snapshot als Download.

type Preview = {
  mode: 'merge' | 'replace'
  tables: Record<string, { insert: number; update: number; skip: number; deleteExisting: number }>
  skipped: Array<{ table: string; id: string | null; reason: string }>
}

type Report = {
  mode: string
  applied: Record<string, { inserted: number; updated: number }>
  skipped: Array<{ table: string; id: string | null; reason: string }>
}

const TABLE_LABELS: Record<string, string> = {
  profiles: 'Profile',
  activities: 'Tätigkeiten',
  payroll_settings: 'Lohn-Einstellungen',
  time_entries: 'Zeiteinträge',
  calendar_slots: 'Kalender-Slots',
  monthly_reports: 'Monatsberichte',
  notifications: 'Benachrichtigungen',
  payroll_runs: 'Lohnläufe',
  account_ledger: 'Kontobuch',
  assistant_unavailability: 'Sperrzeiten',
}

function downloadJson(obj: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function SicherungPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState(false)
  const [backup, setBackup] = useState<Record<string, unknown> | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [importing, setImporting] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [snapshot, setSnapshot] = useState<{ manifest: { tenant: { slug: string | null } } } | null>(null)

  async function handleExport() {
    setExporting(true)
    try {
      const res = await fetch('/api/admin/backup/export')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Export fehlgeschlagen')
      }
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename="([^"]+)"/)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = match?.[1] ?? 'sicherung.json'
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Sicherung heruntergeladen')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export fehlgeschlagen')
    } finally {
      setExporting(false)
    }
  }

  async function handleFile(file: File) {
    setPreview(null)
    setReport(null)
    setSnapshot(null)
    setConfirmText('')
    if (file.size > 25 * 1024 * 1024) {
      toast.error('Datei zu groß (max. 25 MB)')
      return
    }
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      toast.error('Keine gültige JSON-Datei')
      return
    }
    const manifest = parsed?.manifest as { format?: string; schemaVersion?: number } | undefined
    if (manifest?.format !== 'assistenten-app-backup' || manifest?.schemaVersion !== 1) {
      toast.error('Inkompatible oder fremde Sicherungsdatei')
      return
    }
    setBackup(parsed)
    setFileName(file.name)
    await loadPreview(parsed, mode)
  }

  async function loadPreview(b: Record<string, unknown>, m: 'merge' | 'replace') {
    setPreviewLoading(true)
    try {
      const res = await fetch('/api/admin/backup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: m, dryRun: true, backup: b }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Vorschau fehlgeschlagen')
      setPreview(json.preview)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Vorschau fehlgeschlagen')
      setPreview(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  async function switchMode(m: 'merge' | 'replace') {
    setMode(m)
    setConfirmText('')
    if (backup) await loadPreview(backup, m)
  }

  async function handleImport() {
    if (!backup) return
    setImporting(true)
    setReport(null)
    try {
      const res = await fetch('/api/admin/backup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, confirm: confirmText || undefined, backup }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Import fehlgeschlagen')
      setReport(json.report)
      setSnapshot(json.preRestoreSnapshot)
      toast.success('Import abgeschlossen')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import fehlgeschlagen')
    } finally {
      setImporting(false)
    }
  }

  const totals = preview
    ? Object.values(preview.tables).reduce(
        (a, t) => ({
          insert: a.insert + t.insert,
          update: a.update + t.update,
          skip: a.skip + t.skip,
          del: a.del + t.deleteExisting,
        }),
        { insert: 0, update: 0, skip: 0, del: 0 }
      )
    : null

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Save className="h-5 w-5" />}
        title="Datensicherung"
        subtitle="Fachdaten exportieren und wiederherstellen"
        tone="slate"
      />

      {/* Export */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-4 w-4" /> Sicherung erstellen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-600">
            Sichert die <strong>Fachdaten</strong> Ihrer Organisation (Zeiten, Slots, Berichte,
            Lohn- und Kontodaten) als JSON-Datei. <strong>Nicht</strong> enthalten: Logins/Passwörter —
            dies ist kein vollständiges System-Backup.
          </p>
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Die Datei enthält personenbezogene Daten (Namen, IBAN, Arbeitszeiten). Bitte sicher
            aufbewahren und nicht unverschlüsselt weitergeben.
          </p>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? 'Wird erstellt…' : 'Sicherung herunterladen'}
          </Button>
        </CardContent>
      </Card>

      {/* Import */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" /> Sicherung wiederherstellen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="backup-file">Sicherungsdatei (JSON)</Label>
            <Input
              id="backup-file"
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
            {fileName && <p className="text-xs text-gray-500">Geladen: {fileName}</p>}
          </div>

          {backup && (
            <div className="space-y-2">
              <Label>Modus</Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === 'merge'}
                    onChange={() => switchMode('merge')}
                  />
                  <span>
                    <strong>Ergänzen</strong> — fehlende Zeilen anlegen, vorhandene aktualisieren
                  </span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === 'replace'}
                    onChange={() => switchMode('replace')}
                  />
                  <span>
                    <strong>Ersetzen</strong> — Fachdaten zuerst löschen, dann einspielen
                  </span>
                </label>
              </div>
            </div>
          )}

          {previewLoading && <p className="text-sm text-gray-500">Vorschau wird berechnet…</p>}

          {preview && !previewLoading && (
            <div className="space-y-3">
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Tabelle</th>
                      <th className="text-right px-3 py-2 font-medium">Neu</th>
                      <th className="text-right px-3 py-2 font-medium">Aktualisiert</th>
                      <th className="text-right px-3 py-2 font-medium">Übersprungen</th>
                      {mode === 'replace' && (
                        <th className="text-right px-3 py-2 font-medium">Gelöscht (Bestand)</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(preview.tables).map(([t, s]) => (
                      <tr key={t} className="border-t border-gray-100">
                        <td className="px-3 py-1.5">{TABLE_LABELS[t] ?? t}</td>
                        <td className="px-3 py-1.5 text-right">{s.insert}</td>
                        <td className="px-3 py-1.5 text-right">{s.update}</td>
                        <td className="px-3 py-1.5 text-right">{s.skip}</td>
                        {mode === 'replace' && (
                          <td className="px-3 py-1.5 text-right text-red-600">{s.deleteExisting}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {preview.skipped.length > 0 && (
                <details className="text-sm text-gray-600">
                  <summary className="cursor-pointer">
                    {preview.skipped.length} übersprungene Zeile(n) — Details
                  </summary>
                  <ul className="mt-2 space-y-1 max-h-40 overflow-auto">
                    {preview.skipped.map((s, i) => (
                      <li key={i} className="text-xs">
                        {TABLE_LABELS[s.table] ?? s.table} {s.id ? `(${s.id.slice(0, 8)}…)` : ''}: {s.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {mode === 'replace' && totals && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
                  <p className="text-sm text-red-700 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      <strong>Ersetzen löscht zuerst {totals.del} bestehende Fachzeilen</strong> und
                      spielt dann die Sicherung ein. Profile und Logins bleiben erhalten. Vor dem
                      Import wird automatisch ein Schnappschuss des aktuellen Stands erstellt.
                    </span>
                  </p>
                  <div className="space-y-1">
                    <Label htmlFor="confirm-replace" className="text-red-700">
                      Zur Bestätigung ERSETZEN eintippen:
                    </Label>
                    <Input
                      id="confirm-replace"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder="ERSETZEN"
                      className="max-w-xs"
                    />
                  </div>
                </div>
              )}

              <Button
                onClick={handleImport}
                disabled={importing || (mode === 'replace' && confirmText !== 'ERSETZEN')}
                variant={mode === 'replace' ? 'destructive' : 'default'}
              >
                {importing
                  ? 'Import läuft…'
                  : mode === 'replace'
                    ? 'Fachdaten ersetzen'
                    : `${totals ? totals.insert + totals.update : 0} Zeilen importieren`}
              </Button>
            </div>
          )}

          {report && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
              <p className="text-sm text-emerald-800 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> Import abgeschlossen (
                {Object.values(report.applied).reduce((a, t) => a + t.inserted, 0)} neu,{' '}
                {Object.values(report.applied).reduce((a, t) => a + t.updated, 0)} aktualisiert,{' '}
                {report.skipped.length} übersprungen)
              </p>
              {snapshot && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadJson(
                      snapshot,
                      `vor-wiederherstellung-${snapshot.manifest.tenant.slug ?? 'tenant'}-${Date.now()}.json`
                    )
                  }
                >
                  Schnappschuss „Stand vor der Wiederherstellung" herunterladen
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

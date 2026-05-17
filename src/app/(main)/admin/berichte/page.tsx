'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MonthlyReport, Profile, TimeEntry } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { Download, Eye, ChevronLeft, ChevronRight } from 'lucide-react'
import { format, subMonths, addMonths } from 'date-fns'
import { de } from 'date-fns/locale'
import * as XLSX from 'xlsx'

export default function BerichtePage() {
  const supabase = createClient()
  const [reports, setReports] = useState<(MonthlyReport & { assistant: Profile })[]>([])
  const [assistants, setAssistants] = useState<Profile[]>([])
  const [selectedAssistant, setSelectedAssistant] = useState<string>('all')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [detailEntries, setDetailEntries] = useState<TimeEntry[] | null>(null)
  const [detailReport, setDetailReport] = useState<(MonthlyReport & { assistant: Profile }) | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadAssistants()
  }, [])

  useEffect(() => {
    loadReports()
  }, [currentMonth, selectedAssistant])

  async function loadAssistants() {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'assistant').order('full_name')
    setAssistants(data ?? [])
  }

  async function loadReports() {
    let query = supabase
      .from('monthly_reports')
      .select('*, assistant:profiles!assistant_id(*)')
      .eq('year', currentMonth.getFullYear())
      .eq('month', currentMonth.getMonth() + 1)

    if (selectedAssistant !== 'all') {
      query = query.eq('assistant_id', selectedAssistant)
    }

    const { data } = await query.order('sent_at', { ascending: false })
    setReports((data ?? []) as any)
  }

  async function viewReport(report: MonthlyReport & { assistant: Profile }) {
    setDetailReport(report)
    const monthStart = `${report.year}-${String(report.month).padStart(2, '0')}-01`
    const lastDay = new Date(report.year, report.month, 0).getDate()
    const monthEnd = `${report.year}-${String(report.month).padStart(2, '0')}-${lastDay}`

    const { data } = await supabase
      .from('time_entries')
      .select('*, activity:activities(name)')
      .eq('assistant_id', report.assistant_id)
      .gte('date', monthStart)
      .lte('date', monthEnd)
      .order('date')
    setDetailEntries(data ?? [])

    // Mark as viewed
    if (!report.admin_viewed_at) {
      await supabase.from('monthly_reports').update({ admin_viewed_at: new Date().toISOString() }).eq('id', report.id)
      loadReports()
    }
  }

  async function exportToExcel(report: MonthlyReport & { assistant: Profile }) {
    setLoading(true)
    const monthStart = `${report.year}-${String(report.month).padStart(2, '0')}-01`
    const lastDay = new Date(report.year, report.month, 0).getDate()
    const monthEnd = `${report.year}-${String(report.month).padStart(2, '00')}-${lastDay}`

    const { data: entries } = await supabase
      .from('time_entries')
      .select('*, activity:activities(name)')
      .eq('assistant_id', report.assistant_id)
      .gte('date', monthStart)
      .lte('date', monthEnd)
      .order('date')

    if (!entries) { toast.error('Keine Daten gefunden'); setLoading(false); return }

    const rows = entries.map(e => {
      const [sh, sm] = e.start_time.split(':').map(Number)
      const [eh, em] = e.end_time.split(':').map(Number)
      const hours = (eh * 60 + em - sh * 60 - sm) / 60
      return {
        'Datum': format(new Date(e.date), 'dd.MM.yyyy'),
        'Startzeit': e.start_time.slice(0, 5),
        'Endzeit': e.end_time.slice(0, 5),
        'Stunden': hours.toFixed(2),
        'Tätigkeit': (e.activity as any)?.name ?? '',
        'Beschreibung': e.description ?? '',
      }
    })

    const totalHours = entries.reduce((acc, e) => {
      const [sh, sm] = e.start_time.split(':').map(Number)
      const [eh, em] = e.end_time.split(':').map(Number)
      return acc + (eh * 60 + em - sh * 60 - sm) / 60
    }, 0)

    rows.push({
      'Datum': '',
      'Startzeit': '',
      'Endzeit': 'GESAMT',
      'Stunden': totalHours.toFixed(2),
      'Tätigkeit': '',
      'Beschreibung': '',
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 25 }, { wch: 40 }]

    const wb = XLSX.utils.book_new()
    const sheetName = `${report.assistant.full_name} ${format(new Date(report.year, report.month - 1), 'MMM yyyy', { locale: de })}`
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))

    XLSX.writeFile(wb, `Bericht_${report.assistant.full_name.replace(' ', '_')}_${report.year}-${String(report.month).padStart(2, '0')}.xlsx`)
    toast.success('Excel-Export erfolgreich')
    setLoading(false)
  }

  async function exportAllMonth() {
    setLoading(true)
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth() + 1
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${lastDay}`

    const { data: entries } = await supabase
      .from('time_entries')
      .select('*, activity:activities(name), assistant:profiles!assistant_id(full_name)')
      .gte('date', monthStart)
      .lte('date', monthEnd)
      .order('assistant_id')
      .order('date')

    if (!entries?.length) { toast.error('Keine Daten'); setLoading(false); return }

    const wb = XLSX.utils.book_new()
    const assistantGroups = new Map<string, typeof entries>()
    entries.forEach(e => {
      const name = (e.assistant as any)?.full_name ?? 'Unbekannt'
      if (!assistantGroups.has(name)) assistantGroups.set(name, [])
      assistantGroups.get(name)!.push(e)
    })

    assistantGroups.forEach((aEntries, name) => {
      const rows = aEntries.map(e => {
        const [sh, sm] = e.start_time.split(':').map(Number)
        const [eh, em] = e.end_time.split(':').map(Number)
        return {
          'Datum': format(new Date(e.date), 'dd.MM.yyyy'),
          'Von': e.start_time.slice(0, 5),
          'Bis': e.end_time.slice(0, 5),
          'Stunden': ((eh * 60 + em - sh * 60 - sm) / 60).toFixed(2),
          'Tätigkeit': (e.activity as any)?.name ?? '',
          'Beschreibung': e.description ?? '',
        }
      })
      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 25 }, { wch: 35 }]
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
    })

    XLSX.writeFile(wb, `Alle_Assistenten_${year}-${String(month).padStart(2, '0')}.xlsx`)
    toast.success('Gesamt-Export erfolgreich')
    setLoading(false)
  }

  const totalHoursDetail = (detailEntries ?? []).reduce((acc, e) => {
    const [sh, sm] = e.start_time.split(':').map(Number)
    const [eh, em] = e.end_time.split(':').map(Number)
    return acc + (eh * 60 + em - sh * 60 - sm) / 60
  }, 0)

  if (detailReport && detailEntries) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => { setDetailReport(null); setDetailEntries(null) }}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Zurück
          </Button>
          <div>
            <h1 className="text-xl font-bold">{detailReport.assistant.full_name}</h1>
            <p className="text-gray-500 text-sm">
              {format(new Date(detailReport.year, detailReport.month - 1), 'MMMM yyyy', { locale: de })} · {totalHoursDetail.toFixed(1)} Std.
            </p>
          </div>
          <Button className="ml-auto" onClick={() => exportToExcel(detailReport)} disabled={loading}>
            <Download className="h-4 w-4 mr-2" /> Excel
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Zeit</TableHead>
                  <TableHead>Std.</TableHead>
                  <TableHead>Tätigkeit</TableHead>
                  <TableHead>Beschreibung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailEntries.map(e => {
                  const [sh, sm] = e.start_time.split(':').map(Number)
                  const [eh, em] = e.end_time.split(':').map(Number)
                  const h = (eh * 60 + em - sh * 60 - sm) / 60
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm">{format(new Date(e.date), 'dd.MM.yyyy')}</TableCell>
                      <TableCell className="text-sm">{e.start_time.slice(0, 5)}–{e.end_time.slice(0, 5)}</TableCell>
                      <TableCell className="text-sm font-medium">{h.toFixed(1)}</TableCell>
                      <TableCell className="text-sm">{(e.activity as any)?.name ?? '–'}</TableCell>
                      <TableCell className="text-sm text-gray-500">{e.description ?? '–'}</TableCell>
                    </TableRow>
                  )
                })}
                <TableRow className="bg-gray-50 font-semibold">
                  <TableCell colSpan={2}>Gesamt</TableCell>
                  <TableCell>{totalHoursDetail.toFixed(1)} h</TableCell>
                  <TableCell colSpan={2}>{detailEntries.length} Einträge</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Berichte</h1>
          <p className="text-gray-500 text-sm mt-0.5">Monatsberichte und Excel-Export</p>
        </div>
        <Button onClick={exportAllMonth} disabled={loading} variant="outline">
          <Download className="h-4 w-4 mr-2" /> Alle exportieren
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[120px] text-center">
            {format(currentMonth, 'MMMM yyyy', { locale: de })}
          </span>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Select value={selectedAssistant} onValueChange={(v) => setSelectedAssistant(v ?? 'all')}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Alle Assistenten" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Assistenten</SelectItem>
            {assistants.map(a => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {reports.length === 0 ? (
            <p className="text-center py-10 text-gray-500">
              Keine Berichte für {format(currentMonth, 'MMMM yyyy', { locale: de })}.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assistent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Gesendet am</TableHead>
                  <TableHead>Eingesehen</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.assistant.full_name}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          r.status === 'sent'
                            ? 'bg-green-100 text-green-700 border-green-200'
                            : r.status === 'confirmed'
                            ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                            : 'bg-gray-100 text-gray-600'
                        }
                        variant="outline"
                      >
                        {r.status === 'sent' ? 'Gesendet' : r.status === 'confirmed' ? 'Bestätigt' : 'Ausstehend'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {r.sent_at ? format(new Date(r.sent_at), 'dd.MM.yyyy HH:mm') : '–'}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {r.admin_viewed_at ? format(new Date(r.admin_viewed_at), 'dd.MM.yyyy') : (
                        <Badge variant="destructive" className="text-xs">Neu</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => viewReport(r)}>
                          <Eye className="h-3.5 w-3.5 mr-1" /> Ansehen
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => exportToExcel(r)} disabled={loading}>
                          <Download className="h-3.5 w-3.5 mr-1" /> Excel
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

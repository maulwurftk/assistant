import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ListTodo } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { format } from 'date-fns'
import { PerShiftChecklist } from './PerShiftChecklist'
import { DailyChecklist } from './DailyChecklist'
import { OneOffTodoList } from './OneOffTodoList'
import type { TodoTemplate, TodoCheck, Todo } from '@/lib/types'

export default async function AufgabenPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const today = format(new Date(), 'yyyy-MM-dd')
  // Annahme: JS Date.getDay() liefert 0=So..6=Sa — deckt sich mit der
  // Migration-Constraint todo_templates_weekday_ck (weekday between 0 and 6,
  // siehe supabase/migrations-mt/0014_todos.sql), keine Umrechnung nötig.
  const weekday = new Date().getDay()

  // Heutige Dienste des eingeloggten Assistenten
  const { data: todaySlots } = await supabase
    .from('calendar_slots')
    .select('*')
    .eq('date', today)
    .eq('assigned_to', user.id)
    .neq('status', 'cancelled')
    .order('start_time')

  // Aktive Templates des Tenants (alle Recurrence-Arten in einem Rutsch laden)
  const { data: templates } = await supabase
    .from('todo_templates')
    .select('*, activity:activities(name), assignee:profiles!assignee_id(full_name)')
    .eq('active', true)
    .order('sort_order')

  const allTemplates = (templates ?? []) as unknown as TodoTemplate[]
  const perShiftTemplates = allTemplates.filter(
    (t) => t.recurrence === 'per_shift' && (t.assignee_id === null || t.assignee_id === user.id)
  )
  const dailyTemplates = allTemplates.filter(
    (t) =>
      (t.assignee_id === null || t.assignee_id === user.id) &&
      (t.recurrence === 'daily' || (t.recurrence === 'weekly' && t.weekday === weekday))
  )

  // Checks für heute laden (per_shift: über slot_id; daily/weekly: über check_date + slot_id is null)
  const slotIds = (todaySlots ?? []).map((s) => s.id)
  const { data: shiftChecks } = slotIds.length
    ? await supabase.from('todo_checks').select('*').in('slot_id', slotIds)
    : { data: [] as TodoCheck[] }

  const { data: dailyChecks } = await supabase
    .from('todo_checks')
    .select('*')
    .eq('check_date', today)
    .is('slot_id', null)

  // Einmalaufgaben: offen, nicht storniert, unzugewiesen oder mir zugewiesen
  const { data: todosRaw } = await supabase
    .from('todos')
    .select('*, activity:activities(name)')
    .eq('status', 'open')
    .or(`assignee_id.is.null,assignee_id.eq.${user.id}`)
    .order('due_date', { ascending: true, nullsFirst: false })

  const todos = (todosRaw ?? []) as unknown as Todo[]

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        icon={<ListTodo className="h-5 w-5" />}
        title="Aufgaben"
        subtitle="Deine Checklisten und Einmalaufgaben"
        tone="sky"
      />

      {(todaySlots ?? []).length > 0 && (
        <PerShiftChecklist
          slots={todaySlots ?? []}
          templates={perShiftTemplates}
          checks={(shiftChecks ?? []) as unknown as TodoCheck[]}
          userId={user.id}
        />
      )}

      <DailyChecklist
        templates={dailyTemplates}
        checks={(dailyChecks ?? []) as unknown as TodoCheck[]}
        today={today}
        userId={user.id}
      />

      <OneOffTodoList todos={todos} />
    </div>
  )
}

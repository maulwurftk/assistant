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
  // Kein Embed-Hint für activity/assignee: seit Migration 0014 gibt es je zwei
  // FKs auf activities/profiles (Einzelspalte + Tenant-Composite), PostgREST
  // liefert dann 300 Multiple Choices statt Daten. Getrennte Query statt Embed
  // (gleiches Muster wie admin/aufgaben/TemplatesTab.tsx).
  const { data: templatesRaw } = await supabase
    .from('todo_templates')
    .select('*')
    .eq('active', true)
    .order('sort_order')

  // Einmalaufgaben: offen, nicht storniert, unzugewiesen oder mir zugewiesen
  const { data: todosRaw } = await supabase
    .from('todos')
    .select('*')
    .eq('status', 'open')
    .or(`assignee_id.is.null,assignee_id.eq.${user.id}`)
    .order('due_date', { ascending: true, nullsFirst: false })

  const allTemplatesRaw = (templatesRaw ?? []) as unknown as TodoTemplate[]
  const todosRawTyped = (todosRaw ?? []) as unknown as Todo[]

  // activity-Namen für Templates + Todos gemeinsam nachladen (kein Embed, s.o.)
  const activityIds = Array.from(
    new Set([...allTemplatesRaw.map((t) => t.activity_id), ...todosRawTyped.map((t) => t.activity_id)].filter(Boolean) as string[])
  )
  const { data: activitiesData } = activityIds.length
    ? await supabase.from('activities').select('id, name').in('id', activityIds)
    : { data: [] as { id: string; name: string }[] }
  const activityMap = new Map((activitiesData ?? []).map((a) => [a.id, a]))

  const allTemplates = allTemplatesRaw.map((t) => ({
    ...t,
    activity: t.activity_id ? activityMap.get(t.activity_id) ?? null : null,
  })) as unknown as TodoTemplate[]
  const todos = todosRawTyped.map((t) => ({
    ...t,
    activity: t.activity_id ? activityMap.get(t.activity_id) ?? null : null,
  })) as unknown as Todo[]

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

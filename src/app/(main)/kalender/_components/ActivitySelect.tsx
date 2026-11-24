'use client'

import { Activity } from '@/lib/types'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/** Gruppe einer Tätigkeit: Teil vor „ – “ der Berichtskategorie (z. B. „Elternassistenz“). */
function groupOf(a: Activity) {
  return (a.report_label ?? a.name).split(' – ')[0]
}

type Props = {
  activities: Activity[]
  value: string
  onChange: (id: string) => void
}

/**
 * Ein einziges Auswahlfeld für die Tätigkeit – auf dem Handy bewusst schlank.
 * Haben Tätigkeiten eine Berichtskategorie (report_label), werden sie danach
 * gruppiert (Elternassistenz / Pers. Assistenz), sonst flache Liste.
 */
export function ActivitySelect({ activities, value, onChange }: Props) {
  const grouped = activities.some(a => a.report_label)
  const groups = new Map<string, Activity[]>()
  if (grouped) {
    for (const a of activities) {
      const g = groupOf(a)
      if (!groups.has(g)) groups.set(g, [])
      groups.get(g)!.push(a)
    }
  }

  return (
    <Select value={value || 'none'} onValueChange={v => onChange((v === 'none' || !v) ? '' : v)}>
      <SelectTrigger><SelectValue placeholder="Tätigkeit wählen" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">— Keine Angabe —</SelectItem>
        {grouped
          ? [...groups.entries()].map(([g, items]) => (
              <SelectGroup key={g}>
                <SelectLabel className="text-xs text-gray-400">{g}</SelectLabel>
                {items.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectGroup>
            ))
          : activities.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

/**
 * Setzt die Tätigkeit und übernimmt deren Namen als Titel und den Vorschlagstext
 * als Notiz – aber nur, solange der Nutzer diese Felder noch nicht selbst
 * verändert hat (leer oder noch identisch mit der vorher gewählten Vorlage).
 */
export function applyActivity<F extends { title: string; description: string; activity_id: string }>(
  form: F,
  id: string,
  activities: Activity[],
): F {
  const prev = activities.find(a => a.id === form.activity_id)
  const next = activities.find(a => a.id === id)
  const titleFree = !form.title.trim() || (!!prev && form.title === prev.name)
  const descFree = !form.description.trim() || (!!prev && form.description === (prev.default_description ?? ''))
  return {
    ...form,
    activity_id: id,
    title: next && titleFree ? next.name : form.title,
    description: next?.default_description && descFree ? next.default_description : form.description,
  }
}

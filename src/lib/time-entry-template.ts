export type TemplateRow = {
  jsDay: number   // 0=So, 1=Mo, 2=Di, 3=Mi, 4=Do, 5=Fr, 6=Sa
  start: string   // HH:MM
  end: string     // HH:MM
  activityName: string
}

// Zielvereinbarung Bezirk Oberpfalz (01.03.2026–29.02.2028)
// Mo/Mi/Fr Elternassistenz (9h), Di/Do Persönliche Assistenz (6h)
export const DEFAULT_TEMPLATE: TemplateRow[] = [
  { jsDay: 1, start: '08:00', end: '11:00', activityName: 'Elternassistenz – Betreuung Tochter' },
  { jsDay: 2, start: '10:00', end: '13:00', activityName: 'Pers. Assistenz – Freizeitbegleitung' },
  { jsDay: 3, start: '08:00', end: '11:00', activityName: 'Elternassistenz – Betreuung Tochter' },
  { jsDay: 4, start: '09:00', end: '10:00', activityName: 'Pers. Assistenz – Einkauf' },
  { jsDay: 4, start: '10:00', end: '12:00', activityName: 'Pers. Assistenz – Arzttermin' },
  { jsDay: 5, start: '08:00', end: '11:00', activityName: 'Elternassistenz – Aufräumen / Einkauf' },
]

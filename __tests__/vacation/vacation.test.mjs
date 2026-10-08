// Reine Unit-Tests für src/lib/vacation.ts (keine DB).
// Start: node --experimental-strip-types __tests__/vacation/vacation.test.mjs
import assert from 'node:assert/strict'
import {
  easterSunday, holidays, isVacationEligibleDay, fullMonths, entitlementForYear,
  vacationPayBasis, balancesByYear, allocateTaken, addMonths, distinctWorkdays,
} from '../../src/lib/vacation.ts'

let passed = 0
const t = (name, fn) => { fn(); passed++; console.log('✓', name) }

const term = (o = {}) => ({ valid_from: '2020-01-01', valid_until: null, days_per_week: 5, base_days: null, extra_days: 0, ...o })
const ent = (o) => entitlementForYear({ year: 2026, terms: [term()], baseDefault: 20, employmentStart: null, employmentEnd: null, irregularWorkdaysPerYear: 0, ...o })

t('Ostersonntag', () => {
  assert.equal(easterSunday(2026), '2026-04-05')
  assert.equal(easterSunday(2027), '2027-03-28')
})
t('Feiertage Bayern 2026', () => {
  const h = holidays(2026, 'BY')
  assert.ok(h.has('2026-04-03')) // Karfreitag
  assert.ok(h.has('2026-06-04')) // Fronleichnam
  assert.ok(h.has('2026-08-15'))
  assert.ok(!holidays(2026, 'DE').has('2026-08-15'))
  assert.equal(isVacationEligibleDay('2026-10-04', 'BY'), false) // Sonntag
  assert.equal(isVacationEligibleDay('2026-10-03', 'BY'), false) // Feiertag
  assert.equal(isVacationEligibleDay('2026-10-10', 'BY'), true)  // Samstag zählt
})
t('addMonths/fullMonths', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28')
  assert.equal(fullMonths('2026-03-01', '2026-12-31'), 10)
  assert.equal(fullMonths('2026-03-15', '2026-12-31'), 9)
})
t('Vollzeit ganzjährig 20 Tage', () => assert.equal(ent().days, 20))
t('2-Tage-Woche → 8 Tage', () => assert.equal(ent({ terms: [term({ days_per_week: 2 })] }).days, 8))
t('Unregelmäßig 104 Arbeitstage → 8 Tage', () =>
  assert.equal(ent({ terms: [term({ days_per_week: null })], irregularWorkdaysPerYear: 104 }).days, 8))
t('Schwerbehinderung +5 bei 5-Tage-Woche', () => assert.equal(ent({ terms: [term({ extra_days: 5 })] }).days, 25))
t('Eintritt 01.03. → Wartezeit im Jahr erfüllt → voll', () => {
  const r = ent({ employmentStart: '2026-03-01' })
  assert.equal(r.mode, 'full'); assert.equal(r.days, 20)
})
t('Eintritt 01.07. → Wartezeit endet 31.12. → voll', () => assert.equal(ent({ employmentStart: '2026-07-01' }).mode, 'full'))
t('Eintritt 01.08. → 5/12 von 20 = 8,33 → 8,33 (unter halbem Tag)', () => {
  const r = ent({ employmentStart: '2026-08-01' })
  assert.equal(r.mode, 'partial'); assert.equal(r.fullMonths, 5); assert.equal(r.days, 8.33)
})
t('Eintritt 01.09. 2-Tage-Woche → 4/12 × 8 = 2,67 → aufgerundet 3', () =>
  assert.equal(ent({ employmentStart: '2026-09-01', terms: [term({ days_per_week: 2 })] }).days, 3))
t('Austritt 30.06. → Zwölftel', () => {
  const r = ent({ employmentStart: '2020-01-01', employmentEnd: '2026-06-30' })
  assert.equal(r.mode, 'partial'); assert.equal(r.days, 10)
})
t('Austritt 31.07. nach erfüllter Wartezeit → voll', () =>
  assert.equal(ent({ employmentStart: '2020-01-01', employmentEnd: '2026-07-31' }).mode, 'full'))
t('Vertragswechsel 01.07. von 2 auf 4 Tage → zeitanteilig ≈ 12', () => {
  const r = ent({ terms: [term({ days_per_week: 2, valid_until: '2026-06-30' }), term({ valid_from: '2026-07-01', days_per_week: 4 })] })
  assert.ok(Math.abs(r.days - 12) < 0.1, String(r.days))
})
t('Nicht beschäftigt im Jahr → 0', () => assert.equal(ent({ employmentStart: '2027-01-01' }).days, 0))
t('Urlaubsentgelt Ø 13 Wochen', () => {
  const slots = [
    { date: '2026-09-01', minutes: 180 }, { date: '2026-09-01', minutes: 60 },
    { date: '2026-09-08', minutes: 240 }, { date: '2026-05-01', minutes: 999 }, // außerhalb
  ]
  const p = vacationPayBasis(slots, '2026-10-12', 13)
  assert.equal(p.refWorkdays, 2); assert.equal(p.refMinutes, 480); assert.equal(p.minutesPerDay, 240)
  assert.equal(p.method, 'reference_13w')
})
t('Urlaubsentgelt Fallback Vertrag', () => {
  const p = vacationPayBasis([], '2026-10-12', 13, { weekly_hours: 6, days_per_week: 2 })
  assert.equal(p.minutesPerDay, 180); assert.equal(p.method, 'fallback_terms')
})
t('distinctWorkdays', () => assert.equal(distinctWorkdays([{ date: '2026-01-02', minutes: 60 }, { date: '2026-01-02', minutes: 30 }], '2026-01-01', '2026-01-31'), 1))
t('Konto + FIFO-Verbrauch', () => {
  const b = balancesByYear([
    { leave_year: 2025, kind: 'entitlement', days: 8 }, { leave_year: 2025, kind: 'taken', days: -6 },
    { leave_year: 2026, kind: 'entitlement', days: 8 },
  ])
  assert.deepEqual(b.map((x) => x.balance), [2, 8])
  const a = allocateTaken(b, 3, 2026)
  assert.deepEqual(a.allocation, [{ leave_year: 2025, days: 2 }, { leave_year: 2026, days: 1 }])
  assert.equal(a.shortfall, 0)
  const over = allocateTaken(b, 12, 2026)
  assert.equal(over.shortfall, 2)
})

console.log(`\n${passed} Tests grün`)

// Reine Unit-Tests für src/lib/recurrence.ts (keine DB).
// Start: node --experimental-strip-types __tests__/recurrence/recurrence.test.mjs
import assert from 'node:assert/strict'
import { generateOccurrences, describeRule, validateRule, MAX_OCCURRENCES } from '../../src/lib/recurrence.ts'

let passed = 0
const t = (name, fn) => { fn(); passed++; console.log('✓', name) }

t('täglich, inkl. Ablaufdatum', () => {
  const { dates } = generateOccurrences('2026-11-23', { freq: 'daily', interval: 1, until: '2026-11-26' })
  assert.deepEqual(dates, ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26'])
})
t('alle 3 Tage', () => {
  const { dates } = generateOccurrences('2026-11-23', { freq: 'daily', interval: 3, until: '2026-12-01' })
  assert.deepEqual(dates, ['2026-11-23', '2026-11-26', '2026-11-29'])
})
t('wöchentlich ohne Wochentage = Wochentag des Starts', () => {
  const { dates } = generateOccurrences('2026-11-25', { freq: 'weekly', interval: 1, until: '2026-12-10' })
  assert.deepEqual(dates, ['2026-11-25', '2026-12-02', '2026-12-09'])
})
t('wöchentlich Mo+Do, Start am Mi überspringt Mo der ersten Woche', () => {
  const { dates } = generateOccurrences('2026-11-25', { freq: 'weekly', interval: 1, weekdays: [1, 4], until: '2026-12-07' })
  assert.deepEqual(dates, ['2026-11-26', '2026-11-30', '2026-12-03', '2026-12-07'])
})
t('alle 2 Wochen inkl. Sonntag', () => {
  const { dates } = generateOccurrences('2026-11-23', { freq: 'weekly', interval: 2, weekdays: [0, 1], until: '2026-12-21' })
  assert.deepEqual(dates, ['2026-11-23', '2026-11-29', '2026-12-07', '2026-12-13', '2026-12-21'])
})
t('über Sommerzeitwechsel stabil', () => {
  const { dates } = generateOccurrences('2027-03-22', { freq: 'weekly', interval: 1, until: '2027-04-05' })
  assert.deepEqual(dates, ['2027-03-22', '2027-03-29', '2027-04-05'])
})
t('monatlich am 31. überspringt kurze Monate', () => {
  const { dates } = generateOccurrences('2027-01-31', { freq: 'monthly', interval: 1, until: '2027-05-31' })
  assert.deepEqual(dates, ['2027-01-31', '2027-03-31', '2027-05-31'])
})
t('alle 2 Monate', () => {
  const { dates } = generateOccurrences('2026-11-15', { freq: 'monthly', interval: 2, until: '2027-04-01' })
  assert.deepEqual(dates, ['2026-11-15', '2027-01-15', '2027-03-15'])
})
t('Obergrenze', () => {
  const r = generateOccurrences('2026-01-01', { freq: 'daily', interval: 1, until: '2030-01-01' })
  assert.equal(r.dates.length, MAX_OCCURRENCES)
  assert.equal(r.truncated, true)
})
t('Validierung', () => {
  assert.ok(validateRule('2026-11-23', { freq: 'daily', interval: 1, until: '' }))
  assert.ok(validateRule('2026-11-23', { freq: 'daily', interval: 1, until: '2026-11-01' }))
  assert.ok(validateRule('2026-11-23', { freq: 'daily', interval: 0, until: '2026-12-01' }))
  assert.equal(validateRule('2026-11-23', { freq: 'weekly', interval: 1, weekdays: [1], until: '2026-12-01' }), null)
})
t('Beschreibung', () => {
  assert.equal(describeRule({ freq: 'weekly', interval: 2, weekdays: [3, 1], until: '2027-03-31' }), 'Alle 2 Wochen am Mo, Mi bis 31.03.2027')
  assert.equal(describeRule({ freq: 'daily', interval: 1, until: '2027-01-01' }), 'Täglich bis 01.01.2027')
  assert.equal(describeRule({ freq: 'monthly', interval: 1, until: '2027-01-01' }, '2026-11-15'), 'Jeden Monat am 15. bis 01.01.2027')
})

console.log(`\n${passed} Tests grün`)

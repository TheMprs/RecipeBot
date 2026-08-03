// Exercises the real cookStats helpers (not a copy of them).
// Run with: node src/utils/cookStats.test.mjs
import assert from 'node:assert/strict'
import {
  deriveCookStats, groupByDay, monthMatrix, dayKey, newestFirst,
  oldestAllowed, stepMonth, canStep, isEditableDay, sameMonth, recentDays,
  stripDualNumeral, tidyRelative, HISTORY_MONTHS, monthsBetween, relativeUnit
} from './cookStats.js'

const NOW = new Date('2026-07-29T12:00:00') // a Wednesday
const at = (s) => new Date(s).toISOString()
const rows = (...specs) => specs.map(([recipe, when], i) => ({ id: i + 1, recipe, at: at(when) }))

// --- deriveCookStats -----------------------------------------------------
{
  const { counts, dates, last } = deriveCookStats(rows(
    ['r1', '2026-07-24T18:00'],
    ['r1', '2026-06-05T18:00'],
    ['r2', '2026-07-20T18:00']
  ))
  assert.equal(counts.r1, 2)
  assert.equal(counts.r2, 1)
  assert.equal(last.r1, at('2026-07-24T18:00'), 'last is the newest prep')
  assert.equal(dates.r1[0].at, at('2026-07-24T18:00'), 'dates are newest first')
}
{
  const { counts, dates, last, week } = deriveCookStats([])
  assert.deepEqual(counts, {}); assert.deepEqual(dates, {}); assert.deepEqual(last, {})
  assert.equal(week, 0)
}
{
  // week tally is computed at call time, so it cannot go stale in a cache
  assert.equal(deriveCookStats(rows(['r1', new Date(Date.now() - 2 * 86400000)])).week, 1)
  assert.equal(deriveCookStats(rows(['r1', new Date(Date.now() - 40 * 86400000)])).week, 0)
  // a future-dated row must not count toward "this week" (finding #6)
  const withFuture = deriveCookStats(rows(
    ['r1', new Date(Date.now() - 2 * 86400000)],   // counts
    ['r1', new Date(Date.now() + 3 * 86400000)]    // future — must not
  ))
  assert.equal(withFuture.week, 1, 'future prep excluded from the week tally')
  assert.equal(withFuture.counts.r1, 2, 'but still counted in the all-time total')
}

// --- monthMatrix ---------------------------------------------------------
{
  const cells = monthMatrix(2026, 6) // July 2026
  assert.equal(cells.length, 42, 'always six rows so the panel height is stable')
  const days = cells.filter(Boolean)
  assert.equal(days.length, 31, 'July has 31 days')
  assert.equal(days[0].getDate(), 1)
  assert.equal(days[30].getDate(), 31)
  assert.ok(cells.every(c => c === null || c.getMonth() === 6), 'no neighbouring months leak in')

  // the first real day sits in its true weekday column
  const lead = cells.findIndex(Boolean)
  assert.equal(lead, new Date(2026, 6, 1).getDay(), 'leading blanks match the weekday offset')
}
{
  // February in a non-leap year, and a month that starts on Sunday
  assert.equal(monthMatrix(2026, 1).filter(Boolean).length, 28)
  assert.equal(monthMatrix(2027, 1).filter(Boolean).length, 28)
  assert.equal(monthMatrix(2028, 1).filter(Boolean).length, 29, '2028 is a leap year')
}
{
  // December must not roll into next January
  const cells = monthMatrix(2026, 11)
  assert.ok(cells.every(c => c === null || (c.getMonth() === 11 && c.getFullYear() === 2026)))
}

// --- month stepping is clamped to [one year back, this month] -----------
{
  const here = { y: 2026, m: 6 } // July 2026
  assert.deepEqual(stepMonth(here, -1, NOW), { y: 2026, m: 5 }, 'steps back a month')
  assert.deepEqual(stepMonth(here, 1, NOW), here, 'cannot step into the future')
  assert.equal(canStep(here, 1, NOW), false)
  assert.equal(canStep(here, -1, NOW), true)
}
{
  // the floor is HISTORY_MONTHS before today -> July 2025 at the default of 12
  assert.equal(HISTORY_MONTHS, 12, 'guards the dates below if the constant changes')
  const floor = oldestAllowed(NOW)
  assert.equal(floor.getFullYear(), 2025)
  assert.equal(floor.getMonth(), 6)
  assert.equal(floor.getHours(), 0, 'floored to midnight so a same-day boundary is inclusive')

  const atFloor = { y: 2025, m: 6 }
  assert.deepEqual(stepMonth(atFloor, -1, NOW), atFloor, 'cannot step past one year back')
  assert.equal(canStep(atFloor, -1, NOW), false)
  assert.equal(canStep(atFloor, 1, NOW), true)
}
{
  // stepping backwards across a year boundary
  assert.deepEqual(stepMonth({ y: 2026, m: 0 }, -1, NOW), { y: 2025, m: 11 })
}

// --- editable days -------------------------------------------------------
{
  assert.equal(isEditableDay(new Date(2026, 6, 28), NOW), true, 'yesterday is editable')
  assert.equal(isEditableDay(new Date(2026, 7, 5), NOW), false, 'the future is not')
  assert.equal(isEditableDay(new Date(2024, 6, 29), NOW), false, 'two years back is not')
  assert.equal(isEditableDay(new Date(2025, 7, 1), NOW), true, 'inside the one-year window is')
  assert.equal(isEditableDay(new Date(2025, 5, 1), NOW), false, 'just outside the window is not')
}

// --- more than one prep in a day ----------------------------------------
{
  const d = [
    ['r1', '2026-07-20T08:00'], ['r1', '2026-07-20T13:00'], ['r1', '2026-07-20T20:00']
  ].map(([recipe, when], i) => ({ id: i + 1, recipe, at: at(when) })).sort(newestFirst)

  const byDay = groupByDay(d)
  const hits = byDay[dayKey(new Date('2026-07-20T13:00'))]
  assert.equal(hits.length, 3, 'all three land in the same day bucket')

  // the cell deletes hits[0] — that must be the LATEST prep of that day
  const latest = d.reduce((a, r) => (r.at > a.at ? r : a))
  assert.equal(hits[0].id, latest.id, 'tapping removes the most recent prep of the day')

  const times = hits.map(h => h.at)
  assert.deepEqual(times, [...times].sort().reverse(), 'removals walk newest to oldest')
}

// a backdated insert uses noon local, so it buckets on the day that was tapped
{
  const noon = new Date(2026, 6, 20, 12, 0, 0)
  assert.equal(dayKey(new Date(noon.toISOString())), dayKey(new Date(2026, 6, 20)),
    'noon-local survives the UTC round trip into the same local day')
}

// --- the "last three times" list ----------------------------------------
{
  // one day cooked three times must not fill the whole list with itself
  const d = rows(
    ['r1', '2026-07-29T09:00'], ['r1', '2026-07-29T14:29'], ['r1', '2026-07-29T14:30'],
    ['r1', '2026-07-22T18:00'],
    ['r1', '2026-07-14T18:00']
  )
  const list = recentDays(d, 3)
  assert.equal(list.length, 3)
  assert.deepEqual(
    list.map(x => new Date(x.at).getDate()), [29, 22, 14],
    'three distinct days, not three logs from the same evening'
  )
  assert.equal(new Set(list.map(x => x.key)).size, 3, 'no repeated dates')
  // the day is represented by its newest prep
  assert.equal(new Date(list[0].at).getHours(), new Date('2026-07-29T14:30').getHours())
}
{
  // more distinct days than the limit: capped, newest first
  const d = rows(
    ['r1', '2026-07-29T18:00'], ['r1', '2026-07-22T18:00'],
    ['r1', '2026-07-14T18:00'], ['r1', '2026-07-10T18:00']
  )
  assert.deepEqual(
    recentDays(d, 3).map(x => new Date(x.at).getDate()), [29, 22, 14],
    'newest days first, oldest dropped'
  )
}
{
  // fewer days than the limit: no padding, no crash
  assert.equal(recentDays(rows(['r1', '2026-07-29T18:00']), 3).length, 1)
  assert.deepEqual(recentDays([], 3), [], 'no preps, no rows')
}

// --- Hebrew dual forms carry a redundant "(2)" from CLDR -----------------
{
  const he = new Intl.RelativeTimeFormat('he-IL', { numeric: 'auto' })
  // the real source of the bug report: a trailing (2) next to a date
  assert.equal(stripDualNumeral(he.format(-2, 'week')), 'לפני שבועיים')
  assert.equal(stripDualNumeral(he.format(-2, 'month')), 'לפני חודשיים')
  // untouched where CLDR is already clean
  assert.equal(stripDualNumeral(he.format(-3, 'week')), he.format(-3, 'week'))
  assert.equal(stripDualNumeral(he.format(-1, 'week')), he.format(-1, 'week'))
  assert.equal(stripDualNumeral(he.format(0, 'day')), he.format(0, 'day'))

  // English is unaffected
  const en = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' })
  for (const n of [0, 1, 2, 3]) {
    assert.equal(stripDualNumeral(en.format(-n, 'week')), en.format(-n, 'week'))
  }
  // only a trailing parenthetical goes; digits elsewhere stay
  assert.equal(stripDualNumeral('לפני 3 שבועות'), 'לפני 3 שבועות')

  // tidyRelative also drops the definite article CLDR puts on the -1 forms
  assert.equal(he.format(-1, 'week'), 'השבוע שעבר', 'CLDR still emits the definite form')
  assert.equal(he.format(-1, 'month'), 'החודש שעבר', 'CLDR still emits the definite form')
  assert.equal(tidyRelative(he.format(-1, 'week')), 'שבוע שעבר')
  assert.equal(tidyRelative(he.format(-1, 'month')), 'חודש שעבר')
  // and still strips the dual numeral
  assert.equal(tidyRelative(he.format(-2, 'week')), 'לפני שבועיים')
  assert.equal(tidyRelative(he.format(-2, 'month')), 'לפני חודשיים')
  // leaves everything else alone
  assert.equal(tidyRelative(he.format(0, 'day')), 'היום')
  assert.equal(tidyRelative(he.format(-1, 'day')), 'אתמול')
  assert.equal(tidyRelative(he.format(-2, 'day')), 'שלשום')
  assert.equal(tidyRelative(he.format(-3, 'week')), 'לפני 3 שבועות')
  assert.equal(tidyRelative(he.format(-3, 'month')), 'לפני 3 חודשים')
  for (const n of [0, 1, 2, 3]) {
    assert.equal(tidyRelative(en.format(-n, 'week')), en.format(-n, 'week'))
    assert.equal(tidyRelative(en.format(-n, 'month')), en.format(-n, 'month'))
  }
}

// --- relative "time ago" counts calendar months, not days/30 -------------
{
  // the reported bug: 11 June from 29 July is ONE month, not two (days/30=1.6→2)
  assert.deepEqual(relativeUnit(at('2026-06-11T12:00'), NOW), { n: 1, unit: 'month' })
  // exactly on the monthly anniversary counts; a day short does not
  assert.deepEqual(relativeUnit(at('2026-05-29T12:00'), NOW), { n: 2, unit: 'month' })
  assert.deepEqual(relativeUnit(at('2026-05-30T12:00'), NOW), { n: 1, unit: 'month' },
    'one day before the 2-month anniversary is still 1 month')
  // sub-week and week bands
  assert.deepEqual(relativeUnit(at('2026-07-29T09:00'), NOW), { n: 0, unit: 'day' })
  assert.deepEqual(relativeUnit(at('2026-07-27T12:00'), NOW), { n: 2, unit: 'day' })
  assert.deepEqual(relativeUnit(at('2026-07-15T12:00'), NOW), { n: 2, unit: 'week' })
  // just over a week but same month -> weeks, never months
  assert.equal(relativeUnit(at('2026-07-19T12:00'), NOW).unit, 'week')

  // monthsBetween anniversary edge cases
  assert.equal(monthsBetween(new Date(2026, 5, 11), NOW), 1) // 11 Jun -> 29 Jul
  assert.equal(monthsBetween(new Date(2026, 6, 11), NOW), 0) // 11 Jul -> 29 Jul, under a month
  assert.equal(monthsBetween(new Date(2025, 6, 29), NOW), 12) // exactly a year
  assert.equal(monthsBetween(new Date(2025, 6, 30), NOW), 11) // one day shy of a year
  assert.equal(monthsBetween(NOW, NOW), 0)
}

assert.ok(sameMonth(new Date(2026, 6, 1), NOW))
assert.ok(!sameMonth(new Date(2026, 5, 1), NOW))

console.log('cookStats: all checks passed')

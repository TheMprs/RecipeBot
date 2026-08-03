// Pure derivations over cook_logs rows. Lives here so App.jsx and RecipeDetail
// share one implementation and the tests exercise the real thing.
//
// A row is { id, recipe, at } where `at` is an ISO timestamp. A recipe can be
// prepped more than once a day, so per-day grouping always yields a list.

// How far back the history is editable. The month arrows stop here, and a
// crafted-past prep older than this is unreachable in the UI. This constant is
// the single source of that bound — oldestAllowed() derives from it.
export const HISTORY_MONTHS = 12

export function deriveCookStats(logs) {
  const counts = {}, dates = {}, last = {}
  let week = 0
  const nowMs = Date.now()
  const weekAgo = nowMs - 7 * 86400000
  for (const row of logs) {
    counts[row.recipe] = (counts[row.recipe] || 0) + 1
    ;(dates[row.recipe] ||= []).push(row)
    // Past 7 days only, and not the future: a backdated-forward or clock-skewed
    // row must not inflate the greeting's "cooked N times this week".
    const t = new Date(row.at).getTime()
    if (t > weekAgo && t <= nowMs) week++
  }
  // ISO strings sort lexicographically — newest first, no Date objects needed
  for (const id in dates) {
    dates[id].sort(newestFirst)
    last[id] = dates[id][0].at
  }
  return { counts, dates, last, week }
}

export const newestFirst = (a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)

// CLDR's Hebrew dual forms carry a redundant numeral: Intl.RelativeTimeFormat
// returns "לפני שבועיים (2)" where שבועיים already means "two weeks" (likewise
// "לפני חודשיים (2)"). Next to a date that trailing (2) reads as a quantity, so
// drop it. Only the dual is affected — -1 and -3 come back clean.
export const stripDualNumeral = (s) => s.replace(/\s*\(\d+\)\s*$/, '')

// CLDR renders Hebrew's -1 forms with the definite article ("השבוע שעבר" —
// literally "the last week"). Beside a date it reads better indefinite.
const HE_RELATIVE_FIXES = {
  'השבוע שעבר': 'שבוע שעבר',
  'החודש שעבר': 'חודש שעבר'
}

// Everything Intl gets wrong for this panel, in one place.
export function tidyRelative(s) {
  const t = stripDualNumeral(s)
  return HE_RELATIVE_FIXES[t] ?? t
}

export const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

// Whole calendar months from `from` to `to` — the count of monthly anniversaries
// that have actually passed, not days/30. June 11 → July 29 is one month (July 11
// passed, Aug 11 hasn't), never two.
export function monthsBetween(from, to) {
  let m = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  if (to.getDate() < from.getDate()) m-- // day-of-month anniversary not yet reached
  return Math.max(0, m)
}

// Fuzzy "time ago" as a signed unit for Intl.RelativeTimeFormat: { n, unit }.
// Days under a week, then weeks, then calendar months. Months come from
// monthsBetween so the label matches the wall calendar, not a 30-day average.
export function relativeUnit(fromIso, now = new Date()) {
  const then = new Date(fromIso)
  const days = Math.round((now - then) / 86400000)
  if (days < 7) return { n: days, unit: 'day' }
  const months = monthsBetween(then, now)
  if (months < 1) return { n: Math.round(days / 7), unit: 'week' }
  return { n: months, unit: 'month' }
}

// { dayKey: [row, ...newest first] }
export function groupByDay(rows) {
  const byDay = {}
  for (const row of rows) (byDay[dayKey(new Date(row.at))] ||= []).push(row)
  for (const k in byDay) byDay[k].sort(newestFirst)
  return byDay
}

// The most recent distinct days a recipe was made, newest first. Distinct days
// rather than distinct logs: cooking something three times on one evening is
// one occasion to read about, not three identical lines.
export function recentDays(rows, limit = 3) {
  const out = []
  const seen = new Set()
  for (const row of [...rows].sort(newestFirst)) {
    const k = dayKey(new Date(row.at))
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ key: k, at: row.at })
    if (out.length === limit) break
  }
  return out
}

// --- home cooking-history panel ------------------------------------------
// A row of small month calendars: always the current month plus the three
// before it, whatever the account's age. Months that predate the account still
// render, with their days marked out-of-window so "you weren't here" looks
// different from "cooked nothing".
export const HISTORY_PANEL_MONTHS = 4

export const startOfDay = (d) => {
  const s = new Date(d)
  s.setHours(0, 0, 0, 0)
  return s
}

// [{ y, m, first, cells }], six of them, oldest first. `cells` is monthMatrix's
// fixed 42 slots so every calendar is the same height; each real day carries its
// prep count and `inWindow` — false before the account existed (or after today),
// which the UI draws as a bare number instead of a tile.
// `since` is the account-creation date; a log older than it (backdated import)
// counts as inside the window rather than being greyed out.
export function historyMonths(rows, since, now = new Date()) {
  const perDay = {}
  let earliest = null
  for (const row of rows) {
    const d = new Date(row.at)
    perDay[dayKey(d)] = (perDay[dayKey(d)] || 0) + 1
    if (!earliest || d < earliest) earliest = d
  }

  const opened = [since ? new Date(since) : null, earliest]
    .filter((d) => d && !isNaN(d))
    .reduce((a, b) => (a && a < b ? a : b), null)
  const from = opened ? startOfDay(opened) : null // null = no account date, treat every past day as live

  const today = startOfDay(now)
  const months = []
  for (let i = HISTORY_PANEL_MONTHS - 1; i >= 0; i--) {
    const first = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = first.getFullYear()
    const m = first.getMonth()
    months.push({
      y, m, first,
      cells: monthMatrix(y, m).map((date) => {
        if (!date) return null
        const n = perDay[dayKey(date)] || 0
        return {
          date, count: n, level: n > 4 ? 4 : n,
          inWindow: date <= today && (!from || date >= from)
        }
      })
    })
  }

  return { months, since: from ?? today }
}

// Totals the hero doesn't already say. `week` stays in deriveCookStats.
export function historyStats(rows, now = new Date()) {
  const monthAgo = new Date(now)
  monthAgo.setMonth(monthAgo.getMonth() - 1)
  let month = 0
  const perWeekday = [0, 0, 0, 0, 0, 0, 0]
  for (const row of rows) {
    const d = new Date(row.at)
    if (d > monthAgo && d <= now) month++
    perWeekday[d.getDay()]++
  }
  const top = perWeekday.reduce((best, n, i) => (n > perWeekday[best] ? i : best), 0)
  return { month, all: rows.length, busiestDay: perWeekday[top] > 0 ? top : null }
}

// Newest-first days, each with that day's preps (newest first). `limit` days,
// not `limit` rows — a day is the unit the timeline renders.
export function timelineDays(rows, limit = 8) {
  const byDay = groupByDay(rows)
  return Object.keys(byDay)
    .sort((a, b) => (byDay[a][0].at < byDay[b][0].at ? 1 : -1))
    .slice(0, limit)
    .map((key) => ({ key, date: new Date(byDay[key][0].at), rows: byDay[key] }))
}

// Always 42 cells (6 rows) so the panel does not change height between months.
// Days outside the month are null rather than greyed neighbours — the point of
// the grid is this month, and blanks read faster than dimmed numbers.
export function monthMatrix(year, month) {
  const lead = new Date(year, month, 1).getDay()
  const cells = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month, i - lead + 1)
    cells.push(d.getMonth() === month && d.getFullYear() === year ? d : null)
  }
  return cells
}

// Earliest editable day: HISTORY_MONTHS before today.
export function oldestAllowed(now = new Date()) {
  const d = new Date(now)
  d.setMonth(d.getMonth() - HISTORY_MONTHS)
  d.setHours(0, 0, 0, 0)
  return d
}

export const sameMonth = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()

// Month stepping, clamped to [oldestAllowed's month, this month].
export function stepMonth({ y, m }, delta, now = new Date()) {
  const next = new Date(y, m + delta, 1)
  const floor = oldestAllowed(now)
  const floorMonth = new Date(floor.getFullYear(), floor.getMonth(), 1)
  const ceilMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  if (next < floorMonth || next > ceilMonth) return { y, m }
  return { y: next.getFullYear(), m: next.getMonth() }
}

export function canStep({ y, m }, delta, now = new Date()) {
  const at = { y, m }
  const next = stepMonth(at, delta, now)
  return next.y !== at.y || next.m !== at.m
}

// A day is editable when it is within the last year and not in the future.
export function isEditableDay(day, now = new Date()) {
  return day >= oldestAllowed(now) && day <= now
}

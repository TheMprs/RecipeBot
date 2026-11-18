// Group titles inside a recipe's lists: "לרוטב:", "For the sauce:", "מכינים את העוף:".
//
// Recipes store ingredients and steps as plain string arrays, so a title is just a line —
// imports write them ending in a colon (UrlFetcher / GeminiHandler on the backend), and a
// person typing one tends to do the same. The colon at the end, on a short line, is the
// whole signal: "מלח: לפי הטעם" has its colon in the middle and stays an ingredient, and a
// long step that happens to end in ":" ("Prepare the following:") is past the length cap.
// Same rule as BotFormat.isGroupHeading on the bot side — keep the two in step.
const HEADING_MAX = 40
// "2 cups flour, divided:" opens with an amount — an ingredient, whatever its ending.
const AMOUNT_START = /^[\d¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/

export function isGroupHeading(line) {
  const s = String(line ?? '').trim()
  return s.length > 1 && s.length <= HEADING_MAX && /[:：]$/.test(s) && !AMOUNT_START.test(s)
}

// The title as shown: the trailing colon is how it's stored, not how it reads.
export const headingText = (line) => String(line ?? '').trim().replace(/\s*[:：]+$/, '')

// Real items only — "18 ingredients", not 21 with the three group titles counted.
export const countItems = (lines) => (lines || []).filter(l => !isGroupHeading(l)).length

// Step number for each line, null for titles. Numbering runs on across groups
// (01–05, then 06–08) so "step 6" means one thing while cooking.
export function stepNumbers(lines) {
  let n = 0
  return (lines || []).map(l => (isGroupHeading(l) ? null : ++n))
}

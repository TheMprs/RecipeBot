// Rows that just arrived from a paste are always the tail of the list, so their
// position is all it takes to spot them — no ids on what are plain strings.
export const isLanded = (i, total, n) => n > 0 && i >= total - n

// Stagger the tint by place in the batch, capped so a fifteen-line paste doesn't
// take most of a second to finish arriving.
export const landedDelay = (i, total, n) => isLanded(i, total, n)
  ? { animationDelay: `${Math.min(i - (total - n), 8) * 40}ms` }
  : undefined

// Turn a pasted blob into { title, ingredients, instructions }.
//
// The parse does not have to be right. Whatever comes out lands in the ordinary
// editable form, so a wrong guess costs a drag, not a retype — which is why this
// is sixty lines of heuristics instead of an API call, a queue and a quota.
//
// Two signals, in order of trust:
//   1. A section header ("Ingredients", "אופן ההכנה"). Copied recipes nearly always
//      carry one, and when they do there is nothing left to guess.
//   2. Failing that, line length. Ingredient lines are short, step lines are long.
//      Deliberately NOT "the line starts with a number" — steps are numbered too,
//      which is the classic way this kind of parser gets it backwards.

// A header line is the word and nothing else, so it is always short. 30 chars
// leaves room for "Instructions / Method" without swallowing a real sentence.
const HEADER_MAX = 30

const ING_WORDS = [
  'ingredients', 'ingredient', 'you will need', 'what you need', 'shopping list',
  'מצרכים', 'המצרכים', 'רכיבים', 'הרכיבים', 'חומרים', 'החומרים', 'רשימת מצרכים'
]

const INS_WORDS = [
  'instructions', 'directions', 'method', 'preparation', 'steps', 'how to make',
  'how to', 'הוראות', 'הוראות הכנה', 'אופן ההכנה', 'אופן הכנה', 'הכנה', 'ההכנה',
  'אופן העבודה', 'שלבי ההכנה'
]

// Markdown marks, bullets and trailing colons all decorate headers without
// changing which word it is.
const bare = (s) => s
  .replace(/[*_#~`•·►▪◦]/g, ' ')
  .replace(/[-–—:：]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

function headerKind(line) {
  if (!line || line.length > HEADER_MAX) return null
  const s = bare(line)
  if (!s) return null
  if (ING_WORDS.includes(s)) return 'ing'
  if (INS_WORDS.includes(s)) return 'ins'
  return null
}

// Strip list decoration, never quantities. "1." and "1)" are step numbering;
// a bare leading number is an amount and stays.
// ponytail: an ingredient written "1. onion" loses its 1. Rare enough, and the
// line is one tap from editable — not worth disambiguating.
const cleanItem = (s) => s
  .replace(/^[-–—*•·►▪◦]+\s*/, '')
  .replace(/^\d{1,2}[.)]\s+/, '')
  .replace(/^step\s+\d+\s*[:.-]?\s*/i, '')
  .trim()

const items = (lines) => lines.map(cleanItem).filter(Boolean)

// Does this line read as a sentence or as an entry on a list? Length alone is too
// blunt — "Mix everything and fry." is a step at 23 characters, and "1 large ripe
// beefsteak tomato, cored and cut into wedges" is an ingredient at 56. So: score a
// few signals that actually separate the two, and let them outvote each other.
const AMOUNT_START = /^[\d¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞./]/

function stepScore(line) {
  let score = 0
  if (/[.!?]$/.test(line)) score += 2          // lists don't end in full stops; sentences do
  if (line.split(/\s+/).length >= 7) score += 1
  if (line.length > 60) score += 1
  if (AMOUNT_START.test(line)) score -= 2      // leading quantity: an ingredient, however wordy
  return score
}

const isStepLine = (line) => stepScore(line) >= 2

// A block is the method if most of its lines read as sentences.
const isProse = (lines) => lines.filter(isStepLine).length * 2 > lines.length

// No header to go on: fall back to shape. Blank lines are the author's own
// grouping, so trust them first; within a single run, find where the short
// lines stop.
function splitByShape(lines) {
  const blocks = []
  let cur = []
  for (const l of lines) {
    if (l) cur.push(l)
    else if (cur.length) { blocks.push(cur); cur = [] }
  }
  if (cur.length) blocks.push(cur)
  if (!blocks.length) return { ingredients: [], instructions: [] }

  if (blocks.length > 1) {
    // Everything up to the first prose block is the list; from there on, steps.
    // Order is preserved, so the result reads the way it was pasted.
    let firstProse = blocks.findIndex(isProse)
    if (firstProse === -1) firstProse = 1   // no prose anywhere: first block is the list
    return {
      ingredients: items(blocks.slice(0, firstProse).flat()),
      instructions: items(blocks.slice(firstProse).flat())
    }
  }

  // One run of lines. The method starts at the first sentence that is followed by
  // another — one wordy ingredient in the middle of a list shouldn't open it.
  const only = blocks[0]
  const boundary = only.findIndex((l, i) =>
    isStepLine(l) && (i === only.length - 1 || isStepLine(only[i + 1])))
  if (boundary <= 0) {
    // All list, or sentences from the very first line: nothing to split.
    return only.length && isProse(only)
      ? { ingredients: [], instructions: items(only) }
      : { ingredients: items(only), instructions: [] }
  }
  return { ingredients: items(only.slice(0, boundary)), instructions: items(only.slice(boundary)) }
}

// A heading is not a title, and neither is a paragraph. Anything else on the
// first non-empty line is what the recipe is called.
function titleFrom(lines) {
  const first = lines.find(Boolean)
  if (!first || headerKind(first)) return ''
  const t = cleanItem(first.replace(/^(recipe|מתכון)\s*[:\-–]\s*/i, ''))
  return t.length <= 120 ? t : ''
}

export function parseRecipeText(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').map(l => l.trim())

  let ingAt = -1, insAt = -1
  lines.forEach((l, i) => {
    const k = headerKind(l)
    if (k === 'ing' && ingAt === -1) ingAt = i
    if (k === 'ins' && insAt === -1) insAt = i
  })

  // Both headers: nothing is left to guess. They may come in either order —
  // some recipes lead with the method.
  if (ingAt !== -1 && insAt !== -1) {
    const [a, b] = ingAt < insAt ? [ingAt, insAt] : [insAt, ingAt]
    const firstBlock = items(lines.slice(a + 1, b))
    const secondBlock = items(lines.slice(b + 1))
    return {
      title: titleFrom(lines.slice(0, a)),
      ingredients: ingAt < insAt ? firstBlock : secondBlock,
      instructions: ingAt < insAt ? secondBlock : firstBlock
    }
  }

  // Only "Instructions": everything between the title and it is the ingredients.
  if (insAt !== -1) {
    const title = titleFrom(lines.slice(0, insAt))
    const head = lines.slice(0, insAt)
    const titleAt = head.findIndex(Boolean)
    return {
      title,
      ingredients: items(head.slice(title ? titleAt + 1 : 0)),
      instructions: items(lines.slice(insAt + 1))
    }
  }

  // Only "Ingredients", or no header at all: shape decides where the list ends.
  const start = ingAt !== -1 ? ingAt + 1 : 0
  const title = titleFrom(lines.slice(0, ingAt === -1 ? lines.length : ingAt))
  const titleAt = lines.findIndex(Boolean)
  const body = lines.slice(ingAt !== -1 ? start : (title ? titleAt + 1 : 0))
  return { title, ...splitByShape(body) }
}

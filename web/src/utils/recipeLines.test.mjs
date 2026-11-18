// Run with: node src/utils/recipeLines.test.mjs
import assert from 'node:assert/strict'
import { isGroupHeading, headingText, countItems, stepNumbers } from './recipeLines.js'

// --- what is and isn't a title ----------------------------------------------
assert.equal(isGroupHeading('לרוטב:'), true)
assert.equal(isGroupHeading('For the sauce:'), true)
assert.equal(isGroupHeading('מכינים את העוף:'), true)
assert.equal(isGroupHeading('  להקפצה:  '), true, 'surrounding spaces')
assert.equal(isGroupHeading('לזיגוג：'), true, 'full-width colon')
assert.equal(isGroupHeading('מלח: לפי הטעם'), false, 'colon in the middle is an ingredient')
assert.equal(isGroupHeading('2 cups flour'), false)
assert.equal(isGroupHeading(':'), false, 'a lone colon is nothing')
assert.equal(isGroupHeading(''), false)
assert.equal(isGroupHeading(null), false)
assert.equal(isGroupHeading('Mix everything in a large bowl and then prepare the following:'), false,
  'a long step ending in a colon is still a step')

assert.equal(isGroupHeading('2 cups flour, divided:'), false, 'opens with an amount: an ingredient')
assert.equal(isGroupHeading('½ כוס סוכר:'), false)
assert.equal(isGroupHeading('שלב 1:'), true, 'a number later in the line is fine')

// --- display text -------------------------------------------------------------
assert.equal(headingText('לרוטב:'), 'לרוטב')
assert.equal(headingText('For the sauce :'), 'For the sauce')

// --- counts and numbering (the General Tso's import) ---------------------------
const ing = ['לעוף ולמרינדה:', 'פרגית', 'סויה', 'לרוטב:', 'רסק', 'להקפצה:', 'שמן']
assert.equal(countItems(ing), 4)
assert.equal(countItems(undefined), 0)

const steps = ['מכינים את העוף:', 'משטחים', 'מערבבים', 'מסיימים את המנה:', 'מחממים מחבת', 'מגישים']
assert.deepEqual(stepNumbers(steps), [null, 1, 2, null, 3, 4], 'numbering runs on across groups')
assert.deepEqual(stepNumbers(['a', 'b']), [1, 2], 'no titles: unchanged')

console.log('recipeLines: all tests passed')

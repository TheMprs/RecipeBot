// Run with: node src/utils/importErrors.test.mjs
import assert from 'node:assert/strict'
import { importError, errorCodeFrom, looksLikeRecipeText } from './importErrors.js'

// --- every code the backend sends has both languages -----------------------------
for (const code of ['NOT_ALLOWED', 'RATE_MINUTE', 'RATE_DAY', 'RATE_GLOBAL', 'NO_LINK', 'TOO_LONG',
  'SITE_BLOCKED', 'NOT_A_PAGE', 'NO_RECIPE', 'AI_BUSY', 'FAILED']) {
  const en = importError(code, 'en'), he = importError(code, 'he')
  assert.equal(en.code, code)
  assert.ok(en.text.length > 10 && /[a-z]/i.test(en.text), `${code} en`)
  assert.ok(/[֐-׿]/.test(he.text), `${code} he is Hebrew`)
}

// --- unknown codes fall back instead of showing nothing ---------------------------
assert.equal(importError('SOMETHING_NEW', 'en').code, 'FAILED')
assert.equal(importError(undefined, 'he').code, 'FAILED')

// --- when "Paste text instead" is offered ------------------------------------------
assert.equal(importError('SITE_BLOCKED', 'en').paste, true)
assert.equal(importError('NO_RECIPE', 'en').paste, true)
assert.equal(importError('AI_BUSY', 'en').paste, true)
assert.equal(importError('RATE_DAY', 'en').paste, true, 'pasting costs no import')
assert.equal(importError('NOT_ALLOWED', 'en').paste, false)
assert.equal(importError('TOO_LONG', 'en').paste, false)
assert.equal(importError('NO_LINK', 'en', 'pancakes').paste, false, 'a stray word is not a recipe')

// --- a recipe pasted into the link box moves to the paste box ------------------------
const recipe = 'Pancakes\n2 eggs\n1 cup flour\nWhisk and fry.'
const moved = importError('NO_LINK', 'en', recipe)
assert.equal(moved.paste, true)
assert.equal(moved.pasteText, recipe, 'line breaks intact: carried over')
assert.match(moved.text, /paste-text box/)
const flattened = importError('NO_LINK', 'en', 'Pancakes 2 eggs 1 cup flour 1 cup milk Whisk everything together and fry in a hot pan.')
assert.equal(flattened.paste, true, 'a one-line field flattened it: still offered')
assert.equal(flattened.pasteText, '', 'but not pre-filled as one unsplittable line')
assert.equal(looksLikeRecipeText('Shakshuka 😋 https://site.com/r'), false, 'shared text with a link is a link')
assert.equal(looksLikeRecipeText('x'.repeat(80)), true)
assert.equal(importError('SITE_BLOCKED', 'en', recipe).pasteText, '', 'only NO_LINK carries the input over')

// --- reading the code from a response -------------------------------------------------
const res = (status, body) => ({ status, json: async () => { if (body === undefined) throw new Error('not json'); return body } })
assert.equal(await errorCodeFrom(res(422, { code: 'NO_RECIPE', message: '…' })), 'NO_RECIPE')
assert.equal(await errorCodeFrom(res(429)), 'RATE_DAY', 'older backend: plain-text 429')
assert.equal(await errorCodeFrom(res(403)), 'NOT_ALLOWED')
assert.equal(await errorCodeFrom(res(502)), 'FAILED', 'proxy error page')
assert.equal(await errorCodeFrom(res(400, { message: 'no code' })), 'FAILED')

console.log('importErrors: all tests passed')

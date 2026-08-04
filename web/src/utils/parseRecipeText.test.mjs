// Exercises the real parser (not a copy of it).
// Run with: node src/utils/parseRecipeText.test.mjs
import assert from 'node:assert/strict'
import { parseRecipeText } from './parseRecipeText.js'

// --- headers in both languages -------------------------------------------
{
  const r = parseRecipeText(`Shakshuka for two

Ingredients
2 tbsp olive oil
1 onion, diced
4 eggs

Instructions
Heat the oil in a wide pan over medium heat.
Make four wells and crack an egg into each.`)
  assert.equal(r.title, 'Shakshuka for two')
  assert.deepEqual(r.ingredients, ['2 tbsp olive oil', '1 onion, diced', '4 eggs'])
  assert.equal(r.instructions.length, 2)
  assert.match(r.instructions[0], /^Heat the oil/)
}

{
  const r = parseRecipeText(`שקשוקה

מצרכים
2 כפות שמן זית
בצל אחד
4 ביצים

אופן ההכנה
מחממים את השמן במחבת רחבה על אש בינונית.
שוברים ביצה לתוך כל גומה ומכסים.`)
  assert.equal(r.title, 'שקשוקה')
  assert.deepEqual(r.ingredients, ['2 כפות שמן זית', 'בצל אחד', '4 ביצים'])
  assert.equal(r.instructions.length, 2)
}

// Headers survive markdown, bullets and colons.
{
  const r = parseRecipeText(`Pancakes\n\n**Ingredients:**\n- 200g flour\n\n### Method\nMix everything and fry.`)
  assert.deepEqual(r.ingredients, ['200g flour'], 'bullet stripped, header matched through ** and :')
  assert.deepEqual(r.instructions, ['Mix everything and fry.'])
}

// Method first is still method.
{
  const r = parseRecipeText(`Quick eggs\n\nMethod\nBeat and fry them.\n\nIngredients\n2 eggs\nbutter`)
  assert.deepEqual(r.ingredients, ['2 eggs', 'butter'], 'sections keyed off the header, not the order')
  assert.deepEqual(r.instructions, ['Beat and fry them.'])
}

// --- one header ----------------------------------------------------------
{
  const r = parseRecipeText(`Omelette
3 eggs
knob of butter

Instructions
Beat the eggs with a fork until just combined.
Cook them gently, folding as they set.`)
  assert.equal(r.title, 'Omelette')
  assert.deepEqual(r.ingredients, ['3 eggs', 'knob of butter'], 'everything between title and header')
  assert.equal(r.instructions.length, 2)
}

// --- no header, blank-line blocks ---------------------------------------
{
  const r = parseRecipeText(`Garlic pasta

400g spaghetti
4 cloves garlic
olive oil

Boil the spaghetti in well salted water until al dente.
Meanwhile soften the sliced garlic in plenty of olive oil.
Toss the drained pasta through the garlic oil and serve.`)
  assert.equal(r.title, 'Garlic pasta')
  assert.deepEqual(r.ingredients, ['400g spaghetti', '4 cloves garlic', 'olive oil'])
  assert.equal(r.instructions.length, 3, 'prose block became the steps')
}

// --- no header, no blank lines: length finds the seam --------------------
{
  const r = parseRecipeText(`Toast
2 slices bread
butter
Toast the bread until it is golden on both sides.
Spread the butter while the toast is still hot.`)
  assert.equal(r.title, 'Toast')
  assert.deepEqual(r.ingredients, ['2 slices bread', 'butter'])
  assert.equal(r.instructions.length, 2)
}

// A single long ingredient must not open the method early.
{
  const r = parseRecipeText(`Salad
1 large ripe beefsteak tomato, cored and cut into wedges
salt
Toss everything together in a bowl and dress it well.
Leave it to sit for ten minutes before serving.`)
  assert.equal(r.ingredients.length, 2, 'the wordy tomato stayed an ingredient')
  assert.equal(r.instructions.length, 2)
}

// --- numbering ------------------------------------------------------------
{
  const r = parseRecipeText(`Rice\n\nIngredients\n1 cup rice\n2 cups water\n\nSteps\n1. Rinse the rice.\n2) Simmer covered for twelve minutes.\nStep 3: Rest it off the heat.`)
  assert.deepEqual(r.ingredients, ['1 cup rice', '2 cups water'], 'amounts keep their numbers')
  assert.deepEqual(r.instructions, ['Rinse the rice.', 'Simmer covered for twelve minutes.', 'Rest it off the heat.'],
    'step numbering stripped in all three forms')
}

// --- degenerate input -----------------------------------------------------
{
  const empty = parseRecipeText('')
  assert.deepEqual(empty, { title: '', ingredients: [], instructions: [] })
  assert.deepEqual(parseRecipeText(null), { title: '', ingredients: [], instructions: [] })
}

{
  const r = parseRecipeText('flour\nsugar\neggs')
  assert.equal(r.title, 'flour')
  assert.deepEqual(r.ingredients, ['sugar', 'eggs'], 'no steps invented from a bare list')
  assert.deepEqual(r.instructions, [])
}

{
  // A paragraph is not a title.
  const r = parseRecipeText('This is a long rambling introduction about my grandmother and the summer she taught me to make this, which is not a title.\n\nIngredients\nflour\n\nMethod\nBake it.')
  assert.equal(r.title, '', 'prose first line left alone rather than jammed into the name')
  assert.deepEqual(r.ingredients, ['flour'])
}

console.log('parseRecipeText: all assertions passed')

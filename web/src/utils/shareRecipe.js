import { isGroupHeading, stepNumbers } from './recipeLines.js'

// Builds the plain-text version of a recipe for sharing — same format the
// Telegram bot uses, built locally so sharing needs no backend call.
export function buildShareText(recipe) {
  const lines = [`🍽️ ${recipe.title}`, '']
  if (recipe.description) lines.push(recipe.description, '')
  lines.push('🛒 Ingredients:')
  // Group titles go on their own line, unbulleted and unnumbered, after a blank line.
  const title = (line, i) => { if (i > 0) lines.push(''); lines.push(line.trim()) }
  ;(recipe.ingredients || []).forEach((ingredient, i) =>
    isGroupHeading(ingredient) ? title(ingredient, i) : lines.push(`• ${ingredient}`))
  lines.push('', '📝 Instructions:')
  const numbers = stepNumbers(recipe.instructions)
  ;(recipe.instructions || []).forEach((step, i) =>
    numbers[i] === null ? title(step, i) : lines.push(`${numbers[i]}. ${step}`))
  lines.push('', `🔗 ${window.location.origin}/?r=${recipe.id}`)
  return lines.join('\n')
}

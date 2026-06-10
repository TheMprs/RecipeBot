// Builds the plain-text version of a recipe for sharing — same format the
// Telegram bot uses, built locally so sharing needs no backend call.
export function buildShareText(recipe) {
  const lines = [`🍽️ ${recipe.title}`, '']
  if (recipe.description) lines.push(recipe.description, '')
  lines.push('🛒 Ingredients:')
  for (const ingredient of recipe.ingredients || []) lines.push(`• ${ingredient}`)
  lines.push('', '📝 Instructions:')
  ;(recipe.instructions || []).forEach((step, i) => lines.push(`${i + 1}. ${step}`))
  lines.push('', `🔗 ${window.location.origin}/?r=${recipe.id}`)
  return lines.join('\n')
}

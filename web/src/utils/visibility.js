// The one fallback for a new recipe's visibility. Settings, the form and every save
// path read it here, so what Settings shows is what a new recipe actually gets.
export const DEFAULT_VISIBILITY = 'public'

export function defaultVisibility() {
  try { return localStorage.getItem('defaultRecipeVisibility') || DEFAULT_VISIBILITY }
  catch { return DEFAULT_VISIBILITY }
}

// Maps a Supabase `recipes` row (with optional embedded recipe_categories /
// recipe_likes) to the shape the app renders. Defensive on nullable fields so
// any fetch path can use it. Fields a caller doesn't embed come out as
// null/0/[] — spread and override for extras (likeCount ranking, authorUsername).
export function formatRecipe(r) {
  return {
    id: r.id,
    title: String(r.name || 'Unnamed'),
    description: r.description || '',
    ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
    instructions: Array.isArray(r.instructions) ? r.instructions : [],
    created_at: r.created_at,
    category: r.recipe_categories?.[0]?.categories?.name || null,
    categoryColor: r.recipe_categories?.[0]?.categories?.color || null,
    categoryColors: r.recipe_categories?.map(rc => rc.categories?.color).filter(Boolean) || [],
    caloriesPerServing: r.calories_per_serving,
    visibility: r.visibility,
    likeCount: r.recipe_likes?.length || 0,
    user_id: r.user_id,
    authorId: r.user_id,
  }
}

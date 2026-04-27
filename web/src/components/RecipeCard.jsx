import { Clock, Pencil, Trash2 } from 'lucide-react'

export function RecipeCard({ recipe, onSelect, onEdit, onDelete, showCategory = true }) {
  return (
    <div className="group relative w-full bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 border border-[#e8e4dc]/50">
      {/* Action buttons - top right corner */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onEdit(recipe)
          }}
          className="w-8 h-8 rounded-lg bg-white/90 backdrop-blur flex items-center justify-center text-[#7a7265] hover:text-[#c4785a] hover:bg-white transition-colors shadow-sm border border-[#e8e4dc]/50"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(recipe)
          }}
          className="w-8 h-8 rounded-lg bg-white/90 backdrop-blur flex items-center justify-center text-[#7a7265] hover:text-red-500 hover:bg-white transition-colors shadow-sm border border-[#e8e4dc]/50"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <button onClick={() => onSelect(recipe)} className="w-full text-left">
        {/* Header area with title */}
        <div className="px-5 pt-5 pb-4 border-b border-[#e8e4dc]/30">
          <h3 className="font-semibold text-[#3d3429] text-lg group-hover:text-[#c4785a] transition-colors line-clamp-1 pr-20">
            {recipe.title}
          </h3>
        </div>

        {/* Content area */}
        <div className="px-5 py-4">
          <p className="text-[#7a7265] text-sm line-clamp-2 mb-4">{recipe.description}</p>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-xs text-[#7a7265]">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {recipe.instructions.length * 5} min
              </span>
              <span className="flex items-center gap-1">{recipe.ingredients.length} ingredients</span>
            </div>
            {showCategory && (
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#f5f3ef] text-[#5a5248] flex-shrink-0">
                {recipe.category}
              </span>
            )}
          </div>
        </div>
      </button>
    </div>
  )
}
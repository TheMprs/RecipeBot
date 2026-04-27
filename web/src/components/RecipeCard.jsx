import { Pencil, Trash2 } from 'lucide-react'

export function RecipeCard({ recipe, onSelect, onEdit, onDelete, showCategory = true }) {
  const isRtl = recipe.direction === 'rtl'
  
  return (
    <div className="group relative w-full bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 border border-[#e8e4dc]/50 cursor-pointer" onClick={() => onSelect(recipe)}>
      {/* Header area with title and buttons */}
      <div className={`px-5 pt-5 pb-4 border-b border-[#e8e4dc]/30 flex items-center gap-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
        <h3 
          className="font-semibold text-[#3d3429] text-lg group-hover:text-[#c4785a] transition-colors line-clamp-1 flex-1"
          style={{
            direction: isRtl ? 'rtl' : 'ltr',
            textAlign: isRtl ? 'right' : 'left',
            unicodeBidi: 'plaintext'
          }}
        >
          {recipe.title}
        </h3>
        
        {/* Action buttons - inline */}
        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
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
      </div>

        {/* Content area */}
        <div className="px-5 py-4">
          <p className={`text-[#7a7265] text-sm line-clamp-2 mb-4 ${isRtl ? 'text-right' : 'text-left'}`} dir={isRtl ? 'rtl' : 'ltr'}>{recipe.description}</p>
          <div className={`items-center justify-between gap-4 ${isRtl ? 'flex-row-reverse' : ''}`} dir="ltr">
            <span className="flex items-center gap-1 text-xs text-[#7a7265]">{recipe.ingredients.length} ingredients</span>
            {showCategory && (
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#f5f3ef] text-[#5a5248] flex-shrink-0">
                {recipe.category}
              </span>
            )}
          </div>
        </div>
    </div>
  )
}
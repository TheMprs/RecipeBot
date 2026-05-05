import { useState } from 'react'
import { Share2 } from 'lucide-react'

export function RecipeCard({ recipe, language = 'en', onSelect, showCategory = true }) {
  const isRtl = language === 'he'
  const [copied, setCopied] = useState(false)

  const handleShare = async (e) => {
    e.stopPropagation()
    try {
      const res = await fetch(`/api/recipes/${encodeURIComponent(recipe.title)}/share`)
      const text = await res.text()
      const url = `${window.location.origin}/?recipe=${encodeURIComponent(recipe.title)}`
      const fullText = `${text}\n\n🔗 ${url}`

      if (navigator.share) {
        await navigator.share({ title: recipe.title, text: text, url: url })
      } else {
        await navigator.clipboard.writeText(fullText)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch (err) {}
  }

  return (
    <div className="group relative w-full bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 border border-[#e8e4dc]/50 cursor-pointer flex flex-col" onClick={() => onSelect(recipe)}>
      {/* Header area with title and buttons */}
      <div className={`px-5 pt-5 pb-1 border-b border-[#e8e4dc]/30 flex items-center gap-3`} style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
        <h3 className={`font-semibold text-[#3d3429] text-lg group-hover:text-[#b86535] transition-colors line-clamp-1 ${isRtl ? 'text-right' : 'text-left'} flex-1`}>
          {recipe.title}
        </h3>
        
        {/* Action button */}
        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={handleShare}
            className="w-8 h-8 rounded-lg bg-white/90 backdrop-blur flex items-center justify-center text-[#7a7265] hover:text-[#b86535] hover:bg-white transition-colors shadow-sm border border-[#e8e4dc]/50"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="px-5 py-4 flex flex-col flex-grow">
        <p className={`text-[#7a7265] text-sm line-clamp-2 flex-grow ${isRtl ? 'text-right' : 'text-left'}`}>
          {recipe.description}
        </p>
        
          <div className="border-t border-[#e8e4dc] pt-2 mt-2">

          <div className={`flex justify-between`} style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
            <span className={ `flex text-xs text-[#7a7265]` }>
              {recipe.ingredients.length} {language === 'en' ? 'ingredients' : 'מצרכים'}
            </span>
            </div>
          </div>
        </div>
      </div>
  )
}
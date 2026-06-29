import { useState } from 'react'
import { Share2, Heart, Carrot } from 'lucide-react'
import { buildShareText } from '../utils/shareRecipe'
import { MarbleSpine } from './MarbleSpine'
import { ShareQR } from './ShareQR'
import { SaveToMenu } from './SaveToMenu'

export function RecipeCardSkeleton() {
  return (
    <div className="w-full bg-white rounded-2xl overflow-hidden border border-[#e8e4dc]/50 flex flex-col animate-pulse">
      <div className="px-5 pt-5 pb-1 border-b border-[#e8e4dc]/30 flex items-center gap-3">
        <div className="h-8 bg-[#e8e4dc] rounded-lg flex-1" />
        <div className="w-8 h-8 flex-shrink-0" />
      </div>
      <div className="px-5 py-4 flex flex-col flex-grow">
        <div className="h-5 bg-[#e8e4dc] rounded w-3/4 flex-grow" />
        <div className="border-t border-[#e8e4dc] pt-2 mt-2">
          <div className="flex justify-between items-center">
            <div className="h-4 bg-[#e8e4dc] rounded w-1/4" />
            <div className="h-4 bg-[#e8e4dc] rounded w-1/6" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function RecipeCard({ recipe, language = 'en', apiBase = '/api', onSelect, showCategory = true, likeCount, authorUsername, authorId, onSelectAuthor, userCategories, currentRecipeCategories, onToggleRecipeCategory, onCreateCategory }) {
  const isRtl = language === 'he'
  const [copied, setCopied] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)

  const handleShare = async (e) => {
    e?.stopPropagation()
    try {
      const fullText = buildShareText(recipe)

      if (navigator.share) {
        await navigator.share({ title: recipe.title, text: fullText })
      } else {
        await navigator.clipboard.writeText(fullText)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch (err) {}
  }

  // null color = intentional "no color" → plain white header.
  const color = recipe.categoryColor
  const spineColors = recipe.categoryColors?.length ? recipe.categoryColors : (color ? [color] : [])

  return (
    // OUTER is the static hover target (no transform) + holds the shadow unclipped — so the
    // lift never moves the card out from under the cursor (that oscillation was the stutter),
    // and clip-path on the inner doesn't clip the shadow off.
    // INNER does the visual lift and uses clip-path to keep the colored spine inside the
    // rounded corners while transformed (plain overflow+radius leaks the spine past the
    // corner during a transform in Chrome).
    <div
      className="group relative w-full h-full rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300 cursor-pointer flex flex-col"
      onClick={() => onSelect(recipe)}
    >
      <div className="relative flex-1 bg-white border border-[#e8e4dc]/50 flex flex-col group-hover:-translate-y-0.5 transition-transform duration-300" style={{ clipPath: 'inset(0 round 1rem)' }}>
      <MarbleSpine colors={spineColors} id={recipe.id} />
      {showQR && <ShareQR recipe={recipe} language={language} copied={copied} onShare={handleShare} onClose={() => setShowQR(false)} />}
      {/* Header — color lives on the left spine (card border), so the header stays plain white. */}
      <div className="px-5 pt-5 pb-1 border-b border-[#e8e4dc]/30 flex items-center gap-3" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
        <h3 className={`font-semibold text-[#3d3429] text-lg group-hover:text-[#cf711f] transition-colors line-clamp-1 ${isRtl ? 'text-right' : 'text-left'} flex-1`}>
          {recipe.title}
        </h3>

        {/* Action button — faintly visible on touch, hover-only on desktop */}
        <div className={`flex items-center gap-1.5 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0 ${saveOpen ? 'sm:opacity-100' : ''}`}>
          {onToggleRecipeCategory && (
            <SaveToMenu
              compact
              recipe={recipe}
              language={language}
              accent={color || undefined}
              userCategories={userCategories}
              currentRecipeCategories={currentRecipeCategories}
              onToggleRecipeCategory={onToggleRecipeCategory}
              onCreateCategory={onCreateCategory}
              onOpenChange={setSaveOpen}
            />
          )}
          <button
            onClick={e => { e.stopPropagation(); setShowQR(true) }}
            className="w-8 h-8 rounded-lg bg-white/80 backdrop-blur flex items-center justify-center text-[#7a7265] hover:text-[#cf711f] hover:bg-white transition-colors shadow-sm border border-[#e8e4dc]/50"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="px-5 py-4 flex flex-col flex-grow">
        <p className={`text-[#7a7265] text-sm line-clamp-1 flex-grow ${isRtl ? 'text-right' : 'text-left'}`}>
          {recipe.description}
        </p>

          <div className="border-t border-[#e8e4dc] pt-2 mt-2">
            <div className="flex justify-between items-center gap-2" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
              <div className="flex items-center gap-2 min-w-0">
                {showCategory && recipe.category && (
                  <span className="text-[11px] font-semibold uppercase tracking-wide truncate" style={{ color: color || '#a39b8d' }}>
                    {recipe.category}
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs text-[#7a7265] flex-shrink-0" title={language === 'en' ? 'ingredients' : 'מצרכים'}>
                  <Carrot className="w-3.5 h-3.5" />
                  {recipe.ingredients.length}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {authorUsername && (
                  <button
                    onClick={e => { e.stopPropagation(); onSelectAuthor && onSelectAuthor(authorId) }}
                    className="text-xs text-[#7a7265] hover:text-[#e67e22] transition-colors"
                  >
                    <span dir="ltr">@{authorUsername}</span>
                  </button>
                )}
                {likeCount > 0 && (
                  <span className="flex items-center gap-1 text-xs text-[#7a7265]">
                    <Heart className="w-3 h-3 fill-red-400 text-red-400" />
                    {likeCount}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
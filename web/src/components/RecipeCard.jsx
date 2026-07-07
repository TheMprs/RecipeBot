import { useState } from 'react'
import { Share2, Heart, Carrot } from 'lucide-react'
import { buildShareText } from '../utils/shareRecipe'
import { MarbleSpine } from './MarbleSpine'
import { ShareQR } from './ShareQR'
import { SaveToMenu } from './SaveToMenu'

export function RecipeCardSkeleton({ feed = false }) {
  return (
    <div className="w-full bg-white rounded-2xl overflow-hidden border border-border/50 flex flex-col animate-pulse">
      <div className="px-5 pt-5 pb-1 border-b border-border/30 flex items-center gap-3">
        <div className="h-8 bg-border rounded-lg flex-1" />
        <div className="w-8 h-8 flex-shrink-0" />
      </div>
      <div className="px-5 py-4 flex flex-col flex-grow">
        <div className="h-5 bg-border rounded w-3/4 flex-grow" />
        {/* matches the ingredient-chips row on feed cards */}
        {feed && (
          <div className="flex items-center gap-1 mt-1">
            <div className="h-[18px] w-14 bg-border rounded-full" />
            <div className="h-[18px] w-12 bg-border rounded-full" />
            <div className="h-[18px] w-14 bg-border rounded-full" />
          </div>
        )}
        <div className="border-t border-border pt-2 mt-2">
          <div className="flex justify-between items-center">
            <div className="h-4 bg-border rounded w-1/4" />
            <div className="h-4 bg-border rounded w-1/6" />
          </div>
        </div>
      </div>
    </div>
  )
}

// Google avatar URLs carry a size suffix — request a tiny variant so feed avatars are ~1-2KB
function smallAvatar(url) {
  return url.replace(/=s\d+(-c)?$/, '=s64-c')
}

// Ingredient teaser: drop quantities, units and prep words, keep the noun phrase.
// ponytail: stopword list, not NLP — unknown units just show up in the chip, harmless
const TEASER_STOP = new Set([
  // en units & measures
  'cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons',
  'g', 'gr', 'gram', 'grams', 'kg', 'ml', 'l', 'liter', 'liters', 'litre', 'litres',
  'oz', 'lb', 'lbs', 'pound', 'pounds', 'pinch', 'dash', 'clove', 'cloves', 'can', 'cans',
  'pack', 'packet', 'slice', 'slices', 'piece', 'pieces', 'handful', 'half', 'quarter',
  // en prep & filler
  'chopped', 'diced', 'minced', 'sliced', 'grated', 'peeled', 'crushed', 'fresh', 'dried',
  'ground', 'large', 'small', 'medium', 'finely', 'roughly', 'thinly', 'optional',
  'a', 'an', 'the', 'of', 'to', 'taste', 'some', 'about',
  // he units & measures
  'כוס', 'כוסות', 'כף', 'כפות', 'כפית', 'כפיות', 'גרם', 'ק"ג', 'קילו', 'מ"ל', 'ליטר',
  'חבילה', 'חבילות', 'חבילת', 'קופסה', 'קופסת', 'פחית', 'שקית', 'שן', 'שיני', 'שיניים',
  'יחידה', 'יחידות', 'קורט', 'מעט', 'חצי', 'וחצי', 'רבע', 'ורבע', 'שליש', 'שני', 'שתי',
  'אחד', 'אחת', 'פרוסה', 'פרוסות', 'חתיכה', 'חתיכות', 'צרור', 'חופן', 'ראש', 'עלה', 'עלי',
  // he prep & filler
  'קצוץ', 'קצוצה', 'קצוצות', 'קצוצים', 'טרי', 'טרייה', 'טריים', 'יבש', 'יבשה', 'יבשים',
  'טחון', 'טחונה', 'טחונים', 'טחונות', 'פרוס', 'פרוסים', 'מגורר', 'מגוררת', 'מגוררים',
  'קלוף', 'קלופה', 'קלופים', 'קלופות', 'כתוש', 'כתושה', 'כתושים', 'כתושות',
  'חתוך', 'חתוכה', 'חתוכים', 'חתוכות', 'חצוי', 'חצויה', 'חצויים', 'חצויות',
  'קוביות', 'לקוביות', 'מקלות', 'למקלות', 'לרבעים',
  'מרוסק', 'מרוסקת', 'מרוסקים', 'מרוסקות', 'מעוך', 'מעוכה', 'מעוכות', 'מהול', 'מהולה', 'מהולות',
  'בשל', 'בשלה', 'בשלים', 'בשלות', 'רך', 'רכה', 'רכים', 'רכות', 'קר', 'קרה', 'קרים', 'קרות',
  'חם', 'חמה', 'חמים', 'רותח', 'רותחת', 'רותחים', 'פושר', 'פושרת', 'פושרים', 'חלוט', 'חלוטה',
  'גרוס', 'גרוסה', 'גדוש', 'גדושה', 'גדושות', 'מלא', 'מלאה', 'מלאות', 'דק', 'דקה', 'גס', 'גסה',
  'גדול', 'גדולה', 'גדולים', 'גדולות', 'קטן', 'קטנה', 'קטנים', 'קטנות',
  'בינוני', 'בינונית', 'בינוניים', 'בינוניות', 'שימורים', 'שטוחות', 'שטוחה',
  'אופציונלי', 'לפי', 'טעם', 'הטעם', 'של', 'או', 'עם', 'בלבד', 'לא', 'חובה', 'קריטי', 'אבל', 'עדיף',
])

function teaserWords(ingredients) {
  const out = []
  for (const line of ingredients) {
    const clean = String(line)
      .replace(/<[^>]*>/g, ' ')       // scraped lines can carry HTML tags
      .replace(/&[a-z]+;/gi, '"')     // …and entities (&rdquo; inside מ"ל etc.)
      .replace(/\([^)]*\)/g, ' ')     // parentheses are clarification, never the ingredient
    const isStop = (w) => TEASER_STOP.has(w) || (w.startsWith('ו') && TEASER_STOP.has(w.slice(1))) // וחתוכים = ו + חתוכים
    const words = clean.split(/[\s,()/.·–-]+/)
      .map(w => w.replace(/[^\p{L}"']/gu, ''))
      .filter(w => w.length > 1 && !isStop(w.toLowerCase()))
    const chip = words.slice(0, 2).join(' ').slice(0, 18)
    if (chip && !out.includes(chip)) out.push(chip)
    if (out.length === 3) break
  }
  return out
}

const RANK_BG = { 1: 'bg-brand', 2: 'bg-[#a89a84]', 3: 'bg-[#c4b49a]' }

export function RecipeCard({ recipe, language = 'en', apiBase = '/api', onSelect, showCategory = true, likeCount, authorUsername, authorId, authorAvatar, rank, feed = false, onSelectAuthor, userCategories, currentRecipeCategories, onToggleRecipeCategory, onCreateCategory }) {
  const isRtl = language === 'he'
  const [copied, setCopied] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)

  const teaser = feed ? teaserWords(recipe.ingredients || []) : []
  const isNew = feed && recipe.created_at && (Date.now() - new Date(recipe.created_at)) < 7 * 86400000

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
      {/* will-change keeps this permanently on its own compositor layer: without it, Chrome
          promotes the layer when the hover transform starts and demotes it when it ends, and
          each promote/demote re-rasterizes the gradient spine ~1 device px sideways (the
          multi-color hover stutter — verified with a controlled repro, 2026-07-02). */}
      <div className="relative flex-1 bg-white border border-border/50 flex flex-col group-hover:-translate-y-0.5 transition-transform duration-300 will-change-transform" style={{ clipPath: 'inset(0 round 1rem)' }}>
      <MarbleSpine colors={spineColors} id={recipe.id} />
      {showQR && <ShareQR recipe={recipe} language={language} copied={copied} onShare={handleShare} onClose={() => setShowQR(false)} />}
      {/* Header — color lives on the left spine (card border), so the header stays plain white. */}
      <div className="px-5 pt-5 pb-1 border-b border-border/30 flex items-center gap-3" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
        <h3 className={`font-semibold text-ink text-lg group-hover:text-brand-dark transition-colors line-clamp-1 ${isRtl ? 'text-right' : 'text-left'} flex-1`}>
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
            className="w-8 h-8 rounded-lg bg-white/80 backdrop-blur flex items-center justify-center text-muted hover:text-brand-dark hover:bg-white transition-colors shadow-sm border border-border/50"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="px-5 py-4 flex flex-col flex-grow">
        <p className={`text-muted text-sm line-clamp-1 flex-grow ${isRtl ? 'text-right' : 'text-left'}`}>
          {recipe.description}
        </p>

          {/* Ingredient teaser chips — feed cards only. Single line, never wraps: a second
              chip line would stretch every equal-height card in the carousel row. */}
          {teaser.length > 0 && (
            <div className="flex flex-nowrap items-center gap-1 mt-1 overflow-hidden" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
              {teaser.map(w => (
                <span key={w} className="px-2 py-0.5 rounded-full bg-[#f3efe7] text-[10px] font-semibold text-[#8a7a62] whitespace-nowrap flex-shrink-0">{w}</span>
              ))}
              {recipe.ingredients.length > teaser.length && (
                <span dir="ltr" className="text-[10px] font-semibold text-[#b3a891] flex-shrink-0">+{recipe.ingredients.length - teaser.length}</span>
              )}
            </div>
          )}

          <div className="border-t border-border pt-2 mt-2 relative">
            <div className="flex justify-between items-center gap-2" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
              <div className="flex items-center gap-2 min-w-0">
                {showCategory && recipe.category && (
                  <span className="text-[11px] font-semibold uppercase tracking-wide truncate" style={{ color: color || '#a39b8d' }}>
                    {recipe.category}
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs text-muted flex-shrink-0" title={language === 'en' ? 'ingredients' : 'מצרכים'}>
                  <Carrot className="w-3.5 h-3.5" />
                  {recipe.ingredients.length}
                </span>
                {isNew && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-[#7f9a5e] flex-shrink-0">
                    <i className="w-1.5 h-1.5 rounded-full bg-[#8fae6d] fresh-dot" />
                    {language === 'en' ? 'new' : 'חדש'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {authorUsername && (
                  <button
                    onClick={e => { e.stopPropagation(); onSelectAuthor && onSelectAuthor(authorId) }}
                    className="flex items-center gap-1.5 text-xs text-muted hover:text-brand transition-colors"
                  >
                    {feed && (
                      <span className="relative w-[18px] h-[18px] rounded-full bg-brand/10 overflow-hidden flex items-center justify-center flex-shrink-0">
                        <span className="text-[9px] font-bold text-brand">{authorUsername[0].toUpperCase()}</span>
                        {authorAvatar && (
                          <img
                            src={smallAvatar(authorAvatar)} alt="" referrerPolicy="no-referrer" loading="lazy"
                            onLoad={e => { e.currentTarget.style.opacity = 1 }}
                            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-200"
                            style={{ opacity: 0 }}
                          />
                        )}
                      </span>
                    )}
                    <span dir="ltr">@{authorUsername}</span>
                  </button>
                )}
                {likeCount > 0 && (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <Heart className="w-3 h-3 fill-red-400 text-red-400" />
                    {likeCount}
                  </span>
                )}
              </div>
            </div>
            {/* Hover reveal — desktop only, footer swaps to "Open recipe" */}
            {feed && (
              <div
                className="absolute inset-x-0 top-2 bottom-0 bg-white hidden sm:flex items-center justify-between text-xs font-bold text-brand-dark opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 pointer-events-none"
                style={{ direction: isRtl ? 'rtl' : 'ltr' }}
              >
                <span>{language === 'en' ? 'Open recipe' : 'פתח מתכון'}</span>
                <span>{isRtl ? '←' : '→'}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Rank flag — outside the clipped inner so it can overlap the top edge */}
      {feed && RANK_BG[rank] && (
        <span dir="ltr" className={`absolute -top-2 start-3 z-10 px-2 py-0.5 rounded-full text-[10px] font-extrabold text-white shadow-sm ${RANK_BG[rank]}`}>
          #{rank}
        </span>
      )}
    </div>
  )
}
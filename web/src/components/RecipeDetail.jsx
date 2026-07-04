import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, ArrowRight, Users, ChefHat, Check, Pencil, Trash2, RotateCcw, UtensilsCrossed, Share2, Heart, Copy, Bookmark, Plus, Flame, Lock, Globe } from 'lucide-react'
import { buildShareText } from '../utils/shareRecipe'
import { MarbleSpine } from './MarbleSpine'
import { playSizzle } from '../utils/sizzle'
import { ShareQR } from './ShareQR'
import { SaveToMenu } from './SaveToMenu'

const COOKIE_NAME_PREFIX = 'recipe_ingredients_'
const BRAND = '#e67e22'

function getCookie(name) {
  if (typeof document === 'undefined') return null
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null
  return null
}

function setCookie(name, value, days = 30) {
  if (typeof document === 'undefined') return
  const expires = new Date()
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000)
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`
}

// Checked-ingredient state, persisted per-recipe in a cookie.
function useCheckedIngredients(recipeId) {
  const cookieName = `${COOKIE_NAME_PREFIX}${recipeId}`
  const [checked, setChecked] = useState(() => {
    const saved = getCookie(cookieName)
    if (saved) {
      try { return new Set(JSON.parse(decodeURIComponent(saved))) } catch { return new Set() }
    }
    return new Set()
  })

  useEffect(() => {
    setCookie(cookieName, encodeURIComponent(JSON.stringify(Array.from(checked))))
  }, [checked, cookieName])

  const toggle = (item) => setChecked(prev => {
    const next = new Set(prev)
    next.has(item) ? next.delete(item) : next.add(item)
    return next
  })
  const clearAll = () => setChecked(new Set())

  return { checked, toggle, clearAll }
}

// Round icon chip used for stats + section headers, tinted by the page accent.
function IconChip({ icon: Icon, accent, size = 8 }) {
  const px = size === 8 ? 'w-8 h-8' : 'w-7 h-7'
  return (
    <span className={`${px} rounded-full flex items-center justify-center flex-shrink-0`} style={{ backgroundColor: `${accent}1a` }}>
      <Icon className="w-4 h-4" style={{ color: accent }} />
    </span>
  )
}

// One stat in the header card (servings / ingredients / calories).
function Stat({ icon, accent, children }) {
  return (
    <div className="flex items-center">
      <IconChip icon={icon} accent={accent} />
      <span className="ms-1">{children}</span>
    </div>
  )
}

// Plain action in the top toolbar (Dupe / Edit / Delete).
function ToolbarButton({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      dir="ltr"
      className={`flex items-center gap-2 px-3 py-2 text-sm rounded-xl transition-colors ${danger ? 'text-[#7a7265] hover:text-red-500 hover:bg-red-50' : 'text-[#7a7265] hover:text-[#e67e22] hover:bg-[#faf9f7]'}`}
    >
      <Icon className="w-4 h-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

function IngredientsCard({ recipe, language, accent, checked, toggle, clearAll }) {
  return (
    <div className="lg:col-span-2">
      <div className="bg-white rounded-3xl border border-[#e8e4dc]/60 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-3">
          <IconChip icon={UtensilsCrossed} accent={accent} size={7} />
          <h2 className="text-lg font-semibold text-[#3d3429] flex-1">
            {language === 'en' ? 'Ingredients' : 'מצרכים'}
          </h2>
          {checked.size > 0 && (
            <button onClick={clearAll} className="flex items-center gap-1.5 text-xs text-[#7a7265] hover:text-[#3d3429] transition-colors">
              <RotateCcw className="w-3 h-3" />
              Clear all
            </button>
          )}
        </div>
        <div className="space-y-3">
          {recipe.ingredients.map((ingredient, index) => {
            const isChecked = checked.has(ingredient)
            return (
              <div key={index} className="flex items-start gap-2">
                <div className="w-7 flex-shrink-0 flex items-center justify-center mt-0.5">
                  <button
                    onClick={() => toggle(ingredient)}
                    className="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200"
                    style={{ backgroundColor: isChecked ? accent : 'transparent', borderColor: isChecked ? accent : '#e8e4dc' }}
                  >
                    {isChecked && <Check className="w-3 h-3 text-white" />}
                  </button>
                </div>
                <span className={`text-sm transition-all duration-200 ${isChecked ? 'text-[#a39b8d] line-through' : 'text-[#3d3429]/85'}`}>
                  {ingredient}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function InstructionsCard({ recipe, language, isRtl, accent }) {
  return (
    <div className="lg:col-span-3">
      <div className="bg-white rounded-3xl border border-[#e8e4dc]/60 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-[#3d3429] mb-6 flex items-center">
          <IconChip icon={ChefHat} accent={accent} size={7} />
          <span className="ms-2">
            {language === 'en' ? 'Instructions' : 'הוראות'}
          </span>
        </h2>
        <ol className="w-full list-none p-0 m-0">
          {recipe.instructions.map((instruction, index) => (
            <li key={index} className={`relative pb-8 last:pb-0 ${isRtl ? 'pr-16' : 'pl-16'}`}>
              {/* Big ghost step number, tinted by the accent */}
              <span
                className={`absolute top-[-0.15em] text-5xl font-bold leading-none z-0 ${isRtl ? 'right-0' : 'left-0'}`}
                style={{ color: `${accent}33` }}
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              {/* The instruction content */}
              <p className="relative z-10 text-[#3d3429]/85 leading-relaxed pt-1 m-0">
                {instruction}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

export function RecipeDetail({ recipe, language = 'en', apiBase = '/api', onBack, onEdit, onDelete, onMarkMade, cookCount = 0, likeCount = 0, isLiked = false, onToggleLike, onDuplicate, onSelectAuthor, userCategories = [], currentRecipeCategories = [], onToggleRecipeCategory, onCreateCategory }) {
  const isRtl = language === 'he'
  const [showQR, setShowQR] = useState(false)
  const [copied, setCopied] = useState(false)
  const [marked, setMarked] = useState(false)
  const { checked, toggle, clearAll } = useCheckedIngredients(recipe.id)

  const handleMarkMade = () => {
    if (!onMarkMade) return
    playSizzle()
    onMarkMade(recipe)
    setMarked(true)
    setTimeout(() => setMarked(false), 1500)
  }

  const handleShare = async () => {
    try {
      const fullText = buildShareText(recipe)
      if (navigator.share) {
        await navigator.share({ title: recipe.title, text: fullText })
      } else {
        await navigator.clipboard.writeText(fullText)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch (err) {
      // User cancelled share or clipboard failed
    }
  }

  // Category colors for the page: live saved categories, falling back to the recipe's own field.
  const savedCats = currentRecipeCategories.map(id => userCategories.find(c => c.id === id)).filter(Boolean)
  const catChips = savedCats.length
    ? savedCats.map(c => ({ name: c.name, color: c.color }))
    : (recipe.category ? [{ name: recipe.category, color: recipe.categoryColor }] : [])
  const detailColor = catChips.find(c => c.color)?.color || null
  // One accent drives the whole page; brand orange when the recipe has no category color.
  const accent = detailColor || BRAND
  // Marbled spine blends every category color.
  const spineColors = catChips.map(c => c.color).filter(Boolean)

  const calories = recipe.caloriesPerServing ?? recipe.calories_per_serving

  return (
    <div className="max-w-3xl mx-auto" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
      {showQR && <ShareQR recipe={recipe} language={language} copied={copied} onShare={handleShare} onClose={() => setShowQR(false)} />}
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-2">
        <button onClick={onBack} className="flex items-center gap-2 text-[#7a7265] hover:text-[#3d3429] transition-colors">
          {isRtl ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
          <span className="font-medium">Back</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowQR(true)}
            dir="ltr"
            className="flex items-center gap-2 px-3 py-2 text-sm text-[#7a7265] hover:text-[#cf711f] hover:bg-[#faf9f7] rounded-xl transition-colors"
          >
            <Share2 className="w-4 h-4" />
            <span className="hidden sm:inline">Share</span>
          </button>
          {onToggleRecipeCategory && (
            <SaveToMenu
              recipe={recipe}
              language={language}
              accent={accent}
              userCategories={userCategories}
              currentRecipeCategories={currentRecipeCategories}
              onToggleRecipeCategory={onToggleRecipeCategory}
              onCreateCategory={onCreateCategory}
            />
          )}
          {onDuplicate && <ToolbarButton icon={Copy} label="Dupe" onClick={() => onDuplicate(recipe)} />}
          {onEdit && <ToolbarButton icon={Pencil} label="Edit" onClick={() => onEdit(recipe)} />}
          {onDelete && <ToolbarButton icon={Trash2} label="Delete" onClick={() => onDelete(recipe)} danger />}
        </div>
      </div>

      {/* Recipe Header Card — marbled left spine blends the category colors (matches the cards) */}
      <div className="relative bg-white rounded-3xl border border-[#e8e4dc]/60 shadow-sm overflow-hidden mb-3">
        <MarbleSpine colors={spineColors} id={recipe.id} />
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4 mb-4 w-full">
            <div>
              {catChips.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {catChips.map(({ name, color }) => (
                    <span
                      key={name}
                      className="inline-block px-3 py-1 rounded-full text-xs font-semibold"
                      style={color ? { backgroundColor: `${color}1f`, color } : { backgroundColor: '#faf9f7', color: '#7a7265' }}
                    >
                      {name}
                    </span>
                  ))}
                </div>
              )}
              <h1 className="text-2xl sm:text-3xl font-bold text-[#3d3429] text-balance">
                {recipe.title}
                {recipe.visibility && (
                  <span
                    className="inline-block align-middle ms-2 -translate-y-0.5 text-[#a39b8d]"
                    title={recipe.visibility === 'public'
                      ? (language === 'en' ? 'Public' : 'ציבורי')
                      : (language === 'en' ? 'Private' : 'פרטי')}
                  >
                    {recipe.visibility === 'public'
                      ? <Globe className="w-[15px] h-[15px]" />
                      : <Lock className="w-[15px] h-[15px]" />}
                  </span>
                )}
              </h1>
              {recipe.authorUsername && (
                <button
                  onClick={() => onSelectAuthor && onSelectAuthor(recipe.authorId)}
                  className="mt-1.5 text-sm text-[#7a7265] hover:text-[#e67e22] transition-colors"
                >
                  <span dir="ltr">@{recipe.authorUsername}</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {onToggleLike && (
                <button
                  onClick={() => onToggleLike(recipe.id)}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-2xl border transition-all duration-200 ${isLiked ? 'bg-red-50 border-red-200 text-red-500' : 'bg-[#faf9f7] border-[#e8e4dc] text-[#7a7265] hover:border-red-200 hover:text-red-400'}`}
                >
                  <Heart className={`w-5 h-5 ${isLiked ? 'fill-red-500' : ''}`} />
                  <span className="text-xs font-medium leading-none">{likeCount > 0 ? likeCount : '—'}</span>
                </button>
              )}
              {onMarkMade && (
                <button
                  onClick={handleMarkMade}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-2xl border transition-all duration-200 ${marked ? 'bg-green-50 border-green-200 text-green-500' : 'bg-[#faf9f7] border-[#e8e4dc] text-[#7a7265] hover:border-[#e67e22]/50 hover:text-[#e67e22]'}`}
                >
                  <ChefHat className="w-5 h-5" />
                  <span dir="ltr" className="flex items-center justify-center h-3 text-xs font-medium leading-none">
                    {marked ? <Check className="w-3 h-3" strokeWidth={3} /> : cookCount > 0 ? `×${cookCount}` : '—'}
                  </span>
                </button>
              )}
            </div>
          </div>

          <p className="text-[#7a7265] leading-relaxed mb-6">{recipe.description}</p>

          <div className={`flex flex-wrap items-center gap-4 sm:gap-6 text-sm text-[#7a7265] ${isRtl ? 'text-right' : 'text-left'}`}>
            <Stat icon={Users} accent={accent}>{language === 'en' ? '4 servings' : '4 מנות'}</Stat>
            <Stat icon={ChefHat} accent={accent}>{language === 'en' ? `${recipe.ingredients.length} ingredients` : `${recipe.ingredients.length} מצרכים`}</Stat>
            {/* calories_per_serving — shows once the field is populated; null/absent until calc lands */}
            {calories != null && (
              <Stat icon={Flame} accent={accent}>≈ {calories} {language === 'en' ? 'kcal / serving' : 'קלוריות / מנה'}</Stat>
            )}
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <IngredientsCard recipe={recipe} language={language} accent={accent} checked={checked} toggle={toggle} clearAll={clearAll} />
        <InstructionsCard recipe={recipe} language={language} isRtl={isRtl} accent={accent} />
      </div>
    </div>
  )
}

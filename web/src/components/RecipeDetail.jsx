import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, ArrowRight, Users, ChefHat, Check, Pencil, Trash2, RotateCcw, UtensilsCrossed, Share2, Heart, Copy, Bookmark, Plus } from 'lucide-react'
import { buildShareText } from '../utils/shareRecipe'

const COOKIE_NAME_PREFIX = 'recipe_ingredients_'


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

export function RecipeDetail({ recipe, language = 'en', apiBase = '/api', onBack, onEdit, onDelete, onMarkMade, cookCount = 0, likeCount = 0, isLiked = false, onToggleLike, onDuplicate, onSelectAuthor, userCategories = [], currentRecipeCategories = [], onToggleRecipeCategory, onCreateCategory }) {
  const cookieName = `${COOKIE_NAME_PREFIX}${recipe.id}`
  const isRtl = language === 'he'
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [newCategoryInput, setNewCategoryInput] = useState('')
  const categoryDropdownRef = useRef(null)

  const [checkedIngredients, setCheckedIngredients] = useState(() => {
    const saved = getCookie(cookieName)
    if (saved) {
      try {
        const parsed = JSON.parse(decodeURIComponent(saved))
        return new Set(parsed)
      } catch {
        return new Set()
      }
    }
    return new Set()
  })

  useEffect(() => {
    const value = JSON.stringify(Array.from(checkedIngredients))
    setCookie(cookieName, encodeURIComponent(value))
  }, [checkedIngredients, cookieName])

  const toggleIngredient = (ingredientText) => {
    setCheckedIngredients((prev) => {
    const newSet = new Set(prev)
    if (newSet.has(ingredientText)) {
      newSet.delete(ingredientText)
    } else {
      newSet.add(ingredientText)
    }
    return newSet
  })
}

  const clearAllIngredients = () => {
    setCheckedIngredients(new Set())
  }

  const [copied, setCopied] = useState(false)
  const [marked, setMarked] = useState(false)

  useEffect(() => {
    const handler = (e) => { if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target)) setShowCategoryDropdown(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleMarkMade = () => {
    if (!onMarkMade) return
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

  return (
    <div className="max-w-3xl mx-auto" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-2">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[#64748b] hover:text-[#1e293b] transition-colors"
        >
          {isRtl ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
          <span className="font-medium">{language === 'en' ? 'Back' : 'חזור'}</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            className="flex items-center gap-2 px-3 py-2 text-sm text-[#64748b] hover:text-[#ce743e] hover:bg-[#f8fafc] rounded-xl transition-colors"
          >
            <Share2 className="w-4 h-4" />
            <span className="hidden sm:inline">{copied ? 'Copied!' : 'Share'}</span>
          </button>
          {onToggleRecipeCategory && (
            <div className="relative" ref={categoryDropdownRef}>
              <button
                onClick={() => setShowCategoryDropdown(v => !v)}
                className={`flex items-center gap-2 px-3 py-2 text-sm rounded-xl transition-colors ${
                  currentRecipeCategories.length > 0 ? 'text-[#ce743e] bg-[#ce743e]/10' : 'text-[#64748b] hover:text-[#ce743e] hover:bg-[#f8fafc]'
                }`}
              >
                <Bookmark className={`w-4 h-4 ${currentRecipeCategories.length > 0 ? 'fill-[#ce743e]' : ''}`} />
                <span className="hidden sm:inline">{language === 'en' ? 'Save to' : 'שמור'}</span>
              </button>
              {showCategoryDropdown && (
                <div className={`absolute top-full mt-2 z-50 bg-white border border-[#e8e4dc] rounded-2xl shadow-lg overflow-hidden min-w-[200px] ${isRtl ? 'right-0' : 'left-0'}`}>
                  {userCategories.length === 0 && !onCreateCategory && (
                    <p className="px-4 py-3 text-sm text-[#7a7265]">{language === 'en' ? 'No categories yet' : 'אין קטגוריות עדיין'}</p>
                  )}
                  {userCategories.map(cat => {
                    const isSaved = currentRecipeCategories.includes(cat.id)
                    return (
                      <button
                        key={cat.id}
                        onClick={() => onToggleRecipeCategory(recipe.id, cat.id)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[#f5f3ef] ${isRtl ? 'text-right flex-row-reverse' : 'text-left'}`}
                      >
                        <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors ${isSaved ? 'bg-[#ce743e] border-[#ce743e]' : 'border-[#e2e8f0]'}`}>
                          {isSaved && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <span className="text-[#3d3429]">{cat.name}</span>
                      </button>
                    )
                  })}
                  {onCreateCategory && (
                    <form
                      onSubmit={async e => {
                        e.preventDefault()
                        const val = newCategoryInput.trim()
                        if (!val) return
                        const newCat = await onCreateCategory(val)
                        if (newCat) onToggleRecipeCategory(recipe.id, newCat.id)
                        setNewCategoryInput('')
                      }}
                      className="border-t border-[#e8e4dc] px-3 py-2 flex items-center gap-2"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#7a7265] flex-shrink-0" />
                      <input
                        value={newCategoryInput}
                        onChange={e => setNewCategoryInput(e.target.value)}
                        placeholder={language === 'en' ? 'New category...' : 'קטגוריה חדשה...'}
                        className="flex-1 text-sm text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none bg-transparent"
                      />
                    </form>
                  )}
                </div>
              )}
            </div>
          )}
          {onDuplicate && (
            <button
              onClick={() => onDuplicate(recipe)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-[#64748b] hover:text-[#e67e22] hover:bg-[#f8fafc] rounded-xl transition-colors"
            >
              <Copy className="w-4 h-4" />
              <span className="hidden sm:inline">{language === 'en' ? 'Dupe' : 'שכפל'}</span>
            </button>
          )}
          {onEdit && (
            <button
              onClick={() => onEdit(recipe)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-[#64748b] hover:text-[#e67e22] hover:bg-[#f8fafc] rounded-xl transition-colors"
            >
              <Pencil className="w-4 h-4" />
              <span className="hidden sm:inline">Edit</span>
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(recipe)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-[#64748b] hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Delete</span>
            </button>
          )}
        </div>
      </div>

      {/* Recipe Header Card */}
      <div className="bg-white rounded-3xl border border-[#e2e8f0]/50 shadow-sm overflow-hidden mb-3">
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4 mb-4 w-full">
            <div>
              <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-[#f8fafc] text-[#5a5248] mb-3">
                {recipe.category}
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold text-[#1e293b] text-balance">
                {recipe.title}
              </h1>
              {recipe.authorUsername && (
                <button
                  onClick={() => onSelectAuthor && onSelectAuthor(recipe.authorId)}
                  className="mt-1.5 text-sm text-[#7a7265] hover:text-[#e67e22] transition-colors"
                >
                  @{recipe.authorUsername}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {onToggleLike && (
                <button
                  onClick={() => onToggleLike(recipe.id)}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-2xl border transition-all duration-200 ${
                    isLiked
                      ? 'bg-red-50 border-red-200 text-red-500'
                      : 'bg-[#faf9f7] border-[#e8e4dc] text-[#7a7265] hover:border-red-200 hover:text-red-400'
                  }`}
                >
                  <Heart className={`w-5 h-5 ${isLiked ? 'fill-red-500' : ''}`} />
                  <span className="text-xs font-medium leading-none">{likeCount > 0 ? likeCount : '—'}</span>
                </button>
              )}
              {onMarkMade && (
                <button
                  onClick={handleMarkMade}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-2xl border transition-all duration-200 ${
                    marked
                      ? 'bg-[#e67e22] border-[#e67e22] text-white'
                      : 'bg-[#faf9f7] border-[#e8e4dc] text-[#7a7265] hover:border-[#e67e22]/50 hover:text-[#e67e22]'
                  }`}
                >
                  <ChefHat className="w-5 h-5" />
                  <span className="text-xs font-medium leading-none">
                    {marked ? (language === 'en' ? 'Logged!' : 'נרשם!') : cookCount > 0 ? `${cookCount}×` : (language === 'en' ? 'Made it' : 'הכנתי')}
                  </span>
                </button>
              )}
            </div>
          </div>

          <p className={`text-[#64748b] leading-relaxed mb-6 `}>{recipe.description}</p>

          <div className={`flex flex-wrap items-center gap-4 sm:gap-6 text-sm text-[#64748b] ${isRtl ? 'text-right' : 'text-left'}`}>
            <div className={`flex items-center gap-2}`}>
              <div className="w-8 h-8 rounded-full bg-[#e67e22]/10 flex items-center justify-center">
                <Users className="w-4 h-4 text-[#e67e22]"/>
              </div>
              <span className="ms-1">{language === 'en' ? '4 servings' : '4 מנות'}</span>
            </div>
            <div className={`flex items-center gap-2}`}>
              <div className="w-8 h-8 rounded-full bg-[#e67e22]/10 flex items-center justify-center">
                <ChefHat className="w-4 h-4 text-[#e67e22]" />
              </div>
              <span className="ms-1">{language === 'en' ? `${recipe.ingredients.length} ingredients` : `${recipe.ingredients.length} מצרכים`}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        
        {/* Ingredients */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-3xl border border-[#e2e8f0]/50 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-full bg-[#e67e22]/10 flex items-center justify-center flex-shrink-0">
                <UtensilsCrossed className="w-4 h-4 text-[#e67e22]" />
              </div>
              <h2 className="text-lg font-semibold text-[#1e293b] flex-1">
                {language === 'en' ? 'Ingredients' : 'מצרכים'}
              </h2>
              {checkedIngredients.size > 0 && (
                <button onClick={clearAllIngredients} className="flex items-center gap-1.5 text-xs text-[#64748b] hover:text-[#1e293b] transition-colors">
                  <RotateCcw className="w-3 h-3" />
                  Clear all
                </button>
              )}
            </div>
            <div className="space-y-3">
              {recipe.ingredients.map((ingredient, index) => {
                const isChecked = checkedIngredients.has(ingredient)
                return (
                  <div key={index} className="flex items-start gap-2">
                    <div className="w-7 flex-shrink-0 flex items-center justify-center mt-0.5">
                      <button
                        onClick={() => toggleIngredient(ingredient)}
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${
                          isChecked ? 'bg-[#e67e22] border-[#e67e22]' : 'border-[#e2e8f0] hover:border-[#e67e22]/50'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3 text-white" />}
                      </button>
                    </div>
                    <span className={`text-sm transition-all duration-200 ${isChecked ? 'text-[#64748b] line-through' : 'text-[#1e293b]/80'}`}>
                      {ingredient}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-3xl border border-[#e2e8f0]/50 shadow-sm p-6">
            <h2 className={`text-lg font-semibold text-[#1e293b] mb-6 flex items-center gap-2}`}>
              <span className="w-7 h-7 rounded-full bg-[#e67e22]/10 flex items-center justify-center">
                <ChefHat className="w-4 h-4 text-[#e67e22]" />
              </span>
              <span className="ms-2">
                {language === 'en' ? 'Instructions' : 'הוראות'}
              </span>
            </h2>
            <ol className={`w-full list-none p-0 m-0`}>
              {recipe.instructions.map((instruction, index) => (
                <li 
                  key={index} 
                  className={`relative pb-8 last:pb-0 ${isRtl ? 'pr-16' : 'pl-16'}`}
                >
                  {/* The custom large number background */}
                  <span 
                    className={`absolute top-[-0.15em] text-5xl font-bold leading-none text-[#e2e8f0] z-0 ${
                      isRtl ? 'right-0' : 'left-0'
                    }`}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  
                  {/* The instruction content */}
                  <p className="relative z-10 text-[#1e293b]/80 leading-relaxed pt-1 m-0">
                    {instruction}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
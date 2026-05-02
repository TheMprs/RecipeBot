import { useState, useEffect } from 'react'
import { ArrowLeft, Users, ChefHat, Check, Pencil, Trash2, RotateCcw, UtensilsCrossed} from 'lucide-react'

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

export function RecipeDetail({ recipe, language = 'en', onBack, onEdit, onDelete }) {
  const cookieName = `${COOKIE_NAME_PREFIX}${recipe.id}`
  const isRtl = language === 'he'

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

  const toggleIngredient = (index) => {
    setCheckedIngredients((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }

  const clearAllIngredients = () => {
    setCheckedIngredients(new Set())
  }

  return (
    <div className="max-w-3xl mx-auto" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-2">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[#7a7265] hover:text-[#3d3429] transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Back</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(recipe)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-[#7a7265] hover:text-[#c4785a] hover:bg-[#f5f3ef] rounded-xl transition-colors"
          >
            <Pencil className="w-4 h-4" />
            <span className="hidden sm:inline">Edit</span>
          </button>
          <button
            onClick={() => onDelete(recipe)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-[#7a7265] hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">Delete</span>
          </button>
        </div>
      </div>

      {/* Recipe Header Card */}
      <div className="bg-white rounded-3xl border border-[#e8e4dc]/50 shadow-sm overflow-hidden mb-3">
        <div className="p-6 sm:p-8">
          <div className={`flex items-start mb-4 w-full`}>
            <div className="w-full">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-[#f5f3ef] text-[#5a5248] mb-3">
                {recipe.category}
              </span>
              <h1 
                className={`text-2xl sm:text-3xl font-bold text-[#3d3429] text-balance}`}
              >{recipe.title}</h1>
            </div>
          </div>

          <p className={`text-[#7a7265] leading-relaxed mb-6 `}>{recipe.description}</p>

          <div className={`flex flex-wrap items-center gap-4 sm:gap-6 text-sm text-[#7a7265] ${isRtl ? 'text-right' : 'text-left'}`}>
            <div className={`flex items-center gap-2}`}>
              <div className="w-8 h-8 rounded-full bg-[#c4785a]/10 flex items-center justify-center">
                <Users className="w-4 h-4 text-[#c4785a]"/>
              </div>
              <span className="ms-1">{language === 'en' ? '4 servings' : '4 מנות'}</span>
            </div>
            <div className={`flex items-center gap-2}`}>
              <div className="w-8 h-8 rounded-full bg-[#c4785a]/10 flex items-center justify-center">
                <ChefHat className="w-4 h-4 text-[#c4785a]" />
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
          <div className="bg-white rounded-3xl border border-[#e8e4dc]/50 shadow-sm p-6">
            <div className="flex gap-3">
              {/* Left column: emoji + checkboxes */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-[#c4785a]/10 flex items-center justify-center">
                  <UtensilsCrossed className="w-4 h-4 text-[#c4785a]" />
                </div>
                {recipe.ingredients.map((ingredient, index) => (
                  <button
                    key={index}
                    onClick={() => toggleIngredient(index)}
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${
                      checkedIngredients.has(index) ? 'bg-[#c4785a] border-[#c4785a]' : 'border-[#e8e4dc] hover:border-[#c4785a]/50'
                    }`}
                  >
                    {checkedIngredients.has(index) && <Check className="w-3 h-3 text-white" />}
                  </button>
                ))}
              </div>
    
            {/* Right column: title + ingredients */}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-[#3d3429]">
                    {language === 'en' ? 'Ingredients' : 'מצרכים'}
                  </h2>
                  {checkedIngredients.size > 0 && (
                    <button onClick={clearAllIngredients} className="flex items-center gap-1.5 text-xs text-[#7a7265] hover:text-[#3d3429] transition-colors">
                      <RotateCcw className="w-3 h-3" />
                      Clear all
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  {recipe.ingredients.map((ingredient, index) => {
                    const isChecked = checkedIngredients.has(index)
                    return (
                      <span key={index} className={`text-sm block transition-all duration-200 ${isChecked ? 'text-[#7a7265] line-through' : 'text-[#3d3429]/80'}`}>
                        {ingredient}
                      </span>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-3xl border border-[#e8e4dc]/50 shadow-sm p-6">
            <h2 className={`text-lg font-semibold text-[#3d3429] mb-6 flex items-center gap-2}`}>
              <span className="w-9 h-9 rounded-full bg-[#c4785a]/10 flex items-center justify-center">
                <ChefHat className="w-4 h-4 text-[#c4785a]" />
              </span>
              <span className="ms-2">
                {language === 'en' ? 'Instructions' : 'הוראות'}
              </span>
            </h2>
            <ol className="w-full">
              {recipe.instructions.map((instruction, index) => (
                <li key={index} className="flex mb-5 gap-4 items-baseline" style={{ display: 'flex', flexDirection: 'row-reverse'}}>
                  <span className="w-6 h-6 rounded-full bg-[#c4785a] text-white flex items-center justify-center flex-shrink-0 text-sm font-semibold" style={{ order: isRtl ? 2 : 1 }}>
                    {index + 1}
                  </span>
                  <p 
                    className={`text-[#3d3429]/80 leading-relaxed pt-1 flex-1 }`}
                  >{instruction}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
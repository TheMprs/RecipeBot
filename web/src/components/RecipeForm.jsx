import { useState, useEffect } from 'react'
import { ArrowLeft, LinkIcon, ChevronDown } from 'lucide-react'

// Split a free-typed blob (ingredients or instructions) into items: break on line breaks
// AND sentence endings (. ! ?) followed by whitespace. The lookbehind keeps the punctuation
// on each item, and requiring whitespace after the dot leaves decimals like "1.5" intact.
const splitSteps = (text) =>
  text.split(/\s*\n\s*|(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean)

export function RecipeForm({ onBack, onSave, editingRecipe, onOpenUrlModal, language = 'en', userCategories = [], onCreateCategory, cookCount = 0 }) {
  const isRtl = language === 'he'

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [ingredientsText, setIngredientsText] = useState('')
  const [instructionsText, setInstructionsText] = useState('')
  const [category, setCategory] = useState('')
  const [calories, setCalories] = useState('')
  const [showNewCatInput, setShowNewCatInput] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  // changes locally only; the net delta is applied on save. A retried save
  // carries its unsaved delta back in via editingRecipe.cookCountDelta.
  const [localCookCount, setLocalCookCount] = useState(cookCount + (editingRecipe?.cookCountDelta || 0))
  useEffect(() => { setLocalCookCount(cookCount + (editingRecipe?.cookCountDelta || 0)) }, [cookCount])
  const [countEditing, setCountEditing] = useState(false)
  const [countDraft, setCountDraft] = useState('')

  const commitCountDraft = () => {
    const n = parseInt(countDraft, 10)
    if (!isNaN(n) && n >= 0) setLocalCookCount(n)
    setCountEditing(false)
  }

  useEffect(() => {
    if (editingRecipe) {
      setTitle(editingRecipe.title)
      setDescription(editingRecipe.description)
      setIngredientsText(editingRecipe.ingredients.join('\n'))
      setInstructionsText(editingRecipe.instructions.join('\n'))
      setCategory(editingRecipe.category || '')
      setCalories(editingRecipe.caloriesPerServing != null ? String(editingRecipe.caloriesPerServing) : '')
    }
  }, [editingRecipe])

  const handleSubmit = (e) => {
    e.preventDefault()
    const ingredients = splitSteps(ingredientsText)
    const instructions = splitSteps(instructionsText)
    onSave({ title, description, ingredients, instructions, category: category || null, caloriesPerServing: calories === '' ? null : parseInt(calories, 10), cookCountDelta: localCookCount - cookCount })
  }

  return (
    <>
      <div className="max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-[#e8e4dc]/50 shadow-sm p-6 sm:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <button onClick={onBack}
            className="flex items-center gap-2 text-[#7a7265] hover:text-[#3d3429] transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Back</span>
          </button>
          <button
            type="button"
            onClick={onOpenUrlModal}
            className={`flex items-center gap-2 text-[#7a7265] hover:text-[#cf711f] transition-colors ${isRtl ? 'flex-row-reverse' : ''}`}
            title="Import recipe from link"
          >
            <LinkIcon className="w-5 h-5" />
            <span className="font-medium text-sm">{language === 'en' ? 'Import from link' : 'יבוא מקישור'}</span>
          </button>
        </div>

        <h1 className="text-center text-3xl font-bold text-[#3d3429]">
          {editingRecipe?.id ? (language === 'en' ? 'Edit Recipe' : 'עריכת מתכון')
                             : (language === 'en' ? 'Add New Recipe' : 'הוסף מתכון חדש')}
        </h1>

        <div style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
        <div className="border-t border-[#e8e4dc] pt-2 mt-2"/>

        <div className="space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-[#3d3429] mb-2">{language === 'en' ? 'Recipe Title' : 'שם המתכון'}</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={language === 'en' ? "e.g., Grandma's Apple Pie" : 'למשל, חלה של יובל'}
              required
              className="w-full px-[18px] py-3 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#cf711f]/20 focus:border-[#cf711f] transition-all"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-[#3d3429] mb-2">{language === 'en' ? 'Description' : 'תיאור'}</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={language === 'en' ? 'A brief description of your recipe...' : 'תיאור קצר של המתכון...'}
              rows={3}
              className="w-full px-[18px] py-3 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#cf711f]/20 focus:border-[#cf711f] transition-all resize-none"
            />
          </div>

          {/* Category + prepped count share one row */}
          <div className="flex gap-2 items-start">
          <div className="flex-1 min-w-0">
            <label className="block text-sm font-medium text-[#3d3429] mb-2">{language === 'en' ? 'Category' : 'קטגוריה'}</label>
            <div className="relative">
            <select
              value={showNewCatInput ? '__new__' : category}
              onChange={e => {
                if (e.target.value === '__new__') {
                  setShowNewCatInput(true)
                  setNewCatName('')
                } else {
                  setShowNewCatInput(false)
                  setCategory(e.target.value)
                }
              }}
              className="w-full appearance-none px-[18px] py-3 pr-10 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] focus:outline-none focus:ring-2 focus:ring-[#cf711f]/20 focus:border-[#cf711f] transition-all"
            >
              <option value="">{language === 'en' ? 'None' : 'ללא'}</option>
              {category && !userCategories.find(c => c.name === category) && (
                <option value={category}>{category}</option>
              )}
              {userCategories.map(cat => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
              {onCreateCategory && (
                <option value="__new__">{language === 'en' ? '＋ Add category…' : '＋ הוסף קטגוריה…'}</option>
              )}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7a7265]" />
            </div>
            {showNewCatInput && (
              <div className="flex gap-2 mt-2">
                <input
                  autoFocus
                  type="text"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={async e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const name = newCatName.trim()
                      if (!name) return
                      const newCat = await onCreateCategory(name)
                      if (newCat) setCategory(newCat.name)
                      setShowNewCatInput(false)
                      setNewCatName('')
                    } else if (e.key === 'Escape') {
                      setShowNewCatInput(false)
                      setNewCatName('')
                    }
                  }}
                  placeholder={language === 'en' ? 'Category name…' : 'שם קטגוריה…'}
                  className="flex-1 px-3 py-2 bg-[#faf9f7] border border-[#e8e4dc] rounded-xl text-sm text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#cf711f]/20 focus:border-[#cf711f] transition-all"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const name = newCatName.trim()
                    if (!name) return
                    const newCat = await onCreateCategory(name)
                    if (newCat) setCategory(newCat.name)
                    setShowNewCatInput(false)
                    setNewCatName('')
                  }}
                  className="px-4 py-2 bg-[#e67e22] text-white rounded-xl text-sm font-medium hover:bg-[#cf711f] transition-colors"
                >
                  {language === 'en' ? 'Add' : 'הוסף'}
                </button>
                <button type="button" onClick={() => { setShowNewCatInput(false); setNewCatName('') }} className="px-3 py-2 text-sm text-[#7a7265] hover:text-[#3d3429] transition-colors">
                  {language === 'en' ? 'Cancel' : 'בטל'}
                </button>
              </div>
            )}
          </div>

          {/* Calories per serving (manual for now; auto-calc later) */}
          <div className="shrink-0">
            <label className="block text-sm font-medium text-[#3d3429] mb-2">{language === 'en' ? 'Calories' : 'קלוריות / מנה'}</label>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={calories}
              onChange={e => setCalories(e.target.value)}
              placeholder="—"
              className="no-spinner w-28 text-center font-semibold bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl px-3 py-3 text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#cf711f]/20 focus:border-[#cf711f] transition-all"
            />
          </div>

          {/* Prepped count (existing recipes only) */}
          {editingRecipe?.id && (
            <div className="shrink-0">
              <label className="block text-sm font-medium text-[#3d3429] mb-2">{language === 'en' ? 'Times prepped' : 'מספר הכנות'}</label>
              <div className="inline-flex items-center gap-1 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => setLocalCookCount(c => Math.max(0, c - 1))}
                  disabled={localCookCount === 0}
                  className="w-9 h-9 rounded-xl text-lg font-semibold text-[#7a7265] hover:text-[#cf711f] hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  −
                </button>
                {countEditing ? (
                  <input
                    autoFocus
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={countDraft}
                    onChange={e => setCountDraft(e.target.value)}
                    onBlur={commitCountDraft}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); commitCountDraft() }
                      if (e.key === 'Escape') setCountEditing(false)
                    }}
                    className="no-spinner w-[2.5rem] text-center font-semibold text-[#3d3429] bg-transparent focus:outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => { setCountDraft(String(localCookCount)); setCountEditing(true) }}
                    className="min-w-[2.5rem] text-center font-semibold text-[#3d3429] hover:text-[#cf711f] transition-colors"
                  >
                    {localCookCount}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setLocalCookCount(c => c + 1)}
                  className="w-9 h-9 rounded-xl text-lg font-semibold text-[#7a7265] hover:text-[#cf711f] hover:bg-white transition-colors"
                >
                  +
                </button>
              </div>
            </div>
          )}
          </div>

          {/* Ingredients */}
          <div>
            <label className="block text-sm font-medium text-[#3d3429]">{language === 'en' ? 'Ingredients' : 'רכיבים'}</label>
            <p className="text-xs text-[#7a7265] mb-2">{language === 'en' ? 'Write naturally — ingredients are split by sentence and line break' : 'כתוב באופן חופשי — הרכיבים מתחלקים לפי משפטים ושורות'}</p>
            <textarea
              value={ingredientsText}
              onChange={e => setIngredientsText(e.target.value)}
              placeholder={language === 'en' ? '2 cups flour \n1 cup sugar \n3 eggs \n1/2 cup butter'
                                            : '2 כוסות קמח \n1 כוס סוכר \n3 ביצים \n1/2 כוס שמן'}
              rows={6}
              className="w-full px-[18px] py-3 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#cf711f]/20 focus:border-[#cf711f] transition-all resize-none"
            />
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-sm font-medium text-[#3d3429]">{language === 'en' ? 'Instructions' : 'הוראות'}</label>
            <p className="text-xs text-[#7a7265] mb-2">{language === 'en' ? 'Write naturally — steps are split by sentence and line break' : 'כתוב באופן חופשי — השלבים מתחלקים לפי משפטים ושורות'}</p>
            <textarea
              value={instructionsText}
              onChange={e => setInstructionsText(e.target.value)}
              placeholder={language === 'en' ?
                      'Preheat oven to 350F\nMix dry ingredients in a bowl\nAdd wet ingredients and stir\nPour into pan and bake for 30 minutes'
                    : 'מחמים תנור ל180 מעלות\nמערבבים את הרכיבים היבשים בקערה\nמוסיפים את הרכיבים הרטובים ומערבבים\nיוצקים לתבנית ואופים במשך 30 דקות'}
              rows={8}
              className="w-full px-[18px] py-3 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#cf711f]/20 focus:border-[#cf711f] transition-all resize-none"
            />
          </div>
        </div>

        {/* Submit Button */}
        <div className="mt-8 flex gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 py-3 px-4 border border-[#e8e4dc] text-[#7a7265] rounded-2xl font-medium hover:bg-[#f5f3ef] transition-colors"
          >
            {language === 'en' ? 'Cancel' : 'בטל'}
          </button>
          <button
            type="submit"
            className="flex-1 py-3 px-4 bg-[#e67e22] text-white rounded-2xl font-medium hover:bg-[#cf711f] transition-colors shadow-sm"
          >
            {editingRecipe?.id ? (language === 'en' ? 'Save Changes' : 'שמור שינויים')
                               : (language === 'en' ? 'Add Recipe' : 'הוסף מתכון')}
          </button>
        </div>
        </div>
      </form>
      </div>
    </>
  )
}

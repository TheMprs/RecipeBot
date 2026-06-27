import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, LinkIcon, ChevronDown, Check, Plus, ChefHat } from 'lucide-react'

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
  const [catOpen, setCatOpen] = useState(false)
  const catRef = useRef(null)

  // Close the category dropdown when clicking outside it.
  useEffect(() => {
    if (!catOpen) return
    const onDown = (e) => { if (catRef.current && !catRef.current.contains(e.target)) setCatOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [catOpen])
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
      <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-sm p-6 sm:p-8 overflow-hidden">
        {/* Branded header band — matches the login window look */}
        <div className="-mx-6 -mt-6 sm:-mx-8 sm:-mt-8 px-6 sm:px-8 pt-5 pb-4 bg-gradient-to-b from-[#e67e22] to-[#cf711f]">
          <div className="relative flex items-center justify-between">
            <button onClick={onBack}
              className="flex items-center gap-2 text-white/85 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
              <span className="font-medium">Back</span>
            </button>
            <div className="absolute left-1/2 -translate-x-1/2 translate-y-5 w-11 h-11 sm:w-14 sm:h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center ring-1 ring-white/25">
              <ChefHat className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
            <button
              type="button"
              onClick={onOpenUrlModal}
              className={`flex items-center gap-2 text-white/85 hover:text-white transition-colors ${isRtl ? 'flex-row-reverse' : ''}`}
              title="Import recipe from link"
            >
              <LinkIcon className="w-5 h-5" />
              <span className="font-medium text-sm">{language === 'en' ? 'Import from link' : 'יבוא מקישור'}</span>
            </button>
          </div>
          <h1 className="text-center text-2xl font-bold tracking-tight text-white mt-10">
            {editingRecipe?.id ? (language === 'en' ? 'Edit Recipe' : 'עריכת מתכון')
                               : (language === 'en' ? 'Add New Recipe' : 'הוסף מתכון חדש')}
          </h1>
        </div>

        <div style={{ direction: isRtl ? 'rtl' : 'ltr' }} className="relative bg-white pt-3">

        <div className="space-y-3">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-[#3d3429] mb-2 ps-[14px]">{language === 'en' ? 'Recipe Title' : 'שם המתכון'}</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={language === 'en' ? "e.g., Grandma's Apple Pie" : 'למשל, חלה של יובל'}
              required
              className="w-full px-4 py-3 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#cf711f]/20 focus:border-[#cf711f] transition-all"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-[#3d3429] mb-2 ps-[14px]">{language === 'en' ? 'Description' : 'תיאור'}</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={language === 'en' ? 'A brief description of your recipe...' : 'תיאור קצר של המתכון...'}
              rows={3}
              className="w-full px-4 py-3 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#cf711f]/20 focus:border-[#cf711f] transition-all resize-none"
            />
          </div>

          {/* Category + prepped count share one row */}
          <div className="flex gap-2 items-start">
          <div className="flex-1 min-w-0 max-w-xs">
            <label className="block text-sm font-medium text-[#3d3429] mb-2 ps-[14px]">{language === 'en' ? 'Category' : 'קטגוריה'}</label>
            <div className="relative" ref={catRef}>
              <button
                type="button"
                onClick={() => setCatOpen(o => !o)}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] font-medium cursor-pointer hover:border-[#d9d3c8] hover:bg-[#f5f3ef] focus:outline-none focus:ring-2 focus:ring-[#cf711f]/20 focus:border-[#cf711f] transition-all"
              >
                <span className={category ? '' : 'text-[#7a7265]'}>{category || (language === 'en' ? 'None' : 'ללא')}</span>
                <ChevronDown className={`w-4 h-4 text-[#cf711f] flex-shrink-0 transition-transform duration-200 ${catOpen ? 'rotate-180' : ''}`} />
              </button>
              {catOpen && (
                <div style={{ direction: isRtl ? 'ltr' : 'rtl' }} className="menu-scroll absolute z-20 mt-2 w-full bg-white border border-[#e8e4dc] rounded-2xl shadow-lg py-1 max-h-60 overflow-y-auto">
                  {[{ name: '', label: language === 'en' ? 'None' : 'ללא' },
                    ...userCategories.map(c => ({ name: c.name, label: c.name }))].map(opt => {
                    const selected = category === opt.name
                    return (
                      <button
                        key={opt.name || '__none__'}
                        type="button"
                        style={{ direction: isRtl ? 'rtl' : 'ltr' }}
                        onClick={() => { setCategory(opt.name); setShowNewCatInput(false); setCatOpen(false) }}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm text-start transition-colors ${selected ? 'bg-[#e67e22]/10 text-[#cf711f] font-medium' : 'text-[#3d3429] hover:bg-[#faf9f7]'}`}
                      >
                        <span className="truncate">{opt.label}</span>
                        <span className="w-4 flex-shrink-0">{selected && <Check className="w-4 h-4" />}</span>
                      </button>
                    )
                  })}
                  {onCreateCategory && (
                    <button
                      type="button"
                      style={{ direction: isRtl ? 'rtl' : 'ltr' }}
                      onClick={() => { setCatOpen(false); setShowNewCatInput(true); setNewCatName('') }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-start text-[#e67e22] hover:bg-[#faf9f7] border-t border-[#e8e4dc]/60 font-medium transition-colors"
                    >
                      <Plus className="w-4 h-4 flex-shrink-0" />
                      {language === 'en' ? 'Add category' : 'הוסף קטגוריה'}
                    </button>
                  )}
                </div>
              )}
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
            <label className="block text-sm font-medium text-[#3d3429] mb-2 ps-[14px]">{language === 'en' ? 'Calories' : 'קלוריות / מנה'}</label>
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
              <label className="block text-sm font-medium text-[#3d3429] mb-2 ps-[14px]">{language === 'en' ? 'Times prepped' : 'מספר הכנות'}</label>
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
            <label className="block text-sm font-medium text-[#3d3429] ps-[14px]">{language === 'en' ? 'Ingredients' : 'רכיבים'}</label>
            <p className="text-xs text-[#7a7265] mb-2 ps-[14px]">{language === 'en' ? 'Separate ingredients with new lines or with a period.' : 'הפרד בין הרכיבים בשורות חדשות או בנקודה.'}</p>
            <textarea
              value={ingredientsText}
              onChange={e => setIngredientsText(e.target.value)}
              placeholder={language === 'en' ? '2 cups flour \n1 cup sugar \n3 eggs \n1/2 cup butter'
                                            : '2 כוסות קמח \n1 כוס סוכר \n3 ביצים \n1/2 כוס שמן'}
              rows={6}
              className="w-full px-4 py-3 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#cf711f]/20 focus:border-[#cf711f] transition-all resize-none"
            />
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-sm font-medium text-[#3d3429] ps-[14px]">{language === 'en' ? 'Instructions' : 'הוראות'}</label>
            <p className="text-xs text-[#7a7265] mb-2 ps-[14px]">{language === 'en' ? 'Separate steps with new lines or with a period.' : 'הפרד בין השלבים בשורות חדשות או בנקודה.'}</p>
            <textarea
              value={instructionsText}
              onChange={e => setInstructionsText(e.target.value)}
              placeholder={language === 'en' ?
                      'Preheat oven to 350F\nMix dry ingredients in a bowl\nAdd wet ingredients and stir\nPour into pan and bake for 30 minutes'
                    : 'מחמים תנור ל180 מעלות\nמערבבים את הרכיבים היבשים בקערה\nמוסיפים את הרכיבים הרטובים ומערבבים\nיוצקים לתבנית ואופים במשך 30 דקות'}
              rows={8}
              className="w-full px-4 py-3 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#cf711f]/20 focus:border-[#cf711f] transition-all resize-none"
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

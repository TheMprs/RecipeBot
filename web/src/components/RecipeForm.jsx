import { useState, useEffect, useRef } from 'react'
import { LinkIcon, ChevronDown, Check, Plus, ChefHat, Globe, Lock, Type, AlignLeft, Tag, Flame, Hash, List, ListOrdered, X } from 'lucide-react'
import { categoryColor } from '../utils/categoryColor'

const FieldLabel = ({ icon: Icon, children, hint, trailing }) => (
  <div className="mb-2">
    <div className="flex items-center justify-between gap-2">
      <label className="flex items-center gap-1.5 text-sm font-medium text-[#3d3429]">
        <Icon className="w-4 h-4 text-[#cf711f]" />{children}
      </label>
      {trailing}
    </div>
    {hint && <p className="text-xs text-[#7a7265] mt-1">{hint}</p>}
  </div>
)

// Items are entered one line at a time via the add button; pasted multi-line
// text still splits on line breaks so a copied list lands as separate items.
const splitLines = (text) => text.split('\n').map(s => s.trim()).filter(Boolean)

export function RecipeForm({ onBack, onSave, editingRecipe, onOpenUrlModal, language = 'en', userCategories = [], currentCategoryIds = [], onCreateCategory, cookCount = 0 }) {
  const isRtl = language === 'he'

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [ingredients, setIngredients] = useState([])
  const [instructions, setInstructions] = useState([])
  const [ingredientDraft, setIngredientDraft] = useState('')
  const [instructionDraft, setInstructionDraft] = useState('')
  // In-place edit of an existing list item: {i, text} or null. Commit on blur/Enter;
  // emptying the text drops the item, like the cook-count stepper's inline edit.
  const [editIng, setEditIng] = useState(null)
  const [editInst, setEditInst] = useState(null)
  const [selectedCatIds, setSelectedCatIds] = useState(currentCategoryIds)
  const [calories, setCalories] = useState('')
  const [visibility, setVisibility] = useState(() => localStorage.getItem('defaultRecipeVisibility') || 'public')
  const [errors, setErrors] = useState({})
  const [showNewCatInput, setShowNewCatInput] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [catOpen, setCatOpen] = useState(false)
  const catRef = useRef(null)
  const catMenuRef = useRef(null)

  // Close the category dropdown when clicking outside it.
  useEffect(() => {
    if (!catOpen) return
    const onDown = (e) => { if (catRef.current && !catRef.current.contains(e.target)) { setCatOpen(false); setShowNewCatInput(false); setNewCatName('') } }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [catOpen])
  // changes locally only; the net delta is applied on save. A retried save
  // carries its unsaved delta back in via editingRecipe.cookCountDelta.
  const [localCookCount, setLocalCookCount] = useState(cookCount + (editingRecipe?.cookCountDelta || 0))
  useEffect(() => { setLocalCookCount(cookCount + (editingRecipe?.cookCountDelta || 0)) }, [cookCount])
  const [countEditing, setCountEditing] = useState(false)
  const [countDraft, setCountDraft] = useState('')

  // Cap the prepped count: each unit of increase inserts one cook_logs row on save,
  // so an unbounded value (e.g. a typed 1000000) would freeze the client and mass-insert.
  const MAX_COOK = 999
  const commitCountDraft = () => {
    const n = parseInt(countDraft, 10)
    if (!isNaN(n) && n >= 0) setLocalCookCount(Math.min(n, MAX_COOK))
    setCountEditing(false)
  }

  useEffect(() => {
    if (editingRecipe) {
      setTitle(editingRecipe.title)
      setDescription(editingRecipe.description)
      setIngredients(editingRecipe.ingredients)
      setInstructions(editingRecipe.instructions)
      setCalories(editingRecipe.caloriesPerServing != null ? String(editingRecipe.caloriesPerServing) : '')
      if (editingRecipe.visibility) setVisibility(editingRecipe.visibility)
    }
  }, [editingRecipe])

  const selectedCats = userCategories.filter(c => selectedCatIds.includes(c.id))
  const toggleCat = (id) => setSelectedCatIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])

  // Add the draft line(s) to the list; multi-line pastes become one item per line
  const addIngredient = () => {
    const items = splitLines(ingredientDraft)
    if (!items.length) return
    setIngredients(list => [...list, ...items])
    setIngredientDraft('')
    if (errors.ingredients) setErrors(p => ({ ...p, ingredients: null }))
  }
  // Step reordering — pointer-based drag (works with touch too, unlike HTML5 DnD).
  // Ref drives the logic, state only drives the highlight style.
  const dragIdxRef = useRef(null)
  const [dragIdx, setDragIdx] = useState(null)
  const startStepDrag = (e, i) => {
    e.preventDefault()
    dragIdxRef.current = i
    setDragIdx(i)
    const move = (ev) => {
      const prev = dragIdxRef.current
      if (prev == null) return
      // Target = "insert before this row", the first row whose vertical midpoint is
      // below the pointer (or past the end). Measuring each row's real rect makes it
      // stable across very different heights — no swap-on-edge oscillation.
      const rows = [...document.querySelectorAll('[data-step-idx]')]
      let target = rows.length
      for (let k = 0; k < rows.length; k++) {
        const r = rows[k].getBoundingClientRect()
        if (ev.clientY < r.top + r.height / 2) { target = k; break }
      }
      // Removing the dragged item first shifts every later index down one, so a
      // downward move must insert one slot earlier than the pre-removal target.
      const insertAt = target > prev ? target - 1 : target
      if (insertAt === prev) return
      dragIdxRef.current = insertAt
      setDragIdx(insertAt)
      setInstructions(list => { const c = [...list]; const [m] = c.splice(prev, 1); c.splice(insertAt, 0, m); return c })
    }
    const up = () => {
      dragIdxRef.current = null
      setDragIdx(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const addInstruction = () => {
    const items = splitLines(instructionDraft)
    if (!items.length) return
    setInstructions(list => [...list, ...items])
    setInstructionDraft('')
    if (errors.instructions) setErrors(p => ({ ...p, instructions: null }))
  }

  // Write an edited item back into its list; empty text removes it.
  const commitEditIng = () => {
    if (!editIng) return
    const text = editIng.text.trim()
    setIngredients(list => text ? list.map((v, j) => j === editIng.i ? text : v) : list.filter((_, j) => j !== editIng.i))
    setEditIng(null)
  }
  const commitEditInst = () => {
    if (!editInst) return
    const text = editInst.text.trim()
    setInstructions(list => text ? list.map((v, j) => j === editInst.i ? text : v) : list.filter((_, j) => j !== editInst.i))
    setEditInst(null)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const ingredients2 = ingredients
    const instructions2 = instructions

    const required = language === 'en' ? 'Required field' : 'שדה חובה'
    const tooMany = language === 'en' ? 'Maximum 100 items' : 'עד 100 פריטים'
    const unsaved = language === 'en' ? 'Unsaved line — add it or clear it first' : 'שורה לא שמורה — הוסף או נקה אותה קודם'
    const newErrors = {}
    if (!title.trim()) newErrors.title = required
    if (ingredientDraft.trim()) newErrors.ingredients = unsaved
    else if (ingredients2.length === 0) newErrors.ingredients = required
    else if (ingredients2.length > 100) newErrors.ingredients = tooMany
    if (instructionDraft.trim()) newErrors.instructions = unsaved
    else if (instructions2.length === 0) newErrors.instructions = required
    else if (instructions2.length > 100) newErrors.instructions = tooMany
    if (Object.keys(newErrors).length) {
      setErrors(newErrors)
      document.querySelector('[data-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    onSave({ title, description, ingredients: ingredients2, instructions: instructions2, categoryIds: selectedCatIds, caloriesPerServing: calories === '' ? null : parseInt(calories, 10), visibility, cookCountDelta: localCookCount - cookCount })
  }

  return (
    <>
      <div className="max-w-2xl mx-auto">
      <form id="recipe-form" noValidate onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-sm p-6 sm:p-8">
        {/* Branded header band — matches the login window look */}
        <div className="relative overflow-hidden rounded-t-3xl -mx-6 -mt-6 sm:-mx-8 sm:-mt-8 px-6 sm:px-8 pt-5 pb-6 bg-gradient-to-br from-[#e88934] via-[#e67e22] to-[#cf711f]">
          {/* soft decorative glow */}
          <div className="pointer-events-none absolute -top-16 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 w-52 h-52 rounded-full bg-black/10 blur-2xl" />
          <div className="relative flex items-center justify-between">
            <button onClick={onBack}
              title={language === 'en' ? 'Close' : 'סגור'}
              className="flex items-center justify-center w-9 h-9 rounded-full text-white/85 hover:text-white hover:bg-white/15 transition-colors">
              <X className="w-5 h-5" />
            </button>
            <div className="absolute left-1/2 -translate-x-1/2 translate-y-5 w-11 h-11 sm:w-14 sm:h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center ring-1 ring-white/25">
              <ChefHat className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
            <button
              type="button"
              onClick={onOpenUrlModal}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/15 hover:bg-white/25 text-white ring-1 ring-white/25 backdrop-blur transition-colors ${isRtl ? 'flex-row-reverse' : ''}`}
              title="Import recipe from link"
            >
              <LinkIcon className="w-4 h-4" />
              <span className="font-semibold text-sm">{language === 'en' ? 'Import from link' : 'יבוא מקישור'}</span>
            </button>
          </div>
          <h1 className="relative text-center text-2xl font-bold tracking-tight text-white mt-10">
            {editingRecipe?.id ? (language === 'en' ? 'Edit Recipe' : 'עריכת מתכון')
                               : (language === 'en' ? 'Add New Recipe' : 'הוסף מתכון חדש')}
          </h1>
          <p className="relative text-center text-sm text-white/75 mt-1">
            {editingRecipe?.id
              ? (language === 'en' ? 'Tweak the details and save your changes' : 'עדכן את הפרטים ושמור את השינויים')
              : (language === 'en' ? 'Share what you love to cook' : 'שתף את מה שאתה אוהב לבשל')}
          </p>
        </div>

        <div style={{ direction: isRtl ? 'rtl' : 'ltr' }} className="relative bg-white pt-3">

        <div className="space-y-4">
          {/* Title */}
          <div>
            <FieldLabel icon={Type}>{language === 'en' ? 'Recipe Title' : 'שם המתכון'}</FieldLabel>
            <div className="flex items-stretch gap-2">
              <input
                type="text"
                value={title}
                maxLength={200}
                onChange={e => { setTitle(e.target.value); if (errors.title) setErrors(p => ({ ...p, title: null })) }}
                placeholder={language === 'en' ? "e.g., Grandma's Apple Pie" : 'למשל, חלה של יובל'}
                data-invalid={!!errors.title}
                className={`flex-1 min-w-0 px-4 py-3 bg-[#faf9f7] border rounded-2xl font-medium text-[#3d3429] placeholder:text-[#7a7265] placeholder:font-normal focus:outline-none transition-all ${errors.title ? 'border-red-400 ring-2 ring-red-200' : 'border-[#e8e4dc] focus:ring-2 focus:ring-[#cf711f]/20 focus:border-[#cf711f]'}`}
              />
              <button
                type="button"
                onClick={() => setVisibility(v => v === 'public' ? 'private' : 'public')}
                title={language === 'en' ? 'Who can see this recipe' : 'מי יכול לראות את המתכון'}
                className={`flex-shrink-0 w-28 flex items-center justify-center gap-1.5 px-3 rounded-2xl text-sm font-medium border transition-colors ${
                  visibility === 'public'
                    ? 'bg-[#e67e22]/10 text-[#cf711f] border-[#e67e22]/30 hover:bg-[#e67e22]/15'
                    : 'bg-[#f5f3ef] text-[#7a7265] border-[#e8e4dc] hover:bg-[#e8e4dc]'
                }`}
              >
                {visibility === 'public'
                  ? <><Globe className="w-4 h-4" />{language === 'en' ? 'Public' : 'ציבורי'}</>
                  : <><Lock className="w-4 h-4" />{language === 'en' ? 'Private' : 'פרטי'}</>}
              </button>
            </div>
            {errors.title && <p className="text-xs text-red-500 mt-1.5 ps-[14px]">{errors.title}</p>}
          </div>

          {/* Description */}
          <div>
            <FieldLabel icon={AlignLeft}>{language === 'en' ? 'Description' : 'תיאור'}</FieldLabel>
            <textarea
              value={description}
              maxLength={5000}
              onChange={e => setDescription(e.target.value)}
              placeholder={language === 'en' ? 'A brief description of your recipe...' : 'תיאור קצר של המתכון...'}
              rows={3}
              className="w-full px-4 py-3 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#cf711f]/20 focus:border-[#cf711f] transition-all resize-none"
            />
          </div>

          {/* Category + calories + prepped share one row */}
          <div className="flex gap-2 items-start">
          <div className="flex-1 min-w-0">
            <FieldLabel icon={Tag}>{language === 'en' ? 'Category' : 'קטגוריה'}</FieldLabel>
            <div className="relative" ref={catRef}>
              <button
                type="button"
                onClick={() => setCatOpen(o => { if (o) { setShowNewCatInput(false); setNewCatName('') } return !o })}
                className="w-full flex items-center justify-center sm:justify-between gap-2 px-4 py-3 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] font-medium cursor-pointer hover:border-[#d9d3c8] hover:bg-[#f5f3ef] focus:outline-none focus:ring-2 focus:ring-[#cf711f]/20 focus:border-[#cf711f] transition-all"
              >
                <span className={`flex items-center gap-1.5 min-w-0 ${selectedCats.length ? '' : 'text-[#7a7265]'}`}>
                  {selectedCats.length === 0
                    ? <span className="truncate">{language === 'en' ? 'None' : 'ללא'}</span>
                    : <>
                        {selectedCats.map(c => <span key={c.id} className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: c.color || categoryColor(c.name) }} />)}
                        <span className="truncate hidden sm:inline">{selectedCats.map(c => c.name).join(', ')}</span>
                      </>}
                </span>
                <ChevronDown className={`w-4 h-4 text-[#cf711f] flex-shrink-0 transition-transform duration-200 ${catOpen ? 'rotate-180' : ''}`} />
              </button>
              {catOpen && (
                <div ref={catMenuRef} style={{ direction: isRtl ? 'ltr' : 'rtl' }} className="absolute z-20 mt-2 right-0 min-w-full w-max max-w-[80vw] bg-white border border-[#e8e4dc] rounded-2xl shadow-lg max-h-60 overflow-y-auto overflow-x-hidden">
                  {userCategories.length === 0 && !showNewCatInput && (
                    <p className="px-3 py-2.5 text-sm text-[#a39b8d] text-center">{language === 'en' ? 'No categories yet' : 'אין קטגוריות עדיין'}</p>
                  )}
                  {userCategories.map(c => {
                    const selected = selectedCatIds.includes(c.id)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        style={{ direction: isRtl ? 'rtl' : 'ltr' }}
                        onClick={() => toggleCat(c.id)}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm text-start transition-colors ${selected ? 'bg-[#e67e22]/10 text-[#cf711f] font-medium' : 'text-[#3d3429] hover:bg-[#faf9f7]'}`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: c.color || categoryColor(c.name) }} />
                          <span className="truncate">{c.name}</span>
                        </span>
                        <span className="w-4 flex-shrink-0">{selected && <Check className="w-4 h-4" />}</span>
                      </button>
                    )
                  })}
                  {onCreateCategory && (showNewCatInput ? (
                    <div style={{ direction: isRtl ? 'rtl' : 'ltr' }} className="flex flex-col gap-2 sm:flex-row sm:items-center px-3 py-2 border-t border-[#e8e4dc]/60">
                      <input
                        autoFocus
                        type="text"
                        size={1}
                        style={{ direction: isRtl ? 'rtl' : 'ltr' }}
                        value={newCatName}
                        maxLength={50}
                        onChange={e => setNewCatName(e.target.value)}
                        onKeyDown={async e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            const name = newCatName.trim()
                            if (!name) return
                            const newCat = await onCreateCategory(name)
                            if (newCat) setSelectedCatIds(ids => [...ids, newCat.id])
                            setShowNewCatInput(false); setNewCatName('')
                          } else if (e.key === 'Escape') {
                            setShowNewCatInput(false); setNewCatName('')
                          }
                        }}
                        placeholder={language === 'en' ? 'Category name' : 'שם קטגוריה'}
                        className="w-full sm:flex-1 min-w-0 px-3 py-2 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-sm text-[#3d3429] focus:outline-none focus:border-[#cf711f]"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const name = newCatName.trim()
                          if (!name) return
                          const newCat = await onCreateCategory(name)
                          if (newCat) setSelectedCatIds(ids => [...ids, newCat.id])
                          setShowNewCatInput(false); setNewCatName('')
                        }}
                        title={language === 'en' ? 'Add' : 'הוסף'}
                        className="w-full sm:w-9 h-9 flex items-center justify-center bg-[#e67e22] text-white rounded-xl hover:bg-[#cf711f] flex-shrink-0"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      style={{ direction: isRtl ? 'rtl' : 'ltr' }}
                      onClick={() => { setShowNewCatInput(true); setNewCatName(''); requestAnimationFrame(() => catMenuRef.current?.scrollTo({ top: catMenuRef.current.scrollHeight, behavior: 'smooth' })) }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-start text-[#e67e22] hover:bg-[#faf9f7] border-t border-[#e8e4dc]/60 font-medium transition-colors"
                    >
                      <Plus className="w-4 h-4 flex-shrink-0" />
                      {language === 'en' ? 'Add category' : 'הוסף קטגוריה'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Calories per serving (manual for now; auto-calc later) */}
          <div className="shrink-0">
            <FieldLabel icon={Flame}>{language === 'en' ? 'Calories' : 'קלוריות / מנה'}</FieldLabel>
            <input
              type="number"
              min="0"
              max="100000"
              inputMode="numeric"
              value={calories}
              onChange={e => { const v = e.target.value; if (v === '') return setCalories(''); const n = parseInt(v, 10); if (!isNaN(n)) setCalories(String(Math.min(Math.max(n, 0), 100000))) }}
              placeholder="—"
              className="no-spinner w-28 text-center font-semibold bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl px-3 py-3 text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#cf711f]/20 focus:border-[#cf711f] transition-all"
            />
          </div>

          {/* Prepped count (existing recipes only) */}
          {editingRecipe?.id && (
            <div className="shrink-0">
              <FieldLabel icon={Hash}>{language === 'en' ? 'Times prepped' : 'מספר הכנות'}</FieldLabel>
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
                    maxLength={3}
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
                  onClick={() => setLocalCookCount(c => Math.min(c + 1, MAX_COOK))}
                  disabled={localCookCount >= MAX_COOK}
                  className="w-9 h-9 rounded-xl text-lg font-semibold text-[#7a7265] hover:text-[#cf711f] hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  +
                </button>
              </div>
            </div>
          )}
          </div>

          {/* Ingredients — one line at a time */}
          <div>
            <FieldLabel icon={List} trailing={ingredients.length > 0 && (
              <span className="text-xs font-medium text-[#a39b8d]">
                {ingredients.length} {language === 'en' ? (ingredients.length === 1 ? 'item' : 'items') : 'פריטים'}
              </span>
            )}>
              {language === 'en' ? 'Ingredients' : 'רכיבים'}</FieldLabel>
            {ingredients.length > 0 && (
              <ul className="mb-2 space-y-1.5">
                {ingredients.map((item, i) => (
                  <li key={i} className="flex items-center gap-2 px-4 py-2 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#e67e22] flex-shrink-0" />
                    {editIng?.i === i ? (
                      <input
                        autoFocus
                        type="text"
                        maxLength={500}
                        value={editIng.text}
                        onChange={e => setEditIng({ i, text: e.target.value })}
                        onBlur={commitEditIng}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); commitEditIng() }
                          if (e.key === 'Escape') setEditIng(null)
                        }}
                        className="flex-1 min-w-0 text-sm text-[#3d3429] bg-transparent focus:outline-none"
                      />
                    ) : (
                      <button type="button" onClick={() => setEditIng({ i, text: item })}
                        className="flex-1 min-w-0 text-start text-sm text-[#3d3429] break-words hover:text-[#cf711f] transition-colors">
                        {item}
                      </button>
                    )}
                    <button type="button" onClick={() => setIngredients(list => list.filter((_, j) => j !== i))}
                      className="flex-shrink-0 text-[#a39b8d] hover:text-red-500 transition-colors" title={language === 'en' ? 'Remove' : 'הסר'}>
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="relative">
              <input
                type="text"
                value={ingredientDraft}
                maxLength={500}
                onChange={e => { setIngredientDraft(e.target.value); if (errors.ingredients) setErrors(p => ({ ...p, ingredients: null })) }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addIngredient() } }}
                placeholder={language === 'en' ? 'e.g., 2 cups flour' : 'למשל, 2 כוסות קמח'}
                data-invalid={!!errors.ingredients}
                className={`w-full px-4 py-3 pe-14 bg-[#faf9f7] border rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none transition-all ${errors.ingredients ? 'border-red-400 ring-2 ring-red-200' : 'border-[#e8e4dc] focus:ring-2 focus:ring-[#cf711f]/20 focus:border-[#cf711f]'}`}
              />
              {ingredientDraft && (
                <button type="button"
                  onClick={() => { setIngredientDraft(''); if (errors.ingredients) setErrors(p => ({ ...p, ingredients: null })) }}
                  className={`absolute top-1/2 -translate-y-1/2 ${isRtl ? 'left-3' : 'right-3'} text-xs font-medium text-[#a39b8d] hover:text-red-500 transition-colors`}>
                  {language === 'en' ? 'Clear' : 'נקה'}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={addIngredient}
              disabled={!ingredientDraft.trim()}
              className="mt-2 flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-[#cf711f] bg-[#e67e22]/10 hover:bg-[#e67e22]/15 rounded-2xl border border-[#e67e22]/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-4 h-4" />
              {language === 'en' ? 'Add ingredient' : 'הוסף רכיב'}
            </button>
            {errors.ingredients && <p className="text-xs text-red-500 mt-1.5 ps-[14px]">{errors.ingredients}</p>}
          </div>

          {/* Instructions — one line at a time */}
          <div>
            <FieldLabel icon={ListOrdered} trailing={instructions.length > 0 && (
              <span className="text-xs font-medium text-[#a39b8d]">
                {instructions.length} {language === 'en' ? (instructions.length === 1 ? 'step' : 'steps') : 'שלבים'}
              </span>
            )}>
              {language === 'en' ? 'Instructions' : 'הוראות'}</FieldLabel>
            {instructions.length > 0 && (
              <ol className="mb-2 space-y-1.5">
                {instructions.map((item, i) => (
                  <li key={i} data-step-idx={i}
                    className={`flex items-center gap-2.5 px-4 py-2 bg-[#faf9f7] border rounded-2xl transition-shadow ${dragIdx === i ? 'border-[#e67e22] shadow-md select-none' : 'border-[#e8e4dc]'}`}>
                    <button type="button" onPointerDown={e => startStepDrag(e, i)}
                      style={{ touchAction: 'none' }}
                      className="flex-shrink-0 cursor-grab active:cursor-grabbing text-[#a39b8d] hover:text-[#cf711f] transition-colors"
                      title={language === 'en' ? 'Drag to reorder' : 'גרור לשינוי סדר'}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M5 6h14M5 12h14M5 18h14" />
                      </svg>
                    </button>
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#e67e22]/10 text-[#cf711f] text-xs font-semibold flex items-center justify-center">{i + 1}</span>
                    {editInst?.i === i ? (
                      <input
                        autoFocus
                        type="text"
                        maxLength={2000}
                        value={editInst.text}
                        onChange={e => setEditInst({ i, text: e.target.value })}
                        onBlur={commitEditInst}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); commitEditInst() }
                          if (e.key === 'Escape') setEditInst(null)
                        }}
                        className="flex-1 min-w-0 text-sm text-[#3d3429] bg-transparent focus:outline-none"
                      />
                    ) : (
                      <button type="button" onClick={() => setEditInst({ i, text: item })}
                        className="flex-1 min-w-0 text-start text-sm text-[#3d3429] break-words hover:text-[#cf711f] transition-colors">
                        {item}
                      </button>
                    )}
                    <button type="button" onClick={() => setInstructions(list => list.filter((_, j) => j !== i))}
                      className="flex-shrink-0 text-[#a39b8d] hover:text-red-500 transition-colors" title={language === 'en' ? 'Remove' : 'הסר'}>
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <div className="relative">
              <input
                type="text"
                value={instructionDraft}
                maxLength={2000}
                onChange={e => { setInstructionDraft(e.target.value); if (errors.instructions) setErrors(p => ({ ...p, instructions: null })) }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addInstruction() } }}
                placeholder={language === 'en' ? 'e.g., Preheat oven to 350F' : 'למשל, מחמים תנור ל-180 מעלות'}
                data-invalid={!!errors.instructions}
                className={`w-full px-4 py-3 pe-14 bg-[#faf9f7] border rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none transition-all ${errors.instructions ? 'border-red-400 ring-2 ring-red-200' : 'border-[#e8e4dc] focus:ring-2 focus:ring-[#cf711f]/20 focus:border-[#cf711f]'}`}
              />
              {instructionDraft && (
                <button type="button"
                  onClick={() => { setInstructionDraft(''); if (errors.instructions) setErrors(p => ({ ...p, instructions: null })) }}
                  className={`absolute top-1/2 -translate-y-1/2 ${isRtl ? 'left-3' : 'right-3'} text-xs font-medium text-[#a39b8d] hover:text-red-500 transition-colors`}>
                  {language === 'en' ? 'Clear' : 'נקה'}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={addInstruction}
              disabled={!instructionDraft.trim()}
              className="mt-2 flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-[#cf711f] bg-[#e67e22]/10 hover:bg-[#e67e22]/15 rounded-2xl border border-[#e67e22]/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-4 h-4" />
              {language === 'en' ? 'Add step' : 'הוסף שלב'}
            </button>
            {errors.instructions && <p className="text-xs text-red-500 mt-1.5 ps-[14px]">{errors.instructions}</p>}
          </div>
        </div>

        </div>
      </form>
      {/* spacer (page-colored) so the last field clears the fixed action bar */}
      <div/>

      {/* Fixed action bar — pinned to the viewport bottom, width-matched to the form */}
      <div className="fixed bottom-0 inset-x-0 z-30 pointer-events-none">
        <div className="max-w-2xl mx-auto px-6 sm:px-8 py-3 flex gap-3 pointer-events-auto" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
          <button
            type="button"
            onClick={onBack}
            className="flex-1 py-3 px-4 bg-white border border-[#e8e4dc] text-[#7a7265] rounded-2xl font-medium hover:bg-[#f5f3ef] transition-colors shadow-sm"
          >
            {language === 'en' ? 'Cancel' : 'בטל'}
          </button>
          <button
            type="submit"
            form="recipe-form"
            className="flex-1 py-3 px-4 bg-[#e67e22] text-white rounded-2xl font-medium hover:bg-[#cf711f] transition-colors shadow-sm"
          >
            {editingRecipe?.id ? (language === 'en' ? 'Save Changes' : 'שמור שינויים')
                               : (language === 'en' ? 'Add Recipe' : 'הוסף מתכון')}
          </button>
        </div>
      </div>
      </div>
    </>
  )
}

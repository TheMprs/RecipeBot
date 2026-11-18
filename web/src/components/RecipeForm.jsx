import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { LinkIcon, ChevronDown, Check, Plus, ChefHat, Globe, Lock, Type, AlignLeft, Tag, Flame, List, ListOrdered, X, ClipboardList, Sparkles } from 'lucide-react'
import { categoryColor } from '../utils/categoryColor'
import { parseRecipeText, isLanded, landedDelay } from '../utils/parseRecipeText'
import { defaultVisibility } from '../utils/visibility'
import { isGroupHeading, countItems, stepNumbers } from '../utils/recipeLines'

const FieldLabel = ({ icon: Icon, children, hint, trailing }) => (
  <div className="mb-2">
    <div className="flex items-center justify-between gap-2">
      <label className="flex items-center gap-1.5 text-sm font-medium text-ink">
        <Icon className="w-4 h-4 text-brand-dark" />{children}
      </label>
      {trailing}
    </div>
    {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
  </div>
)

// Items are entered one line at a time via the add button; pasted multi-line
// text still splits on line breaks so a copied list lands as separate items.
const splitLines = (text) => text.split('\n').map(s => s.trim()).filter(Boolean)

export function RecipeForm({ onBack, onSave, editingRecipe, onOpenUrlModal, language = 'en', userCategories = [], currentCategoryIds = [], onCreateCategory, onDirtyChange }) {
  const isRtl = language === 'he'

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [ingredients, setIngredients] = useState([])
  const [instructions, setInstructions] = useState([])
  const stepNums = stepNumbers(instructions) // null for group titles
  const [ingredientDraft, setIngredientDraft] = useState('')
  const [instructionDraft, setInstructionDraft] = useState('')
  // In-place edit of an existing list item: {i, text} or null. Commit on blur/Enter;
  // emptying the text drops the item, like the cook-count stepper's inline edit.
  const [editIng, setEditIng] = useState(null)
  const [editInst, setEditInst] = useState(null)
  const [selectedCatIds, setSelectedCatIds] = useState(currentCategoryIds)
  const [calories, setCalories] = useState('')
  const [visibility, setVisibility] = useState(defaultVisibility)
  const [errors, setErrors] = useState({})
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')
  // How many rows at the end of each list just arrived from a paste, so they can
  // be tinted. A count rather than ids: the rows are plain strings and the fresh
  // ones are always the tail, since a paste appends.
  const [landed, setLanded] = useState({ ing: 0, inst: 0 })
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

  // Unsaved-work check for the discard prompt. The baseline is what the form opened
  // with: the stored recipe when editing, an empty form otherwise — so an imported or
  // pasted recipe that was never saved counts as work too. Half-typed lines count.
  const snapshot = (t, d, ing, ins, cats, cal, vis, drafts) =>
    JSON.stringify([t || '', d || '', ing || [], ins || [], [...cats].sort(), cal, vis, drafts])
  const [baseline] = useState(() => editingRecipe?.id
    ? snapshot(editingRecipe.title, editingRecipe.description, editingRecipe.ingredients, editingRecipe.instructions,
        currentCategoryIds, editingRecipe.caloriesPerServing != null ? String(editingRecipe.caloriesPerServing) : '',
        editingRecipe.visibility || defaultVisibility(), '')
    : snapshot('', '', [], [], currentCategoryIds, '', defaultVisibility(), ''))
  const dirty = snapshot(title, description, ingredients, instructions, selectedCatIds, calories, visibility,
    ingredientDraft.trim() + instructionDraft.trim()) !== baseline
  // Keyed on the value only: onDirtyChange is a fresh arrow every App render, and each
  // version just writes a ref, so re-running on its identity would do nothing new.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => onDirtyChange?.(false), [])

  const selectedCats = userCategories.filter(c => selectedCatIds.includes(c.id))
  const toggleCat = (id) => setSelectedCatIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])

  // Pour a pasted blob into the form. Appending rather than replacing: whatever is
  // already typed is the user's, and a parse is only a suggestion. The title is the
  // one exception — it's a single value, so it fills only when empty.
  const applyPaste = () => {
    const parsed = parseRecipeText(pasteText)
    if (!parsed.title && !parsed.ingredients.length && !parsed.instructions.length) return
    if (parsed.title && !title.trim()) setTitle(parsed.title)
    setIngredients(list => [...list, ...parsed.ingredients])
    setInstructions(list => [...list, ...parsed.instructions])
    setLanded({ ing: parsed.ingredients.length, inst: parsed.instructions.length })
    setErrors({})
    setShowPaste(false)
    setPasteText('')
  }

  // The textarea takes focus on open, so Escape is the reflex for backing out of it.
  useEffect(() => {
    if (!showPaste) return
    const onKey = (e) => { if (e.key === 'Escape') setShowPaste(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showPaste])

  // The tint is a one-off cue, not a state the row lives in — drop it once the
  // animation has run so a later re-render doesn't replay it.
  useEffect(() => {
    if (!landed.ing && !landed.inst) return
    const t = setTimeout(() => setLanded({ ing: 0, inst: 0 }), 2400)
    return () => clearTimeout(t)
  }, [landed])

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
    // Trim at the save boundary only — whitespace goes, nothing else. A line that was
    // nothing but spaces was never content, so it drops out rather than saving blank.
    const ingredients2 = ingredients.map(s => s.trim()).filter(Boolean)
    const instructions2 = instructions.map(s => s.trim()).filter(Boolean)

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
    // Show the user what's actually being saved — if this submit fails validation or the
    // network, the form they're left looking at is the trimmed one, not the raw typing.
    setTitle(title.trim())
    setDescription(description.trim())
    setIngredients(ingredients2)
    setInstructions(instructions2)

    if (Object.keys(newErrors).length) {
      setErrors(newErrors)
      document.querySelector('[data-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    onSave({ title: title.trim(), description: description.trim(), ingredients: ingredients2, instructions: instructions2, categoryIds: selectedCatIds, caloriesPerServing: calories === '' ? null : parseInt(calories, 10), visibility })
  }

  return (
    <>
      <div className="max-w-2xl mx-auto">
      <form id="recipe-form" noValidate onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-sm p-6 sm:p-8">
        {/* Branded header band — matches the login window look */}
        <div className="relative overflow-hidden rounded-t-3xl -mx-6 -mt-6 sm:-mx-8 sm:-mt-8 px-6 sm:px-8 pt-5 pb-6 band-brand">
          {/* soft decorative glow */}
          <div className="pointer-events-none absolute -top-16 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 w-52 h-52 rounded-full bg-black/10 blur-2xl" />
          <div className="relative flex items-center justify-between">
            {/* type="button": inside the form, a bare <button> submits — closing would save */}
            <button type="button" onClick={onBack}
              title={language === 'en' ? 'Close' : 'סגור'}
              className="flex items-center justify-center w-9 h-9 rounded-full text-white/85 hover:text-white hover:bg-white/15 transition-colors">
              <X className="w-5 h-5" />
            </button>
            <div className="absolute left-1/2 -translate-x-1/2 translate-y-5 w-11 h-11 sm:w-14 sm:h-14 band-badge">
              <ChefHat className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
            <span />
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
          {/* Two doorways into the same form, above the first field where a shortcut is
              still a shortcut — inside the band they read as chrome and got skipped. */}
          {!editingRecipe?.id && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowPaste(true)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-border-dark rounded-full text-sm font-semibold text-muted hover:text-brand-dark hover:border-brand/50 transition-colors"
              >
                <ClipboardList className="w-4 h-4" />
                {language === 'en' ? 'Paste text' : 'הדבק טקסט'}
              </button>
              <button
                type="button"
                onClick={onOpenUrlModal}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-border-dark rounded-full text-sm font-semibold text-muted hover:text-brand-dark hover:border-brand/50 transition-colors"
              >
                <LinkIcon className="w-4 h-4" />
                {language === 'en' ? 'From link' : 'מקישור'}
              </button>
            </div>
          )}

          {/* Fades out with the row tint — a paste is a suggestion, and this says so
              without a confirm screen standing between the paste and the form. */}
          {(landed.ing > 0 || landed.inst > 0) && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-2xl bg-brand/10 border border-brand/25 text-brand-deep text-sm">
              <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                {language === 'en'
                  ? 'Landed in the form — give it a glance. Tap any line to edit it, drag steps to reorder.'
                  : 'הכל בטופס — כדאי לעבור על זה. אפשר ללחוץ על כל שורה לעריכה ולגרור שלבים לשינוי סדר.'}
              </span>
            </div>
          )}

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
                className={`flex-1 min-w-0 px-4 py-3 bg-cream border rounded-2xl font-medium text-ink placeholder:text-muted placeholder:font-normal focus:outline-none transition-all ${errors.title ? 'border-red-400 ring-2 ring-red-200' : 'border-border focus:ring-2 focus:ring-brand-dark/20 focus:border-brand-dark'}`}
              />
              <button
                type="button"
                onClick={() => setVisibility(v => v === 'public' ? 'private' : 'public')}
                title={language === 'en' ? 'Who can see this recipe' : 'מי יכול לראות את המתכון'}
                className={`flex-shrink-0 w-28 flex items-center justify-center gap-1.5 px-3 rounded-2xl text-sm font-medium border transition-colors ${
                  visibility === 'public'
                    ? 'bg-brand/10 text-brand-dark border-brand/30 hover:bg-brand/15'
                    : 'bg-cream-dark text-muted border-border hover:bg-border'
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
              className="w-full px-4 py-3 bg-cream border border-border rounded-2xl text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-dark/20 focus:border-brand-dark transition-all resize-none"
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
                className="w-full flex items-center justify-center sm:justify-between gap-2 px-4 py-3 bg-cream border border-border rounded-2xl text-ink font-medium cursor-pointer hover:border-border-dark hover:bg-cream-dark focus:outline-none focus:ring-2 focus:ring-brand-dark/20 focus:border-brand-dark transition-all"
              >
                <span className={`flex items-center gap-1.5 min-w-0 ${selectedCats.length ? '' : 'text-muted'}`}>
                  {selectedCats.length === 0
                    ? <span className="truncate">{language === 'en' ? 'None' : 'ללא'}</span>
                    : <>
                        {selectedCats.map(c => <span key={c.id} className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: c.color || categoryColor(c.name) }} />)}
                        <span className="truncate hidden sm:inline">{selectedCats.map(c => c.name).join(', ')}</span>
                      </>}
                </span>
                <ChevronDown className={`w-4 h-4 text-brand-dark flex-shrink-0 transition-transform duration-200 ${catOpen ? 'rotate-180' : ''}`} />
              </button>
              {catOpen && (
                <div ref={catMenuRef} style={{ direction: isRtl ? 'ltr' : 'rtl' }} className={`absolute z-20 mt-2 ${isRtl ? 'right-0' : 'left-0'} min-w-full w-max max-w-[80vw] bg-white border border-border rounded-2xl shadow-lg max-h-60 overflow-y-auto overflow-x-hidden`}>
                  {userCategories.length === 0 && !showNewCatInput && (
                    <p className="px-4 py-2.5 text-sm text-faint text-center">{language === 'en' ? 'No categories yet' : 'אין קטגוריות עדיין'}</p>
                  )}
                  {userCategories.map(c => {
                    const selected = selectedCatIds.includes(c.id)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        style={{ direction: isRtl ? 'rtl' : 'ltr' }}
                        onClick={() => toggleCat(c.id)}
                        className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-start transition-colors ${selected ? 'bg-brand/10 text-brand font-medium' : 'text-ink hover:bg-cream-dark'}`}
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
                    <div style={{ direction: isRtl ? 'rtl' : 'ltr' }} className="flex flex-col gap-2 sm:flex-row sm:items-center px-4 py-2 border-t border-border/60">
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
                        className="w-full sm:flex-1 min-w-0 px-3 py-2 bg-cream border border-border rounded-2xl text-sm text-ink focus:outline-none focus:border-brand-dark"
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
                        className="w-full sm:w-9 h-9 flex items-center justify-center bg-brand text-white rounded-xl hover:bg-brand-dark flex-shrink-0"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      style={{ direction: isRtl ? 'rtl' : 'ltr' }}
                      onClick={() => { setShowNewCatInput(true); setNewCatName(''); requestAnimationFrame(() => catMenuRef.current?.scrollTo({ top: catMenuRef.current.scrollHeight, behavior: 'smooth' })) }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-start text-brand hover:bg-cream border-t border-border/60 font-medium transition-colors"
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
              className="no-spinner w-28 text-center font-semibold bg-cream border border-border rounded-2xl px-3 py-3 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-dark/20 focus:border-brand-dark transition-all"
            />
          </div>

          {/* Prepped-count stepper removed 2026-07-29 — moving to the cook-history
              drawer on RecipeDetail. Recoverable from git if needed. */}
          </div>

          {/* Ingredients — one line at a time */}
          <div>
            <FieldLabel icon={List} trailing={ingredients.length > 0 && (
              <span className="text-xs font-medium text-faint">
                {countItems(ingredients)} {language === 'en' ? (countItems(ingredients) === 1 ? 'item' : 'items') : 'פריטים'}
              </span>
            )}>
              {language === 'en' ? 'Ingredients' : 'רכיבים'}</FieldLabel>
            {ingredients.length > 0 && (
              <ul className="mb-2 space-y-1.5">
                {ingredients.map((item, i) => (
                  <li key={i} style={landedDelay(i, ingredients.length, landed.ing)}
                    className={`flex items-center gap-2 px-4 py-2 bg-cream border border-border rounded-2xl
                      ${isLanded(i, ingredients.length, landed.ing) ? 'item-landed' : ''}`}>
                    {/* A group title ("לרוטב:") gets no bullet and reads in brand colour, as on the recipe page */}
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isGroupHeading(item) ? 'bg-transparent' : 'bg-brand'}`} />
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
                        className="flex-1 min-w-0 text-sm text-ink bg-transparent focus:outline-none"
                      />
                    ) : (
                      <button type="button" onClick={() => setEditIng({ i, text: item })}
                        className={`flex-1 min-w-0 text-start text-sm break-words hover:text-brand-dark transition-colors ${isGroupHeading(item) ? 'font-bold text-brand-deep' : 'text-ink'}`}>
                        {item}
                      </button>
                    )}
                    <button type="button" onClick={() => setIngredients(list => list.filter((_, j) => j !== i))}
                      className="flex-shrink-0 text-faint hover:text-red-500 transition-colors" title={language === 'en' ? 'Remove' : 'הסר'}>
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
                className={`w-full px-4 py-3 pe-14 bg-cream border rounded-2xl text-ink placeholder:text-muted focus:outline-none transition-all ${errors.ingredients ? 'border-red-400 ring-2 ring-red-200' : 'border-border focus:ring-2 focus:ring-brand-dark/20 focus:border-brand-dark'}`}
              />
              {ingredientDraft && (
                <button type="button"
                  onClick={() => { setIngredientDraft(''); if (errors.ingredients) setErrors(p => ({ ...p, ingredients: null })) }}
                  className={`absolute top-1/2 -translate-y-1/2 ${isRtl ? 'left-3' : 'right-3'} text-xs font-medium text-faint hover:text-red-500 transition-colors`}>
                  {language === 'en' ? 'Clear' : 'נקה'}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={addIngredient}
              disabled={!ingredientDraft.trim()}
              className="mt-2 flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-brand-dark bg-brand/10 hover:bg-brand/15 rounded-2xl border border-brand/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-4 h-4" />
              {language === 'en' ? 'Add ingredient' : 'הוסף רכיב'}
            </button>
            {errors.ingredients && <p className="text-xs text-red-500 mt-1.5 ps-[14px]">{errors.ingredients}</p>}
          </div>

          {/* Instructions — one line at a time */}
          <div>
            <FieldLabel icon={ListOrdered} trailing={instructions.length > 0 && (
              <span className="text-xs font-medium text-faint">
                {countItems(instructions)} {language === 'en' ? (countItems(instructions) === 1 ? 'step' : 'steps') : 'שלבים'}
              </span>
            )}>
              {language === 'en' ? 'Instructions' : 'הוראות'}</FieldLabel>
            {instructions.length > 0 && (
              <ol className="mb-2 space-y-1.5">
                {instructions.map((item, i) => (
                  <li key={i} data-step-idx={i}
                    style={landedDelay(i, instructions.length, landed.inst)}
                    className={`flex items-center gap-2.5 px-4 py-2 bg-cream border rounded-2xl transition-shadow
                      ${dragIdx === i ? 'border-brand shadow-md select-none' : 'border-border'}
                      ${isLanded(i, instructions.length, landed.inst) ? 'item-landed' : ''}`}>
                    <button type="button" onPointerDown={e => startStepDrag(e, i)}
                      style={{ touchAction: 'none' }}
                      className="flex-shrink-0 cursor-grab active:cursor-grabbing text-faint hover:text-brand-dark transition-colors"
                      title={language === 'en' ? 'Drag to reorder' : 'גרור לשינוי סדר'}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M5 6h14M5 12h14M5 18h14" />
                      </svg>
                    </button>
                    {/* Titles take no number; steps number on across them, as on the recipe page */}
                    <span className={`flex-shrink-0 w-6 h-6 rounded-full text-xs font-semibold flex items-center justify-center ${stepNums[i] === null ? '' : 'bg-brand/10 text-brand-dark'}`}>{stepNums[i]}</span>
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
                        className="flex-1 min-w-0 text-sm text-ink bg-transparent focus:outline-none"
                      />
                    ) : (
                      <button type="button" onClick={() => setEditInst({ i, text: item })}
                        className={`flex-1 min-w-0 text-start text-sm break-words hover:text-brand-dark transition-colors ${stepNums[i] === null ? 'font-bold text-brand-deep' : 'text-ink'}`}>
                        {item}
                      </button>
                    )}
                    <button type="button" onClick={() => setInstructions(list => list.filter((_, j) => j !== i))}
                      className="flex-shrink-0 text-faint hover:text-red-500 transition-colors" title={language === 'en' ? 'Remove' : 'הסר'}>
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
                className={`w-full px-4 py-3 pe-14 bg-cream border rounded-2xl text-ink placeholder:text-muted focus:outline-none transition-all ${errors.instructions ? 'border-red-400 ring-2 ring-red-200' : 'border-border focus:ring-2 focus:ring-brand-dark/20 focus:border-brand-dark'}`}
              />
              {instructionDraft && (
                <button type="button"
                  onClick={() => { setInstructionDraft(''); if (errors.instructions) setErrors(p => ({ ...p, instructions: null })) }}
                  className={`absolute top-1/2 -translate-y-1/2 ${isRtl ? 'left-3' : 'right-3'} text-xs font-medium text-faint hover:text-red-500 transition-colors`}>
                  {language === 'en' ? 'Clear' : 'נקה'}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={addInstruction}
              disabled={!instructionDraft.trim()}
              className="mt-2 flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-brand-dark bg-brand/10 hover:bg-brand/15 rounded-2xl border border-brand/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
            className="flex-1 py-3 px-4 bg-white border border-border text-muted rounded-2xl font-medium hover:bg-cream-dark transition-colors shadow-sm"
          >
            {language === 'en' ? 'Cancel' : 'בטל'}
          </button>
          <button
            type="submit"
            form="recipe-form"
            className="flex-1 py-3 px-4 bg-brand text-white rounded-2xl font-medium hover:bg-brand-dark transition-colors shadow-sm"
          >
            {editingRecipe?.id ? (language === 'en' ? 'Save Changes' : 'שמור שינויים')
                               : (language === 'en' ? 'Add Recipe' : 'הוסף מתכון')}
          </button>
        </div>
      </div>
      </div>

      {/* Paste sheet — portaled so the form's own stacking and the fixed action bar
          can't trap it. Orange band: adding a recipe is a cooking action. */}
      {showPaste && createPortal(
        <>
          <div className="fixed inset-0 z-[60] backdrop-blur-sm bg-black/30" onClick={() => setShowPaste(false)} />
          <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 py-12 overflow-y-auto"
            onClick={() => setShowPaste(false)}>
            <div onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-lg overflow-hidden"
              style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
              <div className="relative -mx-6 -mt-6 sm:-mx-8 sm:-mt-8 px-6 sm:px-8 pt-7 pb-7 mb-6 band-brand">
                <button type="button" onClick={() => setShowPaste(false)}
                  title={language === 'en' ? 'Close' : 'סגור'}
                  className="absolute top-4 end-4 text-white/85 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 band-badge">
                    <ClipboardList className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h2 className="text-center text-2xl font-bold tracking-tight text-white">
                      {language === 'en' ? 'Paste a recipe' : 'הדבקת מתכון'}
                    </h2>
                    <p className="text-center text-sm text-white/85 mt-1">
                      {language === 'en'
                        ? "Anything goes — a page, a message, your notes"
                        : 'הכל הולך — אתר, הודעה או פתק'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <textarea
                  autoFocus
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  rows={9}
                  placeholder={language === 'en'
                    ? 'Shakshuka\n\nIngredients\n2 tbsp olive oil\n1 onion, diced\n\nInstructions\nHeat the oil in a wide pan...'
                    : 'שקשוקה\n\nמצרכים\n2 כפות שמן זית\nבצל אחד\n\nאופן ההכנה\nמחממים את השמן במחבת...'}
                  className="w-full px-4 py-3 bg-cream border border-border rounded-2xl text-sm text-ink placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-brand-dark/20 focus:border-brand-dark transition-all resize-none"
                />
                <p className="flex items-start gap-1.5 text-xs text-muted text-start">
                  <Sparkles className="w-3.5 h-3.5 text-brand-dark flex-shrink-0 mt-0.5" />
                  <span>
                    {language === 'en'
                      ? "It sorts the ingredients from the steps as best it can — you'll land in the form to fix anything it got wrong."
                      : 'הוא מפריד בין הרכיבים לשלבים כמיטב יכולתו — תמיד אפשר לתקן אחר כך בטופס.'}
                  </span>
                </p>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowPaste(false)} className="flex-1 btn-modal btn-ghost">
                    {language === 'en' ? 'Cancel' : 'בטל'}
                  </button>
                  <button type="button" onClick={applyPaste} disabled={!pasteText.trim()}
                    className="flex-1 btn-modal btn-brand disabled:bg-brand/50 disabled:cursor-not-allowed">
                    {language === 'en' ? 'Fill the form' : 'מלא את הטופס'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  )
}

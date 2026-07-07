import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Check, Bookmark, Plus } from 'lucide-react'
import { categoryColor } from '../utils/categoryColor'

const BRAND = '#e67e22'

// "Save to" category dropdown (checkbox list + inline create).
// Dropdown is portalled with fixed positioning so it isn't clipped by overflow-hidden cards.
// compact → icon-only trigger styled like the card share button; otherwise a labelled pill.
export function SaveToMenu({ language, accent = BRAND, recipe, userCategories = [], currentRecipeCategories = [], onToggleRecipeCategory, onCreateCategory, compact = false, onOpenChange }) {
  const [pos, setPos] = useState(null) // {x, y} of the dropdown's top-start corner, or null = closed
  const [selected, setSelected] = useState([]) // pending selection, committed on close
  const [newCategoryInput, setNewCategoryInput] = useState('')
  const btnRef = useRef(null)
  const menuRef = useRef(null)
  // Latest values for the close handler (registered once per open).
  const selectedRef = useRef(selected); selectedRef.current = selected
  const originalRef = useRef(currentRecipeCategories)

  useEffect(() => { onOpenChange?.(!!pos) }, [pos])

  // Commit the diff between what was saved when we opened and the pending selection.
  const close = () => {
    const orig = originalRef.current
    const next = selectedRef.current
    for (const id of new Set([...orig, ...next])) {
      if (orig.includes(id) !== next.includes(id)) onToggleRecipeCategory(recipe.id, id)
    }
    setPos(null)
  }

  useEffect(() => {
    if (!pos) return
    const handler = (e) => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      close()
    }
    document.addEventListener('mousedown', handler)
    window.addEventListener('scroll', close, true) // trigger may scroll out of view → commit + drop
    return () => {
      document.removeEventListener('mousedown', handler)
      window.removeEventListener('scroll', close, true)
    }
  }, [pos])

  const toggle = (e) => {
    e.stopPropagation()
    if (pos) return close()
    originalRef.current = currentRecipeCategories
    setSelected(currentRecipeCategories)
    const r = btnRef.current.getBoundingClientRect()
    // Hebrew anchors to the right edge, English to the left edge (of the trigger).
    setPos(language === 'he'
      ? { right: Math.min(Math.max(window.innerWidth - r.right, 8), window.innerWidth - 216), y: r.bottom + 8 }
      : { left: Math.min(r.left, window.innerWidth - 216), y: r.bottom + 8 })
  }

  const saved = currentRecipeCategories.length > 0

  return (
    <>
      {compact ? (
        <button
          ref={btnRef}
          onClick={toggle}
          className="w-8 h-8 rounded-lg bg-white/80 backdrop-blur flex items-center justify-center text-muted hover:text-brand-dark hover:bg-white transition-colors shadow-sm border border-border/50"
          style={saved ? { color: accent } : undefined}
        >
          <Bookmark className="w-3.5 h-3.5" style={saved ? { fill: accent } : undefined} />
        </button>
      ) : (
        <button
          ref={btnRef}
          onClick={toggle}
          className={`flex items-center gap-2 px-3 py-2 text-sm rounded-xl transition-colors ${saved ? '' : 'text-muted hover:text-brand-dark hover:bg-cream'}`}
          style={saved ? { color: accent, backgroundColor: `${accent}1a` } : undefined}
        >
          <Bookmark className="w-4 h-4" style={saved ? { fill: accent } : undefined} />
          <span className="hidden sm:inline">{saved ? 'Saved' : 'Save to'}</span>
        </button>
      )}
      {pos && createPortal(
        <div
          ref={menuRef}
          onClick={e => e.stopPropagation()}
          style={{ position: 'fixed', top: pos.y, left: pos.left, right: pos.right }}
          className="z-50 bg-white border border-border rounded-2xl shadow-lg overflow-hidden min-w-[200px]"
        >
          {userCategories.length === 0 && !onCreateCategory && (
            <p className="px-4 py-3 text-sm text-muted">{language === 'en' ? 'No categories yet' : 'אין קטגוריות עדיין'}</p>
          )}
          {userCategories.map(cat => {
            const isSaved = selected.includes(cat.id)
            return (
              <button
                key={cat.id}
                onClick={() => setSelected(s => s.includes(cat.id) ? s.filter(id => id !== cat.id) : [...s, cat.id])}
                className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-start transition-colors ${isSaved ? 'bg-brand/10 text-brand font-medium' : 'text-ink hover:bg-cream-dark'}`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color || categoryColor(cat.name) }} />
                  <span className="truncate">{cat.name}</span>
                </span>
                <span className="w-4 flex-shrink-0">{isSaved && <Check className="w-4 h-4" />}</span>
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
                if (newCat) setSelected(s => [...s, newCat.id])
                setNewCategoryInput('')
              }}
              className="border-t border-border px-3 py-2 flex items-center gap-2"
            >
              <Plus className="w-3.5 h-3.5 text-muted flex-shrink-0" />
              <input
                value={newCategoryInput}
                onChange={e => setNewCategoryInput(e.target.value)}
                placeholder={language === 'en' ? 'New category...' : 'קטגוריה חדשה...'}
                className="flex-1 text-sm text-ink placeholder:text-muted focus:outline-none bg-transparent"
              />
            </form>
          )}
        </div>,
        document.body
      )}
    </>
  )
}

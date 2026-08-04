import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Users, ChefHat, Check, Pencil, Trash2, RotateCcw, UtensilsCrossed, Share2, Heart, Copy, Bookmark, Plus, Flame, Lock, Globe, CalendarDays } from 'lucide-react'
import { buildShareText } from '../utils/shareRecipe'
import { MarbleSpine } from './MarbleSpine'
import { playSizzle } from '../utils/sizzle'
import { ShareQR } from './ShareQR'
import { SaveToMenu } from './SaveToMenu'
import { groupByDay, monthMatrix, dayKey, stepMonth, canStep, isEditableDay, sameMonth, recentDays, tidyRelative, relativeUnit } from '../utils/cookStats'

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
      className={`flex items-center gap-2 px-3 py-2 text-sm rounded-xl transition-colors ${danger ? 'text-muted hover:text-red-500 hover:bg-red-50' : 'text-muted hover:text-brand hover:bg-cream'}`}
    >
      <Icon className="w-4 h-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

// Cook history. On xl+ it floats in the page margin (max-w-3xl leaves ~256px a
// side at 1280px), anchored to the reading-end side so trigger and panel stay
// together in both directions. Below xl there is no margin to borrow, so the
// same card opens as a centred dialog instead.
function CookHistoryDrawer({ dates, language, accent, open, onClose, triggerRef, recipe, onAddPrepOn, onRemovePrep }) {
  const [editing, setEditing] = useState(false)

  // Any click off the card closes it — below xl the dialog backdrop covers the
  // page, but the xl drawer sits in the open page with nothing over it. The
  // trigger is exempt or its own click would re-open what it just closed.
  // Capture phase on document, so the dismissing click is swallowed before it
  // reaches React's root: it only closes, it never also fires the toolbar
  // button underneath.
  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => {
      if (e.target.closest?.('[data-history-panel]') || triggerRef?.current?.contains(e.target)) return
      e.preventDefault()
      e.stopPropagation()
      onClose?.()
    }
    document.addEventListener('click', onDocClick, true)
    return () => document.removeEventListener('click', onDocClick, true)
    // [open] only: onClose is a fresh arrow each parent render, so listing it would
    // re-subscribe on every render again. Every version of it does the same thing,
    // so the captured one is never stale in a way that matters.
  }, [open])

  // The dialog overlays the page below xl, so the page behind it must not
  // scroll. ponytail: read once on open — resizing across xl while open is not
  // worth a listener.
  useEffect(() => {
    if (!open || window.matchMedia('(min-width: 1280px)').matches) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])
  const canEdit = !!(onAddPrepOn && onRemovePrep)
  const isRtlLang = language === 'he'
  const locale = language === 'en' ? 'en-GB' : 'he-IL'
  // Intl handles both languages, including Hebrew RTL — no date library.
  const dayFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' })
  const shortFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  const now = new Date()
  const relative = (iso) => {
    const { n, unit } = relativeUnit(iso, now)
    return tidyRelative(rtf.format(-n, unit))
  }

  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const monthFmt = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })

  const byDay = groupByDay(dates)
  const matrix = monthMatrix(view.y, view.m)
  const isThisMonth = sameMonth(new Date(view.y, view.m, 1), now)

  const cells = matrix.map((day, i) => {
    if (!day) return <span key={i} className="block aspect-square" />

    const hits = byDay[dayKey(day)] || []
    const n = hits.length
    const editable = isEditableDay(day, now)
    const isToday = dayKey(day) === dayKey(now)
    const tint = n
      ? { backgroundColor: accent, opacity: n > 1 ? 1 : 0.62, color: '#fff' }
      : { backgroundColor: '#f5f3ef', color: '#a39b8d' }
    const label = `${shortFmt.format(day)}${n ? ` ×${n}` : ''}`

    const base = `block w-full aspect-square rounded-lg xl:rounded-md text-xs xl:text-[0.6rem] leading-none flex items-center justify-center tabular-nums ${
      isToday ? 'ring-1 ring-inset' : ''
    }`
    const ring = isToday ? { boxShadow: `inset 0 0 0 1px ${accent}` } : null

    if (editing && editable) {
      return (
        <button
          key={i}
          type="button"
          // Empty day adds a prep; a day that already has some removes the most
          // recent one, so tapping N times clears a day prepped N times.
          onClick={() => n
            ? onRemovePrep(hits[0].id)
            : onAddPrepOn(recipe, day.getFullYear(), day.getMonth(), day.getDate())}
          title={label}
          aria-label={label}
          className={`${base} border-0 p-0 appearance-none cursor-pointer transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1`}
          style={{ ...tint, ...ring, outlineColor: accent }}
        >
          {day.getDate()}
        </button>
      )
    }
    return (
      <span
        key={i}
        title={label}
        className={`${base} ${editing ? 'opacity-40' : ''}`}
        style={{ ...tint, ...ring }}
      >
        {day.getDate()}
      </span>
    )
  })

  const dows = language === 'en'
    ? ['S', 'M', 'T', 'W', 'T', 'F', 'S']
    : ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']

  const go = (delta) => setView(v => stepMonth(v, delta, now))
  // "Older" and "newer" are laid out by reading order, so the icons flip with
  // the language while the meaning of each side stays put.
  const OlderIcon = isRtlLang ? ChevronRight : ChevronLeft
  const NewerIcon = isRtlLang ? ChevronLeft : ChevronRight

  // One card, two homes: the xl margin drawer and the portaled dialog below it.
  const card = (
    <div data-history-panel className="bg-white rounded-3xl border border-border/60 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <IconChip icon={CalendarDays} accent={accent} size={7} />
          <h2 className="text-base xl:text-sm font-semibold text-ink flex-1 whitespace-nowrap">
            {language === 'en' ? 'Cook history' : 'היסטוריית הכנות'}
          </h2>
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing(v => !v)}
              aria-pressed={editing}
              title={editing
                ? (language === 'en' ? 'Done' : 'סיום')
                : (language === 'en' ? 'Edit history' : 'עריכת ההיסטוריה')}
              className={`p-2 xl:p-1 rounded-lg transition-colors ${
                editing ? 'text-brand-dark bg-cream-dark' : 'text-faint hover:text-brand-dark hover:bg-cream-dark'
              }`}
            >
              {editing ? <Check className="w-4 h-4 xl:w-3.5 xl:h-3.5" /> : <Pencil className="w-4 h-4 xl:w-3.5 xl:h-3.5" />}
            </button>
          )}
        </div>

        {/* Empty state gives way to the grid in edit mode — otherwise there is
            nothing to tap to log the first prep. */}
        {dates.length === 0 && !editing ? (
          <p className="text-xs text-faint leading-relaxed">
            {language === 'en'
              ? 'No preps logged yet. Hit the chef hat when you make this.'
              : 'עוד לא נרשמו הכנות. לחץ על כובע השף כשתכין את זה.'}
          </p>
        ) : (
          <>
            {/* Month nav — the label names the month you are looking at, so the
                grid is never an unlabelled block of squares. */}
            <div className="flex items-center justify-between gap-1 mb-2">
              <button
                type="button"
                onClick={() => go(-1)}
                disabled={!canStep(view, -1, now)}
                aria-label={language === 'en' ? 'Previous month' : 'החודש הקודם'}
                className="p-2 xl:p-1 rounded-lg text-faint hover:text-brand-dark hover:bg-cream-dark disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-faint transition-colors"
              >
                <OlderIcon className="w-4 h-4 xl:w-3.5 xl:h-3.5" />
              </button>
              <span className="text-sm xl:text-[0.7rem] font-medium text-ink text-center flex-1">
                {monthFmt.format(new Date(view.y, view.m, 1))}
              </span>
              <button
                type="button"
                onClick={() => go(1)}
                disabled={!canStep(view, 1, now)}
                aria-label={language === 'en' ? 'Next month' : 'החודש הבא'}
                className="p-2 xl:p-1 rounded-lg text-faint hover:text-brand-dark hover:bg-cream-dark disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-faint transition-colors"
              >
                <NewerIcon className="w-4 h-4 xl:w-3.5 xl:h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 xl:gap-[3px]">
              {dows.map((d, i) => (
                <span key={i} className="text-[0.65rem] xl:text-[0.55rem] text-fainter text-center leading-none pb-1">{d}</span>
              ))}
              {cells}
            </div>

            {!isThisMonth && (
              <button
                type="button"
                onClick={() => setView({ y: now.getFullYear(), m: now.getMonth() })}
                className="mt-2 text-[0.65rem] text-muted hover:text-brand-dark transition-colors"
              >
                {language === 'en' ? 'Back to this month' : 'חזרה לחודש הנוכחי'}
              </button>
            )}

            {/* Total lives here rather than in the header: it kept the title
                wrapping to two lines, and down here the label makes clear it
                counts every prep, not the month on screen. */}
            {dates.length > 0 && (
              <div className="mt-3 pt-2.5 border-t border-border/50 flex items-baseline justify-between gap-2">
                <span className="text-[0.65rem] text-faint">
                  {language === 'en' ? 'Made in total' : 'סך הכל'}
                </span>
                <span dir="ltr" className="text-xs font-semibold" style={{ color: accent }}>
                  ×{dates.length}
                </span>
              </div>
            )}

            {editing ? (
              <p className="mt-3 text-[0.65rem] text-faint leading-relaxed">
                {language === 'en'
                  ? 'Tap a day to add a prep. Tap a day you already cooked to remove its latest one.'
                  : 'לחץ על יום כדי להוסיף הכנה. לחץ על יום שכבר בישלת בו כדי להסיר את ההכנה האחרונה שלו.'}
              </p>
            ) : (
              dates.length > 0 && (
                <div className="mt-2.5 grid gap-2">
                  {recentDays(dates, 3).map((d) => (
                    <div key={d.key} className="flex justify-between gap-2 text-xs">
                      <span className="text-ink/85">{dayFmt.format(new Date(d.at))}</span>
                      <span className="text-faint whitespace-nowrap">{relative(d.at)}</span>
                    </div>
                  ))}
                </div>
              )
            )}
          </>
        )}
    </div>
  )

  return (
    <>
      {/* xl: floats in the page margin. Physical side, not logical — it hugs
          the reading-end side (left in Hebrew, right in English), which
          explicit left/right keeps unambiguous once the element sets its own
          direction. `inert` while closed keeps its buttons out of the tab
          order without a second aria-hidden. */}
      <div
        inert={!open}
        className={`hidden xl:block absolute top-0 w-60 transition-all duration-300 ease-out ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        } ${isRtlLang ? 'right-full mr-3' : 'left-full ml-3'}`}
        style={{ direction: isRtlLang ? 'rtl' : 'ltr' }}
      >
        {card}
      </div>

      {/* Below xl there is no margin to borrow, so it becomes a dialog — same
          shape as the share / confirm dialogs. */}
      {open && createPortal(
        <div
          className="xl:hidden fixed inset-0 z-50 backdrop-blur-sm bg-black/40 flex items-start justify-center px-4 py-12 overflow-y-auto"
          onClick={onClose}
          style={{ direction: isRtlLang ? 'rtl' : 'ltr' }}
        >
          <div className="w-full max-w-sm" onClick={e => e.stopPropagation()}>{card}</div>
        </div>,
        document.body
      )}
    </>
  )
}

function IngredientsCard({ recipe, language, accent, checked, toggle, clearAll }) {
  return (
    <div className="lg:col-span-2">
      <div className="bg-white rounded-3xl border border-border/60 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-3">
          <IconChip icon={UtensilsCrossed} accent={accent} size={7} />
          <h2 className="text-lg font-semibold text-ink flex-1">
            {language === 'en' ? 'Ingredients' : 'מצרכים'}
          </h2>
          {checked.size > 0 && (
            <button onClick={clearAll} className="flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors">
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
                <span className={`text-sm transition-all duration-200 ${isChecked ? 'text-faint line-through' : 'text-ink/85'}`}>
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
      <div className="bg-white rounded-3xl border border-border/60 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-ink mb-6 flex items-center">
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
              <p className="relative z-10 text-ink/85 leading-relaxed pt-1 m-0">
                {instruction}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

export function RecipeDetail({ recipe, language = 'en', onBack, onEdit, onDelete, onMarkMade, cookCount = 0, cookDates = [], onAddPrepOn, onRemovePrep, likeCount = 0, isLiked = false, onToggleLike, onDuplicate, onSelectAuthor, userCategories = [], currentRecipeCategories = [], onToggleRecipeCategory, onCreateCategory }) {
  const isRtl = language === 'he'
  const [showQR, setShowQR] = useState(false)
  const [copied, setCopied] = useState(false)
  const [marked, setMarked] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const historyBtnRef = useRef(null)
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
        <button onClick={onBack} className="flex items-center gap-2 text-muted hover:text-ink transition-colors">
          {isRtl ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
          <span className="font-medium">Back</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowQR(true)}
            dir="ltr"
            className="flex items-center gap-2 px-3 py-2 text-sm text-muted hover:text-brand-dark hover:bg-cream rounded-xl transition-colors"
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
          {/* Sits between Saved and Edit. xl-only: below that there is no
              margin for the panel to open into. */}
          {onMarkMade && (
            <button
              ref={historyBtnRef}
              onClick={() => setShowHistory(v => !v)}
              aria-pressed={showHistory}
              dir="ltr"
              className={`flex items-center gap-2 px-3 py-2 text-sm rounded-xl transition-colors ${
                showHistory ? 'bg-cream-dark text-brand-dark' : 'text-muted hover:text-brand hover:bg-cream'
              }`}
            >
              <CalendarDays className="w-4 h-4" />
              <span className="hidden sm:inline">History</span>
            </button>
          )}
          {onDuplicate && <ToolbarButton icon={Copy} label="Dupe" onClick={() => onDuplicate(recipe)} />}
          {onEdit && <ToolbarButton icon={Pencil} label="Edit" onClick={() => onEdit(recipe)} />}
          {onDelete && <ToolbarButton icon={Trash2} label="Delete" onClick={() => onDelete(recipe)} danger />}
        </div>
      </div>

      {/* Wrapper exists only to anchor the history drawer level with the header
          card — the card itself clips (overflow-hidden for the marbled spine). */}
      <div className="relative mb-3">
      {onMarkMade && (
        <CookHistoryDrawer
          dates={cookDates}
          language={language}
          accent={accent}
          open={showHistory}
          onClose={() => setShowHistory(false)}
          triggerRef={historyBtnRef}
          recipe={recipe}
          onAddPrepOn={onAddPrepOn}
          onRemovePrep={onRemovePrep}
        />
      )}
      {/* Recipe Header Card — marbled left spine blends the category colors (matches the cards) */}
      <div className="relative bg-white rounded-3xl border border-border/60 shadow-sm overflow-hidden">
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
              <h1 className="text-2xl sm:text-3xl font-bold text-ink text-balance">
                {recipe.title}
                {recipe.visibility && (
                  <span
                    className="inline-block align-middle ms-2 -translate-y-0.5 text-faint"
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
                  className="mt-1.5 text-sm text-muted hover:text-brand transition-colors"
                >
                  <span dir="ltr">@{recipe.authorUsername}</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {onToggleLike && (
                <button
                  onClick={() => onToggleLike(recipe.id)}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-2xl border transition-all duration-200 ${isLiked ? 'bg-red-50 border-red-200 text-red-500' : 'bg-cream border-border text-muted hover:border-red-200 hover:text-red-400'}`}
                >
                  <Heart className={`w-5 h-5 ${isLiked ? 'fill-red-500' : ''}`} />
                  <span className="text-xs font-medium leading-none">{likeCount > 0 ? likeCount : '—'}</span>
                </button>
              )}
              {onMarkMade && (
                <button
                  onClick={handleMarkMade}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-2xl border transition-all duration-200 ${marked ? 'bg-green-50 border-green-200 text-green-500' : 'bg-cream border-border text-muted hover:border-brand/50 hover:text-brand'}`}
                >
                  <ChefHat className="w-5 h-5" />
                  <span dir="ltr" className="flex items-center justify-center h-3 text-xs font-medium leading-none">
                    {marked ? <Check className="w-3 h-3" strokeWidth={3} /> : cookCount > 0 ? `×${cookCount}` : '—'}
                  </span>
                </button>
              )}
            </div>
          </div>

          <p className="text-muted leading-relaxed mb-6">{recipe.description}</p>

          <div className={`flex flex-wrap items-center gap-4 sm:gap-6 text-sm text-muted ${isRtl ? 'text-right' : 'text-left'}`}>
            <Stat icon={Users} accent={accent}>{language === 'en' ? '4 servings' : '4 מנות'}</Stat>
            <Stat icon={ChefHat} accent={accent}>{language === 'en' ? `${recipe.ingredients.length} ingredients` : `${recipe.ingredients.length} מצרכים`}</Stat>
            {/* calories_per_serving — shows once the field is populated; null/absent until calc lands */}
            {calories != null && (
              <Stat icon={Flame} accent={accent}>≈ {calories} {language === 'en' ? 'kcal / serving' : 'קלוריות / מנה'}</Stat>
            )}
          </div>
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

import { useState, useEffect } from 'react'
import { ChevronUp } from 'lucide-react'

// Appears once you're a screen or so down the page, scrolls back up, hides again
// at the top. Rendered once at the app root, so it follows every view.
const SHOW_AFTER = 300

export function ScrollToTop({ language }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Passive listener; the state only changes on the two threshold crossings,
    // so React isn't re-rendering on every scroll frame.
    const onScroll = () => setShow(window.scrollY > SHOW_AFTER)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const label = language === 'en' ? 'Back to top' : 'חזרה למעלה'

  // Sits at the edge of <main>'s 72rem column on a wide screen, and at a plain
  // 1rem gutter once the window is narrower than the column — max() picks
  // whichever is further in, so it can never end up off-screen on a phone.
  // The app never sets dir=rtl, so the side keys off the language, not a logical
  // property.
  const inset = { [language === 'he' ? 'left' : 'right']: 'max(1rem, calc(50vw - 36rem + 1rem))' }

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      title={label}
      aria-label={label}
      // Kept mounted so it can fade rather than pop; untabbable and click-through
      // while hidden.
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
      style={{ ...inset, bottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
      className={`fixed z-40 w-11 h-11 rounded-full bg-white border border-border-dark text-espresso
        shadow-lg flex items-center justify-center transition-all duration-200 hover:bg-cream-dark hover:-translate-y-0.5
        ${show ? 'opacity-100' : 'opacity-0 pointer-events-none translate-y-2'}`}
    >
      <ChevronUp className="w-5 h-5" />
    </button>
  )
}

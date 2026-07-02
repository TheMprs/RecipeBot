import { useEffect } from 'react'

// Wheel → smooth horizontal scroll while hovering a row (RTL-aware).
// The canonical hover + RAF carousel pattern: pass the scroll container's ref
// and an "active" flag (usually a hover state).
export function useWheelScroll(ref, active) {
  useEffect(() => {
    if (!active) return

    let target = null
    let rafId = null

    const animate = () => {
      const el = ref.current
      if (!el) { rafId = null; return }
      const diff = target - el.scrollLeft
      if (Math.abs(diff) < 1) { el.scrollLeft = target; rafId = null; return }
      el.scrollLeft += diff * 0.15
      rafId = requestAnimationFrame(animate)
    }

    const onWheel = (e) => {
      const el = ref.current
      if (!el) return
      e.preventDefault()
      if (target === null) target = el.scrollLeft
      const rtl = getComputedStyle(el).direction === 'rtl'
      const step = Math.sign(e.deltaY) * 120 * (rtl ? -1 : 1)
      const maxScroll = el.scrollWidth - el.clientWidth
      target = rtl
        ? Math.min(0, Math.max(-maxScroll, target + step))
        : Math.max(0, Math.min(maxScroll, target + step))
      if (!rafId) rafId = requestAnimationFrame(animate)
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('wheel', onWheel)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [ref, active])
}

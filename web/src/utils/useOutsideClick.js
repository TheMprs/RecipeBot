import { useEffect, useRef } from 'react'

// Calls onOutside on any mousedown outside the given ref(s).
// `active` gates the listener (e.g. only while a menu is open).
export function useOutsideClick(refs, onOutside, active = true) {
  const cb = useRef(onOutside)
  cb.current = onOutside

  useEffect(() => {
    if (!active) return
    const list = Array.isArray(refs) ? refs : [refs]
    const handler = (e) => {
      if (list.some(r => r.current?.contains(e.target))) return
      cb.current()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
    // refs array identity changes per render — contents don't; keyed on active only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}

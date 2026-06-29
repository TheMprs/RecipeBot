import { marbleBackground } from '../utils/categoryColor'

// Color spine on the card's leading edge. CSS-gradient marble (cheap, composites
// cleanly) — no runtime SVG filter, which re-rasterized on every hover frame.
// 0 colors → nothing, 1 → solid, 2+ → marbled blend.
export function MarbleSpine({ colors, className = 'w-2.5' }) {
  const bg = marbleBackground((colors || []).filter(Boolean))
  if (!bg) return null
  return <div className={`absolute inset-y-0 start-0 z-10 ${className}`} style={{ background: bg }} />
}

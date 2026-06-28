// Marbled color spine — SVG turbulence swirls the category colors into veins.
// 0 colors → nothing, 1 → solid fill, 2+ → swirl. Sits absolutely on the leading edge.
export function MarbleSpine({ colors, id, className = 'w-2.5' }) {
  const c = (colors || []).filter(Boolean)
  if (c.length === 0) return null

  if (c.length === 1) {
    return <div className={`absolute inset-y-0 start-0 z-10 ${className}`} style={{ background: c[0] }} />
  }

  const safe = String(id).replace(/[^a-zA-Z0-9_-]/g, '')
  const fid = `mbf-${safe}`
  const gid = `mbg-${safe}`
  const n = c.length

  return (
    <div className={`absolute inset-y-0 start-0 z-10 overflow-hidden ${className}`}>
      <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 10 100">
        <defs>
          {/* Base bands of every category color, on a diagonal */}
          <linearGradient id={gid} x1="0" y1="0" x2="0.5" y2="1">
            {c.map((col, i) => (
              <stop key={i} offset={`${Math.round((i / (n - 1)) * 100)}%`} stopColor={col} />
            ))}
          </linearGradient>
          {/* Fractal noise warps the bands into marbled veins */}
          <filter id={fid} x="-25%" y="-25%" width="150%" height="150%">
            <feTurbulence type="fractalNoise" baseFrequency="0.018 0.06" numOctaves="3" seed="11" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="18" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
        <rect x="-5" y="-5" width="20" height="110" fill={`url(#${gid})`} filter={`url(#${fid})`} />
      </svg>
    </div>
  )
}

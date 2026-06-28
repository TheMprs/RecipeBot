import { createPortal } from 'react-dom'
import { QRCodeCanvas } from 'qrcode.react'
import { X, Share2, ScanLine } from 'lucide-react'

// Shows a scannable QR pointing at the recipe page, with a Share button that
// uses the existing text-share method.
export function ShareQR({ recipe, language = 'en', copied = false, onShare, onClose }) {
  const url = `${window.location.origin}/?r=${recipe.id}`
  const isRtl = language === 'he'
  // Theme the dialog with the recipe's category color (brand orange when it has none).
  const accent = recipe.categoryColor || '#e67e22'

  return createPortal(
    <div className="fixed inset-0 z-50 backdrop-blur-sm bg-black/40 flex items-center justify-center p-4"
         onClick={e => { e.stopPropagation(); onClose(); }} style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
      <div className="relative bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden" onClick={e => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute top-3 end-3 w-8 h-8 flex items-center justify-center rounded-full text-[#7a7265] hover:text-[#3d3429] hover:bg-[#faf9f7] transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Accent header — the recipe name */}
        <div className="flex flex-col items-center gap-2 px-8 pt-6 pb-4" style={{ backgroundColor: `${accent}14` }}>
          <h3 className="text-2xl font-bold text-center text-[#3d3429] text-balance">
            {recipe.title}
          </h3>
          <span className="block h-1 w-10 rounded-full" style={{ backgroundColor: accent }} />
        </div>

        <div className="flex flex-col items-center gap-3.5 px-6 pt-4 pb-5">
          <QRCodeCanvas value={url} size={200} fgColor="#000000" bgColor="transparent" level="M" />

          <p className="flex items-center gap-1.5 text-sm font-medium" style={{ color: accent }}>
            <ScanLine className="w-4 h-4" />
            {language === 'en' ? 'Scan for the recipe' : 'סרקו למתכון'}
          </p>

          <button
            onClick={onShare}
            dir="ltr"
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl font-medium text-white shadow-sm hover:brightness-95 active:brightness-90 transition"
            style={{ backgroundColor: accent }}
          >
            <Share2 className="w-4 h-4" /> {copied ? (language === 'en' ? 'Copied!' : 'הועתק!') : (language === 'en' ? 'Share' : 'שתף')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

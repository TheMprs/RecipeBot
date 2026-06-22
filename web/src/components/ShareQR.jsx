import { createPortal } from 'react-dom'
import { QRCodeCanvas } from 'qrcode.react'
import { X, Share2 } from 'lucide-react'

// Shows a scannable QR pointing at the recipe page, with a Share button that
// uses the existing text-share method.
export function ShareQR({ recipe, language = 'en', copied = false, onShare, onClose }) {
  const url = `${window.location.origin}/?r=${recipe.id}`
  const isRtl = language === 'he'

  return createPortal(
    <div className="fixed inset-0 z-50 backdrop-blur-sm bg-black/30 flex items-center justify-center p-4"
         onClick={e => { e.stopPropagation(); onClose(); }} style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
        <div className="flex justify-end">
          <button onClick={onClose} className="text-[#64748b] hover:text-[#1e293b]"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex flex-col items-center gap-4 px-4 pb-2">
          <h3 className="text-lg font-bold text-center text-[#1e293b]">{recipe.title}</h3>
          <QRCodeCanvas value={url} size={200} fgColor="#1e293b" bgColor="#ffffff" level="M" />
          <p className="text-sm text-[#ce743e] font-medium">{language === 'en' ? 'Scan for the recipe' : 'סרקו למתכון'}</p>
        </div>
        <button onClick={onShare} dir="ltr"
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 mt-4 bg-[#ce743e] text-white rounded-xl font-medium">
          <Share2 className="w-4 h-4" /> {copied ? (language === 'en' ? 'Copied!' : 'הועתק!') : (language === 'en' ? 'Share' : 'שתף')}
        </button>
      </div>
    </div>,
    document.body
  )
}

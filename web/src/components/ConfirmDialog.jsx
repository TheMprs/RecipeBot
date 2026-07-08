import { AlertTriangle, HelpCircle } from 'lucide-react'

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel, language = 'en', danger = true, icon }) {
  const Icon = icon || (danger ? AlertTriangle : HelpCircle)
  return (
    <>
      <div className="fixed inset-0 z-[80] backdrop-blur-sm bg-black/30" onClick={onCancel} />
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" onClick={onCancel}>
        <div
          className="confirm-pop bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col"
          dir={language === 'he' ? 'rtl' : 'ltr'}
          onClick={e => e.stopPropagation()}
        >
          <div className="p-6 flex flex-col items-center gap-4">
            <span className={`w-14 h-14 rounded-2xl flex items-center justify-center ${danger ? 'bg-red-100 text-red-600' : 'bg-espresso/10 text-espresso'}`}>
              <Icon className="w-7 h-7" />
            </span>
            <h2 className="text-xl font-bold text-ink text-center text-balance">{title}</h2>
            {message && <p className="text-sm text-muted leading-relaxed text-center -mt-1">{message}</p>}
            <div className="flex gap-3 w-full mt-1">
              <button
                onClick={onCancel}
                className="flex-1 btn-modal py-2.5 text-sm btn-ghost"
              >
                {language === 'en' ? 'Cancel' : 'בטל'}
              </button>
              <button
                onClick={onConfirm}
                className={`flex-1 btn-modal py-2.5 text-sm ${danger ? 'btn-danger' : 'btn-espresso'}`}
              >
                {confirmLabel || (language === 'en' ? 'Confirm' : 'אשר')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

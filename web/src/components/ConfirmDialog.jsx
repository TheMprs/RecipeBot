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
            <span className={`w-16 h-16 rounded-2xl flex items-center justify-center ${danger ? 'bg-red-50 text-red-500' : 'bg-brand/10 text-brand'}`}>
              <Icon className="w-8 h-8" />
            </span>
            <h2 className="text-xl font-bold text-ink text-center text-balance">{title}</h2>
            {message && <p className="text-sm text-muted leading-relaxed text-center -mt-1">{message}</p>}
            <div className="flex gap-3 w-full mt-1">
              <button
                onClick={onCancel}
                className="flex-1 py-2.5 rounded-2xl text-sm font-medium border border-border text-muted hover:bg-cream-dark transition-colors"
              >
                {language === 'en' ? 'Cancel' : 'בטל'}
              </button>
              <button
                onClick={onConfirm}
                className={`flex-1 py-2.5 rounded-2xl text-sm font-medium transition-colors text-white ${
                  danger ? 'bg-red-500 hover:bg-red-600' : 'bg-brand hover:bg-brand-dark'
                }`}
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

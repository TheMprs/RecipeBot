import voidImg from '../assets/void.svg'

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel, language = 'en', danger = true }) {
  return (
    <>
      <div className="fixed inset-0 z-[80] backdrop-blur-sm bg-black/30" onClick={onCancel} />
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" onClick={onCancel}>
        <div
          className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col"
          dir={language === 'he' ? 'rtl' : 'ltr'}
          onClick={e => e.stopPropagation()}
        >
          <div className="p-6 flex flex-col gap-5">
          <img src={voidImg} alt="" className="w-24 h-24 mx-auto -mb-1" />
          <h2 className="text-center text-lg font-bold text-[#3d3429] truncate">{title}</h2>
          {message && <p className="text-sm text-[#7a7265] leading-relaxed text-center">{message}</p>}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-2xl text-sm font-medium border border-[#e8e4dc] text-[#7a7265] hover:bg-[#f5f3ef] transition-colors"
            >
              {language === 'en' ? 'Cancel' : 'בטל'}
            </button>
            <button
              onClick={onConfirm}
              className={`flex-1 py-2.5 rounded-2xl text-sm font-medium transition-colors ${
                danger
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-[#e67e22] hover:bg-[#cf711f] text-white'
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

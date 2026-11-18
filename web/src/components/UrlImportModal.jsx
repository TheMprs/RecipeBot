import { X, Link as LinkIcon, Sparkles, ClipboardList } from 'lucide-react'

// "Import from a link": the URL box, its failure message and the way forward when pasting
// the text can still get the recipe in. All state lives in App; this only draws it.
export function UrlImportModal({ language, canScrape, url, onUrlChange, error, loading, onImport, onClose, onPasteInstead }) {
  const isRtl = language === 'he'
  return (
  <>
    <div className="fixed inset-0 z-[60] backdrop-blur-sm bg-black/30" onClick={() => onClose()}></div>
    <div className="fixed inset-0 flex items-start justify-center z-[70] px-4 py-12 overflow-y-auto" onClick={() => onClose()}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-lg overflow-hidden" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
        {/* Branded header band — orange: importing is a cooking action */}
        <div className="relative -mx-6 -mt-6 sm:-mx-8 sm:-mt-8 px-6 sm:px-8 pt-7 pb-7 mb-6 band-brand">
          <button onClick={() => onClose()} className="absolute top-4 end-4 text-white/85 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 band-badge">
              <LinkIcon className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-center text-2xl font-bold tracking-tight text-white">
                {language === 'en' ? 'Import from a link' : 'ייבוא מקישור'}
              </h2>
              <p className="text-center text-sm text-white/85 mt-1">
                {language === 'en' ? "Paste a recipe page — we'll pull out the details" : 'הדבק קישור למתכון ואנחנו נשלוף את הפרטים'}
              </p>
            </div>
          </div>
        </div>
        
        {!canScrape ? (
          <div className="space-y-4">
            <p className="text-sm text-muted text-center py-4">
              {language === 'en'
                ? "You're not verified to import recipes from URLs."
                : 'החשבון שלך אינו מאומת לייבוא מתכונים מ-URL.'}
            </p>
            <button
              onClick={() => onClose()}
              className="w-full btn-modal btn-ghost"
            >
              {language === 'en' ? 'Close' : 'סגור'}
            </button>
          </div>
        ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              {language === 'en' ? 'Recipe URL' : 'לינק למתכון'}
            </label>
            <div className="relative">
              <LinkIcon className="w-4 h-4 text-muted absolute top-1/2 -translate-y-1/2 left-4 pointer-events-none" />
              <input
                type="url"
                dir="ltr"
                value={url}
                onChange={(e) => onUrlChange(e.target.value)}
                placeholder='https://example.com/recipe'
                className="w-full pl-11 pr-4 py-3 bg-cream text-left border border-border rounded-2xl text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-dark/20 focus:border-brand-dark transition-all"
              />
            </div>
            <p className="flex items-start gap-1.5 text-xs text-muted mt-2 text-start">
              <Sparkles className="w-3.5 h-3.5 text-brand-dark flex-shrink-0 mt-0.5" />
              <span>
                {language === 'en'
                  ? 'Works with most recipe sites, Hebrew or English.'
                  : 'עובד עם רוב אתרי המתכונים, בעברית או באנגלית.'}
              </span>
            </p>
            {error && (
              <div role="alert" className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-start">
                <p className="text-sm text-ink leading-relaxed">{error.text}</p>
                {error.paste && (
                  <button type="button" onClick={onPasteInstead}
                    className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-deep hover:text-brand-dark transition-colors">
                    <ClipboardList className="w-4 h-4" />
                    {language === 'en' ? 'Paste text instead' : 'הדבקת טקסט במקום'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => onClose()}
              className="flex-1 btn-modal btn-ghost"
            >
              {language === 'en' ? 'Cancel' : 'בטל'}
            </button>
            <button
              onClick={onImport}
              disabled={loading}
              className="flex-1 btn-modal btn-brand disabled:bg-brand/50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{language === 'en' ? 'Importing...' : 'מייבא...'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>{language === 'en' ? 'Import' : 'ייבא'}</span>
                </>
              )}
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  </>
  )
}

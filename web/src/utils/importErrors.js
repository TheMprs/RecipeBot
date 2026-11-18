// What to tell someone whose URL import failed, and whether "Paste text instead" can help.
//
// The backend answers a failed import with { code, message } (ScrapeService.Reason). The
// message is the bot's English; the web shows its own wording here so Hebrew users get
// Hebrew. Keep the codes in step with ScrapeService.Reason — an unknown code (or no JSON
// at all, e.g. a proxy error page) falls back to FAILED.
//
// `paste`: the free paste-text parser is a real way forward. It isn't for problems pasting
// can't fix (no permission, a link that's too long) — and it is for the daily limit, since
// pasting costs no import.
const MESSAGES = {
  NOT_ALLOWED: {
    en: "URL import isn't enabled for your account yet.",
    he: 'ייבוא מקישור עוד לא פתוח בחשבון שלך.',
    paste: false,
  },
  RATE_MINUTE: {
    en: 'Too many imports in a row. Wait a minute and try again.',
    he: 'יותר מדי ייבואים ברצף. חכו דקה ונסו שוב.',
    paste: true,
  },
  RATE_DAY: {
    en: "You've used today's imports. Try again tomorrow, or paste the recipe text instead.",
    he: 'ניצלתם את הייבואים של היום. נסו שוב מחר, או הדביקו את טקסט המתכון.',
    paste: true,
  },
  RATE_GLOBAL: {
    en: 'Imports are paused for today. Paste the recipe text instead, or try again tomorrow.',
    he: 'הייבוא מושהה להיום. הדביקו את טקסט המתכון, או נסו שוב מחר.',
    paste: true,
  },
  NO_LINK: {
    en: "That doesn't look like a link. Paste the recipe page's address.",
    he: 'זה לא נראה כמו קישור. הדביקו את כתובת דף המתכון.',
    paste: false, // offered only when the input looks like recipe text — see importError()
  },
  TOO_LONG: {
    en: 'That link is too long.',
    he: 'הקישור ארוך מדי.',
    paste: false,
  },
  SITE_BLOCKED: {
    en: "This site doesn't let us read its pages. Copy the recipe from the site and paste it as text instead.",
    he: 'האתר הזה לא מאפשר לנו לקרוא את הדף. העתיקו את המתכון מהאתר והדביקו אותו כטקסט.',
    paste: true,
  },
  NOT_A_PAGE: {
    en: "That link is a file (like an image or a PDF), not a recipe page. If it's a document, copy its text and paste it instead.",
    he: 'הקישור הזה הוא קובץ (תמונה או PDF), לא דף מתכון. אם זה מסמך, העתיקו ממנו את הטקסט והדביקו אותו.',
    paste: true,
  },
  NO_RECIPE: {
    en: "We couldn't find a recipe on that page. If there is one, copy it and paste it as text instead.",
    he: 'לא מצאנו מתכון בדף הזה. אם יש בו מתכון, העתיקו אותו והדביקו כטקסט.',
    paste: true,
  },
  AI_BUSY: {
    en: 'Recipe reading is busy right now. Try again in a few minutes, or paste the recipe text instead.',
    he: 'קריאת המתכונים עמוסה כרגע. נסו שוב בעוד כמה דקות, או הדביקו את טקסט המתכון.',
    paste: true,
  },
  FAILED: {
    en: "Couldn't import from that link. Try again, or paste the recipe text instead.",
    he: 'לא הצלחנו לייבא מהקישור. נסו שוב, או הדביקו את טקסט המתכון.',
    paste: true,
  },
}

// Typed into the link box, but reads like a recipe: several lines, or a long run of words
// with no address in it. The paste parser is what this person wanted.
export const looksLikeRecipeText = (input) => {
  const s = String(input || '').trim()
  if (/https?:\/\//i.test(s)) return false
  return s.split(/\n/).filter(l => l.trim()).length >= 3 || s.length >= 80
}

// → { code, text, paste, pasteText }. `pasteText` pre-fills the paste box — only with input
// that still has its line breaks. A browser's one-line link field drops them, and a recipe
// run into one line is something the parser can't split; then the box opens empty and the
// recipe, still on the clipboard, goes in with one more paste.
export function importError(code, language, input = '') {
  const key = MESSAGES[code] ? code : 'FAILED'
  const m = MESSAGES[key]
  const recipeText = key === 'NO_LINK' && looksLikeRecipeText(input)
  return {
    code: key,
    text: recipeText
      ? (language === 'he' ? 'נראה שהדבקתם את טקסט המתכון עצמו. פתחו את תיבת הדבקת הטקסט והדביקו אותו שם.' : 'That looks like the recipe text itself. Open the paste-text box and paste it there.')
      : (language === 'he' ? m.he : m.en),
    paste: m.paste || recipeText,
    pasteText: recipeText && /\n/.test(input) ? String(input).trim() : '',
  }
}

// The code out of a failed response, whatever shape it came back in.
export async function errorCodeFrom(res) {
  try {
    const body = await res.json()
    if (body && typeof body.code === 'string') return body.code
  } catch { /* not JSON: a proxy page, an older backend */ }
  if (res.status === 429) return 'RATE_DAY'
  if (res.status === 403) return 'NOT_ALLOWED'
  return 'FAILED'
}

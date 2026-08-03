// Tiny localStorage-backed cache with two behaviours, picked per-call via ttlMs:
//   ttlMs = 0   → pure stale-while-revalidate: return cached instantly, always refetch.
//   ttlMs > 0   → same, but if the cached copy is younger than ttlMs, skip the
//                 network call entirely (a real round-trip saving).
// Only cache data already visible to the user (own + public) — localStorage is
// plaintext, per-origin. No tokens, no private cross-user data.
const PREFIX = 'cache:'
const mem = new Map() // avoids re-parsing localStorage within a session

function read(key) {
  if (mem.has(key)) return mem.get(key)
  try {
    const raw = localStorage.getItem(PREFIX + key)
    const entry = raw ? JSON.parse(raw) : null
    mem.set(key, entry)
    return entry
  } catch { return null }
}

// Synchronous read of a cached value (or null) — for seeding React state at
// useState init so cached data paints on the very first render.
export function peekCache(key) {
  return read(key)?.value ?? null
}

// The logged-in user's id, read synchronously from Supabase's stored session.
// Lets us pick the right cache key before the async auth restore resolves.
export function currentUserIdSync() {
  try {
    const k = Object.keys(localStorage).find(x => x.startsWith('sb-') && x.endsWith('-auth-token'))
    if (!k) return null
    const s = JSON.parse(localStorage.getItem(k))
    return s?.user?.id || s?.currentSession?.user?.id || null
  } catch { return null }
}

export function writeCache(key, value) {
  const entry = { value, ts: Date.now() }
  mem.set(key, entry)
  const json = JSON.stringify(entry)
  try {
    localStorage.setItem(PREFIX + key, json)
  } catch {
    // Quota full. Everything under our prefix is re-fetchable, and our own
    // stale entries are the likeliest hog, so purge the namespace and retry
    // once. If it still fails, the in-memory copy keeps this session working —
    // we just lose persistence, silently but no longer invisibly (the purge is
    // the signal). Without this, a full quota degrades the app permanently.
    purgeNamespace()
    try { localStorage.setItem(PREFIX + key, json) } catch { /* mem holds it */ }
  }
}

function purgeNamespace() {
  try {
    Object.keys(localStorage).forEach(k => { if (k.startsWith(PREFIX)) localStorage.removeItem(k) })
  } catch { /* ignore */ }
}

// Drop cache entries left behind by a schema/key-version bump (e.g. the old
// `cookstats2:`/`cookstats3:` shapes superseded by `cookstats4:`). Nothing
// reads them, but they sit in every user's localStorage until logout and eat
// quota. Call once at startup with the obsolete key prefixes.
export function purgeCacheVersions(prefixes) {
  try {
    Object.keys(localStorage).forEach(k => {
      if (!k.startsWith(PREFIX)) return
      const key = k.slice(PREFIX.length)
      if (prefixes.some(p => key.startsWith(p))) {
        localStorage.removeItem(k)
        mem.delete(key)
      }
    })
  } catch { /* ignore */ }
}

export function invalidate(key) {
  mem.delete(key)
  try { localStorage.removeItem(PREFIX + key) } catch { /* ignore */ }
}

export function clearCache() {
  mem.clear()
  try {
    Object.keys(localStorage).forEach(k => { if (k.startsWith(PREFIX)) localStorage.removeItem(k) })
  } catch { /* ignore */ }
}

// onData is called with the cached value first (if any), then with fresh data
// once the network resolves. Returns the fresh value (or cached, if TTL-fresh).
export async function swr(key, fetcher, onData, ttlMs = 0) {
  const entry = read(key)
  if (entry) onData(entry.value)
  if (entry && Date.now() - entry.ts < ttlMs) return entry.value // TTL-skip
  const fresh = await fetcher()
  writeCache(key, fresh)
  onData(fresh)
  return fresh
}

import { useState, useEffect, useRef } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { BookOpen, Plus, Search, Filter, X, Link as LinkIcon, User as UserIcon, ChevronLeft, ChevronRight, Heart, RotateCcw, Pencil, Menu, Settings, LogOut, Check, Trash2, Sparkles, AtSign, ChefHat } from 'lucide-react'
import { RecipeCard, RecipeCardSkeleton } from './components/RecipeCard'
import { CATEGORY_PALETTE } from './utils/categoryColor'
import { RecipeDetail } from './components/RecipeDetail'
import { RecipeForm } from './components/RecipeForm'
import { UserProfile } from './components/UserProfile'
import { ConfirmDialog } from './components/ConfirmDialog'
import Login from './components/Login'
import { supabase, supabaseUrl, supabaseKey } from './supabaseClient'
import { swr, invalidate, clearCache, peekCache, currentUserIdSync } from './utils/cache'
import { getToken } from './utils/auth'
import { formatRecipe } from './utils/formatRecipe'
import { useWheelScroll } from './utils/useWheelScroll'
import { useOutsideClick } from './utils/useOutsideClick'

// Cached own-recipes for the stored session, read synchronously so they paint
// on the first render (no skeleton flash on reload).
function seedOwnRecipes() {
  const uid = currentUserIdSync()
  return uid ? (peekCache(`recipes:${uid}`) || []) : []
}

function seedUserCategories() {
  const uid = currentUserIdSync()
  return uid ? (peekCache(`categories:${uid}`) || []) : []
}

// cookstats cache = { counts: {recipeId: n}, last: {recipeId: isoDate} }
function seedCookCounts() {
  const uid = currentUserIdSync()
  return uid ? (peekCache(`cookstats2:${uid}`)?.counts || {}) : {}
}

function seedLastCooked() {
  const uid = currentUserIdSync()
  return uid ? (peekCache(`cookstats2:${uid}`)?.last || {}) : {}
}

function seedWeekCooks() {
  const uid = currentUserIdSync()
  return uid ? (peekCache(`cookstats2:${uid}`)?.week || 0) : 0
}
import './global.css'

// API configuration: uses environment variable in production, /api proxy in dev
const API_BASE = import.meta.env.VITE_API_URL || '/api'

function App() {
  const [user, setUser] = useState(null)
  const [userHandle, setUserHandle] = useState(null)
  const [needsHandle, setNeedsHandle] = useState(false) // new user must pick a handle before the users row exists
  const [newHandle, setNewHandle] = useState('')
  const [handleError, setHandleError] = useState(null)
  const [creatingProfile, setCreatingProfile] = useState(false)
  const [canScrape, setCanScrape] = useState(false)
  const [loading, setLoading] = useState(true)
  const [recipes, setRecipes] = useState(seedOwnRecipes)
  const [topLikedRecipes, setTopLikedRecipes] = useState([])
  const [recipeLikeCount, setRecipeLikeCount] = useState(0)
  const [recipeIsLiked, setRecipeIsLiked] = useState(false)
  const [language, setLanguage] = useState(() => localStorage.getItem('language') || 'he')
  const [viewMode, setViewMode] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('user')) return 'profile'
    if (params.get('r') || params.get('recipe')) return 'detail'
    return 'home'
  })
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [detailOrigin, setDetailOrigin] = useState('home') // where Back returns to
  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const [editingRecipe, setEditingRecipe] = useState(null)
  const [userCategories, setUserCategories] = useState(seedUserCategories)
  const [categoriesLoading, setCategoriesLoading] = useState(() => seedUserCategories().length === 0)
  const [ownRecipesLoading, setOwnRecipesLoading] = useState(() => seedOwnRecipes().length === 0)
  const [recipeCategories, setRecipeCategories] = useState({})
  const [showRecipeForm, setShowRecipeForm] = useState(false)
  const [navMenuOpen, setNavMenuOpen] = useState(false)
  const [navClosing, setNavClosing] = useState(false)
  const navMenuRef = useRef(null)
  const navPanelRef = useRef(null)
  const [openProfileSettings, setOpenProfileSettings] = useState(false)
  const [showUrlModal, setShowUrlModal] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [isScrapingLoading, setIsScrapingLoading] = useState(false)
  const [viewingProfile, setViewingProfile] = useState(null)
  const likedRecipesCarouselRef = useRef(null)
  const [hoveringCarousel, setHoveringCarousel] = useState(false)
  const [cookCounts, setCookCounts] = useState(seedCookCounts)
  const [lastCooked, setLastCooked] = useState(seedLastCooked) // recipeId -> most recent cooked_at
  const [weekCooks, setWeekCooks] = useState(seedWeekCooks) // cook_logs rows in the last 7 days (greeting stat)
  const [carouselLoading, setCarouselLoading] = useState(true)
  const [globalQuery, setGlobalQuery] = useState('')
  const [globalResults, setGlobalResults] = useState({ users: [], recipes: [] })
  const [showGlobalResults, setShowGlobalResults] = useState(false)
  const globalSearchRef = useRef(null)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [saveError, setSaveError] = useState(null) // failed background save, offered for retry
  const [saveSuccess, setSaveSuccess] = useState(null) // 'added' | 'saved' — transient success banner
  const [pendingDelete, setPendingDelete] = useState(null) // recipe queued for deletion (drives the undo banner)
  const pendingDeleteRef = useRef(null) // { recipe, timeoutId, token } — survives renders for the timer/flush
  const [showLinkSuccess, setShowLinkSuccess] = useState(false) // Telegram linking celebration
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine)
  const [isStirring, setIsStirring] = useState(false) // offline-pan click animation
  const [offlineDismissed, setOfflineDismissed] = useState(false)
  const profileCheckedFor = useRef(null) // user id whose profile row was already verified this session

  const isRtl = language === 'he'

  // Close the header nav menu on outside click
  useOutsideClick([navMenuRef, navPanelRef], () => closeNavMenu(), navMenuOpen)

  // Mobile: trigger the slide-up exit, panel unmounts on animationend.
  // Desktop: no animation runs, so unmount immediately.
  const closeNavMenu = () => {
    if (window.matchMedia('(min-width: 640px)').matches) { setNavClosing(false); setNavMenuOpen(false) }
    else setNavClosing(true)
  }

  // Navigate with a sliding page transition. `dir` = 'right' (new page enters
  // from the right) or 'left'. Uses the View Transitions API so the outgoing
  // page slides out while the new one slides in; falls back to a plain nav.
  const slideNav = (target, dir) => {
    if (!document.startViewTransition) { handleNavigate(target); return }
    document.documentElement.dataset.swipe = dir
    const transition = document.startViewTransition(() => {
      flushSync(() => handleNavigate(target))
    })
    transition.finished.finally(() => { delete document.documentElement.dataset.swipe })
  }

  // Mobile swipe navigation: swipe left → profile, swipe right → home; works
  // from anywhere on the page except the outer 30px OS-gesture edges
  useEffect(() => {
    if (!user) return
    let startX = null, startY = null, notOsEdge = false

    // A swipe that starts inside a horizontally-scrollable element (carousel,
    // category pills) is a scroll, not a nav gesture — mobile-only conflict,
    // desktop scrolls those with the wheel so it never showed in dev view.
    const inHScroll = (el) => {
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        if (n.scrollWidth > n.clientWidth + 5) {
          const ox = getComputedStyle(n).overflowX
          if (ox === 'auto' || ox === 'scroll') return true
        }
      }
      return false
    }

    const onStart = (e) => {
      if (e.touches.length > 1 || inHScroll(e.target)) { startX = null; return }
      const t = e.touches[0]
      startX = t.clientX
      startY = t.clientY
      // anywhere on the page except the outer 30px edges — those stay the
      // browser's (iOS back/forward-swipe territory) so we never fight the OS
      notOsEdge = t.clientX > 30 && t.clientX < window.innerWidth - 30
    }
    const onEnd = (e) => {
      if (startX === null) return
      const t = e.changedTouches[0]
      const dx = startX - t.clientX, dy = Math.abs(t.clientY - startY)
      // real fingers swipe diagonally — demand a clearly horizontal gesture
      if (dy < 50 && Math.abs(dx) > dy * 1.5) {
        if (viewMode === 'profile' && dx < -60) slideNav('home', 'left')        // swipe right → back to main
        else if (viewMode !== 'profile' && dx > 60 && notOsEdge) slideNav('profile', 'right') // swipe left → profile
      }
      startX = null
    }
    // browser gesture hijack (native scroll / edge nav) fires cancel, not end
    const onCancel = () => { startX = null }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onCancel)
    }
  }, [user, viewMode])

  // Online/offline tracking — refetch everything when the connection returns
  useEffect(() => {
    const goOnline = () => {
      setIsOffline(false)
      if (user) { fetchRecipes(); fetchCookCounts(); fetchUserCategories(); }
      fetchTopLikedRecipes()
    }
    const goOffline = () => { setIsOffline(true); setOfflineDismissed(false) }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [user])

  // Failed-save banner auto-dismisses after 8s
  useEffect(() => {
    if (!saveError) return
    const t = setTimeout(() => setSaveError(null), 8000)
    return () => clearTimeout(t)
  }, [saveError])

  // Success banner auto-dismisses after 3s
  useEffect(() => {
    if (!saveSuccess) return
    const t = setTimeout(() => setSaveSuccess(null), 3000)
    return () => clearTimeout(t)
  }, [saveSuccess])

  // Check auth status on mount
  useEffect(() => {
    // Set initial loading to false after a timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      setLoading(false)
    }, 3000)

    // Listen for auth changes - this will fire immediately with current session
    try {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('[Auth]', event, '-', session?.user?.email || 'anonymous')
        // Keep the same object reference while the identity is unchanged — supabase
        // re-emits SIGNED_IN on every tab refocus, and a fresh user object would
        // re-trigger every effect that depends on it (full visual "reload")
        setUser(prev => (prev?.id === session?.user?.id ? prev : session?.user || null))
        setLoading(false)
        clearTimeout(timeoutId)

        // OAuth implicit flow returns tokens in the URL hash; supabase-js has consumed
        // them by now, so drop the leftover empty "#" for a clean URL.
        // note: a bare trailing "#" makes location.hash === '', so test the raw URL
        if (event === 'SIGNED_IN' && window.location.href.includes('#')) {
          window.history.replaceState({}, '', window.location.pathname + window.location.search)
        }

        // Create profile for new users (OAuth sign-in) — once per user, not on every refocus
        if (event === 'SIGNED_IN' && session?.user && profileCheckedFor.current !== session.user.id) {
          profileCheckedFor.current = session.user.id
          const user = session.user
          try {
            // Check if profile already exists using REST API
            const checkRes = await fetch(
              `${supabaseUrl}/rest/v1/users?id=eq.${user.id}`,
              {
                headers: {
                  'apikey': supabaseKey,
                  'Authorization': `Bearer ${session.access_token}`,
                  'Content-Type': 'application/json'
                }
              }
            );

            const existingProfiles = await checkRes.json();
            
            // No profile yet: don't create the row here — prompt for a handle first,
            // the row is only inserted once a valid one is chosen (see submitHandle)
            if (!existingProfiles || existingProfiles.length === 0) {
              setNeedsHandle(true)
            } else if (user.user_metadata?.avatar_url) {
              // Refresh avatar URL on every login in case Google rotated it
              fetch(`${supabaseUrl}/rest/v1/users?id=eq.${user.id}`, {
                method: 'PATCH',
                headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ avatar_url: user.user_metadata.avatar_url })
              })
            }
          } catch (error) {
            console.error('[Auth] Failed to create profile:', error.message)
          }
        }
      })

      return () => {
        clearTimeout(timeoutId)
        subscription?.unsubscribe()
      }
    } catch (error) {
      console.error('[Auth] Listener setup failed:', error.message)
      setLoading(false)
      clearTimeout(timeoutId)
    }
  }, [])

  useEffect(() => {
    if (!user) { setUserHandle(null); setCanScrape(false); return }
    // Own row — use the session token like every other own-data fetch
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) return
      return fetch(`${supabaseUrl}/rest/v1/users?id=eq.${user.id}&select=username,can_scrape`, {
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${session.access_token}` }
      }).then(r => r.json()).then(d => {
        if (d?.[0]?.username) setUserHandle(d[0].username)
        setCanScrape(!!d?.[0]?.can_scrape)
      })
    }).catch(() => {})
  }, [user])

  // First-time signup: create the users row only once a valid handle is chosen
  const submitHandle = async () => {
    const uname = newHandle.trim()
    if (uname.length < 3) {
      setHandleError('At least 3 characters')
      return
    }
    setCreatingProfile(true)
    setHandleError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('no session')
      const insert = (displayName) => fetch(`${supabaseUrl}/rest/v1/users`, {
        method: 'POST',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: session.user.id, username: uname, display_name: displayName,
          bio: null, avatar_url: session.user.user_metadata?.avatar_url || null,
        })
      })
      // display_name is the raw Google name; if it violates the English CHECK (or any
      // other non-conflict error), retry once with the handle as the name so signup
      // never dead-ends. A 409 is the handle being taken — don't retry that.
      let res = await insert(session.user.user_metadata?.full_name || '')
      if (!res.ok && res.status !== 409) res = await insert(uname)
      if (res.ok) {
        setUserHandle(uname)
        setNeedsHandle(false)
        setNewHandle('')
      } else if (res.status === 409) {
        setHandleError('That handle is already taken')
      } else {
        console.error('[Auth] Failed to create profile:', await res.text())
        setHandleError('Something went wrong — try again')
      }
    } catch (error) {
      console.error('[Auth] Failed to create profile:', error.message)
      setHandleError('Something went wrong — try again')
    }
    setCreatingProfile(false)
  }

  const handleLogout = async () => {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Logout timeout')), 3000)
      )
      await Promise.race([supabase.auth.signOut(), timeoutPromise])
    } catch (error) {
      console.error('[Auth] Logout failed:', error.message)
    } finally {
      clearCache() // don't leak the previous user's cached data
      setUser(null)
      setRecipes([])
      setUserCategories([])
      setCategoriesLoading(true)
      setOwnRecipesLoading(true)
      setRecipeCategories({})
      setSelectedRecipe(null)
      setEditingRecipe(null)
      setViewingProfile(null)
      setShowRecipeForm(false)
      window.history.replaceState({}, '', '/') // drop ?user= so the [user] effect doesn't re-resolve it as guest
      setViewMode('home')
    }
  }

  // 1. FETCH ALL RECIPES WITH FULL DETAILS (no N+1 queries)
  const fetchRecipes = async (force = false) => {
    if (!user) { setRecipes([]); return; }
    const cacheKey = `recipes:${user.id}`;
    if (force) invalidate(cacheKey); // after a mutation: drop stale copy, no flash
    setOwnRecipesLoading(true)
    try {
      // ttl 10min: render cached instantly; skip the network call if fresh.
      // Local edits force-invalidate, so the only staleness is out-of-band
      // changes (Telegram bot, another device) — capped at 10 min.
      // getSession lives inside the fetcher so the cached paint happens before
      // any await — no skeleton flash on reload.
      await swr(cacheKey, async () => {
        const token = await getToken();
        const response = await fetch(
          `${supabaseUrl}/rest/v1/recipes?user_id=eq.${user.id}&select=*,recipe_likes(recipe_id),recipe_categories(category_id,categories(name,color))`,
          {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        )
        const data = await response.json()
        if (!response.ok) {
          throw new Error(`API error: ${response.status} ${JSON.stringify(data)}`);
        }
        return (data || []).map(formatRecipe);
      }, (formattedRecipes) => {
        setRecipes(formattedRecipes);
        setOwnRecipesLoading(false); // got data (cached or fresh) — drop skeleton
        fetchRecipeCategories(formattedRecipes.map(r => r.id));
      }, 10 * 60 * 1000)
    } catch (error) {
      // Keep any cached recipes already painted — don't wipe on a transient
      // revalidation failure. Logout clears state via the !user guard.
      console.error('[Data] Failed to fetch recipes:', error.message);
    } finally {
      setOwnRecipesLoading(false)
    }
  };

  // Fetch public recipes for home page when not logged in
  const fetchCookCounts = async (force = false) => {
    if (!user) return
    const cacheKey = `cookstats2:${user.id}`
    if (force) invalidate(cacheKey)
    try {
      // ttl 10min — feeds the "Most Prepped" hero (counts + last-made dates).
      // Invalidated on mark-made and cook-count edits.
      await swr(cacheKey, async () => {
        const token = await getToken();
        const res = await fetch(
          `${supabaseUrl}/rest/v1/cook_logs?user_id=eq.${user.id}&select=recipe_id,cooked_at`,
          { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${token}` } }
        );
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        const counts = {}, last = {};
        let week = 0;
        const weekAgo = Date.now() - 7 * 86400000;
        for (const row of data) {
          counts[row.recipe_id] = (counts[row.recipe_id] || 0) + 1;
          if (!last[row.recipe_id] || row.cooked_at > last[row.recipe_id]) last[row.recipe_id] = row.cooked_at;
          if (new Date(row.cooked_at) > weekAgo) week++;
        }
        return { counts, last, week };
      }, ({ counts, last, week }) => { setCookCounts(counts); setLastCooked(last); setWeekCooks(week || 0) }, 10 * 60 * 1000)
    } catch (err) {
      console.error('[Data] Failed to fetch cook counts:', err.message);
    }
  };

  const handleMarkMade = async (recipe) => {
    try {
      const token = await getToken();
      const res = await fetch(`${supabaseUrl}/rest/v1/cook_logs`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ user_id: user.id, recipe_id: recipe.id })
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      fetchCookCounts(true);
    } catch (err) {
      console.error('[Data] Failed to log cook:', err.message);
      setSaveError({ message: language === 'en' ? 'Failed to log cook' : 'רישום ההכנה נכשל' });
    }
  };

  // Applies the stepper's net change on save: +N inserts N cook logs in one
  // request, -N deletes the N most recent ones
  const applyCookCountDelta = async (recipeId, delta) => {
    if (!delta) return
    const token = await getToken();
    const headers = { 'apikey': supabaseKey, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    if (delta > 0) {
      const rows = Array.from({ length: delta }, () => ({ user_id: user.id, recipe_id: recipeId }));
      const res = await fetch(`${supabaseUrl}/rest/v1/cook_logs`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify(rows)
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    } else {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/cook_logs?user_id=eq.${user.id}&recipe_id=eq.${recipeId}&select=id&order=cooked_at.desc&limit=${-delta}`,
        { headers }
      );
      const ids = ((await res.json()) || []).map(r => r.id);
      if (ids.length === 0) return;
      const delRes = await fetch(`${supabaseUrl}/rest/v1/cook_logs?id=in.(${ids.join(',')})`, { method: 'DELETE', headers });
      if (!delRes.ok) throw new Error(`${delRes.status} ${await delRes.text()}`);
    }
    fetchCookCounts(true);
  };

  const fetchTopLikedRecipes = async (force = false) => {
    if (force) invalidate('feed:top')
    try {
      // ttl 10min: re-opening the home feed within 10 min reuses the cached
      // list with no network call. Invalidated on like/create/delete.
      await swr('feed:top', async () => {
      const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/get_top_liked_recipes`, {
        method: 'POST',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit_count: 10 })
      })
      if (!rpcRes.ok) throw new Error('rpc failed')
      const ranked = (await rpcRes.json()) || []

      const ids = ranked.map(r => r.recipe_id)
      let recipesData = []
      if (ids.length > 0) {
        const recipesRes = await fetch(`${supabaseUrl}/rest/v1/recipes?id=in.(${ids.join(',')})&select=*,recipe_categories(categories(name,color))`, {
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
        })
        if (!recipesRes.ok) throw new Error('recipes fetch failed')
        recipesData = await recipesRes.json()
      }

      // The RPC only returns recipes with ≥1 like — pad the row to 10 with the
      // newest public recipes so the feed never looks empty.
      if (recipesData.length < 10) {
        const excl = ids.length ? `&id=not.in.(${ids.join(',')})` : ''
        const fillRes = await fetch(
          `${supabaseUrl}/rest/v1/recipes?visibility=eq.public${excl}&order=created_at.desc&limit=${10 - recipesData.length}&select=*,recipe_categories(categories(name,color))`,
          { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
        )
        if (fillRes.ok) recipesData = recipesData.concat(await fillRes.json())
      }

      const likeCountMap = {}
      ranked.forEach(r => { likeCountMap[r.recipe_id] = Number(r.like_count) })

      const userIds = [...new Set(recipesData.map(r => r.user_id).filter(Boolean))]
      let usernameMap = {}, avatarMap = {}
      if (userIds.length > 0) {
        const usersRes = await fetch(
          `${supabaseUrl}/rest/v1/users?id=in.(${userIds.join(',')})&select=id,username,avatar_url`,
          { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
        )
        if (usersRes.ok) {
          const usersData = await usersRes.json()
          usersData.forEach(u => { usernameMap[u.id] = u.username; avatarMap[u.id] = u.avatar_url })
        }
      }

      const decorate = (recipe) => ({
        ...formatRecipe(recipe),
        likeCount: likeCountMap[recipe.id] || 0,
        authorUsername: usernameMap[recipe.user_id] || null,
        authorAvatar: avatarMap[recipe.user_id] || null
      })
      // liked recipes in rank order, then the recency fills
      const rankedIds = new Set(ids)
      const sorted = ranked
        .map(r => recipesData.find(rd => rd.id === r.recipe_id))
        .filter(Boolean)
        .concat(recipesData.filter(rd => !rankedIds.has(rd.id)))
        .map(decorate)

      return sorted
      }, (sorted) => {
        setTopLikedRecipes(sorted)
        setCarouselLoading(false)
      }, 10 * 60 * 1000)
    } catch (err) {
      console.error('[Data] Failed to fetch top liked recipes:', err.message)
    } finally {
      setCarouselLoading(false)
    }
  }

  const fetchRecipeLikeStatus = async (recipeId) => {
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/recipe_likes?recipe_id=eq.${recipeId}&select=user_id`,
        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
      )
      if (!res.ok) return
      const data = await res.json()
      setRecipeLikeCount(data.length)
      setRecipeIsLiked(user ? data.some(r => r.user_id === user.id) : false)
    } catch (err) {
      console.error('[Data] Failed to fetch like status:', err.message)
    }
  }

  const handleToggleLike = async (recipeId) => {
    if (!user) return
    const wasLiked = recipeIsLiked
    setRecipeIsLiked(!wasLiked)
    setRecipeLikeCount(c => wasLiked ? c - 1 : c + 1)
    try {
      const token = await getToken();
      if (wasLiked) {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/recipe_likes?recipe_id=eq.${recipeId}&user_id=eq.${user.id}`,
          { method: 'DELETE', headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${token}` } }
        )
        if (!res.ok) throw new Error(await res.text())
      } else {
        const res = await fetch(`${supabaseUrl}/rest/v1/recipe_likes`, {
          method: 'POST',
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ user_id: user.id, recipe_id: recipeId })
        })
        if (!res.ok) throw new Error(await res.text())
      }
      invalidate('feed:top') // like changed ranking; next feed view refetches
    } catch (err) {
      setRecipeIsLiked(wasLiked)
      setRecipeLikeCount(c => wasLiked ? c + 1 : c - 1)
      console.error('[Data] Like toggle failed:', err.message)
      setSaveError({ message: language === 'en' ? 'Failed to update like' : 'עדכון הלייק נכשל' })
    }
  }

  const handleDuplicateRecipe = async (recipe) => {
    if (!user) return
    try {
      const token = await getToken();
      const res = await fetch(`${supabaseUrl}/rest/v1/recipes`, {
        method: 'POST',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({
          user_id: user.id,
          name: recipe.title,
          description: recipe.description,
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
          visibility: recipe.visibility || localStorage.getItem('defaultRecipeVisibility') || 'public'
        })
      })
      if (!res.ok) throw new Error(await res.text())
      const [dup] = await res.json()
      if (dup?.id) await manageRecipeCategory(dup.id, recipe.category, token)
      fetchRecipes(true)
      handleNavigate('profile')
    } catch (err) {
      console.error('[Data] Dupe failed:', err.message)
      setSaveError({ message: language === 'en' ? 'Failed to duplicate recipe' : 'שכפול המתכון נכשל' })
    }
  }

  const fetchUserCategories = async (force = false) => {
    if (!user) return
    const cacheKey = `categories:${user.id}`
    if (force) invalidate(cacheKey)
    setCategoriesLoading(true)
    try {
      // ttl 10min, same model as own recipes — getSession inside the fetcher so
      // the cached list paints before any await (no flash).
      await swr(cacheKey, async () => {
        const token = await getToken();
        const res = await fetch(
          `${supabaseUrl}/rest/v1/categories?user_id=eq.${user.id}&order=created_at.asc`,
          { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${token}` } }
        )
        if (!res.ok) throw new Error(`API error: ${res.status}`)
        return (await res.json()) || []
      }, (cats) => {
        setUserCategories(cats)
        setCategoriesLoading(false)
      }, 10 * 60 * 1000)
    } catch (err) {
      console.error('[Data] Failed to fetch categories:', err.message)
    } finally {
      setCategoriesLoading(false)
    }
  }

  const fetchRecipeCategories = async (recipeIds) => {
    if (!recipeIds.length) return
    try {
      const token = await getToken()
      const res = await fetch(
        `${supabaseUrl}/rest/v1/recipe_categories?recipe_id=in.(${recipeIds.join(',')})&select=recipe_id,category_id`,
        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${token}` } }
      )
      if (!res.ok) return
      const data = await res.json()
      const map = {}
      for (const row of data) {
        if (!map[row.recipe_id]) map[row.recipe_id] = []
        map[row.recipe_id].push(row.category_id)
      }
      setRecipeCategories(map)
    } catch (err) {
      console.error('[Data] Failed to fetch recipe categories:', err.message)
    }
  }

  const handleCreateCategory = async (name, color) => {
    const reserved = ['all', 'הכל', 'uncategorized', 'ללא קטגוריה']
    if (reserved.includes(name.trim().toLowerCase())) {
      setSaveError({ message: language === 'en' ? `"${name.trim()}" is a reserved name` : `"${name.trim()}" הוא שם שמור` })
      return null
    }
    // Friendly ceiling before insert (the DB row-limit trigger is the hard gate).
    if (userCategories.length >= 99) {
      setSaveError({ message: language === 'en' ? "You've reached the maximum of 99 categories." : 'הגעת למקסימום של 99 קטגוריות.' })
      return null
    }
    // undefined = inline quick-create (no picker) → cycle palette; null = user chose "no color".
    const finalColor = color === undefined ? CATEGORY_PALETTE[userCategories.length % CATEGORY_PALETTE.length] : color
    try {
      const token = await getToken();
      const res = await fetch(`${supabaseUrl}/rest/v1/categories`, {
        method: 'POST',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({ user_id: user.id, name: name.trim(), color: finalColor })
      })
      if (!res.ok) throw new Error(await res.text())
      const [newCat] = await res.json()
      setUserCategories(prev => [...prev, newCat])
      invalidate(`categories:${user.id}`)
      return newCat
    } catch (err) {
      console.error('[Data] Create category failed:', err.message)
      setSaveError({ message: language === 'en' ? 'Failed to create category' : 'יצירת הקטגוריה נכשלה' })
      return null
    }
  }

  const handleDeleteCategory = async (categoryId) => {
    setUserCategories(prev => prev.filter(c => c.id !== categoryId))
    setRecipeCategories(prev => {
      const updated = { ...prev }
      for (const rid in updated) updated[rid] = updated[rid].filter(id => id !== categoryId)
      return updated
    })
    try {
      const token = await getToken();
      const res = await fetch(`${supabaseUrl}/rest/v1/categories?id=eq.${categoryId}`, {
        method: 'DELETE',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) throw new Error(await res.text())
      invalidate(`categories:${user.id}`)
    } catch (err) {
      console.error('[Data] Delete category failed:', err.message)
      setSaveError({ message: language === 'en' ? 'Failed to delete category' : 'מחיקת הקטגוריה נכשלה' })
      fetchUserCategories(true)
      fetchRecipeCategories(recipes.map(r => r.id))
    }
  }

  const handleRenameCategory = async (categoryId, newName) => {
    if (['all', 'הכל', 'uncategorized', 'ללא קטגוריה'].includes(newName.trim().toLowerCase())) {
      setSaveError({ message: language === 'en' ? `"${newName.trim()}" is a reserved name` : `"${newName.trim()}" הוא שם שמור` })
      return
    }
    setUserCategories(prev => prev.map(c => c.id === categoryId ? { ...c, name: newName } : c))
    try {
      const token = await getToken();
      const res = await fetch(`${supabaseUrl}/rest/v1/categories?id=eq.${categoryId}`, {
        method: 'PATCH',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ name: newName.trim() })
      })
      if (!res.ok) throw new Error(await res.text())
      invalidate(`categories:${user.id}`)
    } catch (err) {
      console.error('[Data] Rename category failed:', err.message)
      setSaveError({ message: language === 'en' ? 'Failed to rename category' : 'שינוי שם הקטגוריה נכשל' })
      fetchUserCategories(true)
    }
  }

  const handleRecolorCategory = async (categoryId, color) => {
    setUserCategories(prev => prev.map(c => c.id === categoryId ? { ...c, color } : c))
    try {
      const token = await getToken();
      const res = await fetch(`${supabaseUrl}/rest/v1/categories?id=eq.${categoryId}`, {
        method: 'PATCH',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ color })
      })
      if (!res.ok) throw new Error(await res.text())
      invalidate(`categories:${user.id}`)
      // Recolor recipe cards immediately — they carry a copy of the category color.
      // Recompute from the junction so both the primary color and the full spine array update.
      const cats = userCategories.map(c => c.id === categoryId ? { ...c, color } : c)
      setRecipes(prev => prev.map(r => {
        const ids = recipeCategories[r.id] || []
        if (!ids.includes(categoryId)) return r
        return {
          ...r,
          categoryColor: cats.find(c => c.id === ids[0])?.color || null,
          categoryColors: ids.map(id => cats.find(c => c.id === id)?.color).filter(Boolean),
        }
      }))
    } catch (err) {
      console.error('[Data] Recolor category failed:', err.message)
      setSaveError({ message: language === 'en' ? 'Failed to update color' : 'עדכון הצבע נכשל' })
      fetchUserCategories(true)
    }
  }

  const handleToggleRecipeCategory = async (recipeId, categoryId) => {
    const current = recipeCategories[recipeId] || []
    const isAdding = !current.includes(categoryId)
    setRecipeCategories(prev => ({
      ...prev,
      [recipeId]: isAdding ? [...current, categoryId] : current.filter(id => id !== categoryId)
    }))
    try {
      const token = await getToken();
      if (isAdding) {
        const res = await fetch(`${supabaseUrl}/rest/v1/recipe_categories`, {
          method: 'POST',
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ recipe_id: recipeId, category_id: categoryId })
        })
        if (!res.ok) throw new Error(await res.text())
      } else {
        const res = await fetch(`${supabaseUrl}/rest/v1/recipe_categories?recipe_id=eq.${recipeId}&category_id=eq.${categoryId}`, {
          method: 'DELETE',
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${token}` }
        })
        if (!res.ok) throw new Error(await res.text())
      }
      // Reflect the change on the recipe card immediately (junction is the source of truth).
      const newList = isAdding ? [...current, categoryId] : current.filter(id => id !== categoryId)
      const newCat = newList.length ? userCategories.find(c => c.id === newList[0]) : null
      const newColors = newList.map(id => userCategories.find(c => c.id === id)?.color).filter(Boolean)
      setRecipes(prev => prev.map(r => r.id === recipeId ? { ...r, category: newCat?.name || null, categoryColor: newCat?.color || null, categoryColors: newColors } : r))
    } catch (err) {
      setRecipeCategories(prev => ({ ...prev, [recipeId]: current }))
      console.error('[Data] Toggle recipe category failed:', err.message)
      setSaveError({ message: language === 'en' ? 'Failed to update saved categories' : 'עדכון הקטגוריות השמורות נכשל' })
    }
  }

  const loadRecipeFromSupabase = async (filter) => {
    // Use the user's token so RLS lets owners read their own private recipes (anon key only sees public).
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token || supabaseKey
    fetch(`${supabaseUrl}/rest/v1/recipes?${filter}&select=*,recipe_categories(categories(name,color))&limit=1`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (!data || data.length === 0) { window.history.replaceState({}, '', window.location.pathname); setViewMode('home'); return; }
        const r = data[0];
        setSelectedRecipe(formatRecipe(r));
        setViewMode('detail');
        window.history.replaceState({}, '', `?r=${r.id}`);
      })
      .catch(() => { window.history.replaceState({}, '', window.location.pathname); setViewMode('home'); });
  };

  useEffect(() => {
    if (loading) return
    if (user) {
      fetchRecipes();
      fetchCookCounts();
      fetchUserCategories();
    }
    fetchTopLikedRecipes()
    
    // Check for shared recipe or profile in URL
    const params = new URLSearchParams(window.location.search)
    const profileId = params.get('user')
    const recipeId = params.get('r')
    const recipeName = params.get('recipe')
    const linkToken = params.get('link_token')

    // Handle Telegram account linking
    if (linkToken) {
      window.history.replaceState({}, '', window.location.pathname)
      if (!user) {
        sessionStorage.setItem('pending_link_token', linkToken)
      } else {
        supabase.auth.getSession().then(({ data: { session } }) => {
          fetch(`${API_BASE}/link`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token}`
            },
            body: JSON.stringify({ token: linkToken })
          }).then(res => {
            if (res.ok) setShowLinkSuccess(true)
            else setSaveError({ message: language === 'en' ? 'Telegram linking failed' : 'קישור הטלגרם נכשל' })
          })
        })
      }
      return
    }

    // Complete pending link after login
    if (user) {
      const pendingToken = sessionStorage.getItem('pending_link_token')
      if (pendingToken) {
        sessionStorage.removeItem('pending_link_token')
        supabase.auth.getSession().then(({ data: { session } }) => {
          fetch(`${API_BASE}/link`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token}`
            },
            body: JSON.stringify({ token: pendingToken })
          }).then(res => {
            if (res.ok) setShowLinkSuccess(true)
            else setSaveError({ message: language === 'en' ? 'Telegram linking failed' : 'קישור הטלגרם נכשל' })
          })
        })
      }
    }
    
    // Handle profile viewing (either own or others') - check this FIRST
    if (profileId) {
      // If viewing own profile, just show profile view without viewingProfile set
      if (user && (profileId === user.id || profileId === userHandle)) {
        setViewMode('profile')
        setViewingProfile(null)
        return
      }

      // Otherwise fetch the other user's profile by handle
      fetch(`${supabaseUrl}/rest/v1/users?username=eq.${encodeURIComponent(profileId)}&select=id,username,display_name,bio,avatar_url`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      })
        .then(res => {
          if (!res.ok) {
            console.warn('[Data] Profile not found:', profileId);
            window.history.replaceState({}, '', window.location.pathname);
            return null;
          }
          return res.json();
        })
        .then(data => {
          if (!data || data.length === 0) return;
          const profile = data[0];
          if (user && profile.id === user.id) {
            setViewingProfile(null);
          } else {
            setViewingProfile(profile);
          }
          setViewMode('profile');
        })
        .catch(err => {
          console.warn('[Data] Error loading profile from URL:', err.message);
          window.history.replaceState({}, '', window.location.pathname);
        });
      return; // Don't process recipe parameters if viewing a profile
    }
    
    // Only process recipe parameters if NOT viewing a profile
    if (recipeId) {
      loadRecipeFromSupabase(`id=eq.${encodeURIComponent(recipeId)}`);
    } else if (recipeName) {
      loadRecipeFromSupabase(`name=eq.${encodeURIComponent(recipeName)}`);
    }
  }, [user, loading])

  // Fetch like status + author username whenever the viewed recipe changes
  useEffect(() => {
    if (selectedRecipe?.id) {
      setRecipeLikeCount(0)
      setRecipeIsLiked(false)
      fetchRecipeLikeStatus(selectedRecipe.id)
      if (selectedRecipe.user_id && !selectedRecipe.authorUsername && selectedRecipe.user_id !== user?.id) {
        fetch(`${supabaseUrl}/rest/v1/users?id=eq.${selectedRecipe.user_id}&select=id,username`, {
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
        })
          .then(r => r.json())
          .then(data => {
            if (data?.[0]) setSelectedRecipe(prev => ({ ...prev, authorUsername: data[0].username, authorId: data[0].id }))
          })
          .catch(() => {})
      }
    }
  }, [selectedRecipe?.id])

  const navigateToProfile = async (userId) => {
    try {
      // ttl 10min: other users' public profiles rarely change mid-session.
      await swr(`profile:${userId}`, async () => {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/users?id=eq.${userId}&select=id,username,display_name,bio,avatar_url`,
          { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
        )
        const data = await res.json()
        if (!data?.[0]) throw new Error('profile not found')
        return data[0]
      }, (profile) => {
        setViewingProfile(profile)
        setSelectedRecipe(null)
        setViewMode('profile')
        window.history.pushState({}, '', `/?user=${profile.username}`)
      }, 10 * 60 * 1000)
    } catch (err) {
      console.error('[Nav] Failed to load profile:', err.message)
      setSaveError({ message: language === 'en' ? 'Failed to load profile' : 'טעינת הפרופיל נכשלה' })
    }
  }

  // Wheel → horizontal scroll, active only while hovering the carousel section
  useWheelScroll(likedRecipesCarouselRef, hoveringCarousel)

  // Global search — debounced, queries users + public recipes
  useEffect(() => {
    if (!globalQuery.trim()) { setGlobalResults({ users: [], recipes: [] }); return }
    const timer = setTimeout(async () => {
      const q = encodeURIComponent(`*${globalQuery.trim()}*`)
      const headers = { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
      const [usersRes, recipesRes] = await Promise.all([
        fetch(`${supabaseUrl}/rest/v1/users?or=(username.ilike.${q},display_name.ilike.${q})&select=id,username,display_name,avatar_url&limit=4`, { headers }),
        fetch(`${supabaseUrl}/rest/v1/recipes?name=ilike.${q}&visibility=eq.public&select=id,name,user_id,recipe_categories(categories(name,color))&limit=4`, { headers })
      ])
      const [users, recipesRaw] = await Promise.all([usersRes.json(), recipesRes.json()])
      const recipes = Array.isArray(recipesRaw) ? recipesRaw : []

      // Batch-resolve author usernames
      const userIds = [...new Set(recipes.map(r => r.user_id).filter(Boolean))]
      let usernameMap = {}
      if (userIds.length > 0) {
        const authorsRes = await fetch(`${supabaseUrl}/rest/v1/users?id=in.(${userIds.join(',')})&select=id,username`, { headers })
        const authors = await authorsRes.json()
        if (Array.isArray(authors)) authors.forEach(a => { usernameMap[a.id] = a.username })
      }

      setGlobalResults({
        users: Array.isArray(users) ? users : [],
        recipes: recipes.map(r => ({ ...r, category: r.recipe_categories?.[0]?.categories?.name || null, categoryColor: r.recipe_categories?.[0]?.categories?.color || null, categoryColors: r.recipe_categories?.map(rc => rc.categories?.color).filter(Boolean) || [], authorUsername: usernameMap[r.user_id] || null }))
      })
      setShowGlobalResults(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [globalQuery])

  // Close search results on outside click
  useOutsideClick(globalSearchRef, () => setShowGlobalResults(false))

  // 2. FETCH SPECIFIC RECIPE DETAILS WHEN CLICKED
  const handleSelectRecipe = (recipeObj) => {
    // Directly use the data we already have to make navigation instant
    const formatArray = (text) => {
      if (Array.isArray(text)) return text;
      if (typeof text === 'string') return text.split('\n').filter(i => i.trim());
      return [];
    };

    const recipeData = {
      id: recipeObj.id,
      title: String(recipeObj.title || recipeObj.name || 'Unnamed'),
      description: recipeObj.description || '',
      category: recipeObj.category || null,
      ingredients: formatArray(recipeObj.ingredients),
      instructions: formatArray(recipeObj.instructions),
      caloriesPerServing: recipeObj.caloriesPerServing ?? recipeObj.calories_per_serving ?? null,
      visibility: recipeObj.visibility,
      user_id: recipeObj.user_id || recipeObj.authorId,
      authorId: recipeObj.authorId || recipeObj.user_id,
      authorUsername: recipeObj.authorUsername || null
    };

    setDetailOrigin(viewMode === 'profile' ? 'profile' : 'home');
    setSelectedRecipe(recipeData);
    setViewMode('detail');
    window.history.pushState({}, '', `?r=${recipeObj.id}`);
  }

  // Sync a recipe's junction rows to exactly `categoryIds` (delete all, re-insert).
  const syncRecipeCategories = async (recipeId, categoryIds, token) => {
    await fetch(`${supabaseUrl}/rest/v1/recipe_categories?recipe_id=eq.${recipeId}`, {
      method: 'DELETE',
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${token}` }
    })
    if (!categoryIds?.length) return
    await fetch(`${supabaseUrl}/rest/v1/recipe_categories`, {
      method: 'POST',
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify(categoryIds.map(id => ({ recipe_id: recipeId, category_id: id })))
    })
  }

  const manageRecipeCategory = async (recipeId, categoryName, token) => {
    await fetch(`${supabaseUrl}/rest/v1/recipe_categories?recipe_id=eq.${recipeId}`, {
      method: 'DELETE',
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${token}` }
    })
    if (!categoryName) return
    const cat = userCategories.find(c => c.name === categoryName)
    if (!cat) return
    await fetch(`${supabaseUrl}/rest/v1/recipe_categories`, {
      method: 'POST',
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipe_id: recipeId, category_id: cat.id })
    })
  }

  // 3. SAVE A NEW RECIPE
  const handleAddRecipe = async (newRecipe) => {
    if (!user) {
      alert('Please log in first');
      return;
    }

    // Friendly ceiling before we try to insert (the DB row-limit trigger is the hard gate).
    if (!editingRecipe?.id && recipes.length >= 999) {
      setSaveError({ message: language === 'en' ? "You've reached the maximum of 999 recipes." : 'הגעת למקסימום של 999 מתכונים.' });
      return;
    }

    // close the form right away — the save runs in the background and
    // failures surface in the retry banner
    const editing = editingRecipe;
    // Optimistically reflect the edit in the open detail view; rolled back on failure
    const prevSelected = selectedRecipe;
    const primaryCat = newRecipe.categoryIds?.length ? userCategories.find(c => c.id === newRecipe.categoryIds[0]) : null;
    if (editing?.id) {
      // junction state drives category chips on detail/cards
      setRecipeCategories(prev => ({ ...prev, [editing.id]: newRecipe.categoryIds || [] }));
      setSelectedRecipe(prev => prev && prev.id === editing.id ? {
        ...prev,
        title: newRecipe.title,
        description: newRecipe.description,
        ingredients: newRecipe.ingredients,
        instructions: newRecipe.instructions,
        category: primaryCat?.name || null,
        categoryColor: primaryCat?.color || null,
        caloriesPerServing: newRecipe.caloriesPerServing,
        visibility: newRecipe.visibility,
      } : prev)
    }
    setShowRecipeForm(false);
    setEditingRecipe(null);
    performSave(newRecipe, editing, prevSelected);
  }

  const performSave = async (newRecipe, editing, prevSelected) => {
    setSaveError(null);

    try {
      const token = await getToken();
      const userToken = token;

      if (editing?.id) {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/recipes?id=eq.${editing.id}`,
          {
            method: 'PATCH',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${userToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: newRecipe.title,
              description: newRecipe.description,
              ingredients: newRecipe.ingredients,
              instructions: newRecipe.instructions,
              calories_per_serving: newRecipe.caloriesPerServing,
              visibility: newRecipe.visibility,
            })
          }
        );
        if (!res.ok) throw new Error(`Update failed: ${res.status} ${await res.text()}`);
        await syncRecipeCategories(editing.id, newRecipe.categoryIds, userToken)
        await applyCookCountDelta(editing.id, newRecipe.cookCountDelta)
      } else {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/recipes`,
          {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${userToken}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            },
            body: JSON.stringify({
              user_id: user.id,
              name: newRecipe.title,
              description: newRecipe.description,
              ingredients: newRecipe.ingredients,
              instructions: newRecipe.instructions,
              calories_per_serving: newRecipe.caloriesPerServing,
              visibility: newRecipe.visibility || localStorage.getItem('defaultRecipeVisibility') || 'public'
            })
          }
        );
        if (!res.ok) throw new Error(`Insert failed: ${res.status} ${await res.text()}`);
        const [saved] = await res.json()
        if (saved?.id) await syncRecipeCategories(saved.id, newRecipe.categoryIds, userToken)
      }

      setSaveSuccess(editing?.id ? 'saved' : 'added');
      fetchRecipes(true);
    } catch (err) {
      console.error('[Data] Error saving recipe:', err);
      // roll back the optimistic detail-view update
      if (editing?.id && prevSelected !== undefined) setSelectedRecipe(prevSelected);
      setSaveError({ recipe: newRecipe, editingId: editing?.id || null });
    }
  }

  // re-open the form pre-filled with the changes from the failed save
  const handleRetryWithEdit = () => {
    const { recipe, editingId } = saveError;
    setEditingRecipe({ ...(editingId ? { id: editingId } : {}), ...recipe });
    setShowRecipeForm(true);
    setSaveError(null);
  }

  // resend the failed save unchanged
  const handleResend = () => {
    const { recipe, editingId } = saveError;
    performSave(recipe, editingId ? { id: editingId } : null);
  }

  // 3b. EDIT RECIPE
  const handleEditRecipe = (recipe) => {
    setEditingRecipe(recipe);
    setShowRecipeForm(true);
  }

  const handleNavigate = (mode) => {
    setSelectedRecipe(null)
    setEditingRecipe(null)
    setViewingProfile(null)
    setViewMode(mode)
    
    // Set URL based on view mode
    if (mode === 'profile' && user) {
      // Use user ID in URL so it can be shared
      window.history.pushState({}, '', `/?user=${userHandle || user.id}`)
    } else {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }

  const handleBack = () => {
    if (showRecipeForm) {
      setShowRecipeForm(false)
      setEditingRecipe(null)
      return
    }
    setSelectedRecipe(null)
    setEditingRecipe(null)
    if (detailOrigin === 'profile') {
      setViewMode('profile')
      // Restore the profile URL we came from — viewed profile (incl. guests) or own
      const handle = viewingProfile?.username || userHandle || user?.id
      window.history.pushState({}, '', `/?user=${handle}`)
    } else {
      setViewMode('home')
      window.history.pushState({}, '', window.location.pathname)
    }
  }

  // Fire the actual network DELETE (after the undo grace period, or on flush).
  const performDeleteNow = async (recipe, token) => {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/recipes?id=eq.${recipe.id}`, {
        method: 'DELETE',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
    } catch (error) {
      console.error('[Data] Error deleting recipe:', error);
      setSaveError({ message: language === 'en' ? 'Failed to delete recipe' : 'מחיקת המתכון נכשלה' });
    }
    fetchRecipes(true); // resync either way (recipe gone on success, still there on failure)
  };

  // Commit a queued delete immediately (e.g. before queuing another, or on unload).
  const flushPendingDelete = () => {
    const p = pendingDeleteRef.current;
    if (!p) return;
    clearTimeout(p.timeoutId);
    pendingDeleteRef.current = null;
    setPendingDelete(null);
    performDeleteNow(p.recipe, p.token);
  };

  // Cancel a queued delete — the recipe is still on the server, just repaint it.
  const undoDelete = () => {
    const p = pendingDeleteRef.current;
    if (!p) return;
    clearTimeout(p.timeoutId);
    pendingDeleteRef.current = null;
    setPendingDelete(null);
    fetchRecipes(true);
  };

  // If the tab closes mid-grace-period, still commit the delete (keepalive fetch).
  useEffect(() => {
    const onUnload = () => {
      const p = pendingDeleteRef.current;
      if (!p) return;
      fetch(`${supabaseUrl}/rest/v1/recipes?id=eq.${p.recipe.id}`, {
        method: 'DELETE', keepalive: true,
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${p.token}` }
      });
    };
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('pagehide', onUnload); // iOS Safari fires this, not beforeunload
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('pagehide', onUnload);
    };
  }, []);

  // 4. DELETE RECIPE
  const handleDeleteRecipe = async (recipe) => {
    const confirmed = await new Promise(resolve => {
      setConfirmDialog({
        title: language === 'en' ? `Delete "${recipe.title}"?` : `למחוק את "${recipe.title}"?`,
        message: language === 'en' ? "You'll have a few seconds to undo." : 'יהיו לך כמה שניות לבטל.',
        confirmLabel: language === 'en' ? 'Delete' : 'מחק',
        icon: Trash2,
        onConfirm: () => { setConfirmDialog(null); resolve(true); },
        onCancel: () => { setConfirmDialog(null); resolve(false); },
      });
    });
    if (!confirmed) return;
    let token;
    try { token = await getToken(); }
    catch { setSaveError({ message: language === 'en' ? 'Not authenticated' : 'לא מחובר' }); return; }
    // Deferred delete: drop it from the list now, fire the network DELETE after a
    // grace period so the user can undo. Any earlier pending delete commits first.
    flushPendingDelete();
    setRecipes(prev => prev.filter(r => r.id !== recipe.id));
    setViewMode('profile');
    const timeoutId = setTimeout(() => {
      pendingDeleteRef.current = null;
      setPendingDelete(null);
      performDeleteNow(recipe, token);
    }, 5000);
    pendingDeleteRef.current = { recipe, timeoutId, token: token };
    setPendingDelete(recipe);
  }

  // 5. SCRAPE RECIPE FROM URL
  const handleScrapeFromUrl = async () => {
    if (!urlInput.trim()) {
      alert('Please enter a URL');
      return;
    }

    setIsScrapingLoading(true);
    try {
      const token = await getToken();

      const res = await fetch(`${API_BASE}/recipes/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'Authorization': `Bearer ${token}` },
        body: urlInput
      });

      if (res.ok) {
        const scrapedRecipe = await res.json();
        // Convert recipe data to format expected by RecipeForm
        setEditingRecipe({
          title: scrapedRecipe.name,
          description: scrapedRecipe.description,
          ingredients: scrapedRecipe.ingredients || [],
          instructions: scrapedRecipe.instructions || [],
        });
        setShowRecipeForm(true);
        setShowUrlModal(false);
        setUrlInput('');
      } else if (res.status === 429) {
        setSaveError({ message: language === 'en' ? "You've hit your import limit, try again later" : 'הגעת למגבלת השימוש, נסה שוב מאוחר יותר' });
      } else {
        setSaveError({ message: language === 'en' ? 'Failed to import recipe from that URL' : 'יבוא המתכון מהקישור נכשל' });
      }
    } catch (error) {
      console.error('Error scraping URL:', error);
      setSaveError({ message: language === 'en' ? 'Failed to import recipe from that URL' : 'יבוא המתכון מהקישור נכשל' });
    } finally {
      setIsScrapingLoading(false);
    }
  }

  // Shared nav-menu items (desktop dropdown + mobile panel)
  const navItems = (
    <>
      {/* ponytail: desktop shows Add recipe as its own button (below), so hide it here on sm+ */}
      <button onClick={() => { closeNavMenu(); setEditingRecipe(null); setShowRecipeForm(true); }}
        className="w-full flex items-center gap-3 px-4 py-4 text-base text-[#3d3429] hover:bg-[#f5f3ef] transition-colors text-start sm:hidden">
        <Plus className="w-5 h-5 text-[#7a7265]"/>
        {language === 'en' ? 'Add recipe' : 'הוסף מתכון'}
      </button>
      <button onClick={() => { closeNavMenu(); handleNavigate('profile'); }}
        className="w-full flex items-center gap-3 px-4 py-4 text-base text-[#3d3429] hover:bg-[#f5f3ef] transition-colors text-start sm:py-2.5 sm:text-sm">
        <UserIcon className="w-5 h-5 text-[#7a7265] sm:w-4 sm:h-4"/>
        {language === 'en' ? 'Profile' : 'פרופיל'}
      </button>
      <button onClick={() => { closeNavMenu(); setOpenProfileSettings(true); handleNavigate('profile'); }}
        className="w-full flex items-center gap-3 px-4 py-4 text-base text-[#3d3429] hover:bg-[#f5f3ef] transition-colors text-start sm:py-2.5 sm:text-sm">
        <Settings className="w-5 h-5 text-[#7a7265] sm:w-4 sm:h-4"/>
        {language === 'en' ? 'Settings' : 'הגדרות'}
      </button>
      <div className="border-t border-[#e8e4dc]" />
      <button onClick={() => {
          closeNavMenu()
          setConfirmDialog({
            title: language === 'en' ? 'Log out?' : 'להתנתק?',
            message: language === 'en' ? 'You can hop back in anytime.' : 'אפשר לחזור בכל רגע.',
            confirmLabel: language === 'en' ? 'Log out' : 'התנתק',
            icon: LogOut,
            danger: false,
            onConfirm: () => { setConfirmDialog(null); handleLogout(); },
            onCancel: () => setConfirmDialog(null),
          })
        }}
        className="w-full flex items-center gap-3 px-4 py-4 text-base text-[#dc2626] hover:bg-[#fef2f2] transition-colors text-start sm:py-2.5 sm:text-sm">
        <LogOut className="w-5 h-5 sm:w-4 sm:h-4"/>
        {language === 'en' ? 'Log out' : 'התנתק'}
      </button>
    </>
  )

  // Segmented EN/HE switch — rendered twice in the footer (mobile action row / desktop bottom bar)
  const langToggle = (
    <div className="inline-flex bg-white border border-[#e8e4dc] rounded-xl overflow-hidden" dir="ltr">
      {['en', 'he'].map(l => (
        <button key={l} onClick={() => { localStorage.setItem('language', l); setLanguage(l); }}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${language === l ? 'bg-[#f0e7dc] text-[#3d3429]' : 'text-[#7a7265] hover:text-[#3d3429]'}`}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )

  return (
    <>
      {loading ? (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#f5f3ef]">
          {/* Simmering pan on a stove flame — same saucepan as the offline banner */}
          <svg width="110" height="100" viewBox="0 0 200 182" fill="none" aria-hidden="true">
            <g className="splash-steam">
              <path d="M72 62 C 66 50, 78 44, 72 30" />
              <path d="M100 60 C 94 48, 106 42, 100 26" />
              <path d="M128 62 C 122 50, 134 44, 128 30" />
            </g>
            <g>
              <rect x="58" y="96" width="84" height="42" rx="10" fill="#3d3429" />
              <ellipse cx="100" cy="96" rx="42" ry="7" fill="#3d3429" />
              <rect x="140" y="90" width="44" height="9" rx="4.5" fill="#3d3429" />
            </g>
            <g className="splash-flames">
              <line x1="70" y1="152" x2="70" y2="166" />
              <line x1="90" y1="154" x2="90" y2="170" />
              <line x1="110" y1="154" x2="110" y2="170" />
              <line x1="130" y1="152" x2="130" y2="166" />
            </g>
          </svg>
          <p className="mt-4 text-[0.95rem] font-semibold text-[#3d3429] tracking-tight">Yuval's Recipe Book</p>
        </div>
      ) : (
    <div className="min-h-screen bg-[#f5f3ef]">
      <header className="sticky top-0 z-30 bg-[#faf9f7]/95 backdrop-blur-md border-b border-[#e8e4dc]">
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
            <button onClick={() => handleNavigate('home')} className="flex items-center gap-2 group min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-[#e67e22] flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <div className="text-left hidden sm:block">
                <h1 className="text-lg font-semibold text-[#3d3429]">Yuval's Recipe Book</h1>
                <p className="text-xs text-[#7a7265]">זה בתהליך לא לשפוט</p>
              </div>
            </button>

            <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
              {user ? (
                <>
                <button onClick={() => { setEditingRecipe(null); setShowRecipeForm(true); }}
                  className="hidden sm:flex items-center text-[#64748b] hover:text-[#1e293b] transition-colors p-2 sm:-me-3">
                  <Plus className="w-5 h-5" />
                </button>
                <div className="relative" ref={navMenuRef}>
                  <button onClick={() => { if (navMenuOpen && !navClosing) { closeNavMenu() } else { setNavClosing(false); setNavMenuOpen(true) } }}
                    className="flex items-center gap-2 text-[#64748b] hover:text-[#1e293b] transition-colors p-2 -me-2">
                    <Menu className="w-5 h-5"/>
                  </button>
                  {/* Desktop: plain anchored dropdown (same style as the recipe-form category menu) */}
                  {navMenuOpen && (
                    <div className={`hidden sm:block absolute ${isRtl ? 'right-0' : 'left-0'} mt-2 w-48 bg-white border border-[#e8e4dc] rounded-2xl shadow-lg overflow-hidden z-50`}
                      style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
                      {navItems}
                    </div>
                  )}
                  {/* Mobile: full-width sliding panel (portaled past the header's backdrop-blur) */}
                  {navMenuOpen && createPortal(
                    <div className="sm:hidden">
                      <div className={`fixed inset-0 z-[65] bg-black/20 transition-opacity duration-200 ${navClosing ? 'opacity-0' : 'opacity-100'}`} onClick={closeNavMenu} />
                      <div ref={navPanelRef}
                        onAnimationEnd={(e) => { if (navClosing && e.target === navPanelRef.current) { setNavClosing(false); setNavMenuOpen(false) } }}
                        className={`fixed top-0 inset-x-0 h-3/5 bg-white py-2 z-[70] rounded-b-3xl overflow-hidden shadow-xl ${navClosing ? 'nav-flow-up' : 'nav-flow-down'}`}
                        style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
                        <div className="flex justify-end px-4 py-2">
                          <button onClick={closeNavMenu} className="p-2 text-[#7a7265]">
                            <X className="w-6 h-6"/>
                          </button>
                        </div>
                        {navItems}
                      </div>
                    </div>,
                    document.body
                  )}
                </div>
                </>
              ) : (
                <button onClick={() => setShowLoginModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#e8e4dc] text-[#3d3429] rounded-xl hover:bg-[#ddd9d0] transition-colors text-sm font-medium whitespace-nowrap">
                  <UserIcon className="w-4 h-4" />
                  <span>{language === 'en' ? 'Sign In' : 'התחברות'}</span>
                </button>
              )}
            </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {viewMode === 'home' && (
          <div style={{ direction: language === 'he' ? 'rtl' : 'ltr' }} >

            {/* Greeting — the page opens by talking to the user (logged-in only) */}
            {user && (() => {
              const hour = new Date().getHours()
              const greet = language === 'en'
                ? (hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening')
                : (hour < 5 ? 'לילה טוב' : hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : 'ערב טוב')
              const firstName = (user.user_metadata?.full_name || userHandle || '').split(' ')[0]
              const leader = recipes.reduce((a, r) => (cookCounts[r.id] || 0) > (cookCounts[a?.id] || 0) ? r : a, null)
              return (
                <div className="mb-6">
                  <h2 className={`text-2xl sm:text-3xl text-[#3d3429] ${isRtl ? 'font-bold' : 'font-extrabold tracking-tight'}`}>
                    {greet}{firstName && <>, <span className="text-[#cf711f]">{firstName}</span></>}
                  </h2>
                  <p className="mt-1 text-sm text-[#7a7265]">
                    {weekCooks > 0
                      ? (language === 'en'
                        ? <>You've cooked <b className="font-semibold text-[#cf711f]">{weekCooks === 1 ? 'once' : `${weekCooks} times`}</b> this week{leader && cookCounts[leader.id] > 0 && <> — {leader.title} is still in the lead</>}.</>
                        : <>בישלת <b className="font-semibold text-[#cf711f]">{weekCooks === 1 ? 'פעם אחת' : `${weekCooks} פעמים`}</b> השבוע{leader && cookCounts[leader.id] > 0 && <> — {leader.title} עדיין מוביל</>}.</>)
                      : (language === 'en' ? 'What are you cooking today?' : 'מה מבשלים היום?')}
                  </p>
                </div>
              )
            })()}

            {/* Global Search */}
            <div ref={globalSearchRef} className="relative mb-8">
              <div className="relative">
                <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-[#7a7265] ${isRtl ? 'right-4' : 'left-4'}`} />
                <input
                  type="text"
                  value={globalQuery}
                  onChange={e => setGlobalQuery(e.target.value)}
                  onFocus={() => globalQuery.trim() && setShowGlobalResults(true)}
                  onKeyDown={e => {
                    if (e.key !== 'Enter') return
                    const firstUser = globalResults.users[0]
                    const firstRecipe = globalResults.recipes[0]
                    if (firstUser) {
                      setViewingProfile(firstUser); setViewMode('profile')
                      setShowGlobalResults(false); setGlobalQuery('')
                      window.history.pushState({}, '', `/?user=${firstUser.username}`)
                    } else if (firstRecipe) {
                      loadRecipeFromSupabase(`id=eq.${firstRecipe.id}`)
                      setShowGlobalResults(false); setGlobalQuery('')
                    }
                  }}
                  placeholder={language === 'en' ? 'Search recipes and people...' : 'חפש מתכונים ואנשים...'}
                  className={`w-full py-3 bg-white border border-[#e8e4dc] rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#cf711f]/20 focus:border-[#cf711f] transition-all ${isRtl ? `pr-11 ${globalQuery ? 'pl-10' : 'pl-4'} text-right` : `pl-11 ${globalQuery ? 'pr-10' : 'pr-4'}`}`}
                />
                {globalQuery && (
                  <button onClick={() => { setGlobalQuery(''); setShowGlobalResults(false) }}
                    className={`absolute top-1/2 -translate-y-1/2 text-[#7a7265] hover:text-[#3d3429] transition-colors ${isRtl ? 'left-3' : 'right-3'}`}>
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {showGlobalResults && globalQuery.trim() && globalResults.users.length === 0 && globalResults.recipes.length === 0 && (
                <div className="absolute top-full mt-2 w-full bg-white border border-[#e8e4dc] rounded-2xl shadow-lg z-50 px-4 py-4">
                  <p className="text-sm text-[#7a7265] text-center">{language === 'en' ? 'No results found' : 'לא נמצאו תוצאות'}</p>
                </div>
              )}

              {showGlobalResults && (globalResults.users.length > 0 || globalResults.recipes.length > 0) && (
                <div className="absolute top-full mt-2 w-full bg-white border border-[#e8e4dc] rounded-2xl shadow-lg z-50 overflow-hidden">
                  {globalResults.users.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-xs font-semibold text-[#7a7265] uppercase tracking-wide">{language === 'en' ? 'People' : 'אנשים'}</p>
                      {globalResults.users.map(u => (
                        <button key={u.id} onClick={() => {
                          setViewingProfile(u)
                          setViewMode('profile')
                          setShowGlobalResults(false)
                          setGlobalQuery('')
                          window.history.pushState({}, '', `/?user=${u.username}`)
                        }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#f5f3ef] transition-colors">
                          <div className="w-8 h-8 rounded-full bg-[#e67e22]/10 flex-shrink-0 overflow-hidden">
                            {u.avatar_url
                              ? <img src={u.avatar_url} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center"><UserIcon className="w-4 h-4 text-[#e67e22]" /></div>}
                          </div>
                          <div className="text-start">
                            <p className="text-sm text-[#3d3429] font-medium">{u.display_name || u.username}</p>
                            <p className="text-xs text-[#7a7265]"><span dir="ltr">@{u.username}</span></p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {globalResults.recipes.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-xs font-semibold text-[#7a7265] uppercase tracking-wide">{language === 'en' ? 'Recipes' : 'מתכונים'}</p>
                      {globalResults.recipes.map(r => (
                        <button key={r.id} onClick={() => {
                          loadRecipeFromSupabase(`id=eq.${r.id}`)
                          setShowGlobalResults(false)
                          setGlobalQuery('')
                        }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#f5f3ef] transition-colors">
                          <div className="w-8 h-8 rounded-full bg-[#e67e22]/10 flex items-center justify-center flex-shrink-0">
                            <BookOpen className="w-4 h-4 text-[#e67e22]" />
                          </div>
                          <div className="text-start">
                            <p className="text-sm text-[#3d3429] font-medium">{r.name}</p>
                            <p className="text-xs text-[#7a7265]">{r.category}{r.authorUsername ? ` · ${r.authorUsername}` : ''}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="h-2" />
                </div>
              )}
            </div>

            {/* Most Liked Section */}
            <section className="carousel-section" onMouseEnter={() => setHoveringCarousel(true)} onMouseLeave={() => setHoveringCarousel(false)}>
              <div className="mb-3">
                <div className="flex items-center gap-2.5">
                  <span className={`mb-2 text-[0.68rem] font-bold uppercase text-[#cf711f] ${isRtl ? '' : 'tracking-[0.13em]'}`}>
                    {language === 'en' ? 'From the community' : 'מהקהילה'}
                  </span>
                  <span className="mb-2 flex-1 h-px bg-[#e3ddd1]" />
                </div>
                <div className="flex items-baseline gap-2.5 mt-1.5">
                  <h2 className="text-xl font-bold text-[#3d3429]">{language === 'en' ? 'Most liked' : 'האהובים ביותר'}</h2>
                  <span className="text-xs text-[#a39b8d]">{language === 'en' ? 'top public recipes' : 'המתכונים הציבוריים המובילים'}</span>
                </div>
              </div>
              {carouselLoading ? (
                <div className="flex gap-4 sm:gap-6 py-2 pb-3 overflow-hidden">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex-shrink-0 w-80 sm:w-96">
                      <RecipeCardSkeleton feed />
                    </div>
                  ))}
                </div>
              ) : topLikedRecipes.length > 0 ? (
                <div className="relative w-full">
                  <div
                    ref={likedRecipesCarouselRef}
                    className="carousel-scroll flex gap-4 sm:gap-4 overflow-x-auto py-2 pb-3"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                  >
                    {topLikedRecipes.map((recipe, idx) => (
                      <div key={recipe.id} className="flex-shrink-0 w-80 sm:w-96">
                        <RecipeCard
                          recipe={recipe}
                          language={language}
                          onSelect={handleSelectRecipe}
                          likeCount={recipe.likeCount}
                          authorUsername={recipe.authorUsername}
                          authorId={recipe.authorId}
                          authorAvatar={recipe.authorAvatar}
                          rank={recipe.likeCount > 0 ? idx + 1 : undefined}
                          feed
                          onSelectAuthor={navigateToProfile}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 bg-gradient-to-br from-[#faf9f7] to-[#f5f3ef] rounded-3xl border-2 border-dashed border-[#e8e4dc]">
                  <Heart className="w-12 h-12 text-[#e67e22]/30 mx-auto mb-4" />
                  <p className="text-[#7a7265] font-medium">{language === 'en' ? 'No liked recipes yet' : 'אין מתכונים עם לייקים עדיין'}</p>
                </div>
              )}
            </section>

            {/* Most Prepped / Sign-In CTA */}
            {user ? (
            <section className="mt-4">
              <div className="mb-3">
                <div className="flex items-center gap-2.5">
                  <span className={`mb-2 text-[0.68rem] font-bold uppercase text-[#cf711f] ${isRtl ? '' : 'tracking-[0.13em]'}`}>
                    {language === 'en' ? 'Your kitchen' : 'המטבח שלך'}
                  </span>
                  <span className="mb-2 flex-1 h-px bg-[#e3ddd1]" />
                </div>
                <div className="flex items-baseline gap-2.5 mt-1.5">
                  <h2 className="text-xl font-bold text-[#3d3429]">{language === 'en' ? 'Most prepped' : 'המוכנים ביותר'}</h2>
                  <span className="text-xs text-[#a39b8d]">{language === 'en' ? 'your cooking habits' : 'הרגלי הבישול שלך'}</span>
                </div>
              </div>
              {(() => {
                // skeleton only before first load — background refetches keep showing current data
                if (ownRecipesLoading && recipes.length === 0) return (
                  <div className="animate-pulse">
                    <div className="bg-[#e8e4dc]/60 rounded-3xl" style={{ height: '168px' }} />
                    <div className="flex flex-col sm:flex-row gap-2.5 mt-3">
                      <div className="flex-1 bg-[#e8e4dc]/60 rounded-2xl" style={{ height: '46px' }} />
                      <div className="flex-1 bg-[#e8e4dc]/60 rounded-2xl" style={{ height: '46px' }} />
                    </div>
                  </div>
                );

                const mostPrepped = [...recipes]
                  .filter(r => cookCounts[r.id] > 0)
                  .sort((a, b) => (cookCounts[b.id] || 0) - (cookCounts[a.id] || 0))
                  .slice(0, 3);

                if (mostPrepped.length === 0) return (
                  <div className="relative overflow-hidden text-center py-14 px-6 bg-[#faf9f7] rounded-3xl border border-[#e8e4dc]">
                    {/* same faint top ember glow as the filled sig-hero */}
                    <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 60% 55% at 50% 0%, rgba(230,126,34,.09), transparent 70%)' }} />
                    <div className="relative">
                      <span className="w-11 h-11 rounded-full bg-[#e67e22]/10 flex items-center justify-center mx-auto">
                        <ChefHat className="w-5 h-5 text-[#cf711f]" />
                      </span>
                      <p className="mt-3 font-bold text-[#3d3429]">{language === 'en' ? 'No cooks logged yet' : 'עדיין לא סימנת בישולים'}</p>
                      <p className="mt-1 text-sm text-[#7a7265] max-w-[42ch] mx-auto">
                        {language === 'en'
                          ? 'Recipes you mark as cooked show up here, ranked by how often you make them.'
                          : 'מתכונים שסימנת כמבושלים יופיעו כאן, לפי כמות הבישולים.'}
                      </p>
                      <button
                        onClick={() => handleNavigate('profile')}
                        className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-[#cf711f] border border-[#e67e22]/35 hover:bg-[#e67e22]/5 transition-colors"
                      >
                        {language === 'en' ? 'Go to my recipes' : 'למתכונים שלי'}
                      </button>
                    </div>
                  </div>
                );

                const [top, ...runners] = mostPrepped;
                // "last made 3 days ago" — Intl handles the wording in both languages
                let lastMade = null;
                if (lastCooked[top.id]) {
                  const days = Math.max(0, Math.floor((Date.now() - new Date(lastCooked[top.id])) / 86400000));
                  lastMade = new Intl.RelativeTimeFormat(language === 'he' ? 'he' : 'en', { numeric: 'auto' }).format(-days, 'day');
                }

                return (
                  <div>
                    {/* Signature dish hero — deep-cream card with a breathing ember glow */}
                    <button
                      onClick={() => handleSelectRecipe(top)}
                      className="sig-hero w-full text-start rounded-3xl transition-all duration-300 hover:-translate-y-0.5"
                    >
                      <div className="relative z-10 flex flex-wrap items-end justify-between gap-5 p-6 sm:px-7">
                        {/* mobile: the count is absolute in the top corner, so keep the text clear of it */}
                        <div className="min-w-0 pe-16 sm:pe-0">
                          <span className={`inline-flex items-center gap-1.5 text-[0.68rem] font-bold uppercase text-[#cf711f] ${isRtl ? '' : 'tracking-[0.14em]'}`}>
                            <svg className="sig-flame" width="10" height="14" viewBox="0 0 12 16" fill="#cf711f" aria-hidden="true">
                              <path d="M6 0 C7 4, 11 5.5, 11 10 A5 5 0 0 1 1 10 C1 7, 4 6.5, 4 3.5 C5 5, 6 5.5, 6 0Z" />
                            </svg>
                            {language === 'en' ? 'Your signature dish' : 'מנת הדגל שלך'}
                          </span>
                          {/* Hebrew glyphs break under synthetic 800 weight + negative tracking — key off the title's script, not the UI language */}
                          <h3 className={`mt-1 text-2xl sm:text-4xl text-[#3d3429] text-balance ${/[֐-׿]/.test(top.title) ? 'font-bold' : 'font-extrabold tracking-tight'}`}>{top.title}</h3>
                          <p className="mt-2 text-sm text-[#7a7265]">
                            {language === 'en'
                              ? <>Cooked more than anything else{lastMade && <> — last made <b className="font-semibold text-[#cf711f]">{lastMade}</b></>}.</>
                              : <>הוכן יותר מכל מתכון אחר{lastMade && <> — לאחרונה <b className="font-semibold text-[#cf711f]">{lastMade}</b></>}.</>}
                          </p>
                        </div>
                        {/* mobile: top corner opposite the text (saves a wrapped row); desktop: inline as before */}
                        <div className="text-end leading-none flex-shrink-0 absolute top-5 end-5 sm:static">
                          <span dir="ltr" className="block text-4xl sm:text-6xl font-extrabold tracking-tight text-[#e67e22] tabular-nums"
                            style={{ textShadow: '0 0 30px rgba(230,126,34,0.35)' }}>
                            ×{cookCounts[top.id]}
                          </span>
                          <span className={`hidden sm:block mt-1.5 text-[0.7rem] font-semibold uppercase text-[#a39b8d] ${isRtl ? '' : 'tracking-widest'}`}>
                            {language === 'en' ? 'times cooked' : 'פעמים'}
                          </span>
                        </div>
                      </div>
                    </button>

                    {/* Runners-up — quiet chips so the hero keeps the drama */}
                    {runners.length > 0 && (
                      <div className="flex flex-col sm:flex-row gap-2.5 mt-3">
                        {runners.map((r, i) => (
                          <button key={r.id} onClick={() => handleSelectRecipe(r)}
                            className="flex-1 flex items-center gap-2.5 bg-white border border-[#e8e4dc] rounded-2xl px-4 py-2.5 hover:border-[#e67e22]/50 hover:-translate-y-px transition-all text-start">
                            <span className="text-[0.7rem] font-bold text-[#cbc0ae]">#{i + 2}</span>
                            <span className="flex-1 text-sm font-semibold text-[#3d3429] truncate">{r.title}</span>
                            <span dir="ltr" className="text-sm font-bold text-[#cf711f] tabular-nums">×{cookCounts[r.id]}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </section>
            ) : (
            <section className="mt-12">
              <div className="bg-gradient-to-br from-[#faf9f7] to-[#f5f3ef] rounded-3xl border border-[#e8e4dc] p-8 sm:p-12 text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#e67e22]/10 flex items-center justify-center mx-auto mb-4">
                  <BookOpen className="w-7 h-7 text-[#e67e22]" />
                </div>
                <h3 className="text-xl font-bold text-[#3d3429] mb-2">
                  {language === 'en' ? 'Save recipes & track your cooking' : 'שמור מתכונים ועקוב אחרי הבישולים שלך'}
                </h3>
                <p className="text-[#7a7265] text-sm max-w-sm mx-auto">
                  {language === 'en'
                    ? 'Sign in to add your own recipes, mark what you\'ve cooked, and see your personal stats.'
                    : 'התחבר כדי להוסיף מתכונים, לסמן מה בישלת ולראות את הסטטיסטיקות שלך.'}
                </p>
              </div>
            </section>
            )}
          </div>
        )}

        {viewMode === 'profile' && (
          <UserProfile
            user={user}
            recipes={recipes}
            language={language}
            onSelectRecipe={handleSelectRecipe}
            onAddRecipe={() => { setEditingRecipe(null); setShowRecipeForm(true); }}
            viewingProfile={viewingProfile}
            cookCounts={cookCounts}
            apiBase={API_BASE}
            onLogout={handleLogout}
            userCategories={userCategories}
            categoriesLoading={categoriesLoading}
            ownRecipesLoading={ownRecipesLoading}
            recipeCategories={recipeCategories}
            onCreateCategory={handleCreateCategory}
            onDeleteCategory={handleDeleteCategory}
            onToggleRecipeCategory={handleToggleRecipeCategory}
            onRenameCategory={handleRenameCategory}
            onRecolorCategory={handleRecolorCategory}
            onHandleChange={setUserHandle}
            openSettings={openProfileSettings}
            onSettingsOpened={() => setOpenProfileSettings(false)}
            onError={(message) => setSaveError({ message })}
          />
        )}

        {viewMode === 'detail' && !selectedRecipe && (
          <div className="max-w-3xl mx-auto animate-pulse" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
            {/* Header row: back button + action buttons (matches h of py-2 buttons) */}
            <div className="flex items-center justify-between mb-6 gap-2">
              <div className="h-9 w-20 rounded-xl bg-[#e8e4dc]/60" />
              <div className="flex items-center gap-2">
                {/* matches the detail toolbar: Share · Saved · Edit · Delete */}
                <div className="h-9 w-9 sm:w-20 rounded-xl bg-[#e8e4dc]/60" />
                <div className="h-9 w-9 sm:w-20 rounded-xl bg-[#e8e4dc]/60" />
                <div className="h-9 w-9 sm:w-16 rounded-xl bg-[#e8e4dc]/60" />
                <div className="h-9 w-9 sm:w-20 rounded-xl bg-[#e8e4dc]/60" />
              </div>
            </div>
            {/* Recipe header card */}
            <div className="bg-white rounded-3xl border border-[#e2e8f0]/50 shadow-sm overflow-hidden mb-3">
              <div className="p-6 sm:p-8">
                <div className="h-6 w-16 rounded-full bg-[#e8e4dc]/60 mb-3" />
                <div className="h-8 sm:h-9 w-2/3 rounded-lg bg-[#e8e4dc]/60 mb-4" />
                <div className="h-4 w-full rounded bg-[#e8e4dc]/60 mb-2" />
                <div className="h-4 w-4/5 rounded bg-[#e8e4dc]/60 mb-6" />
                <div className="flex items-center gap-4 sm:gap-6">
                  <div className="h-8 w-28 rounded-full bg-[#e8e4dc]/60" />
                  <div className="h-8 w-28 rounded-full bg-[#e8e4dc]/60" />
                </div>
              </div>
            </div>
            {/* Ingredients / instructions cards */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-2 bg-white rounded-3xl border border-[#e2e8f0]/50 shadow-sm p-6">
                <div className="h-7 w-32 rounded-lg bg-[#e8e4dc]/60 mb-4" />
                <div className="space-y-3">
                  {[...Array(6)].map((_, i) => <div key={i} className="h-5 w-full rounded bg-[#e8e4dc]/60" />)}
                </div>
              </div>
              <div className="lg:col-span-3 bg-white rounded-3xl border border-[#e2e8f0]/50 shadow-sm p-6">
                <div className="h-7 w-32 rounded-lg bg-[#e8e4dc]/60 mb-4" />
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => <div key={i} className="h-5 w-full rounded bg-[#e8e4dc]/60" />)}
                </div>
              </div>
            </div>
          </div>
        )}

        {viewMode === 'detail' && selectedRecipe && (
          <div className="transition-all duration-300 ease-out opacity-100 translate-y-0">
            <RecipeDetail
              recipe={selectedRecipe}
              onBack={handleBack}
              language={language}
              onEdit={user ? handleEditRecipe : undefined}
              onDelete={user ? handleDeleteRecipe : undefined}
              onMarkMade={user ? handleMarkMade : undefined}
              cookCount={cookCounts[selectedRecipe?.id] || 0}
              likeCount={recipeLikeCount}
              isLiked={recipeIsLiked}
              onToggleLike={user ? handleToggleLike : undefined}
              onDuplicate={user && selectedRecipe?.authorId !== user.id ? handleDuplicateRecipe : undefined}
              onSelectAuthor={selectedRecipe?.authorId ? navigateToProfile : undefined}
              userCategories={userCategories}
              currentRecipeCategories={recipeCategories[selectedRecipe?.id] || []}
              onToggleRecipeCategory={user && selectedRecipe?.authorId === user.id ? handleToggleRecipeCategory : undefined}
              onCreateCategory={user && selectedRecipe?.authorId === user.id ? handleCreateCategory : undefined} />
          </div>
        )}


      </main>

      {/* Recipe Form Overlay */}
      {showRecipeForm && user && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm bg-black/30" onClick={handleBack} />
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={handleBack}>
            <div className="w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
              <RecipeForm
                key={editingRecipe?.id || 'new'}
                editingRecipe={editingRecipe}
                language={language}
                onBack={handleBack}
                onSave={handleAddRecipe}
                onOpenUrlModal={() => setShowUrlModal(true)}
                userCategories={userCategories}
                currentCategoryIds={recipeCategories[editingRecipe?.id] || []}
                onCreateCategory={handleCreateCategory}
                cookCount={cookCounts[editingRecipe?.id] || 0}
              />
            </div>
          </div>
        </>
      )}

      {/* URL Import Modal - Rendered at App level for full-screen overlay */}
      {showUrlModal && (
        <>
          <div className="fixed inset-0 z-[60] backdrop-blur-sm bg-black/30" onClick={() => setShowUrlModal(false)}></div>
          <div className="fixed inset-0 flex items-center justify-center z-[70] p-4" onClick={() => setShowUrlModal(false)}>
            <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-lg overflow-hidden" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
              {/* Branded header band — gray, matches the settings menu */}
              <div className="relative -mx-6 -mt-6 sm:-mx-8 sm:-mt-8 px-6 sm:px-8 pt-7 pb-7 mb-6 bg-gradient-to-br from-[#7a7265] to-[#5a5248]">
                <button onClick={() => setShowUrlModal(false)} className="absolute top-4 end-4 text-white/85 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center ring-1 ring-white/25">
                    <LinkIcon className="w-7 h-7 text-white" />
                  </div>
                  <h2 className="text-center text-2xl font-bold tracking-tight text-white">
                    {language === 'en' ? 'Import Recipe from URL' : 'ייבא מתכון מקישור'}
                  </h2>
                </div>
              </div>
              
              {!canScrape ? (
                <div className="space-y-4">
                  <p className="text-sm text-[#7a7265] text-center py-4">
                    {language === 'en'
                      ? "You're not verified to import recipes from URLs."
                      : 'החשבון שלך אינו מאומת לייבוא מתכונים מ-URL.'}
                  </p>
                  <button
                    onClick={() => setShowUrlModal(false)}
                    className="w-full px-4 py-3 bg-[#f5f3ef] text-[#3d3429] rounded-xl hover:bg-[#e8e4dc] transition-colors font-medium"
                  >
                    {language === 'en' ? 'Close' : 'סגור'}
                  </button>
                </div>
              ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#3d3429] mb-2">
                    {language === 'en' ? 'Recipe URL' : 'לינק למתכון'}
                  </label>
                  <div className="relative">
                    <LinkIcon className="w-4 h-4 text-[#7a7265] absolute top-1/2 -translate-y-1/2 left-4 pointer-events-none" />
                    <input
                      type="url"
                      dir="ltr"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder='https://example.com/recipe'
                      className="w-full pl-11 pr-4 py-3 bg-[#faf9f7] text-left border border-[#e8e4dc] rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#cf711f]/20 focus:border-[#cf711f] transition-all"
                    />
                  </div>
                  <p className="flex items-start gap-1.5 text-xs text-[#7a7265] mt-2 text-start">
                    <Sparkles className="w-3.5 h-3.5 text-[#cf711f] flex-shrink-0 mt-0.5" />
                    <span>
                      {language === 'en'
                        ? 'Paste the URL of a recipe webpage. AI will extract the recipe details automatically.'
                        : 'הדבק כתובת למתכון, אנחנו נשלוף את כל הפרטים.'}
                    </span>
                  </p>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setShowUrlModal(false)}
                    className="flex-1 px-4 py-3 bg-[#f5f3ef] text-[#3d3429] rounded-xl hover:bg-[#e8e4dc] transition-colors font-medium"
                  >
                    {language === 'en' ? 'Cancel' : 'בטל'}
                  </button>
                  <button
                    onClick={handleScrapeFromUrl}
                    disabled={isScrapingLoading}
                    className="flex-1 px-4 py-3 bg-[#cf711f] text-white rounded-xl hover:bg-[#b8621a] disabled:bg-[#cf711f]/50 transition-colors font-medium flex items-center justify-center gap-2"
                  >
                    {isScrapingLoading ? (
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
      )}

      {/* Footer — brand line, Telegram chip, legal links, language toggle */}
      <footer className="border-t border-[#e8e4dc] bg-[#faf9f7] mt-12" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#e67e22] flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#3d3429]">Yuval's Recipe Book</p>
                <p className="text-xs text-[#7a7265]">
                  {language === 'en'
                    ? 'Save recipes, log what you cook, share the keepers.'
                    : 'שמרו מתכונים, תעדו מה בישלתם ושתפו את המוצלחים.'}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <a href="https://t.me/Yuvals_Recipe_Book_bot" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-[#e8e4dc] rounded-xl text-xs font-medium text-[#3d3429] hover:border-[#e67e22]/50 transition-colors">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="#2AABEE" className="flex-shrink-0" aria-hidden="true">
                  <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.56 8.16-1.97 9.28c-.15.66-.54.82-1.09.51l-3-2.21-1.45 1.39c-.16.16-.29.29-.6.29l.21-3.05 5.56-5.02c.24-.21-.05-.33-.37-.12l-6.87 4.33-2.96-.93c-.64-.2-.66-.64.14-.95l11.57-4.46c.53-.19 1 .13.83.94z" />
                </svg>
                {language === 'en' ? 'Add recipes from Telegram' : 'הוסיפו מתכונים דרך טלגרם'}
              </a>
              <div className="sm:hidden">{langToggle}</div>
            </div>
          </div>
          <div className="mt-5 pt-4 border-t border-[#e8e4dc] flex items-center justify-center sm:justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 text-xs text-[#a39b8d]">
              <span>© 2026 Yuval's Recipe Book</span>
              {/* TODO: point to the privacy policy / terms pages once they exist */}
              <a className="hover:text-[#7a7265] transition-colors cursor-pointer">{language === 'en' ? 'Privacy' : 'פרטיות'}</a>
              <a className="hover:text-[#7a7265] transition-colors cursor-pointer">{language === 'en' ? 'Terms' : 'תנאים'}</a>
            </div>
            <div className="hidden sm:block">{langToggle}</div>
          </div>
        </div>
      </footer>

      {/* Confirm Dialog */}
      {confirmDialog && (
        <ConfirmDialog
          language={language}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          icon={confirmDialog.icon}
          onConfirm={confirmDialog.onConfirm}
          onCancel={confirmDialog.onCancel}
        />
      )}

      {/* Bottom banners — offline (persistent until dismissed) stacked with errors */}
      {(saveError || saveSuccess || pendingDelete || (isOffline && !offlineDismissed)) && (
      <div
        className="fixed left-1/2 -translate-x-1/2 z-[80] flex flex-col-reverse items-center gap-2 max-w-[calc(100vw-2rem)]"
        style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        {saveSuccess && (
          <div className="flex items-center gap-2 bg-white border border-[#e8e4dc] shadow-lg rounded-2xl px-4 py-3">
            <span className="w-6 h-6 rounded-full bg-[#e67e22]/10 flex items-center justify-center shrink-0">
              <Check className="w-4 h-4 text-[#e67e22]" />
            </span>
            <span className="text-sm font-medium text-[#3d3429] whitespace-nowrap">
              {saveSuccess === 'added'
                ? (language === 'en' ? 'Recipe added' : 'המתכון נוסף')
                : (language === 'en' ? 'Changes saved' : 'השינויים נשמרו')}
            </span>
          </div>
        )}

        {pendingDelete && (
          <div className={`flex items-center gap-3 bg-white border border-[#e8e4dc] shadow-lg rounded-2xl px-4 py-2.5 ${language === 'en' ? 'flex-row-reverse' : ''}`} style={{ direction: 'ltr' }}>
            <button onClick={undoDelete}
              className="shrink-0 text-sm font-semibold text-[#e67e22] hover:text-[#cf711f] transition-colors">
              {language === 'en' ? 'Undo' : 'ביטול'}
            </button>
            <span className="text-sm font-medium text-[#3d3429] whitespace-nowrap">
              {language === 'en' ? 'Recipe deleted' : 'המתכון נמחק'}
            </span>
          </div>
        )}
        {isOffline && !offlineDismissed && (
          <div className="flex items-center gap-3 bg-white border border-[#e8e4dc] shadow-lg rounded-2xl px-4 py-2">
            <button
              type="button"
              onClick={() => { if (!isStirring) { setIsStirring(true); setTimeout(() => setIsStirring(false), 1300); } }}
              className="relative w-10 flex-shrink-0 cursor-pointer select-none"
            >
              <svg viewBox="0 0 200 140" className="w-10 h-auto" fill="none" aria-hidden="true">
                {/* crossed-out wifi */}
                <path d="M60 42 a55 55 0 0 1 80 0" stroke="#cbc5ba" strokeWidth="10" strokeLinecap="round" />
                <path d="M75 57 a35 35 0 0 1 50 0" stroke="#cbc5ba" strokeWidth="10" strokeLinecap="round" />
                <line x1="58" y1="22" x2="142" y2="66" stroke="#e67e22" strokeWidth="10" strokeLinecap="round" />
                {/* veggies — drawn before the pan so they rest hidden inside it */}
                <text x="64" y="114" fontSize="24" fill="#000" className={isStirring ? 'veg animate-veg-jump' : 'veg'}>🥕</text>
                <text x="88" y="116" fontSize="24" fill="#000" className={isStirring ? 'veg animate-veg-jump' : 'veg'} style={{ animationDelay: '130ms' }}>🥦</text>
                <text x="112" y="114" fontSize="24" fill="#000" className={isStirring ? 'veg animate-veg-jump' : 'veg'} style={{ animationDelay: '260ms' }}>🍅</text>
                {/* saucepan: straight-sided pot + rim + side handle */}
                <g className={isStirring ? 'animate-pan-stir' : ''} style={{ transformBox: 'fill-box', transformOrigin: '50% 90%' }}>
                  <rect x="58" y="80" width="84" height="42" rx="10" fill="#3d3429" />
                  <ellipse cx="100" cy="80" rx="42" ry="7" fill="#3d3429" />
                  <rect x="140" y="74" width="44" height="9" rx="4.5" fill="#3d3429" />
                </g>
              </svg>
            </button>
            <span className="text-sm font-semibold text-red-500 whitespace-nowrap">
              {language === 'en' ? 'No internet' : 'אין אינטרנט'}
            </span>
            <button onClick={() => setOfflineDismissed(true)} className="shrink-0 text-[#7a7265] hover:text-[#3d3429] text-sm">✕</button>
          </div>
        )}

        {/* Error banner — failed saves get retry/edit buttons, plain errors just the message */}
        {saveError && (
        <div className="flex items-center gap-3 bg-white border border-red-200 shadow-lg rounded-2xl px-4 py-3 max-w-full">
          <p className="text-sm text-[#3d3429] truncate">
            {saveError.message
              ? saveError.message
              : (language === 'en' ? `Failed to save "${saveError.recipe.title}"` : `השמירה של "${saveError.recipe.title}" נכשלה`)}
          </p>
          {saveError.recipe && (
            <>
              <button
                onClick={handleResend}
                title={language === 'en' ? 'Retry as is' : 'שלח שוב כפי שהוא'}
                className="shrink-0 w-9 h-9 flex items-center justify-center bg-[#e67e22] text-white rounded-xl hover:bg-[#cf711f] transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={handleRetryWithEdit}
                title={language === 'en' ? 'Edit and retry' : 'ערוך ונסה שוב'}
                className="shrink-0 w-9 h-9 flex items-center justify-center border border-[#e8e4dc] text-[#7a7265] rounded-xl hover:text-[#cf711f] hover:border-[#cf711f]/50 transition-colors"
              >
                <Pencil className="w-4 h-4" />
              </button>
            </>
          )}
          <button onClick={() => setSaveError(null)} className="shrink-0 text-[#7a7265] hover:text-[#3d3429] text-sm">✕</button>
        </div>
        )}
      </div>
      )}

      {/* Telegram linked — celebration modal */}
      {showLinkSuccess && (
        <>
          <div className="fixed inset-0 z-[90] backdrop-blur-sm bg-black/30" onClick={() => setShowLinkSuccess(false)} />
          <div className="fixed inset-0 z-[95] flex items-center justify-center p-4" onClick={() => setShowLinkSuccess(false)}>
            <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center" onClick={e => e.stopPropagation()}>
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold text-[#3d3429] mb-2">{language === 'en' ? 'Connected!' : 'מחוברים!'}</h2>
              <p className="text-[#7a7265] mb-6">
                {language === 'en'
                  ? 'Your Telegram is linked — recipes you add with the bot will show up here.'
                  : 'הטלגרם שלך מקושר — מתכונים שתוסיף דרך הבוט יופיעו כאן.'}
              </p>
              <button
                onClick={() => setShowLinkSuccess(false)}
                className="px-8 py-3 bg-[#e67e22] text-white rounded-2xl font-medium hover:bg-[#cf711f] transition-colors"
              >
                {language === 'en' ? 'Awesome' : 'מעולה'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* First-signup handle picker — blocking: the users row doesn't exist until this succeeds.
          Styled to match the Login card (gradient header + white body). English only. */}
      {user && needsHandle && (
        <>
          <div className="fixed inset-0 z-[90] backdrop-blur-sm bg-black/30" />
          <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-96 max-w-[90vw] overflow-hidden" dir="ltr">
              {/* Warm branded header */}
              <div className="relative bg-gradient-to-br from-[#e67e22] to-[#cf711f] px-8 pt-9 pb-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center mx-auto mb-4 ring-1 ring-white/25">
                  <AtSign className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white">Pick your handle</h2>
                <p className="text-white/85 text-sm mt-1">Your unique @name on RecipeBook</p>
              </div>

              <div className="px-8 pt-8 pb-8 -mt-5 bg-white rounded-t-3xl relative">
                <p className="text-sm text-[#3d3429] mb-5 text-center">
                  It appears on your profile and recipes — lowercase letters, numbers and underscores.
                </p>

                <div className="relative mb-2">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#7a7265]">@</span>
                  <input
                    type="text"
                    value={newHandle}
                    maxLength={30}
                    onChange={e => { setNewHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')); setHandleError(null) }}
                    onKeyDown={e => { if (e.key === 'Enter') submitHandle() }}
                    placeholder="yourhandle"
                    autoFocus
                    className="w-full pl-9 pr-4 p-3.5 border border-[#e8e4dc] rounded-2xl text-[#3d3429] focus:outline-none focus:border-[#e67e22] transition-colors"
                  />
                </div>

                {handleError && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                    <p className="text-red-700 text-sm text-center">{handleError}</p>
                  </div>
                )}

                <button
                  onClick={submitHandle}
                  disabled={creatingProfile || newHandle.trim().length < 3}
                  className="relative w-full bg-[#e67e22] text-white p-3.5 rounded-2xl hover:bg-[#cf711f] disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all shadow-sm hover:shadow-md mt-3"
                >
                  <span className={creatingProfile ? 'invisible' : ''}>Confirm</span>
                  <span className={`absolute inset-0 flex items-center justify-center gap-3 ${creatingProfile ? '' : 'invisible'}`}>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Saving...</span>
                  </span>
                </button>

                <p className="flex items-center justify-center gap-1.5 text-center text-xs text-[#7a7265] mt-4">
                  <Heart className="w-3 h-3 text-[#e67e22]" />
                  You can change it anytime in settings
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Login modal overlay — shown for guests when they click Sign In */}
      {!user && showLoginModal && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm bg-black/30" onClick={() => setShowLoginModal(false)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4" onClick={() => setShowLoginModal(false)}>
            <div onClick={(e) => e.stopPropagation()}>
              <Login onLoginSuccess={() => { setShowLoginModal(false); setViewMode('profile'); }} />
            </div>
          </div>
        </>
      )}
    </div>
      )}
    </>
  )
}

export default App

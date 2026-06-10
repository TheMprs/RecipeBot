import { useState, useEffect, useRef } from 'react'
import { BookOpen, Plus, Search, Filter, X, Link as LinkIcon, User as UserIcon, ChevronLeft, ChevronRight, LogOut, Heart, RotateCcw, Pencil } from 'lucide-react'
import { RecipeCard, RecipeCardSkeleton } from './components/RecipeCard'
import { RecipeDetail } from './components/RecipeDetail'
import { RecipeForm } from './components/RecipeForm'
import { UserProfile } from './components/UserProfile'
import { ConfirmDialog } from './components/ConfirmDialog'
import Login from './components/Login'
import { supabase } from './supabaseClient'
import './global.css'

// API configuration: uses environment variable in production, /api proxy in dev
const API_BASE = import.meta.env.VITE_API_URL || '/api'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function App() {
  const [user, setUser] = useState(null)
  const [userHandle, setUserHandle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recipes, setRecipes] = useState([])
  const [topLikedRecipes, setTopLikedRecipes] = useState([])
  const [recipeLikeCount, setRecipeLikeCount] = useState(0)
  const [recipeIsLiked, setRecipeIsLiked] = useState(false)
  const [publicRecipes, setPublicRecipes] = useState([])
  const [language, setLanguage] = useState(() => localStorage.getItem('language') || 'he')
  const [viewMode, setViewMode] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('user')) return 'profile'
    if (params.get('r') || params.get('recipe')) return 'detail'
    return 'home'
  })
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const [editingRecipe, setEditingRecipe] = useState(null)
  const [userCategories, setUserCategories] = useState([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [ownRecipesLoading, setOwnRecipesLoading] = useState(true)
  const [recipeCategories, setRecipeCategories] = useState({})
  const [showRecipeForm, setShowRecipeForm] = useState(false)
  const [showUrlModal, setShowUrlModal] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [isScrapingLoading, setIsScrapingLoading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importMessage, setImportMessage] = useState('')
  const [viewingProfile, setViewingProfile] = useState(null)
  const likedRecipesCarouselRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)
  const [hoveringCarousel, setHoveringCarousel] = useState(false)
  const [cookCounts, setCookCounts] = useState({})
  const [carouselLoading, setCarouselLoading] = useState(true)
  const [globalQuery, setGlobalQuery] = useState('')
  const [globalResults, setGlobalResults] = useState({ users: [], recipes: [] })
  const [showGlobalResults, setShowGlobalResults] = useState(false)
  const globalSearchRef = useRef(null)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [saveError, setSaveError] = useState(null) // failed background save, offered for retry
  const [showLinkSuccess, setShowLinkSuccess] = useState(false) // Telegram linking celebration
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine)
  const profileCheckedFor = useRef(null) // user id whose profile row was already verified this session

  const isRtl = language === 'he'

  // Online/offline tracking — refetch everything when the connection returns
  useEffect(() => {
    const goOnline = () => {
      setIsOffline(false)
      if (user) { fetchRecipes(); fetchCookCounts(); fetchUserCategories(); } else { fetchPublicRecipes(); }
      fetchTopLikedRecipes()
    }
    const goOffline = () => setIsOffline(true)
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
            
            // If no profile exists, create one — use UUID as default username (always unique)
            if (!existingProfiles || existingProfiles.length === 0) {
              const createRes = await fetch(`${supabaseUrl}/rest/v1/users`, {
                method: 'POST',
                headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: user.id, username: user.id,
                  display_name: user.user_metadata?.full_name || '',
                  bio: null, avatar_url: user.user_metadata?.avatar_url || null,
                })
              })
              if (!createRes.ok) console.error('[Auth] Failed to create profile:', await createRes.text())
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
    if (!user) { setUserHandle(null); return }
    fetch(`${supabaseUrl}/rest/v1/users?id=eq.${user.id}&select=username`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    }).then(r => r.json()).then(d => { if (d?.[0]?.username) setUserHandle(d[0].username) }).catch(() => {})
  }, [user])

  const handleLogout = async () => {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Logout timeout')), 3000)
      )
      await Promise.race([supabase.auth.signOut(), timeoutPromise])
    } catch (error) {
      console.error('[Auth] Logout failed:', error.message)
    } finally {
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
      setViewMode('home')
    }
  }

  // 1. FETCH ALL RECIPES WITH FULL DETAILS (no N+1 queries)
  const fetchRecipes = async () => {
    setOwnRecipesLoading(true)
    try {
      if (user) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) { setRecipes([]); return; }
        const response = await fetch(
          `${supabaseUrl}/rest/v1/recipes?user_id=eq.${user.id}&select=*,recipe_likes(recipe_id),recipe_categories(category_id,categories(name))`,
          {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json'
            }
          }
        )
        
        const data = await response.json()

        if (!response.ok) {
          throw new Error(`API error: ${response.status} ${JSON.stringify(data)}`);
        }

        // Format recipes for display
        const formattedRecipes = (data || []).map(recipe => ({
          id: recipe.id,
          title: recipe.name,
          description: recipe.description,
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
          created_at: recipe.created_at,
          category: recipe.recipe_categories?.[0]?.categories?.name || recipe.category || null,
          likeCount: recipe.recipe_likes?.length || 0,
          user_id: recipe.user_id,
          authorId: recipe.user_id,
        }));

        setRecipes(formattedRecipes);
        fetchRecipeCategories(formattedRecipes.map(r => r.id));
      } else {
        setRecipes([]);
      }
    } catch (error) {
      console.error('[Data] Failed to fetch recipes:', error.message);
      setRecipes([]);
    } finally {
      setOwnRecipesLoading(false)
    }
  };

  // Fetch public recipes for home page when not logged in
  const fetchPublicRecipes = async () => {
    try {
      // Get all public recipes using REST API instead of JS client
      const response = await fetch(
        `${supabaseUrl}/rest/v1/recipes?visibility=eq.public&order=id.desc&limit=50`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      const formattedRecipes = data.map(recipe => ({
        id: recipe.id,
        title: recipe.name,
        category: recipe.category,
        description: recipe.description,
        ingredients: recipe.ingredients,
        instructions: recipe.instructions
      }));

      setPublicRecipes(formattedRecipes);
    } catch (error) {
      console.error('[Data] Failed to fetch public recipes:', error.message);
      setPublicRecipes([]);
    }
  };

  const fetchCookCounts = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(
        `${supabaseUrl}/rest/v1/cook_logs?user_id=eq.${user.id}&select=recipe_id`,
        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${session.access_token}` } }
      );
      if (!res.ok) return;
      const data = await res.json();
      const counts = {};
      for (const row of data) counts[row.recipe_id] = (counts[row.recipe_id] || 0) + 1;
      setCookCounts(counts);
    } catch (err) {
      console.error('[Data] Failed to fetch cook counts:', err.message);
    }
  };

  const handleMarkMade = async (recipe) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');
      const res = await fetch(`${supabaseUrl}/rest/v1/cook_logs`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ user_id: user.id, recipe_id: recipe.id })
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      fetchCookCounts();
    } catch (err) {
      console.error('[Data] Failed to log cook:', err.message);
      setSaveError({ message: language === 'en' ? 'Failed to log cook' : 'רישום ההכנה נכשל' });
    }
  };

  // Applies the stepper's net change on save: +N inserts N cook logs in one
  // request, -N deletes the N most recent ones
  const applyCookCountDelta = async (recipeId, delta) => {
    if (!delta) return
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');
    const headers = { 'apikey': supabaseKey, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };

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
    fetchCookCounts();
  };

  const fetchTopLikedRecipes = async () => {
    try {
      const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/get_top_liked_recipes`, {
        method: 'POST',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit_count: 10 })
      })
      if (!rpcRes.ok) return
      const ranked = await rpcRes.json()
      if (!ranked || ranked.length === 0) { setTopLikedRecipes([]); return }

      const ids = ranked.map(r => r.recipe_id).join(',')
      const recipesRes = await fetch(`${supabaseUrl}/rest/v1/recipes?id=in.(${ids})&select=*`, {
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
      })
      if (!recipesRes.ok) return
      const recipesData = await recipesRes.json()

      const likeCountMap = {}
      ranked.forEach(r => { likeCountMap[r.recipe_id] = Number(r.like_count) })

      const userIds = [...new Set(recipesData.map(r => r.user_id).filter(Boolean))]
      let usernameMap = {}
      if (userIds.length > 0) {
        const usersRes = await fetch(
          `${supabaseUrl}/rest/v1/users?id=in.(${userIds.join(',')})&select=id,username`,
          { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
        )
        if (usersRes.ok) {
          const usersData = await usersRes.json()
          usersData.forEach(u => { usernameMap[u.id] = u.username })
        }
      }

      const sorted = ranked.map(r => {
        const recipe = recipesData.find(rd => rd.id === r.recipe_id)
        if (!recipe) return null
        return {
          id: recipe.id,
          title: recipe.name,
          category: recipe.category,
          description: recipe.description,
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
          created_at: recipe.created_at,
          likeCount: likeCountMap[r.recipe_id],
          authorId: recipe.user_id,
          authorUsername: usernameMap[recipe.user_id] || null
        }
      }).filter(Boolean)

      setTopLikedRecipes(sorted)
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
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')
      if (wasLiked) {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/recipe_likes?recipe_id=eq.${recipeId}&user_id=eq.${user.id}`,
          { method: 'DELETE', headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${session.access_token}` } }
        )
        if (!res.ok) throw new Error(await res.text())
      } else {
        const res = await fetch(`${supabaseUrl}/rest/v1/recipe_likes`, {
          method: 'POST',
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ user_id: user.id, recipe_id: recipeId })
        })
        if (!res.ok) throw new Error(await res.text())
      }
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
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')
      const res = await fetch(`${supabaseUrl}/rest/v1/recipes`, {
        method: 'POST',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          name: recipe.title,
          category: recipe.category,
          description: recipe.description,
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
          visibility: localStorage.getItem('defaultRecipeVisibility') || 'public'
        })
      })
      if (!res.ok) throw new Error(await res.text())
      fetchRecipes()
      handleNavigate('profile')
    } catch (err) {
      console.error('[Data] Dupe failed:', err.message)
      setSaveError({ message: language === 'en' ? 'Failed to duplicate recipe' : 'שכפול המתכון נכשל' })
    }
  }

  const fetchUserCategories = async () => {
    setCategoriesLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const res = await fetch(
        `${supabaseUrl}/rest/v1/categories?user_id=eq.${user.id}&order=created_at.asc`,
        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${session.access_token}` } }
      )
      if (!res.ok) return
      setUserCategories(await res.json() || [])
    } catch (err) {
      console.error('[Data] Failed to fetch categories:', err.message)
    } finally {
      setCategoriesLoading(false)
    }
  }

  const fetchRecipeCategories = async (recipeIds) => {
    if (!recipeIds.length) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const res = await fetch(
        `${supabaseUrl}/rest/v1/recipe_categories?recipe_id=in.(${recipeIds.join(',')})&select=recipe_id,category_id`,
        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${session.access_token}` } }
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

  const handleCreateCategory = async (name) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')
      const res = await fetch(`${supabaseUrl}/rest/v1/categories`, {
        method: 'POST',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({ user_id: user.id, name: name.trim() })
      })
      if (!res.ok) throw new Error(await res.text())
      const [newCat] = await res.json()
      setUserCategories(prev => [...prev, newCat])
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
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')
      const res = await fetch(`${supabaseUrl}/rest/v1/categories?id=eq.${categoryId}`, {
        method: 'DELETE',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${session.access_token}` }
      })
      if (!res.ok) throw new Error(await res.text())
    } catch (err) {
      console.error('[Data] Delete category failed:', err.message)
      setSaveError({ message: language === 'en' ? 'Failed to delete category' : 'מחיקת הקטגוריה נכשלה' })
      fetchUserCategories()
      fetchRecipeCategories(recipes.map(r => r.id))
    }
  }

  const handleRenameCategory = async (categoryId, newName) => {
    setUserCategories(prev => prev.map(c => c.id === categoryId ? { ...c, name: newName } : c))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')
      const res = await fetch(`${supabaseUrl}/rest/v1/categories?id=eq.${categoryId}`, {
        method: 'PATCH',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ name: newName.trim() })
      })
      if (!res.ok) throw new Error(await res.text())
    } catch (err) {
      console.error('[Data] Rename category failed:', err.message)
      setSaveError({ message: language === 'en' ? 'Failed to rename category' : 'שינוי שם הקטגוריה נכשל' })
      fetchUserCategories()
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
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')
      if (isAdding) {
        const res = await fetch(`${supabaseUrl}/rest/v1/recipe_categories`, {
          method: 'POST',
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ recipe_id: recipeId, category_id: categoryId })
        })
        if (!res.ok) throw new Error(await res.text())
      } else {
        const res = await fetch(`${supabaseUrl}/rest/v1/recipe_categories?recipe_id=eq.${recipeId}&category_id=eq.${categoryId}`, {
          method: 'DELETE',
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${session.access_token}` }
        })
        if (!res.ok) throw new Error(await res.text())
      }
    } catch (err) {
      setRecipeCategories(prev => ({ ...prev, [recipeId]: current }))
      console.error('[Data] Toggle recipe category failed:', err.message)
      setSaveError({ message: language === 'en' ? 'Failed to update saved categories' : 'עדכון הקטגוריות השמורות נכשל' })
    }
  }

  const loadRecipeFromSupabase = (filter) => {
    fetch(`${supabaseUrl}/rest/v1/recipes?${filter}&select=*&limit=1`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    })
      .then(res => res.json())
      .then(data => {
        if (!data || data.length === 0) { window.history.replaceState({}, '', window.location.pathname); setViewMode('home'); return; }
        const r = data[0];
        setSelectedRecipe({
          id: r.id,
          title: String(r.name || 'Unnamed'),
          description: r.description || '',
          category: r.category || 'MAIN',
          ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
          instructions: Array.isArray(r.instructions) ? r.instructions : [],
          user_id: r.user_id
        });
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
    } else {
      fetchPublicRecipes();
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
      fetch(`${supabaseUrl}/rest/v1/users?username=eq.${profileId}&select=id,username,display_name,bio,avatar_url`, {
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

  // Check carousel scroll state when recipes load
  useEffect(() => {
    checkCarouselScroll()
  }, [recipes])

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
      const res = await fetch(
        `${supabaseUrl}/rest/v1/users?id=eq.${userId}&select=id,username,display_name,bio,avatar_url`,
        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
      )
      const data = await res.json()
      if (!data?.[0]) return
      setViewingProfile(data[0])
      setSelectedRecipe(null)
      setViewMode('profile')
      window.history.pushState({}, '', `/?user=${data[0].username}`)
    } catch (err) {
      console.error('[Nav] Failed to load profile:', err.message)
      setSaveError({ message: language === 'en' ? 'Failed to load profile' : 'טעינת הפרופיל נכשלה' })
    }
  }

  // Wheel → horizontal scroll, active only while hovering the carousel section
  useEffect(() => {
    if (!hoveringCarousel) return

    let target = null
    let rafId = null

    const animate = () => {
      const el = likedRecipesCarouselRef.current
      if (!el) { rafId = null; return }
      const diff = target - el.scrollLeft
      if (Math.abs(diff) < 1) { el.scrollLeft = target; rafId = null; return }
      el.scrollLeft += diff * 0.15
      rafId = requestAnimationFrame(animate)
    }

    const onWheel = (e) => {
      const el = likedRecipesCarouselRef.current
      if (!el) return
      e.preventDefault()
      if (target === null) target = el.scrollLeft
      const isRtl = getComputedStyle(el).direction === 'rtl'
      const step = Math.sign(e.deltaY) * 120 * (isRtl ? -1 : 1)
      const maxScroll = el.scrollWidth - el.clientWidth
      target = isRtl
        ? Math.min(0, Math.max(-maxScroll, target + step))
        : Math.max(0, Math.min(maxScroll, target + step))
      if (!rafId) rafId = requestAnimationFrame(animate)
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('wheel', onWheel)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [hoveringCarousel])

  // Global search — debounced, queries users + public recipes
  useEffect(() => {
    if (!globalQuery.trim()) { setGlobalResults({ users: [], recipes: [] }); return }
    const timer = setTimeout(async () => {
      const q = encodeURIComponent(`*${globalQuery.trim()}*`)
      const headers = { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
      const [usersRes, recipesRes] = await Promise.all([
        fetch(`${supabaseUrl}/rest/v1/users?or=(username.ilike.${q},display_name.ilike.${q})&select=id,username,display_name,avatar_url&limit=4`, { headers }),
        fetch(`${supabaseUrl}/rest/v1/recipes?name=ilike.${q}&visibility=eq.public&select=id,name,category,user_id&limit=4`, { headers })
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
        recipes: recipes.map(r => ({ ...r, authorUsername: usernameMap[r.user_id] || null }))
      })
      setShowGlobalResults(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [globalQuery])

  // Close search results on outside click
  useEffect(() => {
    const handler = (e) => { if (globalSearchRef.current && !globalSearchRef.current.contains(e.target)) setShowGlobalResults(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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
      category: recipeObj.category || 'MAIN',
      ingredients: formatArray(recipeObj.ingredients),
      instructions: formatArray(recipeObj.instructions),
      user_id: recipeObj.user_id || recipeObj.authorId,
      authorId: recipeObj.authorId || recipeObj.user_id,
      authorUsername: recipeObj.authorUsername || null
    };

    setSelectedRecipe(recipeData);
    setViewMode('detail');
    window.history.pushState({}, '', `?r=${recipeObj.id}`);
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

    // close the form right away — the save runs in the background and
    // failures surface in the retry banner
    const editing = editingRecipe;
    setShowRecipeForm(false);
    setEditingRecipe(null);
    performSave(newRecipe, editing);
  }

  const performSave = async (newRecipe, editing) => {
    setSaveError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');
      const userToken = session.access_token;

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
              category: newRecipe.category || '',
              description: newRecipe.description,
              ingredients: newRecipe.ingredients,
              instructions: newRecipe.instructions,
            })
          }
        );
        if (!res.ok) throw new Error(`Update failed: ${res.status} ${await res.text()}`);
        await manageRecipeCategory(editing.id, newRecipe.category, userToken)
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
              category: newRecipe.category || '',
              description: newRecipe.description,
              ingredients: newRecipe.ingredients,
              instructions: newRecipe.instructions,
              visibility: localStorage.getItem('defaultRecipeVisibility') || 'public'
            })
          }
        );
        if (!res.ok) throw new Error(`Insert failed: ${res.status} ${await res.text()}`);
        const [saved] = await res.json()
        if (saved?.id) await manageRecipeCategory(saved.id, newRecipe.category, userToken)
      }

      fetchRecipes();
    } catch (err) {
      console.error('[Data] Error saving recipe:', err);
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
    setViewMode(user ? 'profile' : 'home')
    window.history.pushState({}, '', window.location.pathname)
  }

  const scrollCarousel = (direction) => {
    if (likedRecipesCarouselRef.current) {
      const container = likedRecipesCarouselRef.current;
      const scrollAmount = 400; // Scroll by this many pixels
      container.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
      
      // Check scroll state after a delay to update arrow visibility
      setTimeout(checkCarouselScroll, 300);
    }
  }

  const checkCarouselScroll = () => {
    if (likedRecipesCarouselRef.current) {
      const container = likedRecipesCarouselRef.current;
      setCanScrollLeft(container.scrollLeft > 0);
      setCanScrollRight(container.scrollLeft < container.scrollWidth - container.clientWidth - 10);
    }
  }

  // 4. DELETE RECIPE
  const handleDeleteRecipe = async (recipe) => {
    const confirmed = await new Promise(resolve => {
      setConfirmDialog({
        title: language === 'en' ? `Delete "${recipe.title}"?` : `למחוק את "${recipe.title}"?`,
        message: language === 'en' ? 'This cannot be undone.' : 'לא ניתן לבטל פעולה זו.',
        confirmLabel: language === 'en' ? 'Delete' : 'מחק',
        onConfirm: () => { setConfirmDialog(null); resolve(true); },
        onCancel: () => { setConfirmDialog(null); resolve(false); },
      });
    });
    if (!confirmed) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');
      const userToken = session.access_token;

      const res = await fetch(
        `${supabaseUrl}/rest/v1/recipes?id=eq.${recipe.id}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${userToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);

      fetchRecipes();
      setViewMode('profile');
    } catch (error) {
      console.error('[Data] Error deleting recipe:', error);
      setSaveError({ message: language === 'en' ? 'Failed to delete recipe' : 'מחיקת המתכון נכשלה' });
    }
  }

  // 5. SCRAPE RECIPE FROM URL
  const handleScrapeFromUrl = async () => {
    if (!urlInput.trim()) {
      alert('Please enter a URL');
      return;
    }

    setIsScrapingLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const res = await fetch(`${API_BASE}/recipes/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'Authorization': `Bearer ${session.access_token}` },
        body: urlInput
      });

      if (res.ok) {
        const scrapedRecipe = await res.json();
        // Convert recipe data to format expected by RecipeForm
        setEditingRecipe({
          title: scrapedRecipe.name,
          category: scrapedRecipe.category,
          description: scrapedRecipe.description,
          ingredients: scrapedRecipe.ingredients || [],
          instructions: scrapedRecipe.instructions || [],
        });
        setShowRecipeForm(true);
        setShowUrlModal(false);
        setUrlInput('');
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

  return (
    <>
      {loading ? (
        <div className="min-h-screen flex items-center justify-center bg-[#f5f3ef]">
          <div className="flex flex-col items-center gap-3 animate-pulse">
            <div className="w-10 h-10 rounded-full bg-[#e8e4dc]" />
            <div className="h-3 w-24 rounded bg-[#e8e4dc]" />
          </div>
        </div>
      ) : (
    <div className="min-h-screen bg-[#f5f3ef]">
      <header className="sticky top-0 z-30 bg-[#faf9f7]/95 backdrop-blur-md border-b border-[#e8e4dc]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
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
                    className="flex items-center gap-2 text-[#64748b] hover:text-[#1e293b] transition-colors p-2">
                    <Plus className="w-5 h-5"/>
                  </button>
                  <button onClick={() => handleNavigate('profile')}
                    className="flex items-center gap-2 text-[#64748b] hover:text-[#1e293b] transition-colors p-2">
                    <UserIcon className="w-5 h-5"/>
                  </button>
                  <button onClick={handleLogout}
                    className="flex items-center gap-1.5 px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-xs sm:text-sm whitespace-nowrap">
                    <LogOut className="w-4 h-4" />
                    <span className="hidden sm:inline">Logout</span>
                  </button>
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
        {/* Offline notice — shown above whatever content we have cached */}
        {isOffline && (
          <div className="mb-8 text-center py-10 bg-gradient-to-br from-[#faf9f7] to-[#f5f3ef] rounded-3xl border-2 border-dashed border-[#e8e4dc]">
            <svg viewBox="0 0 200 140" className="w-44 h-auto mx-auto mb-3" fill="none" aria-hidden="true">
              <path d="M60 50 a55 55 0 0 1 80 0" stroke="#e8e4dc" strokeWidth="8" strokeLinecap="round" />
              <path d="M75 65 a35 35 0 0 1 50 0" stroke="#e8e4dc" strokeWidth="8" strokeLinecap="round" />
              <circle cx="100" cy="82" r="6" fill="#e67e22" />
              <line x1="55" y1="30" x2="145" y2="95" stroke="#e67e22" strokeWidth="8" strokeLinecap="round" />
              <ellipse cx="100" cy="115" rx="45" ry="12" fill="#3d3429" />
              <rect x="143" y="111" width="36" height="8" rx="4" fill="#3d3429" />
            </svg>
            <p className="text-[#3d3429] font-semibold">{language === 'en' ? "No internet — the kitchen's offline" : 'אין אינטרנט — המטבח לא מחובר'}</p>
            <p className="text-[#7a7265] text-sm mt-1">{language === 'en' ? "We'll reload everything when you're back" : 'הכל ייטען מחדש כשהחיבור יחזור'}</p>
          </div>
        )}

        {viewMode === 'home' && (
          <div style={{ direction: language === 'he' ? 'rtl' : 'ltr' }} >

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
                              ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center"><UserIcon className="w-4 h-4 text-[#e67e22]" /></div>}
                          </div>
                          <div className="text-start">
                            <p className="text-sm text-[#3d3429] font-medium">{u.display_name || u.username}</p>
                            <p className="text-xs text-[#7a7265]">@{u.username}</p>
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
              <div className="mb-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-1 h-8 bg-[#e67e22] rounded-full"></div>
                  <h2 className="text-3xl font-bold text-[#3d3429]">
                    {language === 'en' ? 'Most Liked' : 'האהובים ביותר'}
                  </h2>
                </div>
                <p className="text-[#7a7265] text-sm ml-4">
                  {language === 'en' ? 'Top public recipes' : 'המתכונים הציבוריים המובילים'}
                </p>
              </div>
              {carouselLoading ? (
                <div className="flex gap-4 sm:gap-6 py-2 pb-3 overflow-hidden">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex-shrink-0 w-80 sm:w-96">
                      <RecipeCardSkeleton />
                    </div>
                  ))}
                </div>
              ) : topLikedRecipes.length > 0 ? (
                <div className="relative w-full">
                  <div
                    ref={likedRecipesCarouselRef}
                    onScroll={checkCarouselScroll}
                    className="carousel-scroll flex gap-4 sm:gap-6 overflow-x-auto py-2 pb-3"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                  >
                    {topLikedRecipes.map((recipe) => (
                      <div key={recipe.id} className="flex-shrink-0 w-80 sm:w-96">
                        <RecipeCard
                          recipe={recipe}
                          language={language}
                          onSelect={handleSelectRecipe}
                          likeCount={recipe.likeCount}
                          authorUsername={recipe.authorUsername}
                          authorId={recipe.authorId}
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
            <section>
              <div className="mb-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-1 h-8 bg-[#e67e22] rounded-full"></div>
                  <h2 className="text-3xl font-bold text-[#3d3429]">{language === 'en' ? 'Your Most Prepped' : 'המתכונים המוכנים ביותר'}</h2>
                </div>
                <p className="text-[#7a7265] text-sm ml-4">{language === 'en' ? 'Track your cooking habits' : 'עקוב אחרי הרגלי הבישול שלך'}</p>
              </div>
              {(() => {
                // skeleton only before first load — background refetches keep showing current data
                if (ownRecipesLoading && recipes.length === 0) return <div className="animate-pulse bg-[#e8e4dc]/60 rounded-3xl" style={{ height: '276px' }} />;

                const mostPrepped = [...recipes]
                  .filter(r => cookCounts[r.id] > 0)
                  .sort((a, b) => (cookCounts[b.id] || 0) - (cookCounts[a.id] || 0))
                  .slice(0, 3);

                if (mostPrepped.length === 0) return (
                  <div className="text-center py-16 bg-gradient-to-br from-[#faf9f7] to-[#f5f3ef] rounded-3xl border-2 border-dashed border-[#e8e4dc]">
                    <BookOpen className="w-12 h-12 text-[#e67e22]/30 mx-auto mb-4" />
                    <p className="text-[#7a7265] font-medium">{language === 'en' ? 'No recipes cooked yet' : 'עדיין לא בישלת מתכונים'}</p>
                  </div>
                );

                const podiumOrder = mostPrepped.length === 1
                  ? [null, mostPrepped[0], null]
                  : mostPrepped.length === 2
                  ? [mostPrepped[1], mostPrepped[0], null]
                  : [mostPrepped[1], mostPrepped[0], mostPrepped[2]];

                const medals = ['🥇', '🥈', '🥉'];
                const podiumHeights = ['h-24', 'h-36', 'h-16'];
                const podiumColors = ['bg-[#C0C0C0]', 'bg-[#D4AF37]', 'bg-[#CD7F32]'];
                const podiumPositions = [1, 0, 2];

                return (
                  <div>
                  <div className="flex items-end justify-center gap-2 pt-8">
                    {podiumOrder.map((recipe, slot) => {
                      const rank = podiumPositions[slot];
                      return (
                        <div key={slot} className="flex flex-col items-center flex-1 min-w-0 max-w-[200px]">
                          {recipe ? (
                            <>
                              <span className="text-2xl mb-1">{medals[rank]}</span>
                              <button
                                onClick={() => handleSelectRecipe(recipe)}
                                className="w-full mb-2 px-3 py-2 bg-white rounded-2xl border border-[#e8e4dc] hover:border-[#e67e22]/50 hover:shadow-sm transition-all text-center"
                              >
                                <p className="text-sm font-semibold text-[#3d3429] truncate">{recipe.title}</p>
                                <p className="text-xs text-[#7a7265] mt-0.5">{language === 'en' ? `made ${cookCounts[recipe.id]} times` : cookCounts[recipe.id] === 1 ? 'הוכן פעם אחת' : cookCounts[recipe.id] === 2 ? 'הוכן פעמיים' : `הוכן ${cookCounts[recipe.id]} פעמים`}</p>
                              </button>
                              <div className={`w-full rounded-t-xl ${podiumHeights[slot]} ${podiumColors[slot]} flex items-start justify-center pt-2`}>
                                <span className="text-white font-bold text-lg">{rank + 1}</span>
                              </div>
                            </>
                          ) : (
                            <div className={`w-full ${podiumHeights[slot]} ${podiumColors[slot]} opacity-20 rounded-t-xl`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ height: '2px', backgroundColor: '#e8e4dc', width: '100%', display: 'block', flexShrink: 0 }} />
                  </div>
                );
              })()}
            </section>
            ) : (
            <section>
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
            onHandleChange={setUserHandle}
            onError={(message) => setSaveError({ message })}
          />
        )}

        {viewMode === 'detail' && !selectedRecipe && (
          <div className="max-w-3xl mx-auto animate-pulse" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
            {/* Header row: back button + action buttons (matches h of py-2 buttons) */}
            <div className="flex items-center justify-between mb-6 gap-2">
              <div className="h-9 w-20 rounded-xl bg-[#e8e4dc]/60" />
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 sm:w-20 rounded-xl bg-[#e8e4dc]/60" />
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
            <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-lg" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-[#3d3429]">
                  {language === 'en' ? 'Import Recipe from URL' : 'ייבא מתכון מ-URL'}
                </h2>
                <button onClick={() => setShowUrlModal(false)} className="text-[#7a7265] hover:text-[#3d3429] transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#3d3429] mb-2">
                    {language === 'en' ? 'Recipe URL' : 'לינק למתכון'}
                  </label>
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder='https://example.com/recipe'
                    className="w-full px-4 py-3 bg-[#faf9f7] text-left border border-[#e8e4dc] rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#cf711f]/20 focus:border-[#cf711f] transition-all"
                  />
                  <p className={`text-xs text-[#7a7265] mt-2 ${isRtl ? 'text-right' : 'text-left'}`}>
                    {language === 'en' 
                      ? 'Paste the URL of a recipe webpage. AI will extract the recipe details automatically.'
                      : 'הדבק את כתובת ה-URL של דף המתכון. בינה מלאכותית תחלץ את פרטי המתכון באופן אוטומטי.'}
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
                      <span>{language === 'en' ? 'Import' : 'ייבא'}</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Footer - Credits and Language */}
      <footer className="border-t border-[#e8e4dc] bg-[#faf9f7] mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col items-center justify-center text-center">
            <p className="text-sm text-[#7a7265]">© 2026 Yuval's Recipe Book.</p>
            <button
              onClick={() => { const next = language === 'en' ? 'he' : 'en'; localStorage.setItem('language', next); setLanguage(next); }}
              className="text-sm text-[#7a7265] hover:text-[#cf711f] transition-colors"
            >
              Language: <span className="cursor-pointer underline text-[#3d3429]">{language === 'en' ? 'en' : 'he'}</span>
            </button>
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
          onConfirm={confirmDialog.onConfirm}
          onCancel={confirmDialog.onCancel}
        />
      )}

      {/* Error banner — failed saves get retry/edit buttons, plain errors just the message */}
      {saveError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-3 bg-white border border-red-200 shadow-lg rounded-2xl px-4 py-3 max-w-[calc(100vw-2rem)]">
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

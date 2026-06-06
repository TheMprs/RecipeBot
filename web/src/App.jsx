import { useState, useEffect, useRef } from 'react'
import { BookOpen, Plus, Search, Filter, X, Link as LinkIcon, User as UserIcon, ChevronLeft, ChevronRight, LogOut } from 'lucide-react'
import { RecipeCard } from './components/RecipeCard'
import { RecipeDetail } from './components/RecipeDetail'
import { RecipeForm } from './components/RecipeForm'
import { UserProfile } from './components/UserProfile'
import Login from './components/Login'
import { supabase } from './supabaseClient'
import './global.css'

const categories = ['All', 'MAIN', 'SNACK', 'SPECIAL', 'DESSERT']

const categoryTranslations = {
  'MAIN': 'עיקרית',
  'DESSERT': 'קינוח',
  'SNACK': 'חטיף',
  'SPECIAL': 'מיוחד'
}

// API configuration: uses environment variable in production, /api proxy in dev
const API_BASE = import.meta.env.VITE_API_URL || '/api'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recipes, setRecipes] = useState([])
  const [likedRecipeIds, setLikedRecipeIds] = useState([])
  const [publicRecipes, setPublicRecipes] = useState([])
  const [language, setLanguage] = useState('he')
  const [viewMode, setViewMode] = useState('home')
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const [editingRecipe, setEditingRecipe] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false)
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
  const [globalQuery, setGlobalQuery] = useState('')
  const [globalResults, setGlobalResults] = useState({ users: [], recipes: [] })
  const [showGlobalResults, setShowGlobalResults] = useState(false)
  const globalSearchRef = useRef(null)

  const isRtl = language === 'he'

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
        setUser(session?.user || null)
        setLoading(false)
        clearTimeout(timeoutId)
        
        // Create profile for new users (OAuth sign-in)
        if (event === 'SIGNED_IN' && session?.user) {
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
                  id: user.id, email: user.email, username: user.id,
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

  const handleLogout = async () => {
    try {
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Logout timeout')), 3000)
      )
      
      await Promise.race([supabase.auth.signOut(), timeoutPromise])
      setUser(null)
    } catch (error) {
      console.error('[Auth] Logout failed:', error.message)
      setUser(null)
    }
  }

  // 1. FETCH ALL RECIPES WITH FULL DETAILS (no N+1 queries)
  const fetchRecipes = async () => {
    try {
      if (user) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) { setRecipes([]); return; }
        const response = await fetch(
          `${supabaseUrl}/rest/v1/recipes?user_id=eq.${user.id}&select=*`,
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
          category: recipe.category,
          description: recipe.description,
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
          created_at: recipe.created_at
        }));

        setRecipes(formattedRecipes);
      } else {
        setRecipes([]);
      }
    } catch (error) {
      console.error('[Data] Failed to fetch recipes:', error.message);
      setRecipes([]);
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
      alert('Failed to log cook: ' + err.message);
    }
  };

  const loadRecipeFromSupabase = (filter) => {
    fetch(`${supabaseUrl}/rest/v1/recipes?${filter}&select=*&limit=1`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    })
      .then(res => res.json())
      .then(data => {
        if (!data || data.length === 0) { window.history.replaceState({}, '', window.location.pathname); return; }
        const r = data[0];
        setSelectedRecipe({
          id: r.id,
          title: String(r.name || 'Unnamed'),
          description: r.description || '',
          category: r.category || 'MAIN',
          ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
          instructions: Array.isArray(r.instructions) ? r.instructions : []
        });
        setViewMode('detail');
        window.history.pushState({}, '', `?r=${r.id}`);
      })
      .catch(() => window.history.replaceState({}, '', window.location.pathname));
  };

  useEffect(() => {
    if (user) {
      fetchRecipes();
      fetchCookCounts();
    } else {
      fetchPublicRecipes();
    }
    
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
            if (res.ok) alert('Telegram account linked successfully!')
            else res.text().then(t => alert('Linking failed: ' + t))
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
            if (res.ok) alert('Telegram account linked successfully!')
            else res.text().then(t => alert('Linking failed: ' + t))
          })
        })
      }
    }
    
    // Handle profile viewing (either own or others') - check this FIRST
    if (profileId) {
      // If viewing own profile, just show profile view without viewingProfile set
      if (user && profileId === user.id) {
        setViewMode('profile')
        setViewingProfile(null)
        return
      }
      
      // Otherwise fetch the other user's profile
      fetch(`${supabaseUrl}/rest/v1/users?id=eq.${profileId}&select=id,username,display_name,bio,avatar_url`, {
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
          setViewingProfile(profile);
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
  }, [user])

  // Check carousel scroll state when recipes load
  useEffect(() => {
    checkCarouselScroll()
  }, [recipes])

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
      instructions: formatArray(recipeObj.instructions)
    };

    setSelectedRecipe(recipeData);
    setViewMode('detail');
    window.history.pushState({}, '', `?r=${recipeObj.id}`);
  }

  // 3. SAVE A NEW RECIPE
  const handleAddRecipe = async (newRecipe) => {
    if (!user) {
      alert('Please log in first');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');
      const userToken = session.access_token;

      if (editingRecipe) {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/recipes?id=eq.${editingRecipe.id}`,
          {
            method: 'PATCH',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${userToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: newRecipe.title,
              category: newRecipe.category,
              description: newRecipe.description,
              ingredients: newRecipe.ingredients,
              instructions: newRecipe.instructions,
            })
          }
        );
        if (!res.ok) throw new Error(`Update failed: ${res.status} ${await res.text()}`);
      } else {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/recipes`,
          {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${userToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              user_id: user.id,
              name: newRecipe.title,
              category: newRecipe.category,
              description: newRecipe.description,
              ingredients: newRecipe.ingredients,
              instructions: newRecipe.instructions,
              visibility: 'public'
            })
          }
        );
        if (!res.ok) throw new Error(`Insert failed: ${res.status} ${await res.text()}`);
      }

      fetchRecipes();
      setViewMode('profile');
      setEditingRecipe(null);
    } catch (err) {
      console.error('[Data] Error saving recipe:', err);
      alert('Error: ' + err.message);
    }
  }

  // 3b. EDIT RECIPE
  const handleEditRecipe = (recipe) => {
    setEditingRecipe(recipe);
    setViewMode('add');
  }

  const handleNavigate = (mode) => {
    setSelectedRecipe(null)
    setEditingRecipe(null)
    setViewingProfile(null)
    setViewMode(mode)
    
    // Set URL based on view mode
    if (mode === 'profile' && user) {
      // Use user ID in URL so it can be shared
      window.history.pushState({}, '', `/?user=${user.id}`)
    } else {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }

  const handleBack = () => {
    setSelectedRecipe(null)
    setEditingRecipe(null)
    setViewMode('profile')
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
    if (!window.confirm(`Delete ${recipe.title}?`)) return;
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
      alert('Failed to delete recipe');
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
      const res = await fetch(`${API_BASE}/recipes/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
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
        setViewMode('add');
        setShowUrlModal(false);
        setUrlInput('');
      } else {
        alert('Failed to scrape recipe. Please make sure the URL points to a valid recipe page.');
      }
    } catch (error) {
      console.error('Error scraping URL:', error);
      alert('Error: ' + error.message);
    } finally {
      setIsScrapingLoading(false);
    }
  }

  // Bridge: Map recipe data to display format
  const displayRecipes = recipes.map(recipe => {
    const formatArray = (text) => {
      if (Array.isArray(text)) return text; // Backend now returns arrays
      if (typeof text === 'string') return text.split('\n').filter(i => i.trim());
      return [];
    };
    
    const title = String(recipe.name || recipe.title || 'Unnamed').trim();
    
    return {
      id: recipe.id,
      title: title,
      description: recipe.description || '',
      category: recipe.category || 'MAIN',
      ingredients: formatArray(recipe.ingredients) || [],
      instructions: formatArray(recipe.instructions) || []
    };
  }).filter(recipe => {
    // Safely handle recipe.title in case it's not a string
    const titleStr = String(recipe.title || '').toLowerCase();
    return titleStr.includes(searchQuery.toLowerCase()) &&
      (selectedCategory === 'All' || recipe.category === selectedCategory);
  });

  return (
    <>
      {loading ? (
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-gray-500">Loading...</p>
        </div>
      ) : !user ? (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-40" onClick={() => setShowLoginModal(false)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4" onClick={() => setShowLoginModal(false)}>
            <div onClick={(e) => e.stopPropagation()}>
              <Login onLoginSuccess={() => { setShowLoginModal(false); setViewMode('profile'); }} />
            </div>
          </div>
        </>
      ) : (
    <div className="min-h-screen bg-[#f5f3ef]">
      <header className="sticky top-0 z-30 bg-[#faf9f7]/95 backdrop-blur-md border-b border-[#e8e4dc]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
            <button onClick={() => handleNavigate('home')} className="flex items-center gap-2 group min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-[#ce743e] flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <div className="text-left hidden sm:block">
                <h1 className="text-lg font-semibold text-[#3d3429]">Yuval's Recipe Book</h1>
                <p className="text-xs text-[#7a7265]">זה בתהליך לא לשפוט</p>
              </div>
            </button>
            <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
              <button onClick={() => handleNavigate('add')} 
                className={`flex items-center gap-2 text-[#64748b] hover:text-[#1e293b] transition-colors p-2`}>
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
            </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
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
                      window.history.pushState({}, '', `/?user=${firstUser.id}`)
                    } else if (firstRecipe) {
                      loadRecipeFromSupabase(`id=eq.${firstRecipe.id}`)
                      setShowGlobalResults(false); setGlobalQuery('')
                    }
                  }}
                  placeholder={language === 'en' ? 'Search recipes and people...' : 'חפש מתכונים ואנשים...'}
                  className={`w-full py-3 bg-white border border-[#e8e4dc] rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#b86535]/20 focus:border-[#b86535] transition-all ${isRtl ? `pr-11 ${globalQuery ? 'pl-10' : 'pl-4'} text-right` : `pl-11 ${globalQuery ? 'pr-10' : 'pr-4'}`}`}
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
                          window.history.pushState({}, '', `/?user=${u.id}`)
                        }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#f5f3ef] transition-colors">
                          <div className="w-8 h-8 rounded-full bg-[#ce743e]/10 flex-shrink-0 overflow-hidden">
                            {u.avatar_url
                              ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center"><UserIcon className="w-4 h-4 text-[#ce743e]" /></div>}
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
                          <div className="w-8 h-8 rounded-full bg-[#ce743e]/10 flex items-center justify-center flex-shrink-0">
                            <BookOpen className="w-4 h-4 text-[#ce743e]" />
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

            {/* Liked Recipes Section */}
            <section className="carousel-section" onMouseEnter={() => setHoveringCarousel(true)} onMouseLeave={() => setHoveringCarousel(false)}>
              <div className="mb-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-1 h-8 bg-[#ce743e] rounded-full"></div>
                  <h2 className="text-3xl font-bold text-[#3d3429]">
                    {language === 'en' ? 'My Liked Recipes' : 'המתכונים שאהבתי'}
                  </h2>
                </div>
                <p className="text-[#7a7265] text-sm ml-4">
                  {displayRecipes.length} {language === 'en' ? 'recipes' : 'מתכונים'}
                </p>
              </div>
              {displayRecipes.length > 0 ? (
                <div className="relative w-full">
                  <div className="pointer-events-none absolute left-0 top-0 bottom-3 w-6 z-10 bg-gradient-to-r from-[#f5f3ef]/80 to-transparent" />
                  <div className="pointer-events-none absolute right-0 top-0 bottom-3 w-6 z-10 bg-gradient-to-l from-[#f5f3ef]/80 to-transparent" />
                  {/* Carousel Container */}
                  <div
                    ref={likedRecipesCarouselRef}
                    onScroll={checkCarouselScroll}
                    className="carousel-scroll flex gap-4 sm:gap-6 overflow-x-auto py-2 pb-3"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                  >
                    {displayRecipes.map((recipe) => (
                      <div key={recipe.id} className=" flex-shrink-0 w-80 sm:w-96">
                        <div>
                          <RecipeCard 
                            className="h-full"
                            recipe={recipe} 
                            language={language}
                            onSelect={handleSelectRecipe} 
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 bg-gradient-to-br from-[#faf9f7] to-[#f5f3ef] rounded-3xl border-2 border-dashed border-[#e8e4dc]">
                  <BookOpen className="w-12 h-12 text-[#ce743e]/30 mx-auto mb-4" />
                  <p className="text-[#7a7265] font-medium">{language === 'en' ? 'No saved recipes yet' : 'אין מתכונים שמורים עדיין'}</p>
                </div>
              )}
            </section>

            {/* Most Prepped Section */}
            <section>
              <div className="mb-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-1 h-8 bg-[#ce743e] rounded-full"></div>
                  <h2 className="text-3xl font-bold text-[#3d3429]">{language === 'en' ? 'Your Most Prepped' : 'המתכונים המוכנים ביותר'}</h2>
                </div>
                <p className="text-[#7a7265] text-sm ml-4">{language === 'en' ? 'Track your cooking habits' : 'עקוב אחרי הרגלי הבישול שלך'}</p>
              </div>
              {(() => {
                const mostPrepped = [...recipes]
                  .filter(r => cookCounts[r.id] > 0)
                  .sort((a, b) => (cookCounts[b.id] || 0) - (cookCounts[a.id] || 0))
                  .slice(0, 3);

                if (mostPrepped.length === 0) return (
                  <div className="text-center py-16 bg-gradient-to-br from-[#faf9f7] to-[#f5f3ef] rounded-3xl border-2 border-dashed border-[#e8e4dc]">
                    <BookOpen className="w-12 h-12 text-[#ce743e]/30 mx-auto mb-4" />
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
                const podiumPositions = [1, 0, 2]; // which recipe index each slot holds

                return (
                  <div>
                  <div className="flex items-end justify-center gap-2 pt-8">
                    {podiumOrder.map((recipe, slot) => {
                      const rank = podiumPositions[slot];
                      return (
                        <div key={slot} className="flex flex-col items-center flex-1 max-w-[200px]">
                          {recipe ? (
                            <>
                              <span className="text-2xl mb-1">{medals[rank]}</span>
                              <button
                                onClick={() => handleSelectRecipe(recipe)}
                                className="w-full mb-2 px-3 py-2 bg-white rounded-2xl border border-[#e8e4dc] hover:border-[#ce743e]/50 hover:shadow-sm transition-all text-center"
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
            onLogout={() => setUser(null)}
          />
        )}

        {viewMode === 'detail' && selectedRecipe && (
          <div className="transition-all duration-300 ease-out opacity-100 translate-y-0">
            <RecipeDetail
              recipe={selectedRecipe}
              onBack={handleBack}
              language={language}
              onEdit={handleEditRecipe}
              onDelete={handleDeleteRecipe}
              onMarkMade={handleMarkMade}
              cookCount={cookCounts[selectedRecipe?.id] || 0} />
          </div>
        )}

        {viewMode === 'add' && (
          <div className="transition-all duration-300 ease-out opacity-100 translate-y-0">
            <RecipeForm 
              editingRecipe={editingRecipe} 
              language={language}
              onBack={handleBack} 
              onSave={handleAddRecipe}
              onOpenUrlModal={() => setShowUrlModal(true)}
            />
          </div>
        )}

      </main>

      {/* URL Import Modal - Rendered at App level for full-screen overlay */}
      {showUrlModal && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowUrlModal(false)}></div>
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4" onClick={() => setShowUrlModal(false)}>
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
                    className="w-full px-4 py-3 bg-[#faf9f7] text-left border border-[#e8e4dc] rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#b86535]/20 focus:border-[#b86535] transition-all"
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
                    className="flex-1 px-4 py-3 bg-[#b86535] text-white rounded-xl hover:bg-[#a5582d] disabled:bg-[#b86535]/50 transition-colors font-medium flex items-center justify-center gap-2"
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
              onClick={() => setLanguage(language === 'en' ? 'he' : 'en')}
              className="text-sm text-[#7a7265] hover:text-[#b86535] transition-colors"
            >
              Language: <span className="cursor-pointer underline text-[#3d3429]">{language === 'en' ? 'en' : 'he'}</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
      )}
    </>
  )
}

export default App

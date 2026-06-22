import { User, BookOpen, Search, Filter, X, Settings, Plus, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { RecipeCard, RecipeCardSkeleton } from './RecipeCard';
import { ConfirmDialog } from './ConfirmDialog';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { swr } from '../utils/cache';

export function UserProfile({
  user,
  recipes,
  language,
  onSelectRecipe,
  viewingProfile,
  cookCounts = {},
  apiBase = '/api',
  onLogout,
  userCategories = [],
  categoriesLoading = false,
  ownRecipesLoading = false,
  recipeCategories = {},
  onCreateCategory,
  onDeleteCategory,
  onToggleRecipeCategory,
  onRenameCategory,
  onHandleChange,
  onError,
}) {
  const isRtl = language === 'he';
  const [viewingRecipes, setViewingRecipes] = useState([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [ownProfile, setOwnProfile] = useState(() => {
    if (!user?.id) return null;
    try {
      const cached = localStorage.getItem(`profile_${user.id}`);
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editHandle, setEditHandle] = useState('');
  const [editBio, setEditBio] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Determine which profile we're viewing
  const isOwnProfile = !viewingProfile || (user && viewingProfile?.id === user?.id);
  const currentProfile = viewingProfile || user;
  const displayRecipes = viewingProfile ? viewingRecipes : recipes;
  const profileData = viewingProfile || ownProfile;

  const displayName = profileData?.display_name || profileData?.username || currentProfile?.user_metadata?.full_name || 'User';
  const handle = profileData?.username;
  // For own profile: avatar is in the session JWT immediately — no wait needed
  const rawAvatarUrl = viewingProfile
    ? profileData?.avatar_url
    : (ownProfile?.avatar_url || user?.user_metadata?.avatar_url);
  // s288 covers retina for our 128px display, -no removes Google's overlay
  const avatarUrl = rawAvatarUrl?.replace(/=s\d+.*$/, '=s288-c-no');
  const avatarUrlLarge = rawAvatarUrl?.replace(/=s\d+.*$/, '=s800-c-no');
  const [showAvatarFull, setShowAvatarFull] = useState(false);

  // Lock page scroll while the avatar lightbox is open
  useEffect(() => {
    if (!showAvatarFull) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [showAvatarFull]);

  const [likeCounts, setLikeCounts] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryName, setSelectedCategoryName] = useState(null);
  const [sortBy, setSortBy] = useState('most-prepped');
  const [sortOrder, setSortOrder] = useState('desc');
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showRecipeSettings, setShowRecipeSettings] = useState(false);
  const [defaultVisibility, setDefaultVisibility] = useState(() => localStorage.getItem('defaultRecipeVisibility') || 'public');
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const newCategoryInputRef = useRef(null);
  const filterMenuRef = useRef(null);
  const categoryScrollRef = useRef(null);
  const [hoveringCategoryPills, setHoveringCategoryPills] = useState(false);

  useEffect(() => {
    if (!hoveringCategoryPills) return;

    let target = null;
    let rafId = null;

    const animate = () => {
      const el = categoryScrollRef.current;
      if (!el) { rafId = null; return; }
      const diff = target - el.scrollLeft;
      if (Math.abs(diff) < 1) { el.scrollLeft = target; rafId = null; return; }
      el.scrollLeft += diff * 0.15;
      rafId = requestAnimationFrame(animate);
    };

    const onWheel = (e) => {
      const el = categoryScrollRef.current;
      if (!el) return;
      e.preventDefault();
      if (target === null) target = el.scrollLeft;
      const rtl = getComputedStyle(el).direction === 'rtl';
      const step = Math.sign(e.deltaY) * 120 * (rtl ? -1 : 1);
      const maxScroll = el.scrollWidth - el.clientWidth;
      target = rtl
        ? Math.min(0, Math.max(-maxScroll, target + step))
        : Math.max(0, Math.min(maxScroll, target + step));
      if (!rafId) rafId = requestAnimationFrame(animate);
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', onWheel);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [hoveringCategoryPills]);

  useEffect(() => {
    const handler = (e) => { if (filterMenuRef.current && !filterMenuRef.current.contains(e.target)) setIsFilterMenuOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  
  const fetchLikeCounts = async (ids) => {
    if (!ids.length) return;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/recipe_likes?recipe_id=in.(${ids.join(',')})&select=recipe_id`,
        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
      );
      if (!res.ok) return;
      const data = await res.json();
      const counts = {};
      for (const row of data) counts[row.recipe_id] = (counts[row.recipe_id] || 0) + 1;
      setLikeCounts(counts);
    } catch {}
  };

  // Fetch viewing profile's public recipes
  useEffect(() => {
    if (viewingProfile) {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      setRecipesLoading(true);
      // ttl 10min: revisiting a profile reuses the cached list (and its count)
      // instantly, no refetch.
      swr(`profile-recipes:${viewingProfile.id}`, async () => {
        const res = await fetch(`${supabaseUrl}/rest/v1/recipes?user_id=eq.${viewingProfile.id}&visibility=eq.public&select=*,recipe_likes(recipe_id)`, {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          }
        });
        const data = await res.json();
        return (data || []).map(recipe => ({
          id: recipe.id,
          title: recipe.name,
          category: recipe.category,
          description: recipe.description,
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
          created_at: recipe.created_at,
          likeCount: recipe.recipe_likes?.length || 0
        }));
      }, (formatted) => {
        setViewingRecipes(formatted);
        setRecipesLoading(false);
        const counts = {};
        formatted.forEach(r => { counts[r.id] = r.likeCount; });
        setLikeCounts(counts);
      }, 10 * 60 * 1000)
        .catch(err => console.error('[Data] Failed to fetch viewing profile recipes:', err.message))
        .finally(() => setRecipesLoading(false));
    }
  }, [viewingProfile]);

  // Populate like counts for own recipes from embedded data
  useEffect(() => {
    if (!viewingProfile && recipes.length > 0) {
      const counts = {};
      recipes.forEach(r => { counts[r.id] = r.likeCount || 0; });
      setLikeCounts(counts);
    }
  }, [recipes, viewingProfile]);

  useEffect(() => {
    if (!viewingProfile && user) {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      fetch(`${supabaseUrl}/rest/v1/users?id=eq.${user.id}&select=username,display_name,bio,avatar_url`, {
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data?.[0]) {
            setOwnProfile(data[0]);
            localStorage.setItem(`profile_${user.id}`, JSON.stringify(data[0]));
          }
        })
        .catch(() => {});
    }
  }, [user, viewingProfile]);

  const handleSetDefaultVisibility = (v) => {
    setDefaultVisibility(v);
    localStorage.setItem('defaultRecipeVisibility', v);
  };

  const closeSettings = () => { setShowSettings(false); setShowEditProfile(false); setShowRecipeSettings(false); };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${user.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ display_name: editDisplayName.trim(), username: editHandle.trim(), bio: editBio.trim() })
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const updated = { ...ownProfile, display_name: editDisplayName.trim(), username: editHandle.trim(), bio: editBio.trim() };
      setOwnProfile(updated);
      localStorage.setItem(`profile_${user.id}`, JSON.stringify(updated));
      if (onHandleChange) onHandleChange(editHandle.trim());
      setShowEditProfile(false);
    } catch (err) {
      if (onError) onError(language === 'en' ? 'Failed to save profile' : 'שמירת הפרופיל נכשלה');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = await new Promise(resolve => {
      setConfirmDialog({
        title: language === 'en' ? 'Delete account?' : 'מחיקת חשבון?',
        message: language === 'en'
          ? 'This will permanently delete your account and all your recipes. This cannot be undone.'
          : 'פעולה זו תמחק לצמיתות את חשבונך וכל המתכונים שלך. לא ניתן לבטל.',
        confirmLabel: language === 'en' ? 'Delete account' : 'מחק חשבון',
        onConfirm: () => { setConfirmDialog(null); resolve(true); },
        onCancel: () => { setConfirmDialog(null); resolve(false); },
      });
    });
    if (!confirmed) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');
      const res = await fetch(`${apiBase}/account`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (!res.ok) throw new Error(await res.text());
      await supabase.auth.signOut();
      if (onLogout) onLogout();
    } catch (err) {
      if (onError) onError(language === 'en' ? 'Failed to delete account' : 'מחיקת החשבון נכשלה');
    }
  };

  const filteredRecipes = displayRecipes
    .filter(recipe => {
      const matchesSearch = recipe.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           recipe.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = !selectedCategoryName || (
        recipeCategories[recipe.id]?.some(catId =>
          userCategories.find(c => c.id === catId)?.name === selectedCategoryName
        ) || recipe.category === selectedCategoryName
      );
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'alphabetical') cmp = a.title.localeCompare(b.title);
      else if (sortBy === 'most-prepped') cmp = (cookCounts[b.id] || 0) - (cookCounts[a.id] || 0);
      else cmp = new Date(b.created_at) - new Date(a.created_at);
      return sortOrder === 'asc' ? -cmp : cmp;
    });
  
  return (
    <div>
      {/* Profile Header */}
      <div className="bg-white rounded-2xl border border-[#e8e4dc] p-4 sm:p-6 mb-8 relative">
        {!viewingProfile && (
          <button
            onClick={() => setShowSettings(true)}
            className={`absolute top-4 ${isRtl ? 'left-4' : 'right-4'} p-2 text-[#7a7265] hover:text-[#3d3429] hover:bg-[#f5f3ef] rounded-xl transition-colors`}
          >
            <Settings className="w-5 h-5" />
          </button>
        )}
        <div className="flex flex-row items-center sm:items-start gap-4 sm:gap-6" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
          {/* Avatar */}
          <div className="flex-shrink-0">
            <button
              type="button"
              onClick={() => avatarUrl && setShowAvatarFull(true)}
              className={`block w-28 sm:w-36 h-28 sm:h-36 rounded-full border-4 border-[#e67e22]/20 overflow-hidden bg-[#e67e22]/10 flex items-center justify-center ${avatarUrl ? 'cursor-pointer' : 'cursor-default'}`}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                />
              ) : null}
              <div className={`w-full h-full items-center justify-center ${avatarUrl ? 'hidden' : 'flex'}`}>
                <User className="w-12 sm:w-16 h-12 sm:h-16 text-[#e67e22]" />
              </div>
            </button>
          </div>

          {/* Profile Info */}
          <div className="flex-1 pt-0 sm:pt-4">
            <div className="flex flex-col items-start sm:flex-row sm:items-baseline sm:gap-2 mb-4 sm:mb-6" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
              <h1 className="text-2xl sm:text-3xl font-bold text-[#3d3429] mb-1 sm:mb-0 break-all whitespace-normal text-start">{displayName}</h1>
              {handle && <p className="text-sm text-[#7a7265]"><span dir="ltr">@{handle}</span></p>}
            </div>

            {/* Stats */}
            <div className="flex justify-start gap-4 sm:gap-8 mt-4 sm:mt-6">
              <div className="text-center">
                <div className="text-lg sm:text-2xl font-bold text-[#e67e22]">{displayRecipes.length}</div>
                <div className="text-xs text-[#7a7265] uppercase tracking-wide">
                  {language === 'en' ? 'Recipes' : 'מתכונים'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-lg sm:text-2xl font-bold text-[#e67e22]">0</div>
                <div className="text-xs text-[#7a7265] uppercase tracking-wide">
                  {language === 'en' ? 'Followers' : 'עוקבים'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-lg sm:text-2xl font-bold text-[#e67e22]">0</div>
                <div className="text-xs text-[#7a7265] uppercase tracking-wide">
                  {language === 'en' ? 'Following' : 'נעקבים'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Category pills — own profile only */}
      {isOwnProfile && (
        <div
          className="mb-4"
          onMouseEnter={() => setHoveringCategoryPills(true)}
          onMouseLeave={() => setHoveringCategoryPills(false)}
        >
          <div
            ref={categoryScrollRef}
            className="flex items-center gap-2 overflow-x-auto h-9 carousel-scroll"
            style={{ WebkitOverflowScrolling: 'touch', direction: isRtl ? 'rtl' : 'ltr' }}
          >
          {categoriesLoading ? (
            [56, 80, 64, 96, 56, 72, 88, 60, 76, 52].map((w, i) => (
              <div key={i} className="flex-shrink-0 h-8 rounded-full bg-[#e8e4dc] animate-pulse" style={{ width: `${w}px` }} />
            ))
          ) : (
            <>
              <button
                onClick={() => setSelectedCategoryName(null)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  !selectedCategoryName ? 'bg-[#e67e22] text-white' : 'bg-white border border-[#e8e4dc] text-[#7a7265] hover:border-[#e67e22]/40'
                }`}
              >
                {language === 'en' ? 'All' : 'הכל'}
              </button>
              {userCategories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategoryName(selectedCategoryName === cat.name ? null : cat.name)}
                  className={`flex-shrink-0 rounded-full text-sm font-medium transition-colors px-3 py-1.5 ${
                    selectedCategoryName === cat.name ? 'bg-[#e67e22] text-white' : 'bg-white border border-[#e8e4dc] text-[#7a7265] hover:border-[#e67e22]/40'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
              {showNewCategoryInput ? (
                <form
                  onSubmit={async e => {
                    e.preventDefault();
                    const val = newCategoryInput.trim();
                    if (val) await onCreateCategory(val);
                    setNewCategoryInput('');
                    setShowNewCategoryInput(false);
                  }}
                  className="flex-shrink-0"
                >
                  <input
                    ref={newCategoryInputRef}
                    autoFocus
                    value={newCategoryInput}
                    onChange={e => setNewCategoryInput(e.target.value)}
                    onBlur={() => { setShowNewCategoryInput(false); setNewCategoryInput(''); }}
                    onKeyDown={e => { if (e.key === 'Escape') { setShowNewCategoryInput(false); setNewCategoryInput(''); } }}
                    placeholder={language === 'en' ? 'Name...' : 'שם...'}
                    className="w-28 px-3 py-1.5 text-sm border border-[#e67e22] rounded-full focus:outline-none bg-white text-[#3d3429]"
                  />
                </form>
              ) : (
                <button
                  onClick={() => setShowNewCategoryInput(true)}
                  className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-sm text-[#7a7265] border border-dashed border-[#e8e4dc] hover:border-[#e67e22]/40 hover:text-[#e67e22] transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {language === 'en' ? 'New' : 'חדש'}
                </button>
              )}
            </>
          )}
          </div>
        </div>
      )}

      {/* Search and sort */}
      <div className="mb-8 flex items-center">
        <div className="relative flex-1 z-10">
          <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-[#7a7265] ${language === 'he' ? 'right-4' : 'left-4'}`} />
          <input
            type="text"
            placeholder={language === 'en' ? 'Search recipes...' : '...חפש מתכונים'}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className={`w-full py-3 bg-white border border-[#e8e4dc] rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#cf711f]/20 ${language === 'he' ? 'pr-11 pl-14 sm:pl-32 text-right' : 'pl-11 pr-14 sm:pr-32'}`}
          />
          <div ref={filterMenuRef} className={`absolute top-1/2 -translate-y-1/2 ${language === 'he' ? 'left-2' : 'right-2'}`}>
            <button
              onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
              className={`flex items-center gap-1.5 py-1.5 px-3 rounded-xl transition-colors ${
                sortBy !== 'most-prepped' ? 'bg-[#e67e22]/10 text-[#e67e22] font-semibold' : 'bg-[#f5f3ef] text-[#7a7265] hover:bg-[#e8e4dc]'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-xs font-medium">{language === 'en' ? 'Sort' : 'מיון'}</span>
            </button>
            {isFilterMenuOpen && (
                <div className={`absolute top-full mt-3 z-20 bg-white rounded-2xl border border-[#e8e4dc] shadow-lg overflow-hidden min-w-[180px] ${language === 'he' ? 'left-0' : 'right-0'}`}>
                  <div className="px-4 py-2 text-xs font-semibold text-[#7a7265] uppercase tracking-wide border-b border-[#f5f3ef]">
                    {language === 'en' ? 'Sort by' : 'מיון לפי'}
                  </div>
                  {[
                    { value: 'most-prepped', en: 'Most prepped', he: 'הוכן הכי הרבה' },
                    { value: 'date', en: 'Date added', he: 'תאריך הוספה' },
                    { value: 'alphabetical', en: 'Alphabetical', he: 'א-ב' },
                  ].map(opt => {
                    const isActive = sortBy === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => {
                          if (isActive) {
                            setSortOrder(o => o === 'desc' ? 'asc' : 'desc');
                          } else {
                            setSortBy(opt.value);
                            setSortOrder('desc');
                          }
                        }}
                        className={`w-full px-4 py-2.5 text-sm transition-colors flex items-center justify-between gap-2 ${
                          isActive ? 'bg-[#e67e22]/10 text-[#e67e22] font-semibold' : 'text-[#3d3429] hover:bg-[#f5f3ef]'
                        } ${isRtl ? 'flex-row-reverse' : ''}`}
                      >
                        <span>{language === 'en' ? opt.en : opt.he}</span>
                        {isActive && (
                          <span className="text-[10px]">{sortOrder === 'desc' ? '▼' : '▲'}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
            )}
          </div>
        </div>
      </div>

      {/* Recipes Grid */}
      {(recipesLoading || (!viewingProfile && ownRecipesLoading)) ? (
        <div style={{ direction: isRtl ? 'rtl' : 'ltr' }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {[...Array(6)].map((_, i) => <RecipeCardSkeleton key={i} />)}
        </div>
      ) : filteredRecipes.length > 0 ? (
        <div style={{ direction: isRtl ? 'rtl' : 'ltr' }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filteredRecipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              language={language}
              onSelect={onSelectRecipe}
              showCategory={false}
              likeCount={likeCounts[recipe.id]}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <BookOpen className="w-12 h-12 text-[#e8e4dc] mx-auto mb-4" />
          <p className="text-[#7a7265] text-lg">
            {language === 'en' ? 'No recipes found' : 'לא נמצאו מתכונים'}
          </p>
        </div>
      )}
      {/* Avatar Lightbox */}
      {showAvatarFull && avatarUrlLarge && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm bg-black/60" onClick={() => setShowAvatarFull(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowAvatarFull(false)}>
            <img
              src={avatarUrlLarge}
              alt={displayName}
              referrerPolicy="no-referrer"
              className="w-[min(80vw,80vh,28rem)] h-[min(80vw,80vh,28rem)] object-cover rounded-full shadow-xl"
              onClick={e => e.stopPropagation()}
              onError={e => { if (e.target.src !== avatarUrl) e.target.src = avatarUrl; }}
            />
          </div>
        </>
      )}
      {/* Settings Modal */}
      {showSettings && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm bg-black/30" onClick={closeSettings} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={closeSettings}>
            <div
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden"
              style={{ direction: isRtl ? 'rtl' : 'ltr' }}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-[#e8e4dc]">
                <div className="flex items-center gap-2">
                  {(showEditProfile || showRecipeSettings) && (
                    <button
                      onClick={() => { setShowEditProfile(false); setShowRecipeSettings(false); setEditingCategoryId(null); }}
                      className="p-1.5 text-[#7a7265] hover:text-[#3d3429] hover:bg-[#f5f3ef] rounded-xl transition-colors"
                    >
                      {isRtl ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                    </button>
                  )}
                  <h2 className="text-lg font-semibold text-[#3d3429]">
                    {showRecipeSettings
                      ? (language === 'en' ? 'Recipe Settings' : 'הגדרות מתכונים')
                      : (language === 'en' ? 'Settings' : 'הגדרות')}
                  </h2>
                </div>
                <button onClick={closeSettings} className="p-2 text-[#7a7265] hover:text-[#3d3429] hover:bg-[#f5f3ef] rounded-xl transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="px-6 py-4 space-y-1 max-h-[70vh] overflow-y-auto">
                {showEditProfile ? (
                  <div className="space-y-4 py-2">
                    <div>
                      <label className="block text-xs font-semibold text-[#7a7265] uppercase tracking-wide mb-1.5">
                        {language === 'en' ? 'Display Name' : 'שם תצוגה'}
                      </label>
                      <input
                        type="text"
                        value={editDisplayName}
                        onChange={e => setEditDisplayName(e.target.value)}
                        maxLength={64}
                        placeholder={language === 'en' ? 'Your name' : 'השם שלך'}
                        className="w-full px-4 py-2.5 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] focus:outline-none focus:ring-2 focus:ring-[#cf711f]/20 focus:border-[#cf711f] text-sm transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#7a7265] uppercase tracking-wide mb-1.5">
                        {language === 'en' ? 'Handle' : 'שם משתמש'}
                      </label>
                      <div className="relative">
                        <span className="absolute top-1/2 -translate-y-1/2 left-4 text-[#7a7265] text-sm">@</span>
                        <input
                          type="text"
                          value={editHandle}
                          onChange={e => setEditHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                          maxLength={32}
                          placeholder="yourhandle"
                          className="w-full pl-8 pr-4 py-2.5 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] focus:outline-none focus:ring-2 focus:ring-[#cf711f]/20 focus:border-[#cf711f] text-sm transition-all"
                        />
                      </div>
                      <p className="text-xs text-[#7a7265] mt-1">{language === 'en' ? 'Letters, numbers and underscores only' : 'אותיות, מספרים וקווים תחתונים בלבד'}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#7a7265] uppercase tracking-wide mb-1.5">
                        {language === 'en' ? 'Bio' : 'ביוגרפיה'}
                      </label>
                      <textarea
                        value={editBio}
                        onChange={e => setEditBio(e.target.value)}
                        maxLength={160}
                        rows={3}
                        className="w-full px-4 py-2.5 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] focus:outline-none focus:ring-2 focus:ring-[#cf711f]/20 focus:border-[#cf711f] text-sm transition-all resize-none"
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => setShowEditProfile(false)}
                        className="flex-1 px-4 py-2.5 bg-[#f5f3ef] text-[#3d3429] rounded-2xl text-sm font-medium hover:bg-[#e8e4dc] transition-colors"
                      >
                        {language === 'en' ? 'Cancel' : 'ביטול'}
                      </button>
                      <button
                        onClick={handleSaveProfile}
                        disabled={isSaving || !editHandle.trim()}
                        className="flex-1 px-4 py-2.5 bg-[#e67e22] text-white rounded-2xl text-sm font-medium hover:bg-[#cf711f] disabled:opacity-50 transition-colors"
                      >
                        {isSaving ? (language === 'en' ? 'Saving...' : 'שומר...') : (language === 'en' ? 'Save' : 'שמור')}
                      </button>
                    </div>
                    <div className="pt-4 border-t border-[#e8e4dc] mt-2">
                      <button
                        onClick={handleDeleteAccount}
                        className="w-full text-start px-4 py-3 rounded-2xl text-red-500 hover:bg-red-50 transition-colors text-sm font-medium"
                      >
                        {language === 'en' ? 'Delete account' : 'מחיקת חשבון'}
                      </button>
                    </div>
                  </div>
                ) : showRecipeSettings ? (
                  <div className="space-y-5 py-2">
                    {/* Default Visibility */}
                    <div>
                      <p className="text-xs font-semibold text-[#7a7265] uppercase tracking-wide mb-2">
                        {language === 'en' ? 'Default Visibility' : 'נראות ברירת מחדל'}
                      </p>
                      <div className="flex gap-2">
                        {['public', 'private'].map(v => (
                          <button
                            key={v}
                            onClick={() => handleSetDefaultVisibility(v)}
                            className={`flex-1 py-2.5 rounded-2xl text-sm font-medium transition-colors border ${
                              defaultVisibility === v
                                ? 'bg-[#e67e22] text-white border-[#e67e22]'
                                : 'bg-[#faf9f7] text-[#3d3429] border-[#e8e4dc] hover:bg-[#f5f3ef]'
                            }`}
                          >
                            {v === 'public'
                              ? (language === 'en' ? 'Public' : 'ציבורי')
                              : (language === 'en' ? 'Private' : 'פרטי')}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Categories */}
                    <div>
                      <p className="text-xs font-semibold text-[#7a7265] uppercase tracking-wide mb-2">
                        {language === 'en' ? 'Categories' : 'קטגוריות'}
                      </p>
                      <div className="space-y-1">
                        {userCategories.map(cat => (
                          <div key={cat.id} className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-[#faf9f7] border border-[#e8e4dc]">
                            {editingCategoryId === cat.id ? (
                              <>
                                <input
                                  autoFocus
                                  value={editingCategoryName}
                                  onChange={e => setEditingCategoryName(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' && editingCategoryName.trim()) {
                                      if (selectedCategoryName === cat.name) setSelectedCategoryName(editingCategoryName.trim());
                                      onRenameCategory(cat.id, editingCategoryName.trim());
                                      setEditingCategoryId(null);
                                    }
                                    if (e.key === 'Escape') setEditingCategoryId(null);
                                  }}
                                  className="flex-1 bg-transparent text-sm text-[#3d3429] focus:outline-none"
                                />
                                <button
                                  onClick={() => {
                                    if (editingCategoryName.trim()) {
                                      if (selectedCategoryName === cat.name) setSelectedCategoryName(editingCategoryName.trim());
                                      onRenameCategory(cat.id, editingCategoryName.trim());
                                    }
                                    setEditingCategoryId(null);
                                  }}
                                  className="text-xs text-[#e67e22] font-medium hover:text-[#cf711f]"
                                >
                                  {language === 'en' ? 'Save' : 'שמור'}
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="flex-1 text-sm text-[#3d3429] truncate min-w-0">{cat.name}</span>
                                <button
                                  onClick={() => { setEditingCategoryId(cat.id); setEditingCategoryName(cat.name); }}
                                  className="text-xs text-[#7a7265] hover:text-[#3d3429] px-1"
                                >
                                  {language === 'en' ? 'Rename' : 'שנה שם'}
                                </button>
                                <button
                                  onClick={() => {
                                    const confirmed = new Promise(resolve => {
                                      setConfirmDialog({
                                        title: language === 'en' ? `Delete "${cat.name}"?` : `למחוק את "${cat.name}"?`,
                                        message: language === 'en' ? 'Recipes in this category will not be deleted.' : 'המתכונים בקטגוריה זו לא יימחקו.',
                                        confirmLabel: language === 'en' ? 'Delete' : 'מחק',
                                        onConfirm: () => { setConfirmDialog(null); resolve(true); },
                                        onCancel: () => { setConfirmDialog(null); resolve(false); },
                                      });
                                    });
                                    confirmed.then(ok => {
                                      if (!ok) return;
                                      if (selectedCategoryName === cat.name) setSelectedCategoryName(null);
                                      onDeleteCategory(cat.id);
                                    });
                                  }}
                                  className="text-xs text-red-400 hover:text-red-600 px-1"
                                >
                                  {language === 'en' ? 'Delete' : 'מחק'}
                                </button>
                              </>
                            )}
                          </div>
                        ))}
                      </div>

                      {showNewCategoryInput ? (
                        <div className="flex gap-2 mt-2">
                          <input
                            ref={newCategoryInputRef}
                            autoFocus
                            value={newCategoryInput}
                            onChange={e => setNewCategoryInput(e.target.value)}
                            onKeyDown={async e => {
                              if (e.key === 'Enter' && newCategoryInput.trim()) {
                                await onCreateCategory(newCategoryInput.trim());
                                setNewCategoryInput('');
                                setShowNewCategoryInput(false);
                              }
                              if (e.key === 'Escape') { setShowNewCategoryInput(false); setNewCategoryInput(''); }
                            }}
                            placeholder={language === 'en' ? 'Category name' : 'שם קטגוריה'}
                            className="flex-1 px-3 py-2 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-sm text-[#3d3429] focus:outline-none focus:border-[#cf711f]"
                          />
                          <button
                            onClick={async () => {
                              if (newCategoryInput.trim()) await onCreateCategory(newCategoryInput.trim());
                              setNewCategoryInput('');
                              setShowNewCategoryInput(false);
                            }}
                            className="px-3 py-2 bg-[#e67e22] text-white rounded-2xl text-sm font-medium hover:bg-[#cf711f]"
                          >
                            {language === 'en' ? 'Add' : 'הוסף'}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowNewCategoryInput(true)}
                          className="mt-2 w-full px-4 py-2.5 bg-[#faf9f7] border border-dashed border-[#e8e4dc] rounded-2xl text-sm text-[#7a7265] hover:bg-[#f5f3ef] hover:text-[#3d3429] transition-colors"
                        >
                          + {language === 'en' ? 'Add category' : 'הוסף קטגוריה'}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-xs font-semibold text-[#7a7265] uppercase tracking-wide px-2 pb-1">
                      {language === 'en' ? 'Account' : 'חשבון'}
                    </p>
                    <button
                      onClick={() => {
                        setEditDisplayName(ownProfile?.display_name || '');
                        setEditHandle(ownProfile?.username || '');
                        setEditBio(ownProfile?.bio || '');
                        setShowEditProfile(true);
                      }}
                      className="w-full text-start px-4 py-3 rounded-2xl text-[#3d3429] hover:bg-[#f5f3ef] transition-colors text-sm font-medium"
                    >
                      {language === 'en' ? 'Edit profile' : 'עריכת פרופיל'}
                    </button>
                    <p className="text-xs font-semibold text-[#7a7265] uppercase tracking-wide px-2 pt-3 pb-1">
                      {language === 'en' ? 'Recipes' : 'מתכונים'}
                    </p>
                    <button
                      onClick={() => setShowRecipeSettings(true)}
                      className="w-full text-start px-4 py-3 rounded-2xl text-[#3d3429] hover:bg-[#f5f3ef] transition-colors text-sm font-medium"
                    >
                      {language === 'en' ? 'Recipe settings' : 'הגדרות מתכונים'}
                    </button>
                    <div className="pt-4 mt-3 border-t border-[#e8e4dc]">
                      <button
                        onClick={() => { closeSettings(); if (onLogout) onLogout(); }}
                        className={`w-full flex ${isRtl ? 'flex-row-reverse' : ''} items-center justify-center gap-2 px-4 py-3 bg-red-500 text-white rounded-2xl hover:bg-red-600 transition-colors text-sm font-semibold`}
                      >
                        <LogOut className="w-4 h-4" />
                        {language === 'en' ? 'Logout' : 'התנתקות'}
                      </button>
                    </div>
                  </>
                )}
              </div>

            </div>
          </div>
        </>
      )}

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
    </div>
  );
}

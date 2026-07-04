import { User, BookOpen, Search, Filter, X, Settings, Plus, ChevronLeft, ChevronRight, LogOut, Pencil, Trash2, Check, Globe, Lock } from 'lucide-react';
import { RecipeCard, RecipeCardSkeleton } from './RecipeCard';
import { ConfirmDialog } from './ConfirmDialog';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase, supabaseUrl, supabaseKey } from '../supabaseClient';
import { swr, peekCache, writeCache } from '../utils/cache';
import { getToken } from '../utils/auth';
import { formatRecipe } from '../utils/formatRecipe';
import { useWheelScroll } from '../utils/useWheelScroll';
import { useOutsideClick } from '../utils/useOutsideClick';
import { CATEGORY_PALETTE, CHECKERBOARD } from '../utils/categoryColor';

// Virtual category sentinel — recipes with no category assignments live here. ponytail: no DB row, pure client filter.
const UNCATEGORIZED = '\0uncategorized';

export function UserProfile({
  user,
  recipes,
  language,
  onSelectRecipe,
  onAddRecipe,
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
  onRecolorCategory,
  onHandleChange,
  openSettings = false,
  onSettingsOpened,
  onError,
}) {
  const isRtl = language === 'he';
  const [viewingRecipes, setViewingRecipes] = useState([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  // cache.js key (not a raw localStorage one) so clearCache() wipes it on logout
  const [ownProfile, setOwnProfile] = useState(() => user?.id ? peekCache(`profile-own:${user.id}`) : null);
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
  // Start on the already-cached small image so the lightbox opens instantly; upgrade to large on load.
  const [lightboxSrc, setLightboxSrc] = useState(avatarUrl);

  // Lock page scroll while the avatar lightbox is open
  // When the lightbox opens, reset to the cached small image then preload the large one.
  useEffect(() => {
    if (!showAvatarFull || !avatarUrlLarge) return;
    setLightboxSrc(avatarUrl);
    const big = new Image();
    big.referrerPolicy = 'no-referrer';
    big.onload = () => setLightboxSrc(avatarUrlLarge);
    big.src = avatarUrlLarge;
  }, [showAvatarFull, avatarUrl, avatarUrlLarge]);

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
  const [handleErr, setHandleErr] = useState(null); // inline handle validation error in the edit form

  // Open the settings modal when the header menu requests it
  useEffect(() => {
    if (openSettings) { setShowSettings(true); onSettingsOpened?.(); }
  }, [openSettings]);
  const [defaultVisibility, setDefaultVisibility] = useState(() => localStorage.getItem('defaultRecipeVisibility') || 'private');
  // {id, x, y} — popover is portaled to body (modal has backdrop-blur which clips fixed children).
  const [recolor, setRecolor] = useState(null);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(CATEGORY_PALETTE[0]);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const newCategoryInputRef = useRef(null);
  const filterMenuRef = useRef(null);
  const categoryScrollRef = useRef(null);
  const [hoveringCategoryPills, setHoveringCategoryPills] = useState(false);

  useWheelScroll(categoryScrollRef, hoveringCategoryPills);
  useOutsideClick(filterMenuRef, () => setIsFilterMenuOpen(false));
  
  // Fetch viewing profile's public recipes
  useEffect(() => {
    if (viewingProfile) {

      setRecipesLoading(true);
      // ttl 10min: revisiting a profile reuses the cached list (and its count)
      // instantly, no refetch.
      swr(`profile-recipes:${viewingProfile.id}`, async () => {
        const res = await fetch(`${supabaseUrl}/rest/v1/recipes?user_id=eq.${viewingProfile.id}&visibility=eq.public&select=*,recipe_likes(recipe_id),recipe_categories(categories(name))`, {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          }
        });
        const data = await res.json();
        return (data || []).map(formatRecipe);
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
      fetch(`${supabaseUrl}/rest/v1/users?id=eq.${user.id}&select=username,display_name,bio,avatar_url`, {
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data?.[0]) {
            setOwnProfile(data[0]);
            writeCache(`profile-own:${user.id}`, data[0]);
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
    // Match the signup modal: handle must be 3+ chars before we hit the DB.
    if (editHandle.trim().length < 3) {
      setHandleErr(language === 'en' ? 'At least 3 characters' : 'לפחות 3 תווים');
      return;
    }
    setIsSaving(true);
    setHandleErr(null);
    try {
      const token = await getToken();
      const res = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${user.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ display_name: editDisplayName.trim(), username: editHandle.trim(), bio: editBio.trim() })
      });
      // 409 = unique-index conflict on lower(username) → the handle is taken.
      if (res.status === 409) {
        setHandleErr(language === 'en' ? 'That handle is already taken' : 'שם המשתמש הזה תפוס');
        setIsSaving(false);
        return;
      }
      if (!res.ok) throw new Error(`${res.status}`);
      const updated = { ...ownProfile, display_name: editDisplayName.trim(), username: editHandle.trim(), bio: editBio.trim() };
      setOwnProfile(updated);
      writeCache(`profile-own:${user.id}`, updated);
      if (onHandleChange) onHandleChange(editHandle.trim());
      setShowEditProfile(false);
    } catch {
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
        icon: Trash2,
        onConfirm: () => { setConfirmDialog(null); resolve(true); },
        onCancel: () => { setConfirmDialog(null); resolve(false); },
      });
    });
    if (!confirmed) return;
    try {
      const token = await getToken();
      const res = await fetch(`${apiBase}/account`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(await res.text());
      // local scope: the auth user is already deleted server-side, a global
      // sign-out would 403 on the orphaned token
      await supabase.auth.signOut({ scope: 'local' });
      if (onLogout) onLogout();
    } catch {
      if (onError) onError(language === 'en' ? 'Failed to delete account' : 'מחיקת החשבון נכשלה');
    }
  };

  const filteredRecipes = displayRecipes
    .filter(recipe => {
      const matchesSearch = recipe.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           recipe.description.toLowerCase().includes(searchQuery.toLowerCase());
      const isUncategorized = !(recipeCategories[recipe.id]?.length > 0) && !recipe.category;
      const matchesCategory = !selectedCategoryName || (
        selectedCategoryName === UNCATEGORIZED ? isUncategorized : (
          recipeCategories[recipe.id]?.some(catId =>
            userCategories.find(c => c.id === catId)?.name === selectedCategoryName
          ) || recipe.category === selectedCategoryName
        )
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
      <div className="bg-white rounded-2xl border border-[#e8e4dc] p-4 sm:p-6 mb-2 relative">
        {!viewingProfile && (
          <button
            onClick={() => setShowSettings(true)}
            className={`hidden sm:block absolute top-4 ${isRtl ? 'left-4' : 'right-4'} p-2 text-[#7a7265] hover:text-[#3d3429] hover:bg-[#f5f3ef] rounded-xl transition-colors`}
          >
            <Settings className="w-5 h-5" />
          </button>
        )}
        <div className="flex flex-row items-center sm:items-stretch gap-4 sm:gap-6" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
          {/* Avatar */}
          <div className="flex-shrink-0">
            <button
              type="button"
              onClick={() => avatarUrl && setShowAvatarFull(true)}
              className={`block w-28 sm:w-36 h-28 sm:h-36 rounded-full overflow-hidden bg-[#e67e22]/10 flex items-center justify-center ${avatarUrl ? 'cursor-pointer' : 'cursor-default'}`}
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
          <div className="flex-1 flex flex-col justify-center sm:justify-between">
            <div className="flex flex-col items-start sm:flex-row sm:items-baseline sm:gap-2 mb-4 sm:mb-0" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
              <h1 className="text-2xl sm:text-4xl font-bold text-[#3d3429] mb-1 sm:mb-0 break-words line-clamp-2 text-start" title={displayName}>{displayName}</h1>
              {handle && <p className="text-base sm:text-lg text-[#7a7265]"><span dir="ltr">@{handle}</span></p>}
            </div>

            {profileData?.bio ? (
              <p className="text-sm text-[#3d3429] whitespace-pre-line mb-4 sm:mb-0 text-start">{profileData.bio}</p>
            ) : isOwnProfile ? (
              <p className="text-sm italic text-[#a8a29a] mb-4 sm:mb-0 text-start">
                {language === 'en' ? 'add bio in settings' : 'הוסף תיאור בהגדרות'}
              </p>
            ) : null}

            {/* Stats */}
            <div className="flex justify-start gap-5 sm:gap-7 mt-4 sm:mt-0">
              <div className="text-center">
                <div className="text-lg sm:text-2xl font-bold text-[#e67e22]">{displayRecipes.length}</div>
                <div className={`${isRtl ? 'text-xs' : 'text-[10px]'} text-[#7a7265] uppercase tracking-wide`}>
                  {language === 'en' ? 'Recipes' : 'מתכונים'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-lg sm:text-2xl font-bold text-[#e67e22]">0</div>
                <div className={`${isRtl ? 'text-xs' : 'text-[10px]'} text-[#7a7265] uppercase tracking-wide`}>
                  {language === 'en' ? 'Followers' : 'עוקבים'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-lg sm:text-2xl font-bold text-[#e67e22]">0</div>
                <div className={`${isRtl ? 'text-xs' : 'text-[10px]'} text-[#7a7265] uppercase tracking-wide`}>
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
          className="mb-2"
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
              <button
                onClick={() => setSelectedCategoryName(selectedCategoryName === UNCATEGORIZED ? null : UNCATEGORIZED)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedCategoryName === UNCATEGORIZED ? 'bg-[#e67e22] text-white' : 'bg-white border border-[#e8e4dc] text-[#7a7265] hover:border-[#e67e22]/40'
                }`}
              >
                {language === 'en' ? 'Uncategorized' : 'ללא קטגוריה'}
              </button>
              {userCategories.map(cat => {
                const selected = selectedCategoryName === cat.name;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategoryName(selected ? null : cat.name)}
                    className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-full text-sm font-medium transition-colors px-3 py-1.5 border ${selected ? 'text-white border-transparent' : 'bg-white text-[#7a7265]'}`}
                    style={selected
                      ? { backgroundColor: cat.color || '#e67e22' }
                      : { borderColor: cat.color ? `${cat.color}66` : '#e8e4dc' }}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={selected ? { backgroundColor: '#fff' } : (cat.color ? { backgroundColor: cat.color } : CHECKERBOARD)} />
                    {cat.name}
                  </button>
                );
              })}
              {showNewCategoryInput && !showSettings ? (
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
      <div className="mb-3 flex items-center">
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
      ) : (filteredRecipes.length > 0 || isOwnProfile) ? (
        // Cap the visible area to ~2.4 rows so the 3rd row peeks at the bottom — a visual hint
        // that there's more to scroll. px-2/-mx-2 keeps card hover shadows from being clipped.
        <div style={{ direction: isRtl ? 'rtl' : 'ltr' }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-4 max-h-[23.5rem] overflow-y-auto px-2 -mx-2">
          {/* Add-recipe ghost card — own profile only, opens the recipe form */}
          {isOwnProfile && onAddRecipe && (
            <button
              onClick={onAddRecipe}
              className="group w-full min-h-[8.5rem] rounded-2xl border-2 border-dashed border-[#e8e4dc] flex flex-col items-center justify-center gap-2 text-[#a8a29a] hover:border-[#e67e22]/50 hover:text-[#cf711f] hover:bg-[#e67e22]/5 transition-colors"
            >
              <span className="w-11 h-11 rounded-full bg-[#f5f3ef] group-hover:bg-[#e67e22]/10 flex items-center justify-center transition-colors">
                <Plus className="w-6 h-6" />
              </span>
              <span className="text-sm font-medium">{language === 'en' ? 'Add recipe' : 'הוסף מתכון'}</span>
            </button>
          )}
          {filteredRecipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              language={language}
              onSelect={onSelectRecipe}
              showCategory={false}
              likeCount={likeCounts[recipe.id]}
              userCategories={isOwnProfile ? userCategories : undefined}
              currentRecipeCategories={isOwnProfile ? (recipeCategories[recipe.id] || []) : undefined}
              onToggleRecipeCategory={isOwnProfile ? onToggleRecipeCategory : undefined}
              onCreateCategory={isOwnProfile ? onCreateCategory : undefined}
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
              src={lightboxSrc}
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
              {/* Branded header band — gray, mirrors the URL-import / recipe-form bands */}
              <div className="px-6 pt-5 pb-6 bg-gradient-to-br from-[#7a7265] to-[#5a5248]">
                <div className="flex items-center justify-between">
                  {(showEditProfile || showRecipeSettings) ? (
                    <button
                      onClick={() => { setShowEditProfile(false); setShowRecipeSettings(false); setEditingCategoryId(null); }}
                      className="text-white/85 hover:text-white hover:bg-white/15 rounded-xl p-1.5 transition-colors"
                    >
                      {isRtl ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
                    </button>
                  ) : <span className="w-8" />}
                  <button onClick={closeSettings} className="text-white/85 hover:text-white hover:bg-white/15 rounded-xl p-1.5 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex flex-col items-center mt-1">
                  <span className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center mb-2.5">
                    {showEditProfile
                      ? <User className="w-7 h-7 text-white" />
                      : showRecipeSettings
                        ? <BookOpen className="w-7 h-7 text-white" />
                        : <Settings className="w-7 h-7 text-white" />}
                  </span>
                  <h2 className="text-2xl font-bold tracking-tight text-white">
                    {showEditProfile
                      ? (language === 'en' ? 'Edit Profile' : 'עריכת פרופיל')
                      : showRecipeSettings
                        ? (language === 'en' ? 'Recipe Settings' : 'הגדרות מתכונים')
                        : (language === 'en' ? 'Settings' : 'הגדרות')}
                  </h2>
                  <p className="text-sm text-white/70 mt-0.5">
                    {showEditProfile
                      ? (language === 'en' ? 'Your public details' : 'הפרטים הציבוריים שלך')
                      : showRecipeSettings
                        ? (language === 'en' ? 'Visibility & categories' : 'נראות וקטגוריות')
                        : <span dir="ltr">@{ownProfile?.username || ''}</span>}
                  </p>
                </div>
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
                        onChange={e => setEditDisplayName(e.target.value.replace(/[^A-Za-z0-9 '.-]/g, ''))}
                        maxLength={64}
                        placeholder={language === 'en' ? 'Your name' : 'השם שלך'}
                        dir="ltr"
                        className="w-full px-4 py-2.5 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] focus:outline-none focus:ring-2 focus:ring-[#cf711f]/20 focus:border-[#cf711f] text-sm transition-all text-start"
                      />
                      <p className="text-xs text-[#7a7265] mt-1">{language === 'en' ? 'English letters only' : 'אותיות באנגלית בלבד'}</p>
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
                          onChange={e => { setEditHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')); if (handleErr) setHandleErr(null); }}
                          maxLength={32}
                          placeholder="yourhandle"
                          dir="ltr"
                          className={`w-full pl-8 pr-4 py-2.5 bg-[#faf9f7] border rounded-2xl text-[#3d3429] focus:outline-none focus:ring-2 text-sm transition-all text-start ${handleErr ? 'border-red-400 focus:ring-red-200' : 'border-[#e8e4dc] focus:ring-[#cf711f]/20 focus:border-[#cf711f]'}`}
                        />
                      </div>
                      {handleErr
                        ? <p className="text-xs text-red-500 mt-1">{handleErr}</p>
                        : <p className="text-xs text-[#7a7265] mt-1">{language === 'en' ? 'Letters, numbers and underscores only' : 'אותיות, מספרים וקווים תחתונים בלבד'}</p>}
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold text-[#7a7265] uppercase tracking-wide">
                          {language === 'en' ? 'Bio' : 'ביוגרפיה'}
                        </label>
                        <span className="text-xs text-[#a39b8d]">{editBio.length}/100</span>
                      </div>
                      <textarea
                        value={editBio}
                        onChange={e => { if (e.target.value.split('\n').length <= 3) setEditBio(e.target.value); }}
                        maxLength={100}
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
                        className="group w-full flex items-center gap-3 px-3 py-3 rounded-2xl border border-red-100 bg-red-50/50 hover:bg-red-50 hover:border-red-200 transition-colors"
                      >
                        <span className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                          <Trash2 className="w-[18px] h-[18px] text-red-500" />
                        </span>
                        <span className="flex-1 text-start min-w-0">
                          <span className="block text-sm font-semibold text-[#3d3429]">{language === 'en' ? 'Delete account' : 'מחיקת חשבון'}</span>
                          <span className="block text-xs text-[#7a7265]">{language === 'en' ? 'Permanently remove your account' : 'מחיקה לצמיתות של החשבון'}</span>
                        </span>
                        {isRtl ? <ChevronLeft className="w-4 h-4 text-red-300 group-hover:text-red-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-red-300 group-hover:text-red-500 flex-shrink-0" />}
                      </button>
                    </div>
                  </div>
                ) : showRecipeSettings ? (
                  <div className="space-y-5 py-2">
                    {/* Default Visibility */}
                    <div>
                      <p className="text-xs font-semibold text-[#7a7265] uppercase tracking-wide mb-2">
                        {language === 'en' ? 'Default Visibility For New Recipes' : 'נראות ברירת מחדל של מתכונים חדשים'}
                      </p>
                      <div className="flex gap-2">
                        {['public', 'private'].map(v => (
                          <button
                            key={v}
                            onClick={() => handleSetDefaultVisibility(v)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-medium transition-colors border ${
                              defaultVisibility === v
                                ? 'bg-[#e67e22] text-white border-[#e67e22]'
                                : 'bg-[#faf9f7] text-[#3d3429] border-[#e8e4dc] hover:bg-[#f5f3ef]'
                            }`}
                          >
                            {v === 'public' ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
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
                        {userCategories.length === 0 && !showNewCategoryInput && (
                          <p className="text-sm text-[#a39b8d] text-center py-3">
                            {language === 'en' ? 'No categories yet' : 'אין קטגוריות עדיין'}
                          </p>
                        )}
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
                                  title={language === 'en' ? 'Save' : 'שמור'}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-[#e67e22] hover:text-white hover:bg-[#e67e22] transition-colors"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  title={language === 'en' ? 'Change color' : 'שנה צבע'}
                                  onClick={e => {
                                    const r = e.currentTarget.getBoundingClientRect();
                                    setRecolor(recolor?.id === cat.id ? null : { id: cat.id, color: cat.color, x: r.left, y: r.bottom });
                                  }}
                                  className="w-4 h-4 rounded-full ring-1 ring-black/10 hover:scale-110 transition-transform flex-shrink-0"
                                  style={cat.color ? { backgroundColor: cat.color } : CHECKERBOARD}
                                />
                                <span className="flex-1 text-sm text-[#3d3429] truncate min-w-0">{cat.name}</span>
                                <button
                                  title={language === 'en' ? 'Rename' : 'שנה שם'}
                                  onClick={() => { setEditingCategoryId(cat.id); setEditingCategoryName(cat.name); }}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-[#7a7265] hover:text-[#3d3429] hover:bg-[#e8e4dc]/60 transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  title={language === 'en' ? 'Delete' : 'מחק'}
                                  onClick={() => {
                                    const confirmed = new Promise(resolve => {
                                      setConfirmDialog({
                                        title: language === 'en' ? `Delete "${cat.name}"?` : `למחוק את "${cat.name}"?`,
                                        message: language === 'en' ? 'Recipes in this category will not be deleted.' : 'המתכונים בקטגוריה זו לא יימחקו.',
                                        confirmLabel: language === 'en' ? 'Delete' : 'מחק',
                                        icon: Trash2,
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
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        ))}
                      </div>

                      {showNewCategoryInput ? (
                        <div className="mt-2 space-y-2">
                          <div className="flex gap-2">
                            <input
                              ref={newCategoryInputRef}
                              autoFocus
                              value={newCategoryInput}
                              onChange={e => setNewCategoryInput(e.target.value)}
                              onKeyDown={async e => {
                                if (e.key === 'Enter' && newCategoryInput.trim()) {
                                  await onCreateCategory(newCategoryInput.trim(), newCategoryColor);
                                  setNewCategoryInput('');
                                  setNewCategoryColor(CATEGORY_PALETTE[0]);
                                  setShowNewCategoryInput(false);
                                }
                                if (e.key === 'Escape') { setShowNewCategoryInput(false); setNewCategoryInput(''); }
                              }}
                              placeholder={language === 'en' ? 'Category name' : 'שם קטגוריה'}
                              className="flex-1 px-3 py-2 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-sm text-[#3d3429] focus:outline-none focus:border-[#cf711f]"
                            />
                            <button
                              onClick={async () => {
                                if (newCategoryInput.trim()) await onCreateCategory(newCategoryInput.trim(), newCategoryColor);
                                setNewCategoryInput('');
                                setNewCategoryColor(CATEGORY_PALETTE[0]);
                                setShowNewCategoryInput(false);
                              }}
                              className="px-3 py-2 bg-[#e67e22] text-white rounded-2xl text-sm font-medium hover:bg-[#cf711f]"
                            >
                              {language === 'en' ? 'Add' : 'הוסף'}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2 px-1">
                            {CATEGORY_PALETTE.map(c => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setNewCategoryColor(c)}
                                title={c}
                                className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${newCategoryColor === c ? 'ring-2 ring-offset-2 ring-[#3d3429]' : ''}`}
                                style={{ backgroundColor: c }}
                              />
                            ))}
                            <button
                              type="button"
                              onClick={() => setNewCategoryColor(null)}
                              title={language === 'en' ? 'No color' : 'ללא צבע'}
                              className={`w-6 h-6 rounded-full ring-1 ring-black/10 transition-transform hover:scale-110 ${newCategoryColor === null ? 'ring-2 ring-offset-2 ring-[#3d3429]' : ''}`}
                              style={CHECKERBOARD}
                            />
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowNewCategoryInput(true)}
                          className="mt-2 w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#faf9f7] border border-dashed border-[#e8e4dc] rounded-2xl text-sm text-[#7a7265] hover:bg-[#f5f3ef] hover:text-[#3d3429] hover:border-[#cf711f]/40 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          {language === 'en' ? 'Add category' : 'הוסף קטגוריה'}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 py-1">
                    <button
                      onClick={() => {
                        setEditDisplayName(ownProfile?.display_name || '');
                        setEditHandle(ownProfile?.username || '');
                        setEditBio(ownProfile?.bio || '');
                        setHandleErr(null);
                        setShowEditProfile(true);
                      }}
                      className="group w-full flex items-center gap-3 px-3 py-3 rounded-2xl bg-[#faf9f7] border border-[#e8e4dc] hover:border-[#cf711f]/40 hover:bg-[#f5f3ef] transition-all"
                    >
                      <span className="w-9 h-9 rounded-full bg-[#e67e22]/10 flex items-center justify-center flex-shrink-0">
                        <User className="w-[18px] h-[18px] text-[#e67e22]" />
                      </span>
                      <span className="flex-1 text-start min-w-0">
                        <span className="block text-sm font-semibold text-[#3d3429]">{language === 'en' ? 'Edit profile' : 'עריכת פרופיל'}</span>
                        <span className="block text-xs text-[#7a7265] truncate">{language === 'en' ? 'Name, handle, bio' : 'שם, שם משתמש, ביוגרפיה'}</span>
                      </span>
                      {isRtl ? <ChevronLeft className="w-4 h-4 text-[#cdc6ba] group-hover:text-[#cf711f] flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-[#cdc6ba] group-hover:text-[#cf711f] flex-shrink-0" />}
                    </button>
                    <button
                      onClick={() => setShowRecipeSettings(true)}
                      className="group w-full flex items-center gap-3 px-3 py-3 rounded-2xl bg-[#faf9f7] border border-[#e8e4dc] hover:border-[#cf711f]/40 hover:bg-[#f5f3ef] transition-all"
                    >
                      <span className="w-9 h-9 rounded-full bg-[#e67e22]/10 flex items-center justify-center flex-shrink-0">
                        <BookOpen className="w-[18px] h-[18px] text-[#e67e22]" />
                      </span>
                      <span className="flex-1 text-start min-w-0">
                        <span className="block text-sm font-semibold text-[#3d3429]">{language === 'en' ? 'Recipe settings' : 'הגדרות מתכונים'}</span>
                        <span className="block text-xs text-[#7a7265] truncate">{language === 'en' ? 'Visibility, categories' : 'נראות, קטגוריות'}</span>
                      </span>
                      {isRtl ? <ChevronLeft className="w-4 h-4 text-[#cdc6ba] group-hover:text-[#cf711f] flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-[#cdc6ba] group-hover:text-[#cf711f] flex-shrink-0" />}
                    </button>
                    <button
                      onClick={() => {
                        setConfirmDialog({
                          title: language === 'en' ? 'Log out?' : 'להתנתק?',
                          message: language === 'en' ? 'You can hop back in anytime.' : 'אפשר לחזור בכל רגע.',
                          confirmLabel: language === 'en' ? 'Log out' : 'התנתק',
                          icon: LogOut,
                          danger: false,
                          onConfirm: () => { setConfirmDialog(null); closeSettings(); if (onLogout) onLogout(); },
                          onCancel: () => setConfirmDialog(null),
                        });
                      }}
                      className={`w-full flex ${isRtl ? 'flex-row-reverse' : ''} items-center justify-center gap-2 mt-1 px-4 py-3 bg-red-500 text-white rounded-2xl hover:bg-red-600 transition-colors text-sm font-semibold`}
                    >
                      <LogOut className="w-4 h-4" />
                      {language === 'en' ? 'Logout' : 'התנתקות'}
                    </button>
                  </div>
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
          icon={confirmDialog.icon}
          onConfirm={confirmDialog.onConfirm}
          onCancel={confirmDialog.onCancel}
        />
      )}
      {recolor && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setRecolor(null)} />
          <div
            className="fixed z-[61] p-2 bg-white rounded-2xl shadow-xl border border-[#e8e4dc] grid grid-cols-3 gap-2"
            style={{ top: Math.min(recolor.y + 6, window.innerHeight - 130), left: Math.min(recolor.x, window.innerWidth - 130) }}
          >
            {CATEGORY_PALETTE.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => { onRecolorCategory?.(recolor.id, c); setRecolor(null); }}
                className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${recolor.color === c ? 'ring-2 ring-offset-1 ring-[#3d3429]' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
            <button
              type="button"
              title={language === 'en' ? 'No color' : 'ללא צבע'}
              onClick={() => { onRecolorCategory?.(recolor.id, null); setRecolor(null); }}
              className={`w-7 h-7 rounded-full ring-1 ring-black/10 transition-transform hover:scale-110 ${!recolor.color ? 'ring-2 ring-offset-1 ring-[#3d3429]' : ''}`}
              style={CHECKERBOARD}
            />
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

import { User, BookOpen, Search, Filter, X, Settings } from 'lucide-react';
import { RecipeCard } from './RecipeCard';
import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const categories = ['All', 'MAIN', 'SNACK', 'SPECIAL', 'DESSERT']

const categoryTranslations = {
  'MAIN': 'עיקרית',
  'DESSERT': 'קינוח',
  'SNACK': 'חטיף',
  'SPECIAL': 'מיוחד'
}

export function UserProfile({
  user,
  recipes,
  language,
  onSelectRecipe,
  viewingProfile,
  cookCounts = {},
  apiBase = '/api',
  onLogout
}) {
  const isRtl = language === 'he';
  const [viewingRecipes, setViewingRecipes] = useState([]);
  const [ownProfile, setOwnProfile] = useState(null);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Determine which profile we're viewing
  const currentProfile = viewingProfile || user;
  const displayRecipes = viewingProfile ? viewingRecipes : recipes;

  // Prefer custom username over Google name
  const displayName = ownProfile?.username || currentProfile?.username || currentProfile?.user_metadata?.full_name || currentProfile?.email?.split('@')[0] || 'User';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortBy, setSortBy] = useState('most-prepped');
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Fetch viewing profile's public recipes
  useEffect(() => {
    if (viewingProfile) {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      fetch(`${supabaseUrl}/rest/v1/recipes?user_id=eq.${viewingProfile.id}&visibility=eq.public&select=*`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      })
        .then(res => res.json())
        .then(data => {
          const formatted = (data || []).map(recipe => ({
            id: recipe.id,
            title: recipe.name,
            category: recipe.category,
            description: recipe.description,
            ingredients: recipe.ingredients,
            instructions: recipe.instructions,
            created_at: recipe.created_at
          }));
          setViewingRecipes(formatted);
        })
        .catch(err => console.error('[Data] Failed to fetch viewing profile recipes:', err.message));
    }
  }, [viewingProfile]);

  useEffect(() => {
    if (!viewingProfile && user) {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      fetch(`${supabaseUrl}/rest/v1/users?id=eq.${user.id}&select=username,bio`, {
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
      })
        .then(res => res.json())
        .then(data => { if (data?.[0]) setOwnProfile(data[0]); })
        .catch(() => {});
    }
  }, [user, viewingProfile]);

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
        body: JSON.stringify({ username: editUsername.trim(), bio: editBio.trim() })
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setOwnProfile(prev => ({ ...prev, username: editUsername.trim(), bio: editBio.trim() }));
      setShowEditProfile(false);
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm(language === 'en'
      ? 'This will permanently delete your account and all your recipes. This cannot be undone. Are you sure?'
      : 'פעולה זו תמחק לצמיתות את חשבונך וכל המתכונים שלך. לא ניתן לבטל. האם אתה בטוח?'
    )) return;
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
      alert('Failed to delete account: ' + err.message);
    }
  };

  const filteredRecipes = displayRecipes
    .filter(recipe => {
      const matchesSearch = recipe.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           recipe.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || recipe.category === selectedCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      if (sortBy === 'alphabetical') return a.title.localeCompare(b.title);
      if (sortBy === 'most-prepped') return (cookCounts[b.id] || 0) - (cookCounts[a.id] || 0);
      return new Date(b.created_at) - new Date(a.created_at); // date (newest first)
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
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
          {/* Avatar */}
          <div className="flex-shrink-0">
            <div className="w-24 sm:w-32 h-24 sm:h-32 rounded-full bg-[#ce743e]/10 flex items-center justify-center border-4 border-[#ce743e]/20">
              <User className="w-12 sm:w-16 h-12 sm:h-16 text-[#ce743e]" />
            </div>
          </div>

          {/* Profile Info */}
          <div className="flex-1 pt-0 sm:pt-4">
            <h1 className={`text-2xl sm:text-3xl font-bold text-[#3d3429] mb-4 sm:mb-6 break-all whitespace-normal text-center ${isRtl ? 'sm:text-right' : 'sm:text-left'}`} style={{ direction: isRtl ? 'rtl' : 'ltr' }}>{displayName}</h1>

            {/* Stats */}
            <div className="flex justify-center sm:justify-start gap-4 sm:gap-8 mt-4 sm:mt-6">
              <div className="text-center">
                <div className="text-lg sm:text-2xl font-bold text-[#ce743e]">{displayRecipes.length}</div>
                <div className="text-xs text-[#7a7265] uppercase tracking-wide">
                  {language === 'en' ? 'Recipes' : 'מתכונים'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-lg sm:text-2xl font-bold text-[#ce743e]">0</div>
                <div className="text-xs text-[#7a7265] uppercase tracking-wide">
                  {language === 'en' ? 'Followers' : 'עוקבים'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-lg sm:text-2xl font-bold text-[#ce743e]">0</div>
                <div className="text-xs text-[#7a7265] uppercase tracking-wide">
                  {language === 'en' ? 'Following' : 'נעקבים'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="mb-8 flex items-center">
        <div className="relative flex-1 z-10">
          <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-[#7a7265] ${language === 'he' ? 'right-4' : 'left-4'}`} />
          <input 
            type="text" 
            placeholder={language === 'en' ? 'Search recipes...' : '...חפש מתכונים'} 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            className={`w-full py-3 bg-white border border-[#e8e4dc] rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#b86535]/20 ${language === 'he' ? 'pr-11 pl-14 sm:pl-32 text-right' : 'pl-11 pr-14 sm:pr-32'}`}
          />

          {/* Category Filter */}
          <div className={`absolute top-1/2 -translate-y-1/2 ${language === 'he' ? 'left-2' : 'right-2'}`}>
            <button
              onClick={() => setIsCategoryMenuOpen(!isCategoryMenuOpen)}
              className={`flex items-center gap-1.5 py-1.5 px-3 rounded-xl transition-colors ${
                selectedCategory !== 'All'
                  ? 'bg-[#ce743e]/10 text-[#ce743e] font-semibold'
                  : 'bg-[#f5f3ef] text-[#7a7265] hover:bg-[#e8e4dc]'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-xs font-medium">
                {selectedCategory !== 'All'
                  ? (language === 'en' ? selectedCategory : categoryTranslations[selectedCategory] || selectedCategory)
                  : (language === 'en' ? 'Filter' : 'סינון')}
              </span>
            </button>

            {isCategoryMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsCategoryMenuOpen(false)} />
                <div className={`absolute top-full mt-3 z-20 bg-white rounded-2xl border border-[#e8e4dc] shadow-lg overflow-hidden min-w-[180px] ${language === 'he' ? 'left-0' : 'right-0'}`}>
                  <div className="px-4 py-2 text-xs font-semibold text-[#7a7265] uppercase tracking-wide border-b border-[#f5f3ef]">
                    {language === 'en' ? 'Category' : 'קטגוריה'}
                  </div>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => { setSelectedCategory(cat); setIsCategoryMenuOpen(false); }}
                      className={`w-full px-4 py-2.5 text-sm transition-colors ${
                        selectedCategory === cat ? 'bg-[#ce743e]/10 text-[#ce743e] font-semibold' : 'text-[#3d3429] hover:bg-[#f5f3ef]'
                      } ${isRtl ? 'text-right' : 'text-left'}`}
                    >
                      {cat === 'All' ? (language === 'en' ? 'All' : 'הכל') : (language === 'en' ? cat : categoryTranslations[cat] || cat)}
                    </button>
                  ))}
                  <div className="px-4 py-2 text-xs font-semibold text-[#7a7265] uppercase tracking-wide border-t border-b border-[#f5f3ef] mt-1">
                    {language === 'en' ? 'Sort by' : 'מיון לפי'}
                  </div>
                  {[
                    { value: 'most-prepped', en: 'Most prepped', he: 'הוכן הכי הרבה' },
                    { value: 'date', en: 'Date added', he: 'תאריך הוספה' },
                    { value: 'alphabetical', en: 'Alphabetical', he: 'א-ב' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => { setSortBy(opt.value); setIsCategoryMenuOpen(false); }}
                      className={`w-full px-4 py-2.5 text-sm transition-colors ${
                        sortBy === opt.value ? 'bg-[#ce743e]/10 text-[#ce743e] font-semibold' : 'text-[#3d3429] hover:bg-[#f5f3ef]'
                      } ${isRtl ? 'text-right' : 'text-left'}`}
                    >
                      {language === 'en' ? opt.en : opt.he}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Recipes Grid */}
      {filteredRecipes.length > 0 ? (
        <div style={{ direction: isRtl ? 'rtl' : 'ltr' }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filteredRecipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              language={language}
              onSelect={onSelectRecipe}
              showCategory={false}
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
      {/* Settings Modal */}
      {showSettings && (
        <>
          <div
            className="fixed inset-0 z-40 backdrop-blur-sm bg-black/30"
            onClick={() => { setShowSettings(false); setShowEditProfile(false); }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowSettings(false)}>
            <div
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden"
              style={{ direction: isRtl ? 'rtl' : 'ltr' }}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-[#e8e4dc]">
                <h2 className="text-lg font-semibold text-[#3d3429]">
                  {language === 'en' ? 'Settings' : 'הגדרות'}
                </h2>
                <button
                  onClick={() => { setShowSettings(false); setShowEditProfile(false); }}
                  className="p-2 text-[#7a7265] hover:text-[#3d3429] hover:bg-[#f5f3ef] rounded-xl transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="px-6 py-4 space-y-1">
                {showEditProfile ? (
                  <div className="space-y-4 py-2">
                    <div>
                      <label className="block text-xs font-semibold text-[#7a7265] uppercase tracking-wide mb-1.5">
                        {language === 'en' ? 'Username' : 'שם משתמש'}
                      </label>
                      <input
                        type="text"
                        value={editUsername}
                        onChange={e => setEditUsername(e.target.value)}
                        maxLength={32}
                        className="w-full px-4 py-2.5 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] focus:outline-none focus:ring-2 focus:ring-[#b86535]/20 focus:border-[#b86535] text-sm transition-all"
                      />
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
                        className="w-full px-4 py-2.5 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] focus:outline-none focus:ring-2 focus:ring-[#b86535]/20 focus:border-[#b86535] text-sm transition-all resize-none"
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
                        disabled={isSaving || !editUsername.trim()}
                        className="flex-1 px-4 py-2.5 bg-[#ce743e] text-white rounded-2xl text-sm font-medium hover:bg-[#b86535] disabled:opacity-50 transition-colors"
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
                ) : (
                  <>
                    <p className="text-xs font-semibold text-[#7a7265] uppercase tracking-wide px-2 pb-1">
                      {language === 'en' ? 'Account' : 'חשבון'}
                    </p>
                    <button
                      onClick={() => {
                        setEditUsername(ownProfile?.username || user?.user_metadata?.full_name || '');
                        setEditBio(ownProfile?.bio || '');
                        setShowEditProfile(true);
                      }}
                      className="w-full text-start px-4 py-3 rounded-2xl text-[#3d3429] hover:bg-[#f5f3ef] transition-colors text-sm font-medium"
                    >
                      {language === 'en' ? 'Edit profile' : 'עריכת פרופיל'}
                    </button>
                    <button className="w-full text-start px-4 py-3 rounded-2xl text-[#3d3429] hover:bg-[#f5f3ef] transition-colors text-sm font-medium">
                      {language === 'en' ? 'Privacy' : 'פרטיות'}
                    </button>
                  </>
                )}
              </div>

            </div>
          </div>
        </>
      )}
    </div>
  );
}

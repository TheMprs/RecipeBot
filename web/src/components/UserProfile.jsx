import { User, BookOpen, Search, Filter, X } from 'lucide-react';
import { RecipeCard } from './RecipeCard';
import { useState, useEffect } from 'react';

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
  viewingProfile
}) {
  const isRtl = language === 'he';
  const [viewingRecipes, setViewingRecipes] = useState([]);
  
  // Determine which profile we're viewing
  const currentProfile = viewingProfile || user;
  const displayRecipes = viewingProfile ? viewingRecipes : recipes;
  
  // Get display name from Google metadata or fallback to email
  const displayName = currentProfile?.user_metadata?.full_name || currentProfile?.username || currentProfile?.email?.split('@')[0] || 'User';
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  
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
            instructions: recipe.instructions
          }));
          setViewingRecipes(formatted);
        })
        .catch(err => console.error('[Data] Failed to fetch viewing profile recipes:', err.message));
    }
  }, [viewingProfile]);
  
  // Filter recipes by search and category
  const filteredRecipes = displayRecipes.filter(recipe => {
    const matchesSearch = recipe.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         recipe.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || recipe.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });
  
  return (
    <div>
      {/* Profile Header */}
      <div className="bg-white rounded-2xl border border-[#e8e4dc] p-4 sm:p-6 mb-8">
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
        <div className="relative flex-1 z-40">
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
                {selectedCategory === 'All' 
                  ? (language === 'en' ? 'Filter' : 'סינון')
                  : (language === 'en' ? selectedCategory : categoryTranslations[selectedCategory] || selectedCategory)}
              </span>
            </button>

            {isCategoryMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsCategoryMenuOpen(false)} />
                <div className={`absolute top-full mt-3 z-20 bg-white rounded-2xl border border-[#e8e4dc] shadow-lg overflow-hidden min-w-[160px] ${language === 'he' ? 'left-0' : 'right-0'}`}>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => {
                        setSelectedCategory(cat)
                        setIsCategoryMenuOpen(false)
                      }}
                      className={`w-full px-4 py-2.5 text-sm text-left transition-colors ${
                        selectedCategory === cat
                          ? 'bg-[#ce743e]/10 text-[#ce743e] font-semibold'
                          : 'text-[#3d3429] hover:bg-[#f5f3ef]'
                      } ${isRtl ? 'text-right' : 'text-left'}`}
                    >
                      {cat === 'All' ? (language === 'en' ? 'All' : 'הכל') : (language === 'en' ? cat : categoryTranslations[cat] || cat)}
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
    </div>
  );
}

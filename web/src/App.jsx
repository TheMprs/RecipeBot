import { useState, useEffect } from 'react'
import { BookOpen, Plus, Search, Filter, X, Link as LinkIcon } from 'lucide-react'
import { RecipeCard } from './components/RecipeCard'
import { RecipeDetail } from './components/RecipeDetail'
import { RecipeForm } from './components/RecipeForm'
import './global.css'

const categories = ['All', 'MAIN', 'SNACK', 'SPECIAL', 'DESSERT']

const categoryTranslations = {
  'MAIN': 'עיקרית',
  'DESSERT': 'קינוח',
  'SNACK': 'חטיף',
  'SPECIAL': 'מיוחד'
}

function App() {
  const [recipes, setRecipes] = useState([])
  const [language, setLanguage] = useState('he')
  const [viewMode, setViewMode] = useState('dashboard')
  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const [editingRecipe, setEditingRecipe] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false)
  const [showUrlModal, setShowUrlModal] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [isScrapingLoading, setIsScrapingLoading] = useState(false)

  const isRtl = language === 'he'

  // 1. FETCH ALL RECIPE NAMES AND DETAILS
  const fetchRecipes = () => {
    fetch('/api/recipes')
      .then(response => response.json())
      .then(async (data) => {
        // Fetch full details for each recipe
        const fullRecipes = await Promise.all(
          data.map(name => 
            fetch(`/api/recipes/${encodeURIComponent(name)}`)
              .then(res => res.json())
              .catch(error => {
                console.error(`Error fetching ${name}:`, error);
                return { name, description: '' };
              })
          )
        );
        setRecipes(fullRecipes);
      })
      .catch(error => console.error("Error fetching:", error))
  }

  useEffect(() => {
    fetchRecipes()
    
    // Check for shared recipe in URL
    const params = new URLSearchParams(window.location.search)
    const recipeName = params.get('recipe')
    if (recipeName) {
      fetch(`/api/recipes/${encodeURIComponent(recipeName)}`)
        .then(res => {
          if (!res.ok) throw new Error('Recipe not found')
          return res.json()
        })
        .then(data => {
          setSelectedRecipe(data)
          setViewMode('detail')
          window.history.pushState({}, '', `?recipe=${encodeURIComponent(data.title || data.name)}`)
        })
        .catch(console.error)
    }
  }, [])

  // 2. FETCH SPECIFIC RECIPE DETAILS WHEN CLICKED
  const handleSelectRecipe = (recipeObj) => {
    fetch(`/api/recipes/${encodeURIComponent(recipeObj.title)}`)
      .then(res => res.json())
      .then(fullRecipe => {
        // Convert string ingredients/instructions into arrays for the UI
        const formatArray = (text) => typeof text === 'string' ? text.split('\n').filter(i => i.trim()) : text;
        
        const recipeData = {
          title: fullRecipe.name || recipeObj.title,
          description: fullRecipe.description || '',
          category: fullRecipe.category || 'MAIN',
          ingredients: formatArray(fullRecipe.ingredients) || [],
          instructions: formatArray(fullRecipe.instructions) || []
        };
        setSelectedRecipe(recipeData);
        setViewMode('detail');
        window.history.pushState({}, '', `?recipe=${encodeURIComponent(recipeData.title)}`);
      });
  }

  // 3. SAVE A NEW RECIPE
  const handleAddRecipe = async (newRecipe) => {
    // Convert arrays back to strings for your Java backend
    const backendFormat = {
      name: newRecipe.title,
      category: newRecipe.category,
      description: newRecipe.description,
      ingredients: newRecipe.ingredients,
      instructions: newRecipe.instructions,
    };

    const method = editingRecipe ? 'PUT' : 'POST';
    const url = editingRecipe ? `/api/recipes/${encodeURIComponent(editingRecipe.title)}` : '/api/recipes';
    
    console.log(`[DEBUG] ${method} request to ${url}`, backendFormat, 'editingRecipe:', editingRecipe);

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backendFormat)
    });

    if (res.ok) {
      fetchRecipes();
      setViewMode('dashboard');
      setEditingRecipe(null);
    } else {
      const errorText = await res.text();
      console.error(`Error: ${res.status}`, errorText);
    }
  }

  // 3b. EDIT RECIPE
  const handleEditRecipe = (recipe) => {
    setEditingRecipe(recipe);
    setViewMode('add');
  }

  const handleBack = () => {
    setSelectedRecipe(null)
    setEditingRecipe(null)
    setViewMode('dashboard')
    window.history.pushState({}, '', window.location.pathname)
  }

  // 4. DELETE RECIPE
  const handleDeleteRecipe = async (recipe) => {
    if(window.confirm(`Delete ${recipe.title}?`)) {
      const res = await fetch(`/api/recipes/${encodeURIComponent(recipe.title)}`, { method: 'DELETE' });
      if (res.ok) {
        fetchRecipes();
        setViewMode('dashboard');
      }
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
      const res = await fetch('/api/recipes/scrape', {
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
    const formatArray = (text) => typeof text === 'string' ? text.split('\n').filter(i => i.trim()) : text;
    return {
      id: recipe.name || recipe.title,
      title: recipe.name || recipe.title,
      description: recipe.description || '',
      category: recipe.category || 'MAIN',
      ingredients: formatArray(recipe.ingredients) || [],
      instructions: formatArray(recipe.instructions) || []
    };
  }).filter(recipe => 
    recipe.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
    (selectedCategory === 'All' || recipe.category === selectedCategory)
  );

  return (
    <div className="min-h-screen bg-[#f5f3ef]">
      <header className="sticky top-0 z-30 bg-[#faf9f7]/95 backdrop-blur-md border-b border-[#e8e4dc]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
            <button onClick={handleBack} className="flex items-center gap-2 group">
              <div className="w-10 h-10 rounded-2xl bg-[#ce743e] flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <h1 className="text-lg sm:text-xl font-semibold text-[#3d3429]">Yuval's Recipe Book</h1>
                <p className="text-xs text-[#7a7265]">זה בתהליך לא לשפוט</p>
              </div>
            </button>
            <button onClick={() => setViewMode('add')} 
              className={`flex items-center gap-2 text-[#64748b] hover:text-[#1e293b] transition-colors ${language === 'he' ? 'flex-row-reverse' : ''}`}>
              <Plus className="w-5 h-5"/>
              <span className="hidden sm:inline font-medium">{language === 'en' ? 'Add Recipe' : 'הוסף מתכון'}</span>
            </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {viewMode === 'dashboard' && (
          <div className="transition-all duration-300 ease-out opacity-100 translate-y-0">
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
               
              {displayRecipes.length > 0 ? (
                <div style={{ direction: isRtl ? 'rtl' : 'ltr' }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6" >
                  {displayRecipes.map((recipe) => (
                    <RecipeCard 
                      key={recipe.id} 
                      recipe={recipe} 
                      language={language}
                      onSelect={handleSelectRecipe} 
                      showCategory={false} 
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <p className="text-[#7a7265]">No recipes found. Add one!</p>
                </div>
              )}
          </div>
        )}

        {viewMode === 'detail' && selectedRecipe && (
          <div className="transition-all duration-300 ease-out opacity-100 translate-y-0">
            <RecipeDetail 
              recipe={selectedRecipe} 
              onBack={handleBack} 
              language={language}
              onEdit={handleEditRecipe} 
              onDelete={handleDeleteRecipe} />
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
            <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-lg">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-[#3d3429]">Import Recipe from URL</h2>
                <button onClick={() => setShowUrlModal(false)} className="text-[#7a7265] hover:text-[#3d3429] transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#3d3429] mb-2">Recipe URL</label>
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://example.com/recipe"
                    className="w-full px-4 py-3 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#b86535]/20 focus:border-[#b86535] transition-all"
                  />
                  <p className="text-xs text-[#7a7265] mt-2">Paste the URL of a recipe webpage. Our AI will extract the recipe details automatically.</p>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setShowUrlModal(false)}
                    className="flex-1 px-4 py-3 bg-[#f5f3ef] text-[#3d3429] rounded-xl hover:bg-[#e8e4dc] transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleScrapeFromUrl}
                    disabled={isScrapingLoading}
                    className="flex-1 px-4 py-3 bg-[#b86535] text-white rounded-xl hover:bg-[#a5582d] disabled:bg-[#b86535]/50 transition-colors font-medium flex items-center justify-center gap-2"
                  >
                    {isScrapingLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Importing...</span>
                      </>
                    ) : (
                      <span>Import</span>
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
  )
}

export default App

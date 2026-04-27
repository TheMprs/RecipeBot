import { useState, useEffect } from 'react'
import { BookOpen, Plus, Search, Filter, X } from 'lucide-react'
import { RecipeCard } from './components/RecipeCard'
import { RecipeDetail } from './components/RecipeDetail'
import { RecipeForm } from './components/RecipeForm'
import './global.css'

const categories = ['All', 'MAIN', 'SNACK', 'LUNCH', 'SPECIAL', 'DESSERT']

function App() {
  const [recipes, setRecipes] = useState([])
  const [viewMode, setViewMode] = useState('dashboard')
  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const [editingRecipe, setEditingRecipe] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false)

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
  }, [])

  // 2. FETCH SPECIFIC RECIPE DETAILS WHEN CLICKED
  const handleSelectRecipe = (recipeObj) => {
    fetch(`/api/recipes/${encodeURIComponent(recipeObj.title)}`)
      .then(res => res.json())
      .then(fullRecipe => {
        // Convert string ingredients/instructions into arrays for the UI
        const formatArray = (text) => typeof text === 'string' ? text.split('\n').filter(i => i.trim()) : text;
        
        setSelectedRecipe({
          title: fullRecipe.name || recipeObj.title,
          description: fullRecipe.description || '',
          category: fullRecipe.category || 'MAIN',
          direction: fullRecipe.direction || 'ltr',
          ingredients: formatArray(fullRecipe.ingredients) || [],
          instructions: formatArray(fullRecipe.instructions) || []
        });
        setViewMode('detail');
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
      direction: editingRecipe?.direction || 'ltr'
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

  const handleBack = () => {
    setViewMode('dashboard')
    setSelectedRecipe(null)
  }

  // Bridge: Map recipe data to display format
  const displayRecipes = recipes.map(recipe => {
    const formatArray = (text) => typeof text === 'string' ? text.split('\n').filter(i => i.trim()) : text;
    return {
      id: recipe.name || recipe.title,
      title: recipe.name || recipe.title,
      description: recipe.description || '',
      category: recipe.category || 'MAIN',
      direction: recipe.direction || 'ltr',
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
              <div className="w-10 h-10 rounded-2xl bg-[#c4785a] flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <div className="hidden sm:block text-left">
                <h1 className="text-xl font-semibold text-[#3d3429]">My Recipe Book</h1>
                <p className="text-xs text-[#7a7265]">Homemade goodness</p>
              </div>
            </button>
            <button onClick={() => setViewMode('add')} className="flex items-center gap-2 px-4 py-2.5 bg-[#c4785a] text-white rounded-xl hover:bg-[#b56a4d] transition-colors shadow-sm">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline font-medium">Add Recipe</span>
            </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {viewMode === 'dashboard' && (
          <div className="transition-all duration-300 ease-out opacity-100 translate-y-0">
             <div className="mb-8 flex items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7a7265]" />
                    <input type="text" placeholder="Search recipes..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-white border border-[#e8e4dc] rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#c4785a]/20" />
                  </div>
              </div>
              
              {displayRecipes.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {displayRecipes.map((recipe) => (
                    <RecipeCard key={recipe.id} recipe={recipe} onSelect={handleSelectRecipe} onDelete={handleDeleteRecipe} onEdit={handleEditRecipe} showCategory={false} />
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
          <div style={{ direction: selectedRecipe.direction === 'rtl' ? 'rtl' : 'ltr' }} className="transition-all duration-300 ease-out opacity-100 translate-y-0">
            <RecipeDetail recipe={selectedRecipe} onBack={handleBack} onEdit={handleEditRecipe} onDelete={handleDeleteRecipe} />
          </div>
        )}

        {viewMode === 'add' && (
          <div className="transition-all duration-300 ease-out opacity-100 translate-y-0">
            <RecipeForm editingRecipe={editingRecipe} onBack={handleBack} onSave={handleAddRecipe} />
          </div>
        )}
      </main>
    </div>
  )
}

export default App
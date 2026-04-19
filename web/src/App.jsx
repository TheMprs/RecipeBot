import { useState, useEffect } from 'react'
import RecipeCard from './pages/recipeCard'
import RecipeForm from './pages/RecipeForm'
import './global.css'

function App() {
  const [recipes, setRecipes] = useState([])
  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const [isAdding, setIsAdding] = useState(false)
  
  // useEffect runs this code automatically when the page loads
  const fetchRecipes = () => {
    fetch('http://localhost:8080/api/recipes')
      .then(response => response.json())
      .then(data => setRecipes(data))
      .catch(error => console.error("Error fetching recipes:", error))
  }
  
  useEffect(() => {
    fetchRecipes()
  }, [])

  // if we're adding a new recipe, show the form
  if(isAdding) {
    return (
      <RecipeForm 
        onBack={() => setIsAdding(false)} 
        onSuccess={() => {
          setIsAdding(false)
          fetchRecipes() // Refresh the list after adding
        }} 
      />
    )
  }


  // if a recipe is selected, show the details page
  if(selectedRecipe) {
    return (
      <RecipeCard 
        recipeName={selectedRecipe} 
        onBack={() => setSelectedRecipe(null)} 
      />
    )
  }

  // default view: list of recipes
  return (
    <div style={{ padding: '40px'}}>
      <h1>🍽️ My Recipe Book</h1>
      <button className="add-btn" onClick={() => setIsAdding(true)}>
        + Add New Recipe
      </button>

      <div> 
        {recipes.map((recipe, index) => (
              <div 
                key={index}
                onClick={() => setSelectedRecipe(recipe)}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#eee'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f9f9f9'}
              >
                  <strong>  {recipe}  </strong> 
              </div>
            ))}
      </div>
    </div>
  )
}

export default App
import { useState, useEffect } from 'react'
import RecipeCard from './pages/recipeCard'
import './global.css'

function App() {
  const [recipes, setRecipes] = useState([])
  const [selectedRecipe, setSelectedRecipe] = useState(null)

  // useEffect runs this code automatically when the page loads
  useEffect(() => {
    // call Javalin API
    fetch('http://localhost:8080/api/recipes')
      .then(response => response.json()) // convert response to JSON
      .then(data => setRecipes(data))    // save to state
      .catch(error => console.error("Error fetching recipes:", error))
  }, [])

  // if a recipe is selected, show the details page
  if(selectedRecipe) {
    return (
      <RecipeCard 
        recipeName={selectedRecipe} 
        onBack={() => setSelectedRecipe(null)} 
      />
    )
  }


  return (
    <div style={{ padding: '40px'}}>
      <h1>🍽️ My Recipe Book</h1>
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
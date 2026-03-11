import { useState, useEffect } from 'react'
import '../global.css'

export default function RecipeCard({ recipeName, onBack }) {
    const [details, setDetails] = useState(null)

    useEffect(() => {
        // Fetch full recipe details from the API
        fetch(`http://localhost:8080/api/recipes/${recipeName}`)
            .then(response => response.json())
            .then(data => setDetails(data))
            .catch(error => console.error("Error fetching recipe details:", error))
    }, [recipeName])

    if(!details) return <p>Loading recipe details...</p>    

    return (
        <div style={{ padding: '20px'}}>
        <button onClick={onBack}> ← Back </button>
        
        <h2>🍳 {recipeName}</h2>
        <p>{details.description}</p>
        
        <h3>Ingredients:</h3>
        <p style={{ whiteSpace: 'pre-wrap' }}>{details.ingredients}</p>
        
        <h3>Instructions:</h3>
        <p style={{ whiteSpace: 'pre-wrap' }}>{details.instructions}</p>
        
        </div>
    )
}
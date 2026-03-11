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
    
    // language logic
    const dir = details.direction || details.language || 'ltr';    
    const isRtl = dir === 'rtl';

    // Helper to render sections with lines
    const renderSection = (text) => {
        // Safety check: If it's null or undefined, return nothing
        if (!text) return null;

        let lines = [];
        
        // Handle both Strings and Arrays
        if (typeof text === 'string') {
            lines = text.split('\n');
        } else if (Array.isArray(text)) {
            lines = text;
        } else {
            return null; // Not a string or array, can't render
        }

        // Clean up empty lines and render
        const cleanLines = lines.filter(l => l && typeof l === 'string' && l.trim() !== "");
        
        return cleanLines.map((line, index) => (
            <div key={index}>
                <p style={{ margin: '10px 0' }}>{line}</p>
                {index < cleanLines.length - 1 && <hr style={{ border: '0', borderTop: '1px solid #eee' }} />}
            </div>
        ));
    };

    return (
        <div style={{ padding: '20px', direction: dir }}>
            <button onClick={onBack}> ← Back </button>
            
            <h2>🍳 {recipeName}</h2>
            <p>{details.description}</p>
            
            <h3>Ingredients:</h3>
            <div style={{ whiteSpace: 'pre-wrap' }}>
                {renderSection(details.ingredients)}
            </div>
            
            <h3>Instructions:</h3>
            <div style={{ whiteSpace: 'pre-wrap' }}>
                {renderSection(details.instructions)}
            </div>
        </div>
    )
}
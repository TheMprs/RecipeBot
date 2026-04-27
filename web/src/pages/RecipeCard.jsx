import { useState, useEffect } from 'react'
import '../global.css'

export default function RecipeCard({ recipeName, onBack, onDeleteSuccess }) {
    const [details, setDetails] = useState(null)

    useEffect(() => {
        // Fetch full recipe details from the API
        fetch(`/api/recipes/${recipeName}`)
            .then(response => response.json())
            .then(data => setDetails(data))
            .catch(error => console.error("Error fetching recipe details:", error))
    }, [recipeName])

    if(!details) return <p>Loading recipe details...</p>    
    
    // language logic
    const dir = details.direction || details.language || 'ltr';    
    const isRtl = dir === 'rtl';

    // Call the Java DELETE API
    const handleDelete = async () => {
        // Add a safety confirmation pop-up
        if (!window.confirm(isRtl ? `האם אתה בטוח שברצונך למחוק את "${recipeName}"?` : `Are you sure you want to delete "${recipeName}"?`)) {
            return;
        }

        try {
            const safeName = encodeURIComponent(recipeName); // <--- ADD THIS
            const response = await fetch(`/api/recipes/${safeName}`, { // <--- USE IT HERE
                method: 'DELETE'
            });
            
            if (response.ok) {
                onDeleteSuccess(); // Tell App.jsx to close the card and refresh the list
            } else {
                alert("Failed to delete recipe. Check Java console.");
            }
        } catch (error) {
            console.error("Error deleting recipe:", error);
        }
    };

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
                <p style={{ margin: '14px 0', lineHeight: '1.6', color: 'var(--text-main)' }}>• {line}</p>
                {index < cleanLines.length - 1 && <hr style={{ border: '0', borderTop: '1px solid #eee' }} />}
            </div>
        ));
    };

    return (
       <div className="app-container" dir ={dir}>
        <div className="header-actions">
            <button className="btn-secondary" onClick={onBack} style={{ margin: 0 }}> 
                {isRtl ? '→ חזור' : '← Back'} 
            </button>
            
            <button className="btn-danger" onClick={handleDelete} style={{ margin: 0 }}>
                    {isRtl ? 'מחק 🗑️' : 'Delete 🗑️'}
            </button>
        </div>

            <h2 style={{ fontSize: '2rem', marginBottom: '8px' }}>
                🍳 {details.name || recipeName}
            </h2>
            
            <p style={{ fontStyle: 'italic', color: 'var(--text-muted)', marginBottom: '35px', lineHeight: '1.5' }}>
                {details.description}
            </p>
            
            <div style={{ marginBottom: '40px' }}>
                <h3 style={{ borderBottom: '2px solid var(--border)', paddingBottom: '10px', color: 'var(--text-muted)', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {isRtl ? 'מצרכים' : 'Ingredients'}
                </h3>
                <div>
                    {renderSection(details.ingredients)}
                </div>
            </div>
            
            <div>
                <h3 style={{ borderBottom: '2px solid var(--border)', paddingBottom: '10px', color: 'var(--text-muted)', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {isRtl ? 'הוראות' : 'Instructions'}
                </h3>
                <div>
                    {renderSection(details.instructions)}
                </div>
            </div>
        </div>
    )
}
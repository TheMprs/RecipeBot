import { useState } from 'react';
import '../global.css';

export default function RecipeForm({ onBack, onSuccess }) {
    // 1. Manage the form state
    const [formData, setFormData] = useState({
        name: '',
        category: 'MAIN',
        description: '',
        ingredients: '',
        instructions: '',
        direction: 'ltr' // Default to English/LTR
    });

    // 2. Handle typing
    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    // 3. Handle Submit (Send to Java API)
    const handleSubmit = async (e) => {
        e.preventDefault();
        const payload = {
            ...formData,
            ingredients: formData.ingredients
                                .split('\n')
                                .map(line => line.trim())
                                .filter(line => line),
            instructions: formData.instructions
                                .split('\n')
                                .map(line => line.trim())
                                .filter(line => line)
        };

        try {
            const response = await fetch('/api/recipes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (response.ok) {
                onSuccess(); // Go back to the main list after saving
            } else {
                alert("Failed to save recipe. Check the Java console.");
            }
        } catch (error) {
            console.error("Error saving recipe:", error);
        }
    };

    const isRtl = formData.direction === 'rtl';

    return (
        <div className="form-container" style={{ direction: formData.direction }}>
            <button className="btn-secondary" onClick={onBack} type="button">
                {isRtl ? '→ ביטול' : '← Cancel'}
            </button>

            <h2>{isRtl ? 'הוסף מתכון חדש' : 'Add New Recipe'}</h2>

            <form onSubmit={handleSubmit} className="recipe-form">
                
                <div className="form-group">
                    <label>{isRtl ? 'שם המתכון:' : 'Recipe Name:'}</label>
                    <input 
                        type="text" name="name" required
                        value={formData.name} onChange={handleChange} 
                    />
                </div>

                <div className="form-group">
                    <label>{isRtl ? 'קטגוריה:' : 'Category:'}</label>
                    <select name="category" value={formData.category} onChange={handleChange}>
                        {/* CHANGE THESE VALUES TO MATCH YOUR JAVA ENUM EXACTLY */}
                        <option value="MAIN">Main Course</option>
                        <option value="SNACK">Snack</option>
                        <option value="LUNCH">Lunch</option>
                        <option value="SPECIAL">Special</option>
                        <option value="DESSERT">Dessert</option>
                    </select>
                </div>

                <div className="form-group">
                    <label>{isRtl ? 'כיוון טקסט:' : 'Text Direction:'}</label>
                    <select name="direction" value={formData.direction} onChange={handleChange}>
                        <option value="ltr">English (Left-to-Right)</option>
                        <option value="rtl">עברית (Right-to-Left)</option>
                    </select>
                </div>

                <div className="form-group">
                    <label>{isRtl ? 'תיאור קצר:' : 'Description:'}</label>
                    <input 
                        type="text" name="description" 
                        value={formData.description} onChange={handleChange} 
                    />
                </div>

                <div className="form-group">
                    <label>{isRtl ? 'מצרכים (שורה לכל מצרך):' : 'Ingredients (One per line):'}</label>
                    <textarea 
                        name="ingredients" rows="5" required
                        value={formData.ingredients} onChange={handleChange} 
                    />
                </div>

                <div className="form-group">
                    <label>{isRtl ? 'הוראות (שורה לכל שלב):' : 'Instructions (One per line):'}</label>
                    <textarea 
                        name="instructions" rows="6" required
                        value={formData.instructions} onChange={handleChange} 
                    />
                </div>

                <button type="submit" className="btn-primary" style={{ marginTop: '10px' }}>
                    {isRtl ? 'שמור מתכון' : 'Save Recipe'}
                </button>
            </form>
        </div>
    );
}
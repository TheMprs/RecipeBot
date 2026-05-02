import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, ChevronDown, LinkIcon, X } from 'lucide-react'

// Map display names to backend category enums
const categoryMap = {
  'Main': 'MAIN',
  'Dessert': 'DESSERT',
  'Snacks': 'SNACK',
  'Special': 'SPECIAL'
}

const categoryTranslations = {
  'Main': 'עיקרי',
  'Dessert': 'קינוח',
  'Snacks': 'חטיפים',
  'Special': 'מיוחד'
}

const reverseMap = {
  'MAIN': 'Main',
  'DESSERT': 'Dessert',
  'SNACK': 'Snacks',
  'SPECIAL': 'Special'
}

const categories = ['Main', 'Dessert', 'Snacks', 'Special']

export function RecipeForm({ onBack, onSave, editingRecipe, onOpenUrlModal, language = 'en' }) {
  const isRtl = language === 'he'

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Main')
  const [description, setDescription] = useState('')
  const [ingredientsText, setIngredientsText] = useState('')
  const [instructionsText, setInstructionsText] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    if (editingRecipe) {
      setTitle(editingRecipe.title)
      // Map backend enum back to display name
      setCategory(reverseMap[editingRecipe.category] || 'Main')
      setDescription(editingRecipe.description)
      setIngredientsText(editingRecipe.ingredients.join('\n'))
      setInstructionsText(editingRecipe.instructions.join('\n'))
    }
  }, [editingRecipe])

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()

    const ingredients = ingredientsText
      .split('\n')
      .map((i) => i.trim())
      .filter((i) => i.length > 0)

    const instructions = instructionsText
      .split('\n')
      .map((i) => i.trim())
      .filter((i) => i.length > 0)

    onSave({
      title,
      category: categoryMap[category],
      description,
      ingredients,
      instructions,
    })
  }

  return (
    <>
      <div className="max-w-2xl mx-auto">
      

      <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-[#e8e4dc]/50 shadow-sm p-6 sm:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <button onClick={onBack} 
            className="flex items-center gap-2 text-[#7a7265] hover:text-[#3d3429] transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">{language === 'en' ? 'Back' : 'חזור'}</span>
          </button>
          
          <button 
            type="button"
            onClick={onOpenUrlModal}  // Use the prop
            className={`flex items-center gap-2 text-[#7a7265] hover:text-[#c4785a] transition-colors ${isRtl ? 'flex-row-reverse' : ''}`}
            title="Import recipe from link"
          >
            <LinkIcon className="w-5 h-5" />
            <span className="font-medium text-sm">{language === 'en' ? 'Import from link' : 'יבוא מקישור'}</span>
          </button>
        
        </div>
        
        <h1 className="text-center text-3xl font-bold text-[#3d3429]">{language === 'en' ? 'Add New Recipe' : 'הוסף מתכון חדש'}</h1>
        
        <div style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
        <div className="border-t border-[#e8e4dc] pt-2 mt-2"/>

        <div className="space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-[#3d3429] mb-2">{language === 'en' ? 'Recipe Title' : 'שם המתכון'}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={language === 'en' ? "e.g., Grandma's Apple Pie" : 'למשל, חלה של יובל'}
              required
              className="w-full px-4 py-3 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#c4785a]/20 focus:border-[#c4785a] transition-all"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-[#3d3429] mb-2">{language === 'en' ? 'Category' : 'קטגוריה'}</label>
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full px-4 py-3 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#c4785a]/20 focus:border-[#c4785a] transition-all"
              >
                <span>{language === 'en' ? category : categoryTranslations[category] || category}</span>
                <ChevronDown
                  className={`w-4 h-4 text-[#7a7265] transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
                />
              </button>
              <div
                className={`absolute top-full left-0 right-0 mt-2 bg-white border border-[#e8e4dc] rounded-2xl shadow-lg overflow-hidden z-10 transition-all duration-200 origin-top ${
                  isDropdownOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
                }`}
              >
                <div className="p-2">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setCategory(cat)
                        setIsDropdownOpen(false)
                      }}
                      className={`w-full px-4 py-2.5 rounded-xl text-sm transition-colors ${
                        category === cat ? 'bg-[#c4785a] text-white font-medium' : 'text-[#3d3429] hover:bg-[#f5f3ef]'
                        , isRtl ? 'text-right' : 'text-left'
                      }`}
                    >
                      {language === 'en' ? cat : categoryTranslations[cat] || cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-[#3d3429] mb-2">{language === 'en' ? 'Description' : 'תיאור'}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={language === 'en' ? 'A brief description of your recipe...' : 'תיאור קצר של המתכון...'}  
              rows={3}
              className="w-full px-4 py-3 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#c4785a]/20 focus:border-[#c4785a] transition-all resize-none"
            />
          </div>

          {/* Ingredients */}
          <div>
            <label className="block text-sm font-medium text-[#3d3429]">{language === 'en' ? 'Ingredients' : 'רכיבים'}</label>
            <p className="text-xs text-[#7a7265] mb-2">{language === 'en' ? 'Enter each ingredient on a new line' : 'הזן כל רכיב בשורה חדשה'}</p>
            <textarea
              value={ingredientsText}
              onChange={(e) => setIngredientsText(e.target.value)}
              placeholder={language === 'en' ? '2 cups flour \n1 cup sugar \n3 eggs \n1/2 cup butter' 
                                            : '2 כוסות קמח \n1 כוס סוכר \n3 ביצים \n1/2 כוס שמן'}
              rows={6}
              className="w-full px-4 py-3 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#c4785a]/20 focus:border-[#c4785a] transition-all resize-none"
            />
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-sm font-medium text-[#3d3429]">{language === 'en' ? 'Instructions' : 'הוראות'}</label>
            <p className="text-xs text-[#7a7265] mb-2">{language === 'en' ? 'Enter each step on a new line' : 'הזן כל שלב בשורה חדשה'}</p>
            <textarea
              value={instructionsText}
              onChange={(e) => setInstructionsText(e.target.value)}
              placeholder={language === 'en' ? 
                      'Preheat oven to 350F\nMix dry ingredients in a bowl\nAdd wet ingredients and stir\nPour into pan and bake for 30 minutes' 
                    : 'מחמים תנור ל180 מעלות\nמערבבים את הרכיבים היבשים בקערה\nמוסיפים את הרכיבים הרטובים ומערבבים\nיוצקים לתבנית ואופים במשך 30 דקות'}
              rows={8}
              className="w-full px-4 py-3 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#c4785a]/20 focus:border-[#c4785a] transition-all resize-none"
            />
          </div>
        </div>

        {/* Submit Button */}
        <div className="mt-8 flex gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 py-3 px-4 border border-[#e8e4dc] text-[#7a7265] rounded-2xl font-medium hover:bg-[#f5f3ef] transition-colors"
          >
            {language === 'en' ? 'Cancel' : 'בטל'}
          </button>
          <button
            type="submit"
            className="flex-1 py-3 px-4 bg-[#d49277] text-white rounded-2xl font-medium hover:bg-[#b56a4d] transition-colors shadow-sm"
          >
            {editingRecipe ? (language === 'en' ? 'Save Changes' : 'שמור שינויים') 
                          : (language === 'en' ? 'Add Recipe' : 'הוסף מתכון')}
          </button>
        </div>
        </div>
      </form>
      </div>
      
    </>
  )
}
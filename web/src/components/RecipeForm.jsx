import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, ChevronDown } from 'lucide-react'

const categories = ['Breakfast', 'Lunch', 'Dinner', 'Dessert', 'Snacks', 'Drinks']

export function RecipeForm({ onBack, onSave, editingRecipe }) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Dinner')
  const [description, setDescription] = useState('')
  const [ingredientsText, setIngredientsText] = useState('')
  const [instructionsText, setInstructionsText] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    if (editingRecipe) {
      setTitle(editingRecipe.title)
      setCategory(editingRecipe.category)
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
      category,
      description,
      ingredients,
      instructions,
    })
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <button onClick={onBack} className="flex items-center gap-2 text-[#7a7265] hover:text-[#3d3429] transition-colors">
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Back</span>
        </button>
        <h1 className="text-xl font-semibold text-[#3d3429]">{editingRecipe ? 'Edit Recipe' : 'Add New Recipe'}</h1>
        <div className="w-20" />
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-[#e8e4dc]/50 shadow-sm p-6 sm:p-8">
        <div className="space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-[#3d3429] mb-2">Recipe Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Grandma's Apple Pie"
              required
              className="w-full px-4 py-3 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#c4785a]/20 focus:border-[#c4785a] transition-all"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-[#3d3429] mb-2">Category</label>
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full px-4 py-3 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#c4785a]/20 focus:border-[#c4785a] transition-all"
              >
                <span>{category}</span>
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
                      className={`w-full px-4 py-2.5 rounded-xl text-left text-sm transition-colors ${
                        category === cat ? 'bg-[#c4785a] text-white font-medium' : 'text-[#3d3429] hover:bg-[#f5f3ef]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-[#3d3429] mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description of your recipe..."
              rows={3}
              className="w-full px-4 py-3 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#c4785a]/20 focus:border-[#c4785a] transition-all resize-none"
            />
          </div>

          {/* Ingredients */}
          <div>
            <label className="block text-sm font-medium text-[#3d3429] mb-2">Ingredients</label>
            <p className="text-xs text-[#7a7265] mb-2">Enter each ingredient on a new line</p>
            <textarea
              value={ingredientsText}
              onChange={(e) => setIngredientsText(e.target.value)}
              placeholder="2 cups flour&#10;1 cup sugar&#10;3 eggs&#10;1/2 cup butter"
              rows={6}
              className="w-full px-4 py-3 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#c4785a]/20 focus:border-[#c4785a] transition-all resize-none font-mono text-sm"
            />
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-sm font-medium text-[#3d3429] mb-2">Instructions</label>
            <p className="text-xs text-[#7a7265] mb-2">Enter each step on a new line</p>
            <textarea
              value={instructionsText}
              onChange={(e) => setInstructionsText(e.target.value)}
              placeholder="Preheat oven to 350F&#10;Mix dry ingredients in a bowl&#10;Add wet ingredients and stir&#10;Pour into pan and bake for 30 minutes"
              rows={8}
              className="w-full px-4 py-3 bg-[#faf9f7] border border-[#e8e4dc] rounded-2xl text-[#3d3429] placeholder:text-[#7a7265] focus:outline-none focus:ring-2 focus:ring-[#c4785a]/20 focus:border-[#c4785a] transition-all resize-none font-mono text-sm"
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
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 py-3 px-4 bg-[#c4785a] text-white rounded-2xl font-medium hover:bg-[#b56a4d] transition-colors shadow-sm"
          >
            {editingRecipe ? 'Save Changes' : 'Add Recipe'}
          </button>
        </div>
      </form>
    </div>
  )
}
// MealPlanEntrySheet — bottom sheet (mobile) / centered modal (desktop) for creating
// or editing a meal plan entry. Supports three entry types via pill tabs:
//   • Food   — item name, AI suggestion strip, qty/uom, calories, macros
//   • Takeout — takeout name, calorie limit, "No snacks" + "No sides" constraints
//   • Recipe  — searchable recipe picker, servings, computed kcal preview
// In add mode a Favorites tab pre-fills Food fields from a saved favorite.

import { useState, useEffect, useRef, type FormEvent } from 'react'
import type {
  MealPlanEntry,
  CreateMealPlanEntryInput,
  UpdateMealPlanEntryInput,
  CalorieLogFavorite,
  RecipeListItem,
} from '../../api'
import { fetchRecipes } from '../../api'
import { FOOD_UNITS, UNIT_LABELS } from '../../constants'
import { useSuggestion } from '../../hooks/useSuggestion'
import type { AISuggestion } from '../../types'
import SuggestionStrip from '../calorie-log/SuggestionStrip'
import FavoritesDropdown from '../calorie-log/FavoritesDropdown'
import { scaleFavorite } from '../calorie-log/favorites-utils'

/* ─── Types ─────────────────────────────────────────────────────────────── */

type TabId = 'food' | 'takeout' | 'recipe' | 'favorites'

interface Props {
  open: boolean
  onClose: () => void
  // YYYY-MM-DD
  day: string
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  // Present = edit mode; absent = add mode
  entry?: MealPlanEntry
  onSave: (input: CreateMealPlanEntryInput | UpdateMealPlanEntryInput) => Promise<void>
  favorites: CalorieLogFavorite[]
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

// formatDay formats a YYYY-MM-DD string as e.g. "Mon Apr 14".
// We parse with UTC to avoid timezone-offset date shifts.
function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/* ─── Component ──────────────────────────────────────────────────────────── */

export default function MealPlanEntrySheet({ open, onClose, day, mealType, entry, onSave, favorites }: Props) {
  const isEditMode = !!entry

  // Active tab — pre-select based on entry_type in edit mode; default to 'food' in add mode
  const [activeTab, setActiveTab] = useState<TabId>('food')

  // ── Food tab state ──
  const [foodName, setFoodName] = useState('')
  const [qty, setQty] = useState('1')
  const [uom, setUom] = useState('each')
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')

  // ── Takeout tab state ──
  const [takeoutName, setTakeoutName] = useState('')
  const [calorieLimit, setCalorieLimit] = useState('')
  const [noSnacks, setNoSnacks] = useState(false)
  const [noSides, setNoSides] = useState(false)

  // ── Recipe tab state ──
  const [recipes, setRecipes] = useState<RecipeListItem[]>([])
  const [recipesLoaded, setRecipesLoaded] = useState(false)
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | ''>('')
  const [servings, setServings] = useState('1')

  // ── Favorites tab state ──
  const [showFavoritesDropdown, setShowFavoritesDropdown] = useState(false)

  // Track which food fields have been manually edited so AI apply doesn't overwrite them
  const dirtyFields = useRef(new Set<string>())

  // ── Saving state ──
  const [saving, setSaving] = useState(false)

  // AI suggestion — only active on Food tab in add mode
  const suggestionInput = (!isEditMode && open && activeTab === 'food') ? foodName : ''
  const { state: suggestionState, dismiss: dismissSuggestion, markApplied } = useSuggestion(suggestionInput, 'food')

  // Fetch recipes when the sheet first opens (lazily — only once)
  useEffect(() => {
    if (!open || recipesLoaded) return
    setRecipesLoaded(true)
    fetchRecipes().then(setRecipes).catch(() => {/* silently ignore — user sees empty picker */})
  }, [open, recipesLoaded])

  // Reset / pre-fill state whenever the sheet opens or entry changes
  useEffect(() => {
    if (!open) return
    dirtyFields.current.clear()
    setShowFavoritesDropdown(false)
    setSaving(false)

    if (entry) {
      // Edit mode — derive tab from entry_type
      setActiveTab(entry.entry_type)

      // Food fields
      setFoodName(entry.item_name ?? '')
      setQty(entry.qty?.toString() ?? '1')
      setUom(entry.uom ?? 'each')
      setCalories(entry.calories?.toString() ?? '')
      setProtein(entry.protein_g?.toString() ?? '')
      setCarbs(entry.carbs_g?.toString() ?? '')
      setFat(entry.fat_g?.toString() ?? '')

      // Takeout fields
      setTakeoutName(entry.takeout_name ?? '')
      setCalorieLimit(entry.calorie_limit?.toString() ?? '')
      setNoSnacks(entry.no_snacks)
      setNoSides(entry.no_sides)

      // Recipe fields
      setSelectedRecipeId(entry.recipe_id ?? '')
      setServings(entry.servings?.toString() ?? '1')
    } else {
      // Add mode — clear everything
      setActiveTab('food')
      setFoodName('')
      setQty('1')
      setUom('each')
      setCalories('')
      setProtein('')
      setCarbs('')
      setFat('')
      setTakeoutName('')
      setCalorieLimit('')
      setNoSnacks(false)
      setNoSides(false)
      setSelectedRecipeId('')
      setServings('1')
    }
  }, [open, entry])

  /* ── Favorites ── */

  // Fill Food tab fields from a selected favorite, then switch to Food tab
  const fillFromFavorite = (fav: CalorieLogFavorite, scaledQty: number) => {
    const scaled = scaleFavorite(fav, scaledQty)
    setFoodName(fav.item_name)
    setQty(String(scaled.qty ?? 1))
    setUom(scaled.uom ?? 'each')
    setCalories(String(scaled.calories))
    setProtein(scaled.protein_g != null ? String(scaled.protein_g) : '')
    setCarbs(scaled.carbs_g != null ? String(scaled.carbs_g) : '')
    setFat(scaled.fat_g != null ? String(scaled.fat_g) : '')
    dirtyFields.current = new Set(['name', 'qty', 'uom', 'calories', 'protein', 'carbs', 'fat'])
    setShowFavoritesDropdown(false)
    // Switch to Food so the user sees the pre-filled form
    setActiveTab('food')
  }

  /* ── AI suggestion ── */

  const applySuggestion = (suggestion: AISuggestion) => {
    setFoodName(suggestion.item_name)
    if (!dirtyFields.current.has('qty')) setQty(suggestion.qty.toString())
    if (!dirtyFields.current.has('uom')) setUom(suggestion.uom)
    if (!dirtyFields.current.has('calories')) setCalories(suggestion.calories.toString())
    if (!dirtyFields.current.has('protein')) setProtein(suggestion.protein_g.toString())
    if (!dirtyFields.current.has('carbs')) setCarbs(suggestion.carbs_g.toString())
    if (!dirtyFields.current.has('fat')) setFat(suggestion.fat_g.toString())
    markApplied(suggestion.item_name)
  }

  const markDirty = (field: string) => { dirtyFields.current.add(field) }

  /* ── Computed recipe preview ── */

  const selectedRecipe = recipes.find(r => r.id === selectedRecipeId) ?? null
  const servingsNum = parseFloat(servings) || 1
  // Whether the Save button should be disabled due to missing recipe nutrition
  const recipeMissingNutrition = activeTab === 'recipe' && selectedRecipe !== null && selectedRecipe.calories == null

  /* ── Submit ── */

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    let input: CreateMealPlanEntryInput | UpdateMealPlanEntryInput

    if (isEditMode) {
      // Build update — only include fields that changed
      const update: UpdateMealPlanEntryInput = {}
      if (activeTab === 'food') {
        if (foodName.trim() !== (entry.item_name ?? '')) update.item_name = foodName.trim()
        const qtyNum = qty ? parseFloat(qty) : null
        if (qtyNum !== entry.qty) update.qty = qtyNum
        if (uom !== (entry.uom ?? 'each')) update.uom = uom
        const calNum = calories ? parseInt(calories, 10) : null
        if (calNum !== entry.calories) update.calories = calNum
        const proNum = protein ? parseFloat(protein) : null
        if (proNum !== entry.protein_g) update.protein_g = proNum
        const carbNum = carbs ? parseFloat(carbs) : null
        if (carbNum !== entry.carbs_g) update.carbs_g = carbNum
        const fatNum = fat ? parseFloat(fat) : null
        if (fatNum !== entry.fat_g) update.fat_g = fatNum
      } else if (activeTab === 'takeout') {
        if (takeoutName.trim() !== (entry.takeout_name ?? '')) update.takeout_name = takeoutName.trim()
        const limNum = calorieLimit ? parseInt(calorieLimit, 10) : null
        if (limNum !== entry.calorie_limit) update.calorie_limit = limNum
        if (noSnacks !== entry.no_snacks) update.no_snacks = noSnacks
        if (noSides !== entry.no_sides) update.no_sides = noSides
      } else if (activeTab === 'recipe') {
        const recipeId = selectedRecipeId !== '' ? selectedRecipeId : null
        if (recipeId !== entry.recipe_id) update.recipe_id = recipeId
        const srvNum = parseFloat(servings) || 1
        if (srvNum !== entry.servings) update.servings = srvNum
      }
      input = update
    } else {
      // Build create
      const create: CreateMealPlanEntryInput = {
        date: day,
        meal_type: mealType,
        entry_type: activeTab as 'food' | 'takeout' | 'recipe',
      }
      if (activeTab === 'food') {
        create.item_name = foodName.trim()
        create.qty = qty ? parseFloat(qty) : null
        create.uom = uom || null
        create.calories = calories ? parseInt(calories, 10) : null
        create.protein_g = protein ? parseFloat(protein) : null
        create.carbs_g = carbs ? parseFloat(carbs) : null
        create.fat_g = fat ? parseFloat(fat) : null
      } else if (activeTab === 'takeout') {
        create.takeout_name = takeoutName.trim()
        create.calorie_limit = calorieLimit ? parseInt(calorieLimit, 10) : null
        create.no_snacks = noSnacks
        create.no_sides = noSides
      } else if (activeTab === 'recipe') {
        create.recipe_id = selectedRecipeId !== '' ? selectedRecipeId : null
        create.servings = parseFloat(servings) || 1
      }
      input = create
    }

    setSaving(true)
    try {
      await onSave(input)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  /* ── Validation — controls whether Save is enabled ── */
  const canSave = (() => {
    if (saving) return false
    if (activeTab === 'food') return !!foodName.trim() && !!calories
    if (activeTab === 'takeout') return !!takeoutName.trim() && !!calorieLimit
    if (activeTab === 'recipe') return selectedRecipeId !== '' && !recipeMissingNutrition
    return false
  })()

  /* ── Tabs ── */

  // Tabs visible depend on mode: Favorites tab only in add mode
  const tabs: { id: TabId; label: string }[] = [
    { id: 'food', label: 'Food' },
    { id: 'takeout', label: 'Takeout' },
    { id: 'recipe', label: 'Recipe' },
    ...(!isEditMode ? [{ id: 'favorites' as TabId, label: '★ Favorites' }] : []),
  ]

  /* ── Title ── */
  const formattedDay = formatDay(day)
  const capitalMeal = mealType.charAt(0).toUpperCase() + mealType.slice(1)
  const title = isEditMode
    ? `Edit · ${capitalMeal} · ${formattedDay}`
    : `Add to ${capitalMeal} · ${formattedDay}`

  /* ── Shared field styles ── */
  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stride-500 focus:border-transparent'
  const tabActiveCls = 'border-stride-600 bg-stride-50 text-stride-700'
  const tabInactiveCls = 'border-gray-200 text-gray-600 hover:bg-gray-50'

  return (
    <>
      {/* Backdrop — flex centering container on desktop */}
      <div
        data-testid="meal-plan-entry-sheet"
        className={`fixed inset-0 bg-black/40 z-50 transition-opacity duration-300
          sm:flex sm:items-center sm:justify-center sm:p-4
          ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      >
        {/* Mobile: bottom sheet (slide up). Desktop: centered modal (scale in). */}
        <div
          className={`bg-white shadow-2xl overflow-hidden transition-all duration-300
            fixed bottom-0 left-0 right-0 rounded-t-2xl
            ${open ? 'translate-y-0' : 'translate-y-full'}
            sm:static sm:rounded-xl sm:w-full sm:max-w-lg sm:translate-y-0
            ${open ? 'sm:scale-100 sm:opacity-100' : 'sm:scale-95 sm:opacity-0'}`}
          style={{ maxHeight: '85vh' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Drag handle — mobile only */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          <form
            onSubmit={handleSubmit}
            className="px-5 pt-4 pb-6 sm:pt-5 overflow-y-auto"
            style={{ maxHeight: 'calc(85vh - 2rem)' }}
          >
            {/* Header: title + close button */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Pill tab selector */}
            <div className="flex gap-1.5 mb-4 flex-wrap">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`border rounded-lg px-3 py-1.5 text-sm transition-colors
                    ${activeTab === tab.id ? tabActiveCls : tabInactiveCls}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── Food tab ─────────────────────────────────────────────────── */}
            {activeTab === 'food' && (
              <>
                {/* Item name */}
                <div className="mb-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Item name</label>
                  <input
                    type="text"
                    placeholder="e.g. Banana Smoothie"
                    value={foodName}
                    onChange={e => setFoodName(e.target.value)}
                    className={inputCls}
                  />
                </div>

                {/* AI suggestion strip — create mode only */}
                {!isEditMode && (
                  <SuggestionStrip
                    state={suggestionState}
                    onApply={applySuggestion}
                    onDismiss={dismissSuggestion}
                    variant="card"
                  />
                )}

                {/* Quantity + Unit */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                    <input
                      type="number"
                      value={qty}
                      onChange={e => { markDirty('qty'); setQty(e.target.value) }}
                      min="0"
                      step="0.25"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                    <select
                      value={uom}
                      onChange={e => { markDirty('uom'); setUom(e.target.value) }}
                      className={`${inputCls} bg-white`}
                    >
                      {FOOD_UNITS.map(u => (
                        <option key={u} value={u}>{UNIT_LABELS[u]}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Calories (required) */}
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Calories</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={calories}
                    onChange={e => { markDirty('calories'); setCalories(e.target.value) }}
                    className={inputCls}
                    required
                  />
                </div>

                {/* Macros (optional) */}
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Protein (g)</label>
                    <input
                      type="number" placeholder="—" value={protein}
                      onChange={e => { markDirty('protein'); setProtein(e.target.value) }}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Carbs (g)</label>
                    <input
                      type="number" placeholder="—" value={carbs}
                      onChange={e => { markDirty('carbs'); setCarbs(e.target.value) }}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fat (g)</label>
                    <input
                      type="number" placeholder="—" value={fat}
                      onChange={e => { markDirty('fat'); setFat(e.target.value) }}
                      className={inputCls}
                    />
                  </div>
                </div>
              </>
            )}

            {/* ── Takeout tab ───────────────────────────────────────────────── */}
            {activeTab === 'takeout' && (
              <>
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Restaurant / takeout name</label>
                  <input
                    type="text"
                    placeholder="e.g. Chipotle"
                    value={takeoutName}
                    onChange={e => setTakeoutName(e.target.value)}
                    className={inputCls}
                  />
                </div>

                {/* Calorie limit (required) */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Calorie limit</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={calorieLimit}
                    onChange={e => setCalorieLimit(e.target.value)}
                    className={inputCls}
                    required
                  />
                </div>

                {/* Constraints */}
                <div className="mb-5 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={noSnacks}
                      onChange={e => setNoSnacks(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-stride-600 focus:ring-stride-500"
                    />
                    <span className="text-sm text-gray-700">No snacks</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={noSides}
                      onChange={e => setNoSides(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-stride-600 focus:ring-stride-500"
                    />
                    <span className="text-sm text-gray-700">No sides</span>
                  </label>
                </div>
              </>
            )}

            {/* ── Recipe tab ────────────────────────────────────────────────── */}
            {activeTab === 'recipe' && (
              <>
                {/* Recipe picker */}
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Recipe</label>
                  <select
                    value={selectedRecipeId}
                    onChange={e => setSelectedRecipeId(e.target.value !== '' ? parseInt(e.target.value, 10) : '')}
                    className={`${inputCls} bg-white`}
                  >
                    <option value="">— Select a recipe —</option>
                    {recipes.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>

                {/* Servings */}
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Servings</label>
                  <input
                    type="number"
                    value={servings}
                    onChange={e => setServings(e.target.value)}
                    min="0.25"
                    step="0.25"
                    className={inputCls}
                  />
                </div>

                {/* Computed preview / warning */}
                {selectedRecipe && (
                  <div className="mb-5">
                    {recipeMissingNutrition ? (
                      // Recipe has no calorie data — warn user and block save
                      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        This recipe has no nutrition data. Add calories to the recipe before planning with it.
                      </p>
                    ) : (
                      // Show computed kcal estimate scaled to servings input
                      <p className="text-sm text-gray-600">
                        ≈{' '}
                        <span className="font-medium text-gray-800">
                          {Math.round((selectedRecipe.calories ?? 0) * servingsNum / (selectedRecipe.servings || 1))} kcal
                        </span>
                        {' '}for {servingsNum} serving{servingsNum !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── Favorites tab (add mode only) ────────────────────────────── */}
            {activeTab === 'favorites' && !isEditMode && (
              <div className="mb-5">
                <button
                  type="button"
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => setShowFavoritesDropdown(f => !f)}
                  className={`text-xs px-2.5 py-1 rounded border transition-colors
                    ${showFavoritesDropdown
                      ? 'border-amber-300 bg-amber-50 text-amber-600'
                      : 'border-gray-200 text-gray-400 hover:text-amber-500 hover:border-amber-200'
                    }`}
                >
                  ★ Favorites
                </button>
                {showFavoritesDropdown && (
                  <div className="mt-1.5">
                    <FavoritesDropdown
                      favorites={favorites}
                      mealType={mealType}
                      onSelect={fillFromFavorite}
                      onManage={() => setShowFavoritesDropdown(false)}
                      onClose={() => setShowFavoritesDropdown(false)}
                    />
                  </div>
                )}
                {/* Hint explaining that picking a favorite switches to the Food tab */}
                {!showFavoritesDropdown && (
                  <p className="mt-2 text-xs text-gray-400">
                    Pick a favorite to pre-fill the Food tab.
                  </p>
                )}
              </div>
            )}

            {/* Save button — spinner while in-flight */}
            <button
              type="submit"
              disabled={!canSave}
              className="w-full bg-stride-600 hover:bg-stride-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {saving && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                </svg>
              )}
              {isEditMode ? 'Save Changes' : 'Add to Plan'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}

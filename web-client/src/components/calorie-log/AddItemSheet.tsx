// AddItemSheet — form for creating or editing a calorie log item.
// Mobile: slides up as a bottom sheet. Desktop (sm+): centered modal dialog
// with scale-in animation. Supports "Log Item" (create) and "Edit Item"
// (pre-filled) modes. Type selector uses segmented buttons.
// In create mode, an AI suggestion strip appears below the name input
// after a 600ms debounce, offering to auto-fill nutrition fields.
// A ★ button below the name field opens a FavoritesDropdown to pre-fill
// all fields from a saved favorite.

import { useState, useEffect, useRef, type FormEvent } from 'react'
import type { CalorieLogItem, CalorieLogFavorite } from '../../api'
import { FOOD_UNITS, EXERCISE_UNITS, UNIT_LABELS, ITEM_TYPES } from '../../constants'
import { useSuggestion } from '../../hooks/useSuggestion'
import type { AISuggestion } from '../../types'
import SuggestionStrip from './SuggestionStrip'
import FavoritesDropdown from './FavoritesDropdown'
import { scaleFavorite } from './favorites-utils'


interface Props {
  open: boolean
  onClose: () => void
  onSave: (item: {
    item_name: string
    type: string
    qty: number | null
    uom: string | null
    calories: number
    protein_g: number | null
    carbs_g: number | null
    fat_g: number | null
    meal_plan_entry_id?: number | null
  }) => void
  // Pre-fill fields from an existing item (edit mode).
  editItem?: CalorieLogItem | null
  // Default meal type when creating (set by the meal section that triggered the open).
  defaultType?: string
  favorites: CalorieLogFavorite[]
  onManageFavorites: () => void
  // When logging a takeout meal plan entry: pre-fills the name, shows an amber
  // banner with plan context, and attaches meal_plan_entry_id to the saved item.
  mealPlanContext?: {
    entryId: number
    takeoutName: string
    calorieLimit: number | null
    noSnacks: boolean
    noSides: boolean
  }
}

export default function AddItemSheet({ open, onClose, onSave, editItem, defaultType, favorites, onManageFavorites, mealPlanContext }: Props) {
  const [name, setName] = useState('')
  const [type, setType] = useState<string>('snack')
  const [qty, setQty] = useState('1')
  const [uom, setUom] = useState('each')
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')
  // showFavorites toggles the inline FavoritesDropdown below the name field
  const [showFavorites, setShowFavorites] = useState(false)

  const isEditMode = !!editItem

  // Track which fields the user has manually edited so Apply doesn't overwrite them
  const dirtyFields = useRef(new Set<string>())

  // Only fetch suggestions in create mode when the sheet is open
  const suggestionInput = (!isEditMode && open) ? name : ''
  const { state: suggestionState, dismiss: dismissSuggestion, markApplied } = useSuggestion(suggestionInput, type)

  // Reset or pre-fill form when the sheet opens. A useEffect on [open, editItem]
  // is cleaner than setting state during render, which is fragile in StrictMode.
  // The synchronous setState calls here are safe — none of name/type/qty/etc. are
  // in the dependency array, so there is no risk of cascading re-renders.
  useEffect(() => {
    if (!open) return
    dirtyFields.current.clear()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowFavorites(false)
    if (editItem) {
      setName(editItem.item_name)
      setType(editItem.type)
      setQty(editItem.qty?.toString() ?? '1')
      setUom(editItem.uom ?? 'each')
      setCalories(editItem.calories.toString())
      setProtein(editItem.protein_g?.toString() ?? '')
      setCarbs(editItem.carbs_g?.toString() ?? '')
      setFat(editItem.fat_g?.toString() ?? '')
    } else {
      // Pre-fill name from meal plan takeout context if provided.
      setName(mealPlanContext ? mealPlanContext.takeoutName : '')
      setType(defaultType || 'snack')
      setQty('1')
      setUom('each')
      setCalories('')
      setProtein('')
      setCarbs('')
      setFat('')
    }
  }, [open, editItem, defaultType, mealPlanContext])

  // Fill all form fields from a selected favorite (scaled to the chosen qty).
  // Marks all fields dirty so the AI suggestion strip won't overwrite them.
  const fillFromFavorite = (fav: CalorieLogFavorite, scaledQty: number) => {
    const scaled = scaleFavorite(fav, scaledQty)
    setName(fav.item_name)
    setQty(String(scaled.qty ?? 1))
    setUom(scaled.uom ?? 'each')
    setCalories(String(scaled.calories))
    setProtein(scaled.protein_g != null ? String(scaled.protein_g) : '')
    setCarbs(scaled.carbs_g != null ? String(scaled.carbs_g) : '')
    setFat(scaled.fat_g != null ? String(scaled.fat_g) : '')
    dirtyFields.current = new Set(['name', 'qty', 'uom', 'calories', 'protein', 'carbs', 'fat'])
    setShowFavorites(false)
  }

  // Apply AI suggestion — populates non-dirty fields, always replaces name
  const applySuggestion = (suggestion: AISuggestion) => {
    setName(suggestion.item_name)
    if (!dirtyFields.current.has('qty')) setQty(suggestion.qty.toString())
    if (!dirtyFields.current.has('uom')) setUom(suggestion.uom)
    if (!dirtyFields.current.has('calories')) setCalories(suggestion.calories.toString())
    if (type !== 'exercise') {
      if (!dirtyFields.current.has('protein')) setProtein(suggestion.protein_g.toString())
      if (!dirtyFields.current.has('carbs')) setCarbs(suggestion.carbs_g.toString())
      if (!dirtyFields.current.has('fat')) setFat(suggestion.fat_g.toString())
    }
    markApplied(suggestion.item_name)
  }

  // Mark a field as dirty when the user manually edits it
  const markDirty = (field: string) => {
    dirtyFields.current.add(field)
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !calories) return
    onSave({
      item_name: name.trim(),
      type,
      qty: qty ? parseFloat(qty) : null,
      uom: uom || null,
      calories: parseInt(calories, 10),
      protein_g: protein ? parseFloat(protein) : null,
      carbs_g: carbs ? parseFloat(carbs) : null,
      fat_g: fat ? parseFloat(fat) : null,
      // Include meal_plan_entry_id when logging a takeout plan entry so the
      // ghost row disappears after the item is saved.
      meal_plan_entry_id: mealPlanContext?.entryId ?? null,
    })
  }

  return (
    <>
      {/* Backdrop — also acts as flex centering container on desktop */}
      <div
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

          <form onSubmit={handleSubmit} className="px-5 pt-4 pb-6 sm:pt-5 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 2rem)' }}>
            {/* Header: title + close button (close button visible on desktop) */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {editItem ? 'Edit Item' : 'Log Item'}
              </h2>
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

          {/* Meal plan takeout banner — shown when logging a takeout entry from the plan */}
          {mealPlanContext && (
            <div className="mb-4 flex flex-col gap-1 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
              <div className="flex items-center gap-2 font-medium">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
                Planned takeout: {mealPlanContext.takeoutName}
              </div>
              {mealPlanContext.calorieLimit != null && (
                <p className="text-xs text-amber-700">Target: ≤ {mealPlanContext.calorieLimit} cal</p>
              )}
              {mealPlanContext.noSnacks && (
                <p className="text-xs text-amber-700">Plan: no snacks</p>
              )}
              {mealPlanContext.noSides && (
                <p className="text-xs text-amber-700">Plan: no sides</p>
              )}
            </div>
          )}

          {/* Item name */}
          <div className="mb-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Item name</label>
            <input
              type="text"
              placeholder="e.g. Banana Smoothie"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stride-500 focus:border-transparent"
            />
          </div>

          {/* ★ Favorites button — opens the dropdown inline (pushes content down) */}
          {!isEditMode && (
            <div className="mb-3">
              <button
                type="button"
                onMouseDown={e => e.stopPropagation()}
                onClick={() => setShowFavorites(f => !f)}
                className={`text-xs px-2.5 py-1 rounded border transition-colors
                  ${showFavorites
                    ? 'border-amber-300 bg-amber-50 text-amber-600'
                    : 'border-gray-200 text-gray-400 hover:text-amber-500 hover:border-amber-200'
                  }`}
              >
                ★ Favorites
              </button>
              {/* Inline favorites dropdown — not absolutely positioned; pushes content down */}
              {showFavorites && (
                <div className="mt-1.5">
                  <FavoritesDropdown
                    favorites={favorites}
                    mealType={type}
                    onSelect={fillFromFavorite}
                    onManage={() => { setShowFavorites(false); onManageFavorites() }}
                    onClose={() => setShowFavorites(false)}
                  />
                </div>
              )}
            </div>
          )}

          {/* AI suggestion strip — appears between name and type selector in create mode */}
          {!isEditMode && (
            <SuggestionStrip
              state={suggestionState}
              onApply={applySuggestion}
              onDismiss={dismissSuggestion}
              variant="card"
            />
          )}

          {/* Type selector — segmented buttons */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <div className="grid grid-cols-5 gap-1">
              {ITEM_TYPES.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setType(t)
                    // Reset to 'each' when switching to exercise if the current UOM isn't valid for exercise
                    if (t === 'exercise' && !(EXERCISE_UNITS as readonly string[]).includes(uom)) setUom('each')
                  }}
                  className={`px-2 py-2 text-xs font-medium rounded-lg border capitalize ${
                    type === t
                      ? 'border-stride-600 bg-stride-50 text-stride-700'
                      : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

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
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stride-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <select
                value={uom}
                onChange={e => { markDirty('uom'); setUom(e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stride-500 focus:border-transparent"
              >
                {(type === 'exercise' ? EXERCISE_UNITS : FOOD_UNITS).map(u => (
                  <option key={u} value={u}>{UNIT_LABELS[u]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Calories */}
          <div className="mb-3">
            <label htmlFor="calories" className="block text-sm font-medium text-gray-700 mb-1">Calories</label>
            <input
              id="calories"
              type="number"
              placeholder="0"
              value={calories}
              onChange={e => { markDirty('calories'); setCalories(e.target.value) }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stride-500 focus:border-transparent"
            />
          </div>

          {/* Macros — hidden for exercise (no nutritional macros tracked) */}
          {type !== 'exercise' && <div className="grid grid-cols-3 gap-3 mb-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Protein (g)</label>
              <input
                type="number" placeholder="—" value={protein}
                onChange={e => { markDirty('protein'); setProtein(e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stride-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Carbs (g)</label>
              <input
                type="number" placeholder="—" value={carbs}
                onChange={e => { markDirty('carbs'); setCarbs(e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stride-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fat (g)</label>
              <input
                type="number" placeholder="—" value={fat}
                onChange={e => { markDirty('fat'); setFat(e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stride-500 focus:border-transparent"
              />
            </div>
          </div>}

          <button
            type="submit"
            className={`w-full bg-stride-600 hover:bg-stride-700 text-white font-medium py-3 rounded-xl transition-colors ${type === 'exercise' ? 'mt-5' : ''}`}
          >
            {editItem ? 'Save Changes' : 'Save Item'}
          </button>
          </form>
        </div>
      </div>
    </>
  )
}

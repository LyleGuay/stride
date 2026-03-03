// FavoritesDropdown — searchable dropdown for picking a saved favorite.
// Used in InlineAddRow (absolutely positioned) and AddItemSheet (inline card).
// Filtering:
//   - Exercise sections: always shows only exercise favorites; no toggle.
//   - Food sections: defaults to current meal type; filter icon toggles all food.
// ×qty expands a per-row serving scale panel with live calorie/macro preview.

import { useState, useRef, useEffect } from 'react'
import type { CalorieLogFavorite } from '../../api'
import { scaleFavorite } from './favorites-utils'

interface Props {
  favorites: CalorieLogFavorite[]
  mealType: string          // current section type (breakfast/lunch/etc. or exercise)
  onSelect: (fav: CalorieLogFavorite, scaledQty: number) => void
  onManage: () => void
  onClose: () => void
}


export default function FavoritesDropdown({ favorites, mealType, onSelect, onManage, onClose }: Props) {
  const isExercise = mealType === 'exercise'
  const [search, setSearch] = useState('')
  // filterToType: when true, only show favorites matching the current meal type.
  // Always true for exercise (no toggle); defaults true for food sections.
  const [filterToType, setFilterToType] = useState(true)
  // expandedId: which favorite row has its ×qty scale panel open (null = none)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  // scaledQtys: per-row qty input values for the scale panel
  const [scaledQtys, setScaledQtys] = useState<Record<number, string>>({})
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Auto-focus search on mount
  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  // Close on mousedown outside
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [onClose])

  // Filtering: exercise always scoped; food uses filterToType toggle
  const visible = favorites.filter(fav => {
    const typeMatch = isExercise
      ? fav.type === 'exercise'
      : (filterToType ? fav.type === mealType : fav.type !== 'exercise')
    if (!typeMatch) return false
    if (!search) return true
    return fav.item_name.toLowerCase().includes(search.toLowerCase())
  })

  function getScaledQty(fav: CalorieLogFavorite): number {
    const raw = scaledQtys[fav.id]
    return raw !== undefined ? parseFloat(raw) || 0 : (fav.qty ?? 1)
  }

  function handleRowClick(fav: CalorieLogFavorite) {
    const qty = getScaledQty(fav)
    onSelect(fav, qty > 0 ? qty : (fav.qty ?? 1))
  }

  function toggleExpand(e: React.MouseEvent, fav: CalorieLogFavorite) {
    e.stopPropagation()
    setExpandedId(prev => prev === fav.id ? null : fav.id)
    // Seed qty input if not already set
    if (scaledQtys[fav.id] === undefined) {
      setScaledQtys(prev => ({ ...prev, [fav.id]: String(fav.qty ?? 1) }))
    }
  }

  function handleAddScaled(e: React.MouseEvent, fav: CalorieLogFavorite) {
    e.stopPropagation()
    const qty = getScaledQty(fav)
    onSelect(fav, qty > 0 ? qty : (fav.qty ?? 1))
  }

  return (
    <div
      ref={ref}
      className="bg-white border border-gray-200 rounded-lg shadow-xl z-50 w-80 flex flex-col"
      style={{ maxHeight: '320px' }}
    >
      {/* Search row + filter icon */}
      <div className="flex items-center gap-1 p-2 border-b border-gray-100 shrink-0">
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search favorites…"
          className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-stride-400"
        />
        {/* Filter toggle — hidden for exercise (always scoped) */}
        {!isExercise && (
          <button
            type="button"
            title={filterToType ? `Showing ${mealType} only — click to show all food` : 'Showing all food — click to filter'}
            onClick={() => setFilterToType(f => !f)}
            className={`shrink-0 p-1.5 rounded transition-colors ${
              filterToType
                ? 'text-stride-600 bg-stride-50 border border-stride-200'
                : 'text-gray-400 border border-gray-200 hover:text-gray-600'
            }`}
          >
            {/* Funnel icon */}
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 0 1 .628.74v2.288a2.25 2.25 0 0 1-.659 1.59l-4.682 4.683a2.25 2.25 0 0 0-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 0 1 8 18.25v-5.757a2.25 2.25 0 0 0-.659-1.591L2.659 6.22A2.25 2.25 0 0 1 2 4.629V2.34a.75.75 0 0 1 .628-.74Z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      {/* Favorites list */}
      <div className="overflow-y-auto flex-1">
        {visible.length === 0 ? (
          <div className="px-3 py-4 text-xs text-gray-400 text-center">
            {favorites.length === 0 ? 'No favorites yet' : 'No results'}
          </div>
        ) : (
          visible.map(fav => {
            const isExpanded = expandedId === fav.id
            const scaledQtyStr = scaledQtys[fav.id] ?? String(fav.qty ?? 1)
            const scaledQtyNum = parseFloat(scaledQtyStr) || 0
            const scaled = scaledQtyNum > 0 ? scaleFavorite(fav, scaledQtyNum) : null

            return (
              <div key={fav.id}>
                {/* Main favorite row */}
                <div
                  className="group flex items-start px-3 py-2 hover:bg-stride-50 cursor-pointer border-b border-gray-50 transition-colors"
                  onClick={() => handleRowClick(fav)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800 text-xs truncate">{fav.item_name}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                      {fav.qty != null && <span>{fav.qty} {fav.uom ?? ''}</span>}
                      {!isExercise && (fav.protein_g != null || fav.carbs_g != null || fav.fat_g != null) && (
                        <span className="flex items-center gap-1.5">
                          ·
                          <span className="text-blue-500 w-6 text-right">{Math.round(fav.protein_g ?? 0)}P</span>
                          <span className="text-amber-500 w-6 text-right">{Math.round(fav.carbs_g ?? 0)}C</span>
                          <span className="text-pink-500 w-6 text-right">{Math.round(fav.fat_g ?? 0)}F</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={`text-xs font-semibold ml-2 mt-0.5 shrink-0 ${isExercise ? 'text-emerald-600' : 'text-gray-700'}`}>
                    {isExercise ? `−${fav.calories}` : fav.calories}
                  </div>
                  {/* ×qty button — reveals on hover */}
                  <button
                    type="button"
                    onClick={e => toggleExpand(e, fav)}
                    className="ml-1.5 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-stride-600 text-[10px] border border-gray-200 hover:border-stride-300 rounded px-1.5 py-0.5 transition-colors"
                    title="Adjust serving"
                  >
                    ×qty
                  </button>
                </div>

                {/* Serving scale panel — inline below the row */}
                {isExpanded && (
                  <div className="bg-stride-50 border-b border-stride-100 px-3 py-2.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500 shrink-0">Serving:</span>
                      <input
                        type="number"
                        value={scaledQtyStr}
                        min="0"
                        step="0.25"
                        onChange={e => setScaledQtys(prev => ({ ...prev, [fav.id]: e.target.value }))}
                        className="w-16 border border-stride-300 rounded px-2 py-1 text-center text-xs focus:outline-none focus:ring-1 focus:ring-stride-500 bg-white"
                        onClick={e => e.stopPropagation()}
                      />
                      <span className="text-gray-400 shrink-0">× {fav.uom ?? 'each'}</span>
                      {scaled && (
                        <div className="ml-auto text-right shrink-0">
                          <div className={`font-semibold text-xs ${isExercise ? 'text-emerald-700' : 'text-stride-700'}`}>
                            {isExercise ? `−${scaled.calories}` : scaled.calories} cal
                          </div>
                          {!isExercise && scaled.protein_g != null && (
                            <div className="text-[10px] text-gray-400">
                              {Math.round(scaled.protein_g)}P / {Math.round(scaled.carbs_g ?? 0)}C / {Math.round(scaled.fat_g ?? 0)}F
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={e => handleAddScaled(e, fav)}
                      className="mt-2 w-full bg-stride-600 text-white text-[11px] py-1.5 rounded hover:bg-stride-700 transition-colors"
                    >
                      Add with this serving
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-gray-100 text-center shrink-0">
        <button
          type="button"
          onClick={onManage}
          className="text-[10px] text-gray-400 hover:text-stride-600 transition-colors"
        >
          Manage Favorites…
        </button>
      </div>
    </div>
  )
}

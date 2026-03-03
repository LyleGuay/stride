// ManageFavoritesModal — tabbed modal for viewing and deleting saved favorites.
// Five tabs (Breakfast, Lunch, Dinner, Snack, Exercise) each show favorites of
// that type. Delete is the only supported action — no editing.
// Receives favorites from the parent; calls onDelete(id) to trigger removal.
// The parent re-fetches after deletion so the list stays in sync.

import { useState, useEffect } from 'react'
import type { CalorieLogFavorite } from '../../types'

interface Props {
  open: boolean
  favorites: CalorieLogFavorite[]
  onDelete: (id: number) => void
  onClose: () => void
}

// Tab definitions — ordered for display.
const TABS: { type: string; label: string }[] = [
  { type: 'breakfast', label: 'Breakfast' },
  { type: 'lunch',     label: 'Lunch' },
  { type: 'dinner',    label: 'Dinner' },
  { type: 'snack',     label: 'Snack' },
  { type: 'exercise',  label: 'Exercise' },
]

export default function ManageFavoritesModal({ open, favorites, onDelete, onClose }: Props) {
  // Default to the first tab that has favorites, or 'breakfast' if none.
  const [activeTab, setActiveTab] = useState(() => {
    const firstWithData = TABS.find(t => favorites.some(f => f.type === t.type))
    return firstWithData?.type ?? 'breakfast'
  })

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  const tabFavorites = favorites.filter(f => f.type === activeTab)

  return (
    <div
      className={`fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 transition-opacity duration-200
        ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-xl shadow-2xl w-full max-w-md transition-all duration-200
          ${open ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
        style={{ maxHeight: '80vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Manage Favorites</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {TABS.map(tab => {
            const count = favorites.filter(f => f.type === tab.type).length
            return (
              <button
                key={tab.type}
                type="button"
                onClick={() => setActiveTab(tab.type)}
                className={`shrink-0 px-3.5 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer
                  ${activeTab === tab.type
                    ? 'border-stride-600 text-stride-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold
                    ${activeTab === tab.type ? 'bg-stride-100 text-stride-700' : 'bg-gray-100 text-gray-500'}`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Favorites list for active tab */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 120px)' }}>
          {tabFavorites.length === 0 ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">
              No {activeTab} favorites saved yet.
            </div>
          ) : (
            <ul>
              {tabFavorites.map(fav => (
                <li key={fav.id} className="flex items-center gap-3 px-5 py-3 border-b border-gray-50 last:border-0">
                  {/* Favorite info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{fav.item_name}</div>
                    <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                      {fav.qty != null && <span>{fav.qty} {fav.uom ?? ''}</span>}
                      <span className={`font-medium ${fav.type === 'exercise' ? 'text-emerald-600' : 'text-gray-600'}`}>
                        · {fav.type === 'exercise' ? `−${fav.calories}` : fav.calories} cal
                      </span>
                      {fav.type !== 'exercise' && (fav.protein_g != null || fav.carbs_g != null || fav.fat_g != null) && (
                        <span className="flex items-center gap-1.5">
                          ·
                          <span className="text-blue-500 w-7 text-right">{Math.round(fav.protein_g ?? 0)}P</span>
                          <span className="text-amber-500 w-7 text-right">{Math.round(fav.carbs_g ?? 0)}C</span>
                          <span className="text-pink-500 w-7 text-right">{Math.round(fav.fat_g ?? 0)}F</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={() => onDelete(fav.id)}
                    className="shrink-0 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                    aria-label={`Delete ${fav.item_name}`}
                    title="Delete favorite"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// RecipeList — /recipes
// Displays all user recipes in a grid with search + category filter.
// Right-click on a card opens a context menu for Delete.
// AI Generate and + new recipe buttons in the sticky header.

import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useRecipes } from '../hooks/useRecipes'
import { useSidebar } from '../components/SidebarContext'
import { deleteRecipe } from '../api'
import type { RecipeListItem } from '../types'
import AIGenerateSheet from '../components/recipes/AIGenerateSheet'

/* ─── Constants ─────────────────────────────────────────────────────── */

// Fallback emoji by category when recipe.emoji is null
const CATEGORY_EMOJI: Record<string, string> = {
  breakfast: '🍳',
  lunch:     '🥗',
  dinner:    '🍽',
  dessert:   '🍰',
  snack:     '🍎',
  other:     '🍴',
}

// Tailwind color classes for the category badge
const CATEGORY_BADGE: Record<string, string> = {
  breakfast: 'bg-amber-100 text-amber-700',
  lunch:     'bg-green-100 text-green-700',
  dinner:    'bg-blue-100 text-blue-700',
  dessert:   'bg-pink-100 text-pink-700',
  snack:     'bg-purple-100 text-purple-700',
  other:     'bg-gray-100 text-gray-600',
}

// Background tint for the emoji area at the top of each card
const CATEGORY_BG: Record<string, string> = {
  breakfast: 'bg-amber-50',
  lunch:     'bg-green-50',
  dinner:    'bg-blue-50',
  dessert:   'bg-pink-50',
  snack:     'bg-purple-50',
  other:     'bg-gray-50',
}

const CATEGORIES = ['all', 'breakfast', 'lunch', 'dinner', 'snack', 'other'] as const

// Format total_timer_seconds into a human-readable string like "25 min" or "1h 20m"
function formatTime(seconds: number): string | null {
  if (seconds <= 0) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.ceil((seconds % 3600) / 60)
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m} min`
}

/* ─── Context menu ──────────────────────────────────────────────────── */

interface CardContextMenu {
  x: number
  y: number
  recipe: RecipeListItem
}

function RecipeContextMenu({ menu, onDelete, onClose }: {
  menu: CardContextMenu
  onDelete: (id: number) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Nudge onto screen if overflowing
  useEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    if (rect.right  > window.innerWidth)  ref.current.style.left = `${window.innerWidth - rect.width - 8}px`
    if (rect.bottom > window.innerHeight) ref.current.style.top  = `${window.innerHeight - rect.height - 8}px`
  }, [menu.x, menu.y])

  return (
    <div
      ref={ref}
      className="fixed z-[100] bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[150px]"
      style={{ left: menu.x, top: menu.y }}
    >
      <button
        onClick={() => { onDelete(menu.recipe.id); onClose() }}
        className="flex items-center gap-2 w-full px-3.5 py-[7px] text-[13px] text-red-600 hover:bg-red-50"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
        </svg>
        Delete
      </button>
    </div>
  )
}

/* ─── Delete confirmation dialog ────────────────────────────────────── */

function DeleteConfirmDialog({ recipe, onConfirm, onCancel }: {
  recipe: RecipeListItem
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
        <h3 className="text-base font-semibold mb-2">Delete Recipe?</h3>
        <p className="text-sm text-gray-600 mb-5">
          "{recipe.name}" will be permanently deleted. This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors">
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Recipe Card ───────────────────────────────────────────────────── */

function RecipeCard({ recipe, onClick, onContextMenu }: {
  recipe: RecipeListItem
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  const emoji    = recipe.emoji ?? CATEGORY_EMOJI[recipe.category] ?? '🍴'
  const badge    = CATEGORY_BADGE[recipe.category] ?? CATEGORY_BADGE.other
  const bgTint   = CATEGORY_BG[recipe.category]    ?? CATEGORY_BG.other
  const timeStr  = formatTime(recipe.total_timer_seconds)

  return (
    <div
      className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer hover:-translate-y-0.5 select-none"
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {/* Emoji area */}
      <div className={`${bgTint} flex items-center justify-center py-7 text-5xl`}>
        {emoji}
      </div>

      {/* Card body */}
      <div className="p-3">
        <p className="text-sm font-semibold text-gray-900 truncate mb-1.5">{recipe.name}</p>
        <div className="flex items-center justify-between mb-2">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize ${badge}`}>
            {recipe.category}
          </span>
          {timeStr && <span className="text-[10px] text-gray-400">{timeStr}</span>}
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500">
          {recipe.calories != null
            ? <span className="font-semibold text-gray-700">{recipe.calories} cal</span>
            : <span className="text-gray-300">—</span>
          }
          <span>{recipe.step_count} step{recipe.step_count !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  )
}

/* ─── Main page ─────────────────────────────────────────────────────── */

export default function RecipeList() {
  const navigate         = useNavigate()
  const { setOpen }      = useSidebar()
  const { recipes, loading, error, reload } = useRecipes()

  const [search,       setSearch]       = useState('')
  const [category,     setCategory]     = useState<string>('all')
  const [contextMenu,  setContextMenu]  = useState<CardContextMenu | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RecipeListItem | null>(null)
  const [aiSheetOpen,  setAISheetOpen]  = useState(false)
  const [deleting,     setDeleting]     = useState(false)

  // Filter recipes by search + category
  const filtered = recipes.filter(r => {
    const matchCat    = category === 'all' || r.category === category
    const matchSearch = r.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const handleContextMenu = useCallback((e: React.MouseEvent, recipe: RecipeListItem) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, recipe })
  }, [])

  const handleDeleteRequest = useCallback((id: number) => {
    const recipe = recipes.find(r => r.id === id)
    if (recipe) setDeleteTarget(recipe)
  }, [recipes])

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      await deleteRecipe(deleteTarget.id)
      await reload()
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  return (
    <div className="pb-8">
      {/* Sticky header — h-14 matches sidebar chrome line */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="h-14 px-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setOpen(true)}
              className="lg:hidden p-1.5 rounded-md text-gray-500 hover:bg-gray-100 mr-1 shrink-0"
              aria-label="Open sidebar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/>
              </svg>
            </button>
            <h2 className="text-base font-semibold text-gray-900">Recipes</h2>
            {!loading && (
              <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full font-medium">
                {recipes.length}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* AI Generate */}
            <button
              onClick={() => setAISheetOpen(true)}
              className="flex items-center gap-1.5 bg-stride-600 hover:bg-stride-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
            >
              <span>✦</span> AI Generate
            </button>
            {/* New recipe */}
            <button
              onClick={() => navigate('/recipes/new')}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:text-stride-600 hover:border-stride-300 transition-colors text-xl font-light"
              title="New recipe"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-5">
        {/* Search + category filter */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="relative flex-1 min-w-[140px] max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/>
            </svg>
            <input
              type="text"
              placeholder="Search recipes…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stride-500 focus:border-transparent"
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors capitalize ${
                  category === cat
                    ? 'bg-stride-600 text-white border-stride-600'
                    : 'border-gray-200 text-gray-600 hover:border-stride-300'
                }`}
              >
                {cat === 'all' ? 'All' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* States */}
        {loading && (
          <div className="text-center py-20 text-gray-400 text-sm">Loading…</div>
        )}

        {error && (
          <div className="text-center py-20 text-red-500 text-sm">{error}</div>
        )}

        {!loading && !error && recipes.length === 0 && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📖</div>
            <p className="text-gray-600 font-medium mb-1">No recipes yet</p>
            <p className="text-sm text-gray-400 mb-5">Generate your first recipe with AI or add one manually.</p>
            <button
              onClick={() => setAISheetOpen(true)}
              className="inline-flex items-center gap-1.5 bg-stride-600 hover:bg-stride-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
            >
              ✦ Generate your first recipe
            </button>
          </div>
        )}

        {!loading && !error && recipes.length > 0 && filtered.length === 0 && (
          <div className="text-center py-20 text-gray-400 text-sm">No recipes found</div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(recipe => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                onClick={() => navigate(`/recipes/${recipe.id}`)}
                onContextMenu={e => handleContextMenu(e, recipe)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <RecipeContextMenu
          menu={contextMenu}
          onDelete={handleDeleteRequest}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <DeleteConfirmDialog
          recipe={deleteTarget}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* AI Generate sheet */}
      <AIGenerateSheet
        open={aiSheetOpen}
        onClose={() => setAISheetOpen(false)}
        onGenerated={recipe => {
          setAISheetOpen(false)
          navigate(`/recipes/${recipe.id}`)
        }}
      />
    </div>
  )
}

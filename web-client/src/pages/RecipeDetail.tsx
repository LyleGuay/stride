// RecipeDetail — /recipes/:id and /recipes/new
// Single page with view and edit mode. Route param "new" starts in edit mode with
// a blank draft; numeric IDs load the recipe then start in view mode.

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useSidebar } from '../components/SidebarContext'
import { fetchRecipe, createRecipe, updateRecipe, deleteRecipe, aiNutrition } from '../api'
import type { RecipeDetail as RecipeDetailType, RecipeIngredientInput, RecipeToolInput, RecipeStepInput, CreateRecipeInput } from '../types'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import LogFromRecipeSheet from '../components/recipes/LogFromRecipeSheet'
import AIModifySheet from '../components/recipes/AIModifySheet'

/* ─── Constants ─────────────────────────────────────────────────────── */

const CATEGORY_BADGE: Record<string, string> = {
  breakfast: 'bg-amber-100 text-amber-700',
  lunch:     'bg-green-100 text-green-700',
  dinner:    'bg-blue-100 text-blue-700',
  dessert:   'bg-pink-100 text-pink-700',
  snack:     'bg-purple-100 text-purple-700',
  other:     'bg-gray-100 text-gray-600',
}

const CATEGORIES = ['breakfast', 'lunch', 'dinner', 'snack', 'other']

// Map common cooking UOM names to their standard shorthands for display.
const UOM_SHORTHANDS: Record<string, string> = {
  teaspoon: 'tsp', teaspoons: 'tsp',
  tablespoon: 'tbsp', tablespoons: 'tbsp',
  ounce: 'oz', ounces: 'oz',
  pound: 'lb', pounds: 'lb',
  gram: 'g', grams: 'g',
  kilogram: 'kg', kilograms: 'kg',
  milliliter: 'ml', milliliters: 'ml',
  liter: 'l', liters: 'l',
  quart: 'qt', quarts: 'qt',
  pint: 'pt', pints: 'pt',
  gallon: 'gal', gallons: 'gal',
  cup: 'cup', cups: 'cups',
  inch: 'in', inches: 'in',
}

function formatUOM(uom: string | null): string {
  if (!uom) return ''
  return UOM_SHORTHANDS[uom.toLowerCase()] ?? uom
}

const FOOD_EMOJIS = [
  '🍳','🥗','🍽','🍰','🍎','🍴','🍕','🍜','🍣','🥩',
  '🥦','🌮','🍲','🥘','🍱','🍛','🍝','🍤','🥪','🧆',
  '🫕','🥣','🍿','🧀','🥚','🍞','🥐','🧇','🥞','🫐',
]

/* ─── Draft state type ───────────────────────────────────────────────── */

// Mirrors the edit form state. id=null means "new recipe not yet saved".
interface Draft {
  id: number | null
  name: string
  emoji: string | null
  category: string
  notes: string
  servings: number
  calories: string
  protein_g: string
  carbs_g:   string
  fat_g:     string
  ingredients: RecipeIngredientInput[]
  tools:       RecipeToolInput[]
  steps:       RecipeStepInput[]
}

function blankDraft(): Draft {
  return {
    id: null, name: '', emoji: null, category: 'other', notes: '',
    servings: 1, calories: '', protein_g: '', carbs_g: '', fat_g: '',
    ingredients: [], tools: [], steps: [],
  }
}

function recipeToEdit(r: RecipeDetailType): Draft {
  return {
    id:         r.id,
    name:       r.name,
    emoji:      r.emoji,
    category:   r.category,
    notes:      r.notes ?? '',
    servings:   r.servings,
    calories:   r.calories  != null ? String(r.calories)  : '',
    protein_g:  r.protein_g != null ? String(r.protein_g) : '',
    carbs_g:    r.carbs_g   != null ? String(r.carbs_g)   : '',
    fat_g:      r.fat_g     != null ? String(r.fat_g)     : '',
    ingredients: r.ingredients.map(i => ({ name: i.name, qty: i.qty, uom: i.uom, note: i.note, sort_order: i.sort_order })),
    tools:       r.tools.map(t => ({ name: t.name, sort_order: t.sort_order })),
    steps:       r.steps.map(s => ({ type: s.type, text: s.text, timer_seconds: s.timer_seconds, meanwhile_text: s.meanwhile_text, sort_order: s.sort_order })),
  }
}

function draftToInput(d: Draft): CreateRecipeInput {
  return {
    name:        d.name,
    emoji:       d.emoji,
    category:    d.category,
    notes:       d.notes || null,
    servings:    d.servings,
    calories:    d.calories  !== '' ? Number(d.calories)  : null,
    protein_g:   d.protein_g !== '' ? Number(d.protein_g) : null,
    carbs_g:     d.carbs_g   !== '' ? Number(d.carbs_g)   : null,
    fat_g:       d.fat_g     !== '' ? Number(d.fat_g)     : null,
    ingredients: d.ingredients,
    tools:       d.tools,
    steps:       d.steps,
  }
}

// Merge an AI draft response into the current draft (keeps the existing id)
function mergeAIDraft(current: Draft, ai: CreateRecipeInput, clearId = false): Draft {
  return {
    id:          clearId ? null : current.id,
    name:        ai.name       ?? current.name,
    emoji:       ai.emoji      ?? current.emoji,
    category:    ai.category   ?? current.category,
    notes:       ai.notes      ?? current.notes,
    servings:    ai.servings   ?? current.servings,
    calories:    ai.calories   != null ? String(ai.calories)  : current.calories,
    protein_g:   ai.protein_g  != null ? String(ai.protein_g) : current.protein_g,
    carbs_g:     ai.carbs_g    != null ? String(ai.carbs_g)   : current.carbs_g,
    fat_g:       ai.fat_g      != null ? String(ai.fat_g)     : current.fat_g,
    ingredients: ai.ingredients ?? current.ingredients,
    tools:       ai.tools       ?? current.tools,
    steps:       ai.steps       ?? current.steps,
  }
}

/* ─── Small sub-components ───────────────────────────────────────────── */

function CollapsibleSection({ title, icon, count, children }: {
  title: string
  icon: React.ReactNode
  count?: number
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="mt-2 border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2">
          {icon}
          {title}
          {count != null && <span className="text-xs text-gray-400 font-normal">({count})</span>}
        </span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5"/>
        </svg>
      </button>
      {open && (
        <div className="bg-white border-t border-gray-100 px-4 pb-4 pt-3">
          {children}
        </div>
      )}
    </div>
  )
}

// EmojiSelector — small popover grid for picking a recipe emoji
function EmojiSelector({ value, onChange }: { value: string | null; onChange: (e: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-10 h-10 flex items-center justify-center rounded-lg border border-amber-200 bg-white text-xl hover:bg-amber-50 transition-colors"
        title="Pick emoji"
      >
        {value ?? '🍴'}
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-2 grid grid-cols-6 gap-1 w-[188px]">
          <button
            onClick={() => { onChange(null); setOpen(false) }}
            className="w-7 h-7 flex items-center justify-center text-xs text-gray-400 hover:bg-gray-100 rounded"
            title="Clear emoji"
          >✕</button>
          {FOOD_EMOJIS.map(e => (
            <button
              key={e}
              onClick={() => { onChange(e); setOpen(false) }}
              className={`w-7 h-7 flex items-center justify-center text-lg rounded hover:bg-gray-100 ${value === e ? 'bg-stride-50' : ''}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Delete confirmation ────────────────────────────────────────────── */

function DeleteConfirm({ name, onConfirm, onCancel }: {
  name: string; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
        <h3 className="text-base font-semibold mb-2">Delete Recipe?</h3>
        <p className="text-sm text-gray-600 mb-5">
          "{name}" will be permanently deleted. This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={onConfirm} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors">Delete</button>
        </div>
      </div>
    </div>
  )
}

/* ─── Main page component ────────────────────────────────────────────── */

export default function RecipeDetail() {
  const { id: idParam }   = useParams<{ id: string }>()
  const navigate           = useNavigate()
  const { setOpen: setSidebarOpen } = useSidebar()

  const isNew = idParam === 'new'
  const numId = isNew ? null : (idParam ? parseInt(idParam, 10) : null)

  // Server recipe (null for new)
  const [recipe,  setRecipe]  = useState<RecipeDetailType | null>(null)
  const [fetching, setFetching] = useState(!isNew)
  const [fetchErr, setFetchErr] = useState('')

  // Draft state for edit mode
  const [draft,   setDraft]   = useState<Draft>(blankDraft())
  const [mode,    setMode]    = useState<'view' | 'edit'>(isNew ? 'edit' : 'view')
  const [dirty,   setDirty]   = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [saveErr, setSaveErr] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Sheet state
  const [logSheetOpen,    setLogSheetOpen]    = useState(false)
  const [aiModifyOpen,    setAIModifyOpen]    = useState(false)
  const [aiCopyOpen,      setAICopyOpen]      = useState(false)
  const [aiCalcLoading,   setAICalcLoading]   = useState(false)

  // Fetch recipe on mount (existing recipes only)
  useEffect(() => {
    if (isNew || !numId) return
    setFetching(true)
    fetchRecipe(numId)
      .then(r => { setRecipe(r); setDraft(recipeToEdit(r)) })
      .catch(() => setFetchErr('Recipe not found'))
      .finally(() => setFetching(false))
  }, [numId, isNew])

  const enterEdit = () => {
    if (recipe) setDraft(recipeToEdit(recipe))
    setDirty(false)
    setSaveErr('')
    setMode('edit')
  }

  const exitEdit = () => {
    if (dirty && !confirm('Discard unsaved changes?')) return
    setMode('view')
    setDirty(false)
  }

  const updateDraft = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }))
    setDirty(true)
  }, [])

  // ── Save ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!draft.name.trim()) { setSaveErr('Recipe name is required'); return }
    setSaving(true)
    setSaveErr('')
    try {
      const input = draftToInput({ ...draft, name: draft.name.trim() })
      if (draft.id == null) {
        // Create
        const created = await createRecipe(input)
        setRecipe(created)
        setDraft(recipeToEdit(created))
        setMode('view')
        setDirty(false)
        navigate(`/recipes/${created.id}`, { replace: true })
      } else {
        // Update
        const updated = await updateRecipe(draft.id, input)
        setRecipe(updated)
        setDraft(recipeToEdit(updated))
        setMode('view')
        setDirty(false)
      }
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!draft.id) return
    try {
      await deleteRecipe(draft.id)
      navigate('/recipes')
    } finally {
      setShowDeleteConfirm(false)
    }
  }

  // ── AI Nutrition auto-calculate ─────────────────────────────────────
  const handleAICalc = async () => {
    if (!draft.id) return
    setAICalcLoading(true)
    try {
      const n = await aiNutrition(draft.id)
      setDraft(prev => ({
        ...prev,
        calories:  String(n.calories),
        protein_g: String(n.protein_g),
        carbs_g:   String(n.carbs_g),
        fat_g:     String(n.fat_g),
      }))
      setDirty(true)
    } catch {
      // Silently ignore — user can retry
    } finally {
      setAICalcLoading(false)
    }
  }

  // ── Ingredient helpers ──────────────────────────────────────────────
  const addIngredient = () => {
    setDraft(prev => ({
      ...prev,
      ingredients: [...prev.ingredients, { name: '', qty: null, uom: null, note: null, sort_order: prev.ingredients.length }],
    }))
    setDirty(true)
  }

  const updateIngredient = (i: number, field: keyof RecipeIngredientInput, value: RecipeIngredientInput[typeof field]) => {
    setDraft(prev => {
      const copy = [...prev.ingredients]
      copy[i] = { ...copy[i], [field]: value }
      return { ...prev, ingredients: copy }
    })
    setDirty(true)
  }

  const removeIngredient = (i: number) => {
    setDraft(prev => ({ ...prev, ingredients: prev.ingredients.filter((_, idx) => idx !== i) }))
    setDirty(true)
  }

  // ── Tool helpers ────────────────────────────────────────────────────
  const addTool = () => {
    setDraft(prev => ({
      ...prev,
      tools: [...prev.tools, { name: '', sort_order: prev.tools.length }],
    }))
    setDirty(true)
  }

  const removeTool = (i: number) => {
    setDraft(prev => ({ ...prev, tools: prev.tools.filter((_, idx) => idx !== i) }))
    setDirty(true)
  }

  // ── Step helpers ────────────────────────────────────────────────────
  const addStep = (type: 'instruction' | 'timer') => {
    setDraft(prev => ({
      ...prev,
      steps: [...prev.steps, { type, text: '', timer_seconds: null, meanwhile_text: null, sort_order: prev.steps.length }],
    }))
    setDirty(true)
  }

  const updateStep = (i: number, field: keyof RecipeStepInput, value: RecipeStepInput[typeof field]) => {
    setDraft(prev => {
      const copy = [...prev.steps]
      copy[i] = { ...copy[i], [field]: value }
      return { ...prev, steps: copy }
    })
    setDirty(true)
  }

  const removeStep = (i: number) => {
    setDraft(prev => ({ ...prev, steps: prev.steps.filter((_, idx) => idx !== i) }))
    setDirty(true)
  }

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return
    const items = Array.from(draft.steps)
    const [removed] = items.splice(result.source.index, 1)
    items.splice(result.destination.index, 0, removed)
    setDraft(prev => ({ ...prev, steps: items.map((s, i) => ({ ...s, sort_order: i })) }))
    setDirty(true)
  }

  // ── Loading / error states ──────────────────────────────────────────
  if (fetching) return (
    <div className="lg:ml-0 min-h-screen flex items-center justify-center text-gray-400 text-sm">Loading…</div>
  )
  if (fetchErr) return (
    <div className="lg:ml-0 min-h-screen flex items-center justify-center text-red-500 text-sm">{fetchErr}</div>
  )

  const displayRecipe = recipe // used only in view mode

  // ── VIEW MODE ───────────────────────────────────────────────────────
  if (mode === 'view' && displayRecipe) {
    const badge = CATEGORY_BADGE[displayRecipe.category] ?? CATEGORY_BADGE.other
    return (
      <div className="pb-16">
        {/* Sticky header */}
        <div className="sticky top-0 z-20 bg-white border-b border-gray-200">
          <div className="h-14 px-4 sm:px-6 flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1.5 rounded-md text-gray-500 hover:bg-gray-100 shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/></svg>
            </button>
            <button onClick={() => navigate('/recipes')} className="text-gray-400 hover:text-gray-600 transition-colors shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/></svg>
            </button>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <h2 className="text-base font-semibold text-gray-900 truncate">{displayRecipe.name}</h2>
              <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize ${badge}`}>
                {displayRecipe.category}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => navigate(`/recipes/${displayRecipe.id}/cook`)}
                className="flex items-center gap-1.5 bg-stride-600 hover:bg-stride-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"/></svg>
                Cook
              </button>
              <button
                onClick={() => setLogSheetOpen(true)}
                className="hidden sm:flex items-center gap-1.5 border border-gray-200 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                🍽 Log
              </button>
              <button onClick={enterEdit} className="text-sm text-stride-600 border border-stride-200 px-3 py-2 rounded-lg hover:bg-stride-50 font-medium transition-colors">
                Edit
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-8">
          {/* Nutrition panel */}
          <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-gray-500">Per serving</p>
              <p className="text-sm text-gray-600">Serves <span className="font-semibold">{displayRecipe.servings}</span></p>
            </div>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-gray-800">{displayRecipe.calories ?? '—'}</p>
                <p className="text-xs text-gray-400 mt-0.5">Calories</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">{displayRecipe.protein_g != null ? `${displayRecipe.protein_g}g` : '—'}</p>
                <p className="text-xs text-gray-400 mt-0.5">Protein</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-500">{displayRecipe.carbs_g != null ? `${displayRecipe.carbs_g}g` : '—'}</p>
                <p className="text-xs text-gray-400 mt-0.5">Carbs</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-pink-500">{displayRecipe.fat_g != null ? `${displayRecipe.fat_g}g` : '—'}</p>
                <p className="text-xs text-gray-400 mt-0.5">Fat</p>
              </div>
            </div>
          </div>

          {/* Log from recipe — also available via button on mobile */}
          <button onClick={() => setLogSheetOpen(true)} className="sm:hidden mt-3 w-full flex items-center justify-center gap-1.5 border border-gray-200 text-gray-700 text-sm font-medium px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
            🍽 Log Calories
          </button>

          {/* Notes */}
          {displayRecipe.notes && (
            <CollapsibleSection title="Notes" icon={<svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487 18.549 2.8a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z"/></svg>}>
              <p className="text-sm text-gray-700 leading-relaxed bg-amber-50 border border-amber-100 rounded-xl p-3">{displayRecipe.notes}</p>
            </CollapsibleSection>
          )}

          {/* Tools */}
          {displayRecipe.tools.length > 0 && (
            <CollapsibleSection title="Tools" count={displayRecipe.tools.length} icon={<svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l5.654-4.654m5.65-4.65 3.029-2.497a1.125 1.125 0 0 0-1.17-1.883"/></svg>}>
              <ul className="space-y-1.5 text-sm text-gray-700">
                {displayRecipe.tools.map((t, i) => (
                  <li key={i} className="py-1 border-b border-gray-50 last:border-0">{t.name}</li>
                ))}
              </ul>
            </CollapsibleSection>
          )}

          {/* Ingredients */}
          {displayRecipe.ingredients.length > 0 && (
            <CollapsibleSection title="Ingredients" count={displayRecipe.ingredients.length} icon={<svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h7.5M8.25 12h7.5m-7.5 5.25H12"/></svg>}>
              <ul className="space-y-2 text-sm text-gray-700">
                {displayRecipe.ingredients.map((ing, i) => (
                  <li key={i} className="flex gap-3 py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-gray-500 w-14 shrink-0 text-right">
                      {ing.qty != null ? `${ing.qty}${ing.uom ? ' ' + formatUOM(ing.uom) : ''}` : ''}
                    </span>
                    <span>{ing.name}{ing.note ? <span className="text-gray-400">, {ing.note}</span> : ''}</span>
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          )}

          {/* Steps */}
          {displayRecipe.steps.length > 0 && (
            <CollapsibleSection title="Instructions" count={displayRecipe.steps.length} icon={<svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h7.5M8.25 12h7.5m-7.5 5.25H12"/></svg>}>
              <ol className="-mx-4 -mb-4">
                {displayRecipe.steps.map((step, i) => (
                  <li key={i} className={`px-4 py-3 text-sm text-gray-700 ${i % 2 === 1 ? 'bg-gray-50' : 'bg-white'}`}>
                    <span className="text-xs font-medium text-gray-400 block mb-0.5">
                      Step {i + 1}
                      {step.type === 'timer' && step.timer_seconds != null && (
                        <span className="ml-1.5 text-amber-500">⏱ {Math.floor(step.timer_seconds / 60)}:{String(step.timer_seconds % 60).padStart(2, '0')}</span>
                      )}
                    </span>
                    {step.text}
                    {step.meanwhile_text && (
                      <p className="mt-1 text-xs text-emerald-700 bg-emerald-50 rounded px-2 py-1">Meanwhile: {step.meanwhile_text}</p>
                    )}
                  </li>
                ))}
              </ol>
            </CollapsibleSection>
          )}
        </div>

        {/* Log from recipe sheet */}
        <LogFromRecipeSheet
          open={logSheetOpen}
          onClose={() => setLogSheetOpen(false)}
          recipe={displayRecipe}
        />
      </div>
    )
  }

  // ── EDIT MODE ───────────────────────────────────────────────────────
  return (
    <div className="pb-16">
      {/* Sticky edit header — amber tint to signal unsaved state */}
      <div className="sticky top-0 z-20 bg-amber-50 border-b border-amber-200">
        <div className="h-14 px-4 sm:px-6 flex items-center gap-2">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1.5 rounded-md text-gray-500 hover:bg-gray-100 shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/></svg>
          </button>
          <button onClick={isNew ? () => navigate('/recipes') : exitEdit} className="text-amber-600 hover:text-amber-800 transition-colors shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/></svg>
          </button>

          <input
            value={draft.name}
            onChange={e => updateDraft('name', e.target.value)}
            placeholder="Recipe name"
            className="flex-1 min-w-0 text-base font-semibold text-gray-900 bg-transparent border-b-2 border-amber-300 focus:outline-none focus:border-stride-500 pb-0.5"
          />

          <EmojiSelector value={draft.emoji} onChange={e => { updateDraft('emoji', e); setDirty(true) }} />

          <select
            value={draft.category}
            onChange={e => updateDraft('category', e.target.value)}
            aria-label="Category"
            className="text-xs bg-white border border-amber-200 rounded-lg px-2 py-1.5 text-gray-600 focus:outline-none shrink-0"
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>

          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => setAIModifyOpen(true)} className="hidden sm:flex items-center gap-1 border border-stride-200 bg-white text-stride-700 text-xs font-medium px-2.5 py-2 rounded-lg hover:bg-stride-50 transition-colors">
              ✦ AI Modify
            </button>
            <button onClick={() => setAICopyOpen(true)} className="hidden sm:flex items-center gap-1 border border-stride-200 bg-white text-stride-700 text-xs font-medium px-2.5 py-2 rounded-lg hover:bg-stride-50 transition-colors">
              ✦ AI Copy
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-stride-600 hover:bg-stride-700 disabled:bg-stride-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Edit body */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-8">
        {saveErr && <p className="mt-3 text-sm text-red-600">{saveErr}</p>}

        {/* AI action bar (mobile) */}
        <div className="sm:hidden flex gap-2 mt-4">
          <button onClick={() => setAIModifyOpen(true)} className="flex-1 flex items-center justify-center gap-1 border border-stride-200 bg-white text-stride-700 text-xs font-medium px-2.5 py-2 rounded-lg hover:bg-stride-50 transition-colors">
            ✦ AI Modify
          </button>
          <button onClick={() => setAICopyOpen(true)} className="flex-1 flex items-center justify-center gap-1 border border-stride-200 bg-white text-stride-700 text-xs font-medium px-2.5 py-2 rounded-lg hover:bg-stride-50 transition-colors">
            ✦ AI Copy
          </button>
        </div>

        {/* Nutrition panel — edit */}
        <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-gray-500">Nutrition per serving</p>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              Serves
              <input
                type="number"
                value={draft.servings}
                min="0.5"
                step="0.5"
                onChange={e => updateDraft('servings', parseFloat(e.target.value) || 1)}
                className="w-14 border border-gray-200 rounded px-1.5 py-0.5 text-sm font-medium text-center focus:outline-none focus:ring-1 focus:ring-stride-400"
              />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3 mb-3">
            {(['calories', 'protein_g', 'carbs_g', 'fat_g'] as const).map(field => {
              const labels = { calories: 'Cal', protein_g: 'Protein (g)', carbs_g: 'Carbs (g)', fat_g: 'Fat (g)' }
              const colors = { calories: 'text-gray-800', protein_g: 'text-blue-600', carbs_g: 'text-amber-500', fat_g: 'text-pink-500' }
              return (
                <div key={field} className="text-center">
                  <input
                    type="number"
                    value={draft[field]}
                    onChange={e => updateDraft(field, e.target.value)}
                    placeholder="—"
                    className={`w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-stride-400 ${colors[field]}`}
                  />
                  <p className="text-xs text-gray-400 mt-1">{labels[field]}</p>
                </div>
              )
            })}
          </div>
          {draft.id != null && (
            <button
              onClick={handleAICalc}
              disabled={aiCalcLoading}
              className="w-full flex items-center justify-center gap-1.5 border border-stride-200 bg-stride-50 text-stride-700 text-xs font-medium py-2 rounded-lg hover:bg-stride-100 transition-colors disabled:opacity-50"
            >
              {aiCalcLoading ? 'Calculating…' : '✦ AI Auto-calculate from Ingredients'}
            </button>
          )}
        </div>

        {/* Notes */}
        <CollapsibleSection title="Notes" icon={<svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487 18.549 2.8a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z"/></svg>}>
          <textarea
            value={draft.notes}
            onChange={e => updateDraft('notes', e.target.value)}
            placeholder="Any tips, notes, or substitutions…"
            rows={3}
            className="w-full text-sm text-gray-700 border border-amber-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-stride-400 resize-none"
          />
        </CollapsibleSection>

        {/* Tools */}
        <CollapsibleSection title="Tools" count={draft.tools.length} icon={<svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l5.654-4.654m5.65-4.65 3.029-2.497a1.125 1.125 0 0 0-1.17-1.883"/></svg>}>
          <div className="space-y-2">
            {draft.tools.map((tool, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={tool.name}
                  onChange={e => {
                    const copy = [...draft.tools]
                    copy[i] = { ...copy[i], name: e.target.value }
                    updateDraft('tools', copy)
                  }}
                  placeholder="e.g. 9-inch pie dish"
                  className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-stride-400"
                />
                <button onClick={() => removeTool(i)} className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none">✕</button>
              </div>
            ))}
            <button onClick={addTool} className="text-sm text-stride-600 hover:text-stride-700 font-medium">+ Add tool</button>
          </div>
        </CollapsibleSection>

        {/* Ingredients */}
        <CollapsibleSection title="Ingredients" count={draft.ingredients.length} icon={<svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h7.5M8.25 12h7.5m-7.5 5.25H12"/></svg>}>
          <div className="space-y-2">
            {draft.ingredients.map((ing, i) => (
              <div key={i} className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
                <input
                  type="number"
                  value={ing.qty ?? ''}
                  onChange={e => updateIngredient(i, 'qty', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="Qty"
                  className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-stride-400"
                />
                <input
                  value={ing.uom ?? ''}
                  onChange={e => updateIngredient(i, 'uom', e.target.value || null)}
                  placeholder="UOM"
                  className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-stride-400"
                />
                <input
                  value={ing.name}
                  onChange={e => updateIngredient(i, 'name', e.target.value)}
                  placeholder="Ingredient name"
                  className="flex-1 min-w-[120px] border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-stride-400"
                />
                <input
                  value={ing.note ?? ''}
                  onChange={e => updateIngredient(i, 'note', e.target.value || null)}
                  placeholder="Note"
                  className="w-28 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-stride-400 text-gray-400"
                />
                <button onClick={() => removeIngredient(i)} className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none shrink-0">✕</button>
              </div>
            ))}
            <button onClick={addIngredient} className="text-sm text-stride-600 hover:text-stride-700 font-medium">+ Add ingredient</button>
          </div>
        </CollapsibleSection>

        {/* Steps — drag-to-reorder */}
        <CollapsibleSection title="Instructions" count={draft.steps.length} icon={<svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h7.5M8.25 12h7.5m-7.5 5.25H12"/></svg>}>
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="steps">
              {provided => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-3 mb-3">
                  {draft.steps.map((step, i) => (
                    <Draggable key={i} draggableId={String(i)} index={i}>
                      {(drag, snapshot) => (
                        <div
                          ref={drag.innerRef}
                          {...drag.draggableProps}
                          className={`p-3 rounded-lg border ${step.type === 'timer' ? 'border-amber-200 bg-amber-50' : i % 2 === 1 ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-white'} ${snapshot.isDragging ? 'shadow-lg' : ''}`}
                        >
                          <div className="flex items-start gap-2">
                            {/* Drag handle */}
                            <div {...drag.dragHandleProps} className="mt-0.5 text-gray-300 hover:text-gray-500 cursor-grab shrink-0">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <circle cx="7" cy="5"  r="1.5"/><circle cx="13" cy="5"  r="1.5"/>
                                <circle cx="7" cy="10" r="1.5"/><circle cx="13" cy="10" r="1.5"/>
                                <circle cx="7" cy="15" r="1.5"/><circle cx="13" cy="15" r="1.5"/>
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${step.type === 'timer' ? 'bg-amber-200 text-amber-700' : 'bg-gray-200 text-gray-500'}`}>
                                  {step.type}
                                </span>
                                <span className="text-xs text-gray-400">Step {i + 1}</span>
                              </div>
                              <textarea
                                value={step.text}
                                onChange={e => updateStep(i, 'text', e.target.value)}
                                placeholder="Describe this step…"
                                rows={2}
                                className="w-full text-sm text-gray-700 bg-transparent border border-gray-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-stride-400 resize-none"
                              />
                              {step.type === 'timer' && (
                                <div className="flex gap-2 mt-2">
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      value={step.timer_seconds != null ? Math.floor(step.timer_seconds / 60) : ''}
                                      onChange={e => {
                                        const mins = parseInt(e.target.value) || 0
                                        const secs = step.timer_seconds != null ? step.timer_seconds % 60 : 0
                                        updateStep(i, 'timer_seconds', mins * 60 + secs)
                                      }}
                                      placeholder="0"
                                      min="0"
                                      className="w-14 border border-gray-200 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-stride-400"
                                    />
                                    <span className="text-xs text-gray-400">min</span>
                                    <input
                                      type="number"
                                      value={step.timer_seconds != null ? step.timer_seconds % 60 : ''}
                                      onChange={e => {
                                        const secs = parseInt(e.target.value) || 0
                                        const mins = step.timer_seconds != null ? Math.floor(step.timer_seconds / 60) : 0
                                        updateStep(i, 'timer_seconds', mins * 60 + secs)
                                      }}
                                      placeholder="0"
                                      min="0"
                                      max="59"
                                      className="w-14 border border-gray-200 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-stride-400"
                                    />
                                    <span className="text-xs text-gray-400">sec</span>
                                  </div>
                                </div>
                              )}
                              {step.type === 'timer' && (
                                <input
                                  value={step.meanwhile_text ?? ''}
                                  onChange={e => updateStep(i, 'meanwhile_text', e.target.value || null)}
                                  placeholder="Meanwhile… (optional)"
                                  className="mt-2 w-full text-sm border border-gray-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-stride-400"
                                />
                              )}
                            </div>
                            <button onClick={() => removeStep(i)} className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none shrink-0 mt-0.5">✕</button>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>

          {/* Add step buttons */}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <span className="text-[11px] text-gray-400 font-medium shrink-0">Add step</span>
            <button
              onClick={() => addStep('instruction')}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              Instruction
            </button>
            <button
              onClick={() => addStep('timer')}
              className="flex items-center gap-1.5 text-xs font-medium text-amber-600 border border-amber-200 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              ⏱ Timer
            </button>
          </div>
        </CollapsibleSection>

        {/* Danger zone — only show for existing recipes */}
        {draft.id != null && (
          <div className="mt-6 pt-5 border-t border-gray-100 flex justify-center">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-xs text-red-400 hover:text-red-600 transition-colors"
            >
              Delete this recipe
            </button>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <DeleteConfirm
          name={draft.name || 'this recipe'}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {/* AI sheets (only available for existing recipes) */}
      {recipe && (
        <>
          <AIModifySheet
            open={aiModifyOpen}
            onClose={() => setAIModifyOpen(false)}
            mode="modify"
            recipe={recipe}
            onResult={aiDraft => {
              setDraft(prev => mergeAIDraft(prev, aiDraft, false))
              setDirty(true)
            }}
          />
          <AIModifySheet
            open={aiCopyOpen}
            onClose={() => setAICopyOpen(false)}
            mode="copy"
            recipe={recipe}
            onResult={aiDraft => {
              setDraft(prev => mergeAIDraft(prev, aiDraft, true))
              setDirty(true)
            }}
          />
        </>
      )}
    </div>
  )
}

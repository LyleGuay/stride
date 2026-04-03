// ContextMenu — fixed-position menu shown on right-click (desktop) or "···" tap
// (mobile) on an item row. Options: Edit item, Duplicate, Copy to Today (past days only),
// Save as Favorite, Delete. When the item was logged from a recipe, also shows "Open Recipe".
// Click outside or Escape closes it.

import { useEffect, useRef } from 'react'

interface Props {
  x: number
  y: number
  onEdit: () => void
  onDuplicate: () => void
  onFavorite: () => void
  onDelete: () => void
  onClose: () => void
  // Show "Copy to Today" only when viewing a past day.
  isPastDay?: boolean
  onCopyToToday?: () => void
  // Optional recipe actions — only rendered when the item was logged from a recipe.
  recipeId?: number | null
  onOpenRecipe?: () => void
}

export default function ContextMenu({ x, y, onEdit, onDuplicate, onFavorite, onDelete, onClose, isPastDay, onCopyToToday, recipeId, onOpenRecipe }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  // Close on click outside or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Nudge menu onto screen if it overflows
  useEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    if (rect.right > window.innerWidth) {
      ref.current.style.left = `${window.innerWidth - rect.width - 8}px`
    }
    if (rect.bottom > window.innerHeight) {
      ref.current.style.top = `${window.innerHeight - rect.height - 8}px`
    }
  }, [x, y])

  return (
    <div
      ref={ref}
      className="fixed z-[100] bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]"
      style={{ left: x, top: y }}
    >
      <button
        onClick={onEdit}
        className="flex items-center gap-2 w-full px-3.5 py-[7px] text-[13px] text-gray-700 hover:bg-gray-100"
      >
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931z" />
        </svg>
        Edit item...
      </button>
      <button
        onClick={onDuplicate}
        className="flex items-center gap-2 w-full px-3.5 py-[7px] text-[13px] text-gray-700 hover:bg-gray-100"
      >
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
        </svg>
        Duplicate
      </button>
      {isPastDay && onCopyToToday && (
        <button
          onClick={onCopyToToday}
          className="flex items-center gap-2 w-full px-3.5 py-[7px] text-[13px] text-gray-700 hover:bg-gray-100"
        >
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
          </svg>
          Copy to Today
        </button>
      )}
      <button
        onClick={onFavorite}
        className="flex items-center gap-2 w-full px-3.5 py-[7px] text-[13px] text-amber-600 hover:bg-amber-50"
      >
        <span className="w-4 text-center">★</span>
        Save as Favorite
      </button>
      {recipeId != null && onOpenRecipe && (
        <button
          onClick={() => { onOpenRecipe(); onClose() }}
          className="flex items-center gap-2 w-full px-3.5 py-[7px] text-[13px] text-gray-700 hover:bg-gray-100"
        >
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
          </svg>
          Open Recipe
        </button>
      )}
      <div className="h-px bg-gray-200 my-1" />
      <button
        onClick={onDelete}
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

// AIGenerateSheet — bottom sheet for generating a new recipe via AI.
// User types a prompt → Generate → loading state → on success calls onGenerated(recipe).
// On error shows an inline message with a retry option.

import { useState, useEffect, type FormEvent } from 'react'
import { generateRecipe } from '../../api'
import type { RecipeDetail } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
  // Called with the fully-saved RecipeDetail after a successful generate
  onGenerated: (recipe: RecipeDetail) => void
}

export default function AIGenerateSheet({ open, onClose, onGenerated }: Props) {
  const [prompt,    setPrompt]    = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

  // Reset on open
  useEffect(() => {
    if (!open) return
    setPrompt('')
    setLoading(false)
    setError('')
  }, [open])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!prompt.trim()) return
    setLoading(true)
    setError('')
    try {
      const recipe = await generateRecipe(prompt.trim())
      onGenerated(recipe)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className={`fixed inset-0 bg-black/40 z-50 transition-opacity duration-300
        sm:flex sm:items-center sm:justify-center sm:p-4
        ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      onClick={() => !loading && onClose()}
    >
      {open && (
        <div
          className="bg-white shadow-2xl overflow-hidden
            fixed bottom-0 left-0 right-0 rounded-t-2xl
            sm:static sm:rounded-xl sm:w-full sm:max-w-md"
          onClick={e => e.stopPropagation()}
        >
          {/* Drag handle — mobile only */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          <form onSubmit={handleSubmit} className="px-5 pt-4 pb-6 sm:pt-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-stride-600">✦</span>
                <h2 className="text-lg font-semibold">Generate Recipe</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-3">
              Describe the recipe you want and AI will create it with ingredients, tools, and step-by-step instructions.
            </p>

            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g. A quick weeknight chicken stir-fry with vegetables, ready in 20 minutes"
              rows={4}
              disabled={loading}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stride-500 focus:border-transparent resize-none mb-4 disabled:bg-gray-50"
            />

            {error && (
              <p className="text-sm text-red-600 mb-3">{error}</p>
            )}

            <button
              type="submit"
              disabled={!prompt.trim() || loading}
              className="w-full bg-stride-600 hover:bg-stride-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating…
                </>
              ) : (
                <>✦ Generate Recipe</>
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

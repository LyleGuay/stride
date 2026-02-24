// useSuggestion debounces a food/exercise description and fetches AI-powered
// nutrition suggestions from the backend. Returns the current state (idle, loading,
// success, unrecognized, error), a dismiss callback, and a markApplied callback
// that prevents re-fetching when the name changes from applying a suggestion.

import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchSuggestion } from '../api'
import type { AISuggestion } from '../types'

export type SuggestionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; suggestion: AISuggestion }
  | { status: 'unrecognized' }
  | { status: 'error'; message: string }

interface UseSuggestionResult {
  state: SuggestionState
  dismiss: () => void
  // Call after applying a suggestion to prevent the name change from re-triggering a fetch
  markApplied: (appliedName: string) => void
}

// Minimum character count before triggering a suggestion request
const MIN_CHARS = 3
// Debounce delay in ms
const DEBOUNCE_MS = 600

export function useSuggestion(description: string, type: string): UseSuggestionResult {
  const [state, setState] = useState<SuggestionState>({ status: 'idle' })
  const dismissedRef = useRef(false)
  // Tracks the name set by Apply so we don't re-fetch for it
  const lastAppliedRef = useRef('')

  // dismiss hides the current suggestion and prevents the in-flight request
  // from showing its result
  const dismiss = useCallback(() => {
    dismissedRef.current = true
    setState({ status: 'idle' })
  }, [])

  // markApplied records the applied suggestion name so the effect skips
  // re-fetching when the name field changes to this value
  const markApplied = useCallback((appliedName: string) => {
    lastAppliedRef.current = appliedName
    dismissedRef.current = true
    setState({ status: 'idle' })
  }, [])

  useEffect(() => {
    const trimmed = description.trim()

    // Reset when input is too short
    if (trimmed.length < MIN_CHARS) {
      setState({ status: 'idle' })
      lastAppliedRef.current = ''
      return
    }

    // Skip re-fetch if the description matches what we just applied
    if (trimmed === lastAppliedRef.current) {
      return
    }
    lastAppliedRef.current = ''

    // Un-dismiss when the user types a new description
    dismissedRef.current = false

    const controller = new AbortController()

    const timer = setTimeout(async () => {
      setState({ status: 'loading' })

      try {
        const result = await fetchSuggestion(trimmed, type, controller.signal)

        // Don't update state if the user dismissed or the request was aborted
        if (controller.signal.aborted || dismissedRef.current) return

        if (result === null) {
          setState({ status: 'unrecognized' })
        } else {
          setState({ status: 'success', suggestion: result })
        }
      } catch (err) {
        if (controller.signal.aborted || dismissedRef.current) return
        setState({ status: 'error', message: (err as Error).message })
      }
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [description, type])

  return { state, dismiss, markApplied }
}

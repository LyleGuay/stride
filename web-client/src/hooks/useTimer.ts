// useTimer — manages a single countdown timer for cook mode.
// Tracks which step owns the timer, seconds remaining, and running state.
// Only one timer runs at a time; switching steps resets the timer.

import { useState, useEffect, useRef, useCallback } from 'react'

interface TimerState {
  stepId:           number | null  // which step's timer is active
  secondsRemaining: number
  totalSeconds:     number         // original duration for progress ring
  running:          boolean
  done:             boolean        // true when timer has reached 0
}

interface UseTimerReturn {
  timer:   TimerState
  start:   (stepId: number, seconds: number) => void
  toggle:  () => void  // start / pause / resume
  reset:   (stepId: number, seconds: number) => void
}

const INITIAL: TimerState = {
  stepId: null, secondsRemaining: 0, totalSeconds: 0, running: false, done: false,
}

export function useTimer(): UseTimerReturn {
  const [timer, setTimer] = useState<TimerState>(INITIAL)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Clear the tick interval
  const clearTick = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // Start ticking — called internally whenever running transitions to true
  const startTick = useCallback(() => {
    clearTick()
    intervalRef.current = setInterval(() => {
      setTimer(prev => {
        if (!prev.running) return prev
        const next = prev.secondsRemaining - 1
        if (next <= 0) {
          clearTick()
          return { ...prev, secondsRemaining: 0, running: false, done: true }
        }
        return { ...prev, secondsRemaining: next }
      })
    }, 1000)
  }, [clearTick])

  // Clean up on unmount
  useEffect(() => () => clearTick(), [clearTick])

  // Start a new timer for a given step (replaces any existing timer)
  const start = useCallback((stepId: number, seconds: number) => {
    clearTick()
    setTimer({ stepId, secondsRemaining: seconds, totalSeconds: seconds, running: true, done: false })
    startTick()
  }, [clearTick, startTick])

  // Toggle pause/resume for the current timer
  const toggle = useCallback(() => {
    setTimer(prev => {
      if (prev.done || prev.stepId === null) return prev
      if (prev.running) {
        clearTick()
        return { ...prev, running: false }
      } else {
        // Resume — startTick will read `running: true` from state
        return { ...prev, running: true }
      }
    })
  }, [clearTick])

  // Watch running state to start ticking after a resume (toggle sets running→true, then this fires)
  useEffect(() => {
    if (timer.running && intervalRef.current === null) {
      startTick()
    }
  }, [timer.running, startTick])

  // Reset timer for a step without starting it (e.g. navigating to a new timer step)
  const reset = useCallback((stepId: number, seconds: number) => {
    clearTick()
    setTimer({ stepId, secondsRemaining: seconds, totalSeconds: seconds, running: false, done: false })
  }, [clearTick])

  return { timer, start, toggle, reset }
}

// Tests for useTimer hook.
// Uses vi.useFakeTimers() to control setInterval without real time passing.

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useTimer } from './useTimer'

describe('useTimer', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('starts at idle state', () => {
    const { result } = renderHook(() => useTimer())
    expect(result.current.timer.running).toBe(false)
    expect(result.current.timer.stepId).toBeNull()
    expect(result.current.timer.secondsRemaining).toBe(0)
  })

  it('start() sets running and begins counting down', () => {
    const { result } = renderHook(() => useTimer())

    act(() => { result.current.start(1, 10) })
    expect(result.current.timer.running).toBe(true)
    expect(result.current.timer.secondsRemaining).toBe(10)
    expect(result.current.timer.stepId).toBe(1)

    // Advance 3 seconds
    act(() => { vi.advanceTimersByTime(3000) })
    expect(result.current.timer.secondsRemaining).toBe(7)
  })

  it('toggle() pauses a running timer', () => {
    const { result } = renderHook(() => useTimer())

    act(() => { result.current.start(1, 10) })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(result.current.timer.secondsRemaining).toBe(8)

    act(() => { result.current.toggle() })
    expect(result.current.timer.running).toBe(false)

    // No more ticks while paused
    act(() => { vi.advanceTimersByTime(5000) })
    expect(result.current.timer.secondsRemaining).toBe(8)
  })

  it('toggle() resumes a paused timer', () => {
    const { result } = renderHook(() => useTimer())

    act(() => { result.current.start(1, 10) })
    act(() => { vi.advanceTimersByTime(2000) })
    act(() => { result.current.toggle() })            // pause at 8s
    act(() => { vi.advanceTimersByTime(3000) })       // time passes while paused
    expect(result.current.timer.secondsRemaining).toBe(8)

    act(() => { result.current.toggle() })            // resume
    expect(result.current.timer.running).toBe(true)
    act(() => { vi.advanceTimersByTime(3000) })       // 3 more seconds
    expect(result.current.timer.secondsRemaining).toBe(5)
  })

  it('timer stops at 0 and sets done', () => {
    const { result } = renderHook(() => useTimer())

    act(() => { result.current.start(1, 3) })
    act(() => { vi.advanceTimersByTime(3000) })

    expect(result.current.timer.secondsRemaining).toBe(0)
    expect(result.current.timer.running).toBe(false)
    expect(result.current.timer.done).toBe(true)
  })

  it('reset() stops the timer and resets seconds without starting', () => {
    const { result } = renderHook(() => useTimer())

    act(() => { result.current.start(1, 10) })
    act(() => { vi.advanceTimersByTime(3000) })

    act(() => { result.current.reset(2, 60) })
    expect(result.current.timer.stepId).toBe(2)
    expect(result.current.timer.secondsRemaining).toBe(60)
    expect(result.current.timer.running).toBe(false)

    // Confirm no ticking after reset
    act(() => { vi.advanceTimersByTime(5000) })
    expect(result.current.timer.secondsRemaining).toBe(60)
  })
})

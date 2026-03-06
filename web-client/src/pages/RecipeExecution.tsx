// RecipeExecution — /recipes/:id/cook
// Full-screen cook mode: one step at a time with optional countdown timer.
// Segmented progress bar, ingredient slide-up sheet, wake lock.
// Per design: design/features/recipes/execution-mode.html

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useRecipeDetail } from '../hooks/useRecipeDetail'
import { useTimer } from '../hooks/useTimer'
import type { RecipeIngredient, RecipeStep } from '../types'

/* ─── Helpers ───────────────────────────────────────────────────────── */

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function fmtTimerLabel(seconds: number): string {
  const m = Math.round(seconds / 60)
  return m >= 60
    ? `${Math.floor(m / 60)}h ${m % 60 > 0 ? `${m % 60}m` : ''}`.trim()
    : `${m} min`
}

/* ─── TimerRing ─────────────────────────────────────────────────────── */

// SVG circular countdown ring showing fraction of timer remaining.
const RING_R = 34
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R  // ≈ 213.6

function TimerRing({ fraction, done }: { fraction: number; done: boolean }) {
  const offset = (1 - fraction) * RING_CIRCUMFERENCE
  return (
    <svg width="80" height="80" viewBox="0 0 80 80">
      {/* Track */}
      <circle cx="40" cy="40" r={RING_R} fill="none" stroke="#fde68a" strokeWidth="7" />
      {/* Progress arc */}
      <circle
        cx="40" cy="40" r={RING_R}
        fill="none"
        stroke={done ? '#22c55e' : '#f59e0b'}
        strokeWidth="7"
        strokeLinecap="round"
        style={{
          strokeDasharray: RING_CIRCUMFERENCE,
          strokeDashoffset: offset,
          transform: 'rotate(-90deg)',
          transformOrigin: 'center',
          transition: 'stroke-dashoffset 1s linear, stroke 0.3s',
        }}
      />
    </svg>
  )
}

/* ─── IngredientsSheet ──────────────────────────────────────────────── */

// Slide-up sheet listing all ingredients with a checkbox to cross them off.
function IngredientsSheet({
  open,
  onClose,
  ingredients,
}: {
  open: boolean
  onClose: () => void
  ingredients: RecipeIngredient[]
}) {
  const [checked, setChecked] = useState<Set<number>>(new Set())

  const toggle = (id: number) =>
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="absolute bottom-0 left-0 lg:left-64 right-0 bg-white border-t border-gray-200 shadow-2xl rounded-t-2xl overflow-y-auto"
        style={{ maxHeight: '70vh' }}
      >
        <div className="max-w-lg mx-auto p-5">
          {/* Drag handle */}
          <div className="flex justify-center mb-4">
            <div className="w-10 h-1 bg-gray-200 rounded-full" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 mb-4">Ingredients</h3>
          <div className="space-y-1.5">
            {ingredients.map(ing => {
              const done = checked.has(ing.id)
              const qty = ing.qty != null ? `${ing.qty}${ing.uom ? ` ${ing.uom}` : ''}` : ing.uom ?? ''
              return (
                <label
                  key={ing.id}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer border border-gray-100"
                >
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={() => toggle(ing.id)}
                    className="w-4 h-4 rounded accent-stride-500 shrink-0"
                  />
                  <div style={{ opacity: done ? 0.4 : 1 }}>
                    <p className={`text-sm text-gray-800 font-medium${done ? ' line-through' : ''}`}>{ing.name}</p>
                    {qty && <p className="text-xs text-gray-400">{qty}</p>}
                  </div>
                </label>
              )
            })}
            {ingredients.length === 0 && (
              <p className="text-sm text-gray-400 py-2">No ingredients listed.</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="mt-4 w-full border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── StepBadge ─────────────────────────────────────────────────────── */

function StepBadge({ step, index }: { step: RecipeStep; index: number }) {
  if (step.type === 'timer') {
    const label = fmtTimerLabel(step.timer_seconds ?? 0)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
        ⏱ Timer Step · {label}
      </span>
    )
  }
  return (
    <span className="inline-flex text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
      Step {index + 1}
    </span>
  )
}

/* ─── TimerPanel ────────────────────────────────────────────────────── */

interface TimerPanelProps {
  step:     RecipeStep
  stepId:   number
  timer:    ReturnType<typeof useTimer>['timer']
  onToggle: () => void
  onStart:  () => void
}

function TimerPanel({ step, stepId, timer, onToggle, onStart }: TimerPanelProps) {
  const isThisTimer    = timer.stepId === stepId
  const secondsLeft    = isThisTimer ? timer.secondsRemaining : (step.timer_seconds ?? 0)
  const total          = isThisTimer ? timer.totalSeconds : (step.timer_seconds ?? 0)
  const fraction       = total > 0 ? secondsLeft / total : 0
  const running        = isThisTimer && timer.running
  const done           = isThisTimer && timer.done
  const started        = isThisTimer

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
      <div className="flex items-center gap-5">
        {/* Ring */}
        <div className="relative shrink-0 w-20 h-20">
          <TimerRing fraction={fraction} done={done} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold tabular-nums text-amber-800">
              {done ? 'Done!' : formatTime(secondsLeft)}
            </span>
          </div>
        </div>
        {/* Controls */}
        <div className="flex-1">
          <p className="text-amber-700 text-sm font-semibold mb-0.5">
            Timer · {fmtTimerLabel(step.timer_seconds ?? 0)}
          </p>
          <p className="text-amber-600/60 text-xs mb-3">
            {done ? '✓ Timer complete' : running ? 'Running…' : started ? 'Paused' : 'Tap to start when ready'}
          </p>
          {!done && (
            <button
              onClick={started ? onToggle : onStart}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              {running ? (
                <>
                  {/* Pause icon */}
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                  </svg>
                  Pause
                </>
              ) : (
                <>
                  {/* Play icon */}
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  {started ? 'Resume' : 'Start Timer'}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Main Page ─────────────────────────────────────────────────────── */

export default function RecipeExecution() {
  const { id }       = useParams<{ id: string }>()
  const navigate     = useNavigate()
  const { recipe, loading, error } = useRecipeDetail(Number(id))

  const [stepIndex,        setStepIndex]        = useState(0)
  const [ingredientsOpen,  setIngredientsOpen]  = useState(false)
  const { timer, start, toggle, reset }         = useTimer()

  // Acquire wake lock so the screen stays on while cooking
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    navigator.wakeLock.request('screen')
      .then(lock => { wakeLockRef.current = lock })
      .catch(() => { /* wake lock denied — not a blocker */ })
    return () => { wakeLockRef.current?.release() }
  }, [])

  const steps = recipe?.steps ?? []
  const step  = steps[stepIndex]

  // Reset the timer whenever we navigate to a new timer step
  useEffect(() => {
    if (!step) return
    if (step.type === 'timer' && step.timer_seconds) {
      // Only reset if this step doesn't already own the timer
      if (timer.stepId !== step.id) {
        reset(step.id, step.timer_seconds)
      }
    }
  }, [stepIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePrev = useCallback(() => {
    if (stepIndex > 0) setStepIndex(i => i - 1)
  }, [stepIndex])

  const handleNext = useCallback(() => {
    if (!recipe) return
    if (stepIndex >= steps.length - 1) {
      // Finish Cooking — back to detail
      navigate(`/recipes/${recipe.id}`)
      return
    }
    setStepIndex(i => i + 1)
  }, [stepIndex, steps.length, recipe, navigate])

  const handleTimerStart = useCallback(() => {
    if (!step || !step.timer_seconds) return
    start(step.id, step.timer_seconds)
  }, [step, start])

  // ── Loading / error states ───────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-400 text-sm">
        Loading…
      </div>
    )
  }

  if (error || !recipe) {
    return (
      <div className="flex items-center justify-center min-h-screen text-red-500 text-sm">
        {error ?? 'Recipe not found'}
      </div>
    )
  }

  if (steps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-gray-500 px-6 text-center">
        <p className="text-base font-medium">No steps to cook</p>
        <button
          onClick={() => navigate(`/recipes/${recipe.id}`)}
          className="text-sm text-stride-600 hover:underline"
        >
          ← Back to recipe
        </button>
      </div>
    )
  }

  const isLast     = stepIndex === steps.length - 1
  const isFirst    = stepIndex === 0

  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* ── Sticky header ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 h-14 px-4 sm:px-6 flex items-center gap-3">
        {/* Exit cook mode */}
        <button
          onClick={() => navigate(`/recipes/${recipe.id}`)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
          aria-label="Exit cook mode"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12"/>
          </svg>
        </button>

        {/* Recipe name + step counter */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 truncate">{recipe.name}</p>
          <p className="text-sm font-semibold text-gray-800">Step {stepIndex + 1} of {steps.length}</p>
        </div>

        {/* Ingredients button */}
        <button
          onClick={() => setIngredientsOpen(true)}
          className="shrink-0 flex items-center gap-1.5 border border-gray-200 text-gray-600 text-xs font-medium px-3 py-1.5 rounded-full hover:bg-gray-50 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12"/>
          </svg>
          Ingredients
        </button>
      </div>

      {/* ── Progress bar ──────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto w-full px-6 pt-5 pb-1">
        <div className="flex gap-1.5">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i < stepIndex  ? 'bg-stride-500' :
                i === stepIndex ? 'bg-stride-300' :
                'bg-gray-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* ── Step content ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col px-6 py-5 max-w-2xl mx-auto w-full">

        {/* Step type badge */}
        <div className="mb-4">
          <StepBadge step={step} index={stepIndex} />
        </div>

        {step.type === 'instruction' ? (
          /* ── Instruction step ──────────────────────────────────────── */
          <p className="text-gray-900 text-2xl leading-relaxed font-light">
            {step.text}
          </p>
        ) : (
          /* ── Timer step ────────────────────────────────────────────── */
          <div className="flex flex-col gap-5">
            {/* What to do */}
            <p className="text-gray-900 text-2xl leading-relaxed font-light">
              {step.text}
            </p>

            {/* Timer widget */}
            <TimerPanel
              step={step}
              stepId={step.id}
              timer={timer}
              onToggle={toggle}
              onStart={handleTimerStart}
            />

            {/* Meanwhile card */}
            {step.meanwhile_text && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                <p className="text-emerald-700 text-xs font-semibold mb-2">
                  ↳ Meanwhile, while the timer runs…
                </p>
                <p className="text-gray-700 text-sm leading-relaxed">{step.meanwhile_text}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom nav ────────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3 bg-white">
        <button
          onClick={handlePrev}
          disabled={isFirst}
          className="flex items-center gap-1.5 border border-gray-200 text-gray-500 text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/>
          </svg>
          Prev
        </button>

        <button
          onClick={handleNext}
          className="flex-1 bg-stride-600 hover:bg-stride-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          {isLast ? (
            <>
              Finish Cooking
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
              </svg>
            </>
          ) : (
            <>
              Next Step
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/>
              </svg>
            </>
          )}
        </button>
      </div>

      {/* Ingredients slide-up sheet */}
      <IngredientsSheet
        open={ingredientsOpen}
        onClose={() => setIngredientsOpen(false)}
        ingredients={recipe.ingredients}
      />
    </div>
  )
}

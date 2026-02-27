// BudgetPlan covers the "Your Calorie Plan" preview card, Weight Loss Goal,
// and Daily Budget sections. showBreakdown is local state — purely presentational.

import { useState } from 'react'
import type React from 'react'
import { SectionHeader, Row, numInputCls } from './shared'
import { ACTIVITY_LEVELS, autoSplitBudgets, lbsToKg, kgToLbs, paceToTargetDate } from './utils'
import type { FormState, Preview } from './utils'

interface BudgetPlanProps {
  form: FormState
  preview: Preview | null
  onFormChange: (patch: Partial<FormState>) => void
  // onSetForm needed for atomic multi-field updates (e.g., meal budget toggle)
  onSetForm: React.Dispatch<React.SetStateAction<FormState | null>>
}

export default function BudgetPlan({ form, preview, onFormChange, onSetForm }: BudgetPlanProps) {
  // Local — only affects this card's expand/collapse, no need in parent state
  const [showBreakdown, setShowBreakdown] = useState(false)

  // Target weight handlers: keep lbs (canonical) and kg display value in sync.
  function onTargetWeightLbsChange(v: string) {
    const lbs = parseFloat(v)
    onFormChange({ targetWeightLbs: v, targetWeightKg: isNaN(lbs) ? '' : String(lbsToKg(lbs)) })
  }
  function onTargetWeightKgChange(v: string) {
    const kg = parseFloat(v)
    onFormChange({ targetWeightKg: v, targetWeightLbs: isNaN(kg) ? '' : String(kgToLbs(kg)) })
  }

  // Pace preset: derive a target date from current weight, goal weight, and pace
  function onPacePreset(pace: number) {
    const curW = parseFloat(form.weightLbs)
    const goalW = parseFloat(form.targetWeightLbs)
    if (isNaN(curW) || isNaN(goalW)) return
    onFormChange({ targetDate: paceToTargetDate(curW, goalW, pace) })
  }

  return (
    <>
      {/* ── Your Calorie Plan ──────────────────────────────────────────── */}
      <div className="bg-white border border-stride-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Your Calorie Plan</h2>
            <p className="text-xs text-gray-400 mt-0.5">Updates as you edit settings below</p>
          </div>
          <span className={`text-[10px] font-semibold px-2 py-1 rounded-full uppercase tracking-wide ${
            form.budgetAuto ? 'text-stride-600 bg-stride-50' : 'text-gray-500 bg-gray-100'
          }`}>
            {form.budgetAuto ? 'Auto' : 'Manual'}
          </span>
        </div>

        {preview ? (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-[11px] text-gray-400 mb-0.5 uppercase tracking-wide">Maintenance</div>
                <div className="text-xl font-bold text-gray-900">{preview.tdee.toLocaleString()}</div>
                <div className="text-[10px] text-gray-400">cal/day (TDEE)</div>
              </div>
              <div className="bg-stride-50 rounded-xl p-3 text-center border border-stride-100">
                <div className="text-[11px] text-stride-500 mb-0.5 uppercase tracking-wide">Food Budget</div>
                <div className="text-xl font-bold text-stride-700">{preview.foodBudget.toLocaleString()}</div>
                {/* Show net separately when exercise target is set */}
                <div className="text-[10px] text-stride-400">
                  {preview.foodBudget !== preview.budget
                    ? `net ${preview.budget.toLocaleString()} + ${(preview.foodBudget - preview.budget).toLocaleString()} exercise`
                    : 'cal/day'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                {/* Label flips to "Surplus" when budget exceeds TDEE */}
                <div className="text-gray-400 mb-0.5">{preview.deficit >= 0 ? 'Deficit' : 'Surplus'}</div>
                <div className="font-semibold text-gray-700">
                  {preview.deficit >= 0
                    ? `−${preview.deficit.toLocaleString()} cal/day`
                    : `+${Math.abs(preview.deficit).toLocaleString()} cal/day`}
                </div>
              </div>
              <div>
                <div className="text-gray-400 mb-0.5">Pace</div>
                <div className={`font-semibold ${Math.abs(preview.pace) >= 2 ? 'text-red-600' : 'text-gray-700'}`}>
                  {preview.pace < 0
                    ? `+${Math.abs(preview.pace).toFixed(1)} lbs/wk gain`
                    : `~${preview.pace.toFixed(1)} lbs/wk loss`}
                </div>
              </div>
              <div>
                <div className="text-gray-400 mb-0.5">Goal date</div>
                <div className="font-semibold text-gray-700">
                  {/* Auto mode: show target date the user set.
                      Manual mode: derive goal date from budget pace + weight delta. */}
                  {form.budgetAuto
                    ? (form.targetDate
                        ? new Date(form.targetDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                        : '—')
                    : (preview.goalDate
                        ? preview.goalDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                        : '—')}
                </div>
              </div>
            </div>

            {/* Expandable TDEE breakdown */}
            <button
              onClick={() => setShowBreakdown(v => !v)}
              className="mt-3 text-xs text-stride-600 hover:underline flex items-center gap-1"
            >
              <span>{showBreakdown ? 'Hide calculation' : 'Show calculation'}</span>
              <svg className={`w-3.5 h-3.5 transition-transform ${showBreakdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/>
              </svg>
            </button>

            {showBreakdown && (
              <div className="mt-3 pt-3 border-t border-gray-100 text-xs space-y-1.5 text-gray-500">
                <div className="flex justify-between">
                  <span>BMR ({form.sex}, DOB {form.dateOfBirth}, {form.heightCm} cm, {form.weightLbs} lbs)</span>
                  <span className="font-medium text-gray-700">{preview.bmr.toLocaleString()} cal</span>
                </div>
                <div className="flex justify-between">
                  <span>× Activity ({ACTIVITY_LEVELS.find(a => a.value === form.activityLevel)?.mult ?? '?'})</span>
                  <span className="font-medium text-gray-700">+{(preview.tdee - preview.bmr).toLocaleString()} cal</span>
                </div>
                <div className="flex justify-between border-t border-gray-100 pt-1.5">
                  <span className="font-medium text-gray-600">= Maintenance (TDEE)</span>
                  <span className="font-bold text-gray-900">{preview.tdee.toLocaleString()} cal</span>
                </div>
                {form.budgetAuto ? (
                  <>
                    <div className="flex justify-between">
                      {preview.pace >= 0
                        ? <span>− Goal deficit ({preview.pace.toFixed(1)} lb/wk loss × 500)</span>
                        : <span>+ Goal surplus ({Math.abs(preview.pace).toFixed(1)} lb/wk gain × 500)</span>}
                      <span className={`font-medium ${preview.deficit >= 0 ? 'text-red-500' : 'text-gray-700'}`}>
                        {preview.deficit >= 0
                          ? `−${preview.deficit.toLocaleString()} cal`
                          : `+${Math.abs(preview.deficit).toLocaleString()} cal`}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-gray-100 pt-1.5">
                      <span className="font-semibold text-gray-600">= Net budget</span>
                      <span className="font-bold text-gray-700">{preview.budget.toLocaleString()} cal</span>
                    </div>
                    {preview.foodBudget !== preview.budget && (
                      <div className="flex justify-between">
                        <span>+ Exercise target</span>
                        <span className="font-medium text-gray-700">+{(preview.foodBudget - preview.budget).toLocaleString()} cal</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-gray-100 pt-1.5">
                      <span className="font-semibold text-stride-700">= Food budget</span>
                      <span className="font-bold text-stride-700">{preview.foodBudget.toLocaleString()} cal</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span>{preview.deficit >= 0 ? '− Deficit vs. maintenance' : '+ Surplus vs. maintenance'}</span>
                      <span className={`font-medium ${preview.deficit >= 0 ? 'text-red-500' : 'text-gray-700'}`}>
                        {preview.deficit >= 0
                          ? `−${preview.deficit.toLocaleString()} cal`
                          : `+${Math.abs(preview.deficit).toLocaleString()} cal`}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-gray-100 pt-1.5">
                      <span className="font-semibold text-stride-700">Implied pace</span>
                      <span className={`font-bold ${Math.abs(preview.pace) >= 2 ? 'text-red-600' : 'text-stride-700'}`}>
                        {preview.pace < 0
                          ? `+${Math.abs(preview.pace).toFixed(1)} lbs/wk gain`
                          : `~${preview.pace.toFixed(1)} lbs/wk loss`}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">
            Complete your profile below to see your personalized plan.
          </p>
        )}
      </div>

      {/* ── Weight Loss Goal ───────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <SectionHeader>Weight Loss Goal</SectionHeader>
        <div className="space-y-4">

          <Row label="Goal weight">
            <div className="flex items-center gap-2">
              {form.units === 'us' ? (
                <input
                  type="number" min={50} max={700} step={0.5}
                  value={form.targetWeightLbs}
                  onChange={e => onTargetWeightLbsChange(e.target.value)}
                  placeholder="—"
                  className={numInputCls}
                />
              ) : (
                <input
                  type="number" min={20} max={320} step={0.1}
                  value={form.targetWeightKg}
                  onChange={e => onTargetWeightKgChange(e.target.value)}
                  placeholder="—"
                  className={numInputCls}
                />
              )}
              <span className="text-sm text-gray-400">{form.units === 'us' ? 'lbs' : 'kg'}</span>
            </div>
          </Row>

          <Row label="Target date">
            <input
              type="date"
              value={form.targetDate}
              onChange={e => onFormChange({ targetDate: e.target.value })}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white cursor-pointer hover:border-gray-400 focus:outline-none focus:border-stride-500 focus:ring-2 focus:ring-stride-500/10"
            />
          </Row>

          {/* Pace presets — clicking derives target date from goal weight delta.
              Shows +/- prefix based on whether target weight is above/below current. */}
          <div>
            <label className="block text-sm text-gray-500 mb-2">Or choose a pace (sets target date)</label>
            <div className="grid grid-cols-4 gap-2">
              {([0.5, 1, 1.5, 2] as const).map(pace => {
                const curW = parseFloat(form.weightLbs)
                const goalW = parseFloat(form.targetWeightLbs)
                const isGaining = !isNaN(curW) && !isNaN(goalW) && goalW > curW
                // Compare against abs(preview.pace) so selection holds regardless of direction
                const isSelected = preview != null && Math.abs(Math.abs(preview.pace) - pace) < 0.1
                const prefix = isGaining ? '+' : ''
                return (
                  <button
                    key={pace}
                    onClick={() => onPacePreset(pace)}
                    className={`border rounded-lg py-2 text-center transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-stride-500 bg-stride-50'
                        : 'border-gray-200 bg-white hover:border-stride-400 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`text-sm font-bold ${isSelected ? 'text-stride-700' : 'text-gray-700'}`}>{prefix}{pace}</div>
                    <div className={`text-[10px] ${isSelected ? 'text-stride-500' : 'text-gray-400'}`}>lbs/wk</div>
                  </button>
                )
              })}
            </div>
          </div>

        </div>
      </section>

      {/* ── Daily Budget ───────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <SectionHeader>Daily Budget</SectionHeader>
        <div className="space-y-4">

          <Row label="Auto-compute budget" sub="Calculated from TDEE and goal pace">
            <button
              role="switch"
              aria-checked={form.budgetAuto}
              onClick={() => onFormChange({ budgetAuto: !form.budgetAuto })}
              className={`relative w-10 h-[22px] rounded-full transition-colors flex-shrink-0 cursor-pointer ${
                form.budgetAuto ? 'bg-stride-600 hover:bg-stride-700' : 'bg-gray-300 hover:bg-gray-400'
              }`}
            >
              {/* Knob starts at left: 3px (off), slides 18px right (on) — matches mockup CSS */}
              <span className={`absolute left-[3px] top-[3px] w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                form.budgetAuto ? 'translate-x-[18px]' : 'translate-x-0'
              }`} />
            </button>
          </Row>

          {form.budgetAuto ? (
            <Row label="Computed budget">
              <div>
                <span className="text-sm font-semibold text-stride-700">
                  {preview ? `${preview.foodBudget.toLocaleString()} cal/day` : '—'}
                </span>
                {preview && preview.foodBudget !== preview.budget && (
                  <div className="text-xs text-gray-400 mt-0.5">
                    net {preview.budget.toLocaleString()} + {(preview.foodBudget - preview.budget).toLocaleString()} exercise
                  </div>
                )}
              </div>
            </Row>
          ) : (
            <Row label="Manual budget">
              <div className="flex items-center gap-2">
                <input
                  type="number" min={1200} max={5000}
                  value={form.manualBudget}
                  onChange={e => onFormChange({ manualBudget: e.target.value })}
                  className={`${numInputCls} w-24`}
                />
                <span className="text-sm text-gray-400">cal/day</span>
              </div>
            </Row>
          )}

          {/* Meal budgets — can be auto-split from the total, or set manually */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <Row label="Meal budgets" sub="Split your daily budget by meal">
              <button
                role="switch"
                aria-checked={form.mealBudgetAuto}
                onClick={() => {
                  const next = !form.mealBudgetAuto
                  // When switching to auto, recalculate from current effective budget
                  if (next) {
                    const total = form.budgetAuto
                      ? (preview?.budget ?? parseInt(form.manualBudget))
                      : parseInt(form.manualBudget)
                    if (!isNaN(total)) {
                      const split = autoSplitBudgets(total)
                      onSetForm(f => f ? { ...f,
                        mealBudgetAuto: true,
                        breakfastBudget: String(split.breakfast),
                        lunchBudget: String(split.lunch),
                        dinnerBudget: String(split.dinner),
                        snackBudget: String(split.snack),
                      } : f)
                      return
                    }
                  }
                  onFormChange({ mealBudgetAuto: next })
                }}
                className={`relative w-10 h-[22px] rounded-full transition-colors flex-shrink-0 cursor-pointer ${
                  form.mealBudgetAuto ? 'bg-stride-600 hover:bg-stride-700' : 'bg-gray-300 hover:bg-gray-400'
                }`}
              >
                <span className={`absolute left-[3px] top-[3px] w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                  form.mealBudgetAuto ? 'translate-x-[18px]' : 'translate-x-0'
                }`} />
              </button>
            </Row>

            {/* 4 meal inputs — read-only when auto, editable when manual */}
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: 'breakfastBudget', label: 'Breakfast' },
                { key: 'lunchBudget',     label: 'Lunch' },
                { key: 'dinnerBudget',    label: 'Dinner' },
                { key: 'snackBudget',     label: 'Snack' },
              ] as const).map(({ key, label }) => (
                <div key={key} className="bg-gray-50 rounded-xl p-3">
                  <div className="text-[11px] text-gray-400 mb-1">{label}</div>
                  {form.mealBudgetAuto ? (
                    <div className="text-sm font-semibold text-gray-700">{parseInt(form[key]).toLocaleString()} cal</div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <input
                        type="number" min={0} max={3000}
                        value={form[key]}
                        onChange={e => onFormChange({ [key]: e.target.value })}
                        className="w-16 text-sm font-semibold text-gray-700 bg-transparent outline-none border-b border-gray-200 focus:border-stride-500 pb-0.5"
                      />
                      <span className="text-[11px] text-gray-400">cal</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Meal total — shows sum of all 4 budgets vs the food budget */}
            {(() => {
              const mealTotal = [form.breakfastBudget, form.lunchBudget, form.dinnerBudget, form.snackBudget]
                .reduce((sum, v) => sum + (parseInt(v) || 0), 0)
              const foodBudget = preview?.foodBudget
              const diff = foodBudget != null ? mealTotal - foodBudget : null
              return (
                <div className="flex items-center justify-between pt-1 px-1">
                  <span className="text-xs text-gray-400">Meal total</span>
                  <span className={`text-sm font-semibold ${diff == null ? 'text-gray-700' : diff === 0 ? 'text-green-600' : diff > 0 ? 'text-red-500' : 'text-amber-500'}`}>
                    {mealTotal.toLocaleString()} cal
                    {diff != null && diff !== 0 && (
                      <span className="text-xs font-normal ml-1">
                        ({diff > 0 ? '+' : ''}{diff.toLocaleString()} vs food budget)
                      </span>
                    )}
                  </span>
                </div>
              )
            })()}
          </div>

        </div>
      </section>

    </>
  )
}

// Settings page — orchestrator. Owns load/save state and passes form state +
// callbacks down to ProfileForm and BudgetPlan. The body metrics, activity level,
// and weight goal sub-components drive a live TDEE preview computed here.

import { useEffect, useState } from 'react'
import { fetchUserSettings, patchUserSettings } from '../../api'
import type { CalorieLogUserSettings } from '../../api'
import { computePreview, autoSplitBudgets, buildFormState } from './utils'
import type { FormState } from './utils'
import ProfileForm from './ProfileForm'
import BudgetPlan from './BudgetPlan'

export default function Settings() {
  const [settings, setSettings] = useState<CalorieLogUserSettings | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetchUserSettings()
      .then(s => { setSettings(s); setForm(buildFormState(s)) })
      .catch(() => setLoadError('Failed to load settings. Please refresh.'))
  }, [])

  // Compute preview and effective food budget from current form state (may be null while loading).
  const preview = form ? computePreview(form) : null
  // Food budget = net budget + exercise target. Used for meal auto-split.
  const effectiveFoodBudget = preview?.foodBudget ?? null

  // When meal budgets are set to auto, keep them in sync with the effective food budget.
  // Must run before conditional returns so it's not a conditional hook call.
  useEffect(() => {
    if (!form?.mealBudgetAuto || effectiveFoodBudget == null) return
    const split = autoSplitBudgets(effectiveFoodBudget)
    setForm(f => f ? { ...f,
      breakfastBudget: String(split.breakfast),
      lunchBudget: String(split.lunch),
      dinnerBudget: String(split.dinner),
      snackBudget: String(split.snack),
    } : f)
  }, [effectiveFoodBudget, form?.mealBudgetAuto])

  if (loadError) return <div className="p-6 text-red-600">{loadError}</div>
  if (!form || !settings) return <div className="p-6 text-gray-400">Loading…</div>

  // Generic patch callback used by both sub-components; also clears the "Saved!" flash.
  function onFormChange(patch: Partial<FormState>) {
    setForm(f => f ? { ...f, ...patch } : f)
    setSaved(false)
  }

  async function handleSave() {
    if (!form) return
    setSaving(true); setSaveError(''); setSaved(false)
    try {
      const exerciseTarget = parseInt(form.exerciseTarget) || 0

      // Meal auto-split uses the food budget (net + exercise target), not the net budget alone.
      // This ensures meal targets reflect what you actually eat, not your net calorie goal.
      const rawFoodBudget = preview?.foodBudget ?? ((parseInt(form.manualBudget) || 0) + exerciseTarget)
      const effectiveFoodBudgetForSave = rawFoodBudget || undefined

      // Derive meal budgets: auto-split from food budget, or use manual values
      let breakfastBudget: number | undefined, lunchBudget: number | undefined
      let dinnerBudget: number | undefined, snackBudget: number | undefined
      if (form.mealBudgetAuto && effectiveFoodBudgetForSave) {
        const split = autoSplitBudgets(effectiveFoodBudgetForSave)
        breakfastBudget = split.breakfast; lunchBudget = split.lunch
        dinnerBudget = split.dinner; snackBudget = split.snack
      } else {
        breakfastBudget = parseInt(form.breakfastBudget) || undefined
        lunchBudget     = parseInt(form.lunchBudget) || undefined
        dinnerBudget    = parseInt(form.dinnerBudget) || undefined
        snackBudget     = parseInt(form.snackBudget) || undefined
      }

      const updated = await patchUserSettings({
        sex: form.sex || undefined,
        date_of_birth: form.dateOfBirth || undefined,
        height_cm: parseFloat(form.heightCm) || undefined,
        weight_lbs: parseFloat(form.weightLbs) || undefined,
        activity_level: form.activityLevel || undefined,
        exercise_target_calories: exerciseTarget,
        target_weight_lbs: parseFloat(form.targetWeightLbs) || undefined,
        target_date: form.targetDate || undefined,
        units: form.units,
        budget_auto: form.budgetAuto,
        calorie_budget: form.budgetAuto ? undefined : (parseInt(form.manualBudget) || undefined),
        breakfast_budget: breakfastBudget,
        lunch_budget: lunchBudget,
        dinner_budget: dinnerBudget,
        snack_budget: snackBudget,
      })
      setSettings(updated)
      setForm(buildFormState(updated))
      setSaved(true)
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Scrollable content — pb-32 leaves room for the fixed save bar */}
      <div className="max-w-xl mx-auto px-4 py-6 pb-32 space-y-6">
        <BudgetPlan
          form={form}
          preview={preview}
          onFormChange={onFormChange}
          onSetForm={setForm}
        />
        <ProfileForm
          form={form}
          onFormChange={onFormChange}
        />
      </div>

      {/* ── Sticky save bar — fixed at bottom, respects lg sidebar ──────── */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-white border-t border-gray-200 px-4 py-4 z-20">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-stride-600 hover:bg-stride-700 text-white font-semibold text-sm transition-colors active:scale-[0.98] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          {saved && <span className="text-sm text-green-600 font-medium">Saved!</span>}
          {saveError && <span className="text-sm text-red-600">{saveError}</span>}
        </div>
      </div>
    </>
  )
}

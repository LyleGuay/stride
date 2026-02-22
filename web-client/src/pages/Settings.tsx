// Settings page — body metrics, activity level, and weight goal. The server
// uses these to auto-compute a TDEE-based calorie budget. The client mirrors
// the formula for live preview as the user edits.

import { useEffect, useState } from 'react'
import { fetchUserSettings, patchUserSettings } from '../api'
import type { CalorieLogUserSettings } from '../api'

/* ─── Types ──────────────────────────────────────────────────────────── */

// All editable fields in display units. Weights stored as lbs (canonical),
// heights stored as cm (canonical); display inputs are derived from those.
interface FormState {
  sex: string
  age: string
  heightFt: string
  heightIn: string
  heightCm: string     // canonical storage
  weightLbs: string    // canonical storage
  weightKg: string
  activityLevel: string
  targetWeightLbs: string  // canonical storage
  targetWeightKg: string
  targetDate: string
  units: 'us' | 'metric'
  budgetAuto: boolean
  manualBudget: string
}

interface Preview {
  bmr: number
  tdee: number
  budget: number
  deficit: number
  pace: number
  goalDate: Date | null  // null when not computable (e.g. no target weight set in manual mode)
}

/* ─── Client-side TDEE (mirrors Go computeTDEE) ─────────────────────── */

// computePreview handles both auto and manual budget modes:
// - Auto: budget derived from TDEE and goal pace toward target date
// - Manual: budget taken from form.manualBudget; deficit/pace/goal date derived from it
function computePreview(form: FormState): Preview | null {
  const age = parseFloat(form.age)
  const heightCm = parseFloat(form.heightCm)
  const weightLbs = parseFloat(form.weightLbs)

  // BMR + TDEE required for both modes
  if (!form.sex || isNaN(age) || isNaN(heightCm) || isNaN(weightLbs) || !form.activityLevel) {
    return null
  }

  const weightKg = weightLbs / 2.20462
  let bmr = 10 * weightKg + 6.25 * heightCm - 5 * age
  bmr += form.sex === 'male' ? 5 : -161

  const multipliers: Record<string, number> = {
    sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
  }
  const mult = multipliers[form.activityLevel]
  if (!mult) return null
  const tdee = bmr * mult

  if (!form.budgetAuto) {
    // Manual mode: budget is given; derive deficit/pace/goal date from it.
    // Negative deficit = caloric surplus = weight gain.
    const budget = parseInt(form.manualBudget)
    if (isNaN(budget) || budget <= 0) return null
    const deficit = tdee - budget
    const pace = deficit / 500  // negative when budget > TDEE (gaining)

    // Goal date: derive from pace + weight delta. Works for both loss (pace > 0)
    // and gain (pace < 0, target > current).
    let goalDate: Date | null = null
    const targetWeightLbs = parseFloat(form.targetWeightLbs)
    if (!isNaN(targetWeightLbs) && pace !== 0) {
      const delta = weightLbs - targetWeightLbs   // negative when gaining
      if ((delta > 0 && pace > 0) || (delta < 0 && pace < 0)) {
        const weeksNeeded = delta / pace
        goalDate = new Date(Date.now() + weeksNeeded * 7 * 24 * 60 * 60 * 1000)
      }
    }
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), budget, deficit: Math.round(deficit), pace, goalDate }
  }

  // Auto mode: derive budget from pace toward goal date.
  // Negative pace = gaining (target > current weight).
  const targetWeightLbs = parseFloat(form.targetWeightLbs)
  if (isNaN(targetWeightLbs) || !form.targetDate) return null

  const msUntil = new Date(form.targetDate).getTime() - Date.now()
  const weeksUntil = msUntil / 1000 / 60 / 60 / 24 / 7
  if (weeksUntil <= 0) return null

  let pace = (weightLbs - targetWeightLbs) / weeksUntil
  // Cap rate at ±2 lbs/wk for both loss and gain. Only apply the 0.25 minimum
  // for weight loss — gaining should be shown as-is without a floor.
  if (pace > 2) pace = 2
  else if (pace > 0 && pace < 0.25) pace = 0.25
  else if (pace < -2) pace = -2

  const deficit = pace * 500  // negative when gaining
  return {
    bmr: Math.round(bmr), tdee: Math.round(tdee),
    budget: Math.round(tdee - deficit), deficit: Math.round(deficit),
    pace, goalDate: null,
  }
}

/* ─── Unit conversion helpers ───────────────────────────────────────── */

function cmToFtIn(cm: number) {
  const totalIn = cm / 2.54
  return { ft: Math.floor(totalIn / 12), inches: Math.round(totalIn % 12) }
}
function ftInToCm(ft: number, inches: number) {
  return Math.round((ft * 12 + inches) * 2.54 * 10) / 10
}
function lbsToKg(lbs: number) { return Math.round(lbs / 2.20462 * 10) / 10 }
function kgToLbs(kg: number)   { return Math.round(kg * 2.20462 * 10) / 10 }

/* ─── Form initialization ────────────────────────────────────────────── */

function buildFormState(s: CalorieLogUserSettings): FormState {
  let age = ''
  if (s.date_of_birth) {
    const dob = new Date(s.date_of_birth)
    const today = new Date()
    let a = today.getFullYear() - dob.getFullYear()
    const mDiff = today.getMonth() - dob.getMonth()
    if (mDiff < 0 || (mDiff === 0 && today.getDate() < dob.getDate())) a--
    age = String(a)
  }
  const units = s.units === 'metric' ? 'metric' : 'us'
  let heightFt = '', heightIn = '', heightCm = ''
  if (s.height_cm != null) {
    heightCm = String(s.height_cm)
    const { ft, inches } = cmToFtIn(s.height_cm)
    heightFt = String(ft); heightIn = String(inches)
  }
  let weightLbs = '', weightKg = ''
  if (s.weight_lbs != null) {
    weightLbs = String(s.weight_lbs); weightKg = String(lbsToKg(s.weight_lbs))
  }
  let targetWeightLbs = '', targetWeightKg = ''
  if (s.target_weight_lbs != null) {
    targetWeightLbs = String(s.target_weight_lbs); targetWeightKg = String(lbsToKg(s.target_weight_lbs))
  }
  return {
    sex: s.sex ?? '', age,
    heightFt, heightIn, heightCm,
    weightLbs, weightKg,
    activityLevel: s.activity_level ?? '',
    targetWeightLbs, targetWeightKg,
    targetDate: s.target_date ?? '',
    units: units as 'us' | 'metric',
    budgetAuto: s.budget_auto,
    manualBudget: String(s.calorie_budget),
  }
}

/* ─── Activity level definitions ─────────────────────────────────────── */

const ACTIVITY_LEVELS = [
  { value: 'sedentary',   emoji: '🪑', label: 'Sedentary',         mult: '×1.2',   desc: 'Desk job or mostly seated. Little movement outside of logged exercise.' },
  { value: 'light',       emoji: '🚶', label: 'Lightly Active',    mult: '×1.375', desc: 'On your feet some of the day — errands, light walking, standing desk.' },
  { value: 'moderate',    emoji: '🏃', label: 'Moderately Active', mult: '×1.55',  desc: 'Standing or moving most of the day — retail, service, active job.' },
  { value: 'active',      emoji: '🏋️', label: 'Very Active',       mult: '×1.725', desc: 'On your feet all day — construction, warehouse, nursing, physical trade.' },
  { value: 'very_active', emoji: '⚡', label: 'Extra Active',      mult: '×1.9',   desc: 'Intense physical job plus an active lifestyle. Rare.' },
]

/* ─── Sub-components ─────────────────────────────────────────────────── */

// Section header: small uppercase label with a bottom border, matching mockup.
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 pb-2 border-b border-gray-100 mb-4">
      {children}
    </div>
  )
}

// Horizontal row: label on the left, control on the right.
function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-shrink-0">
        <div className="text-sm font-medium text-gray-700">{label}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

// Segmented pill control — gray background with white active pill.
function SegmentedControl({ options, value, onChange }: {
  options: { label: string; value: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            value === opt.value ? 'bg-white shadow-sm text-gray-900 cursor-default' : 'text-gray-500 hover:bg-white/60 hover:text-gray-700 cursor-pointer'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

/* ─── Main component ─────────────────────────────────────────────────── */

export default function Settings() {
  const [settings, setSettings] = useState<CalorieLogUserSettings | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(false)

  useEffect(() => {
    fetchUserSettings()
      .then(s => { setSettings(s); setForm(buildFormState(s)) })
      .catch(() => setLoadError('Failed to load settings. Please refresh.'))
  }, [])

  if (loadError) return <div className="p-6 text-red-600">{loadError}</div>
  if (!form || !settings) return <div className="p-6 text-gray-400">Loading…</div>

  const preview = computePreview(form)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => f ? { ...f, [key]: value } : f)
    setSaved(false)
  }

  function onHeightFtChange(v: string) {
    setForm(f => {
      if (!f) return f
      return { ...f, heightFt: v, heightCm: String(ftInToCm(parseFloat(v) || 0, parseFloat(f.heightIn) || 0)) }
    }); setSaved(false)
  }
  function onHeightInChange(v: string) {
    setForm(f => {
      if (!f) return f
      return { ...f, heightIn: v, heightCm: String(ftInToCm(parseFloat(f.heightFt) || 0, parseFloat(v) || 0)) }
    }); setSaved(false)
  }
  function onHeightCmChange(v: string) {
    setForm(f => {
      if (!f) return f
      const cm = parseFloat(v)
      const { ft, inches } = isNaN(cm) ? { ft: 0, inches: 0 } : cmToFtIn(cm)
      return { ...f, heightCm: v, heightFt: String(ft), heightIn: String(inches) }
    }); setSaved(false)
  }
  function onWeightLbsChange(v: string) {
    setForm(f => {
      if (!f) return f
      const lbs = parseFloat(v)
      return { ...f, weightLbs: v, weightKg: isNaN(lbs) ? '' : String(lbsToKg(lbs)) }
    }); setSaved(false)
  }
  function onWeightKgChange(v: string) {
    setForm(f => {
      if (!f) return f
      const kg = parseFloat(v)
      return { ...f, weightKg: v, weightLbs: isNaN(kg) ? '' : String(kgToLbs(kg)) }
    }); setSaved(false)
  }
  function onTargetWeightLbsChange(v: string) {
    setForm(f => {
      if (!f) return f
      const lbs = parseFloat(v)
      return { ...f, targetWeightLbs: v, targetWeightKg: isNaN(lbs) ? '' : String(lbsToKg(lbs)) }
    }); setSaved(false)
  }
  function onTargetWeightKgChange(v: string) {
    setForm(f => {
      if (!f) return f
      const kg = parseFloat(v)
      return { ...f, targetWeightKg: v, targetWeightLbs: isNaN(kg) ? '' : String(kgToLbs(kg)) }
    }); setSaved(false)
  }

  // Pace preset: derive a target date from current weight, goal weight, and pace
  function onPacePreset(pace: number) {
    if (!form) return
    const curW = parseFloat(form.weightLbs)
    const goalW = parseFloat(form.targetWeightLbs)
    if (isNaN(curW) || isNaN(goalW)) return
    const weeksNeeded = Math.abs(curW - goalW) / pace
    const d = new Date(Date.now() + weeksNeeded * 7 * 24 * 60 * 60 * 1000)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    set('targetDate', `${yyyy}-${mm}-${dd}`)
  }

  async function handleSave() {
    if (!form) return
    setSaving(true); setSaveError(''); setSaved(false)
    try {
      let dateOfBirth: string | undefined
      const age = parseInt(form.age)
      if (!isNaN(age)) {
        const dob = new Date()
        dob.setFullYear(dob.getFullYear() - age)
        dateOfBirth = dob.toISOString().slice(0, 10)
      }
      const updated = await patchUserSettings({
        sex: form.sex || undefined,
        date_of_birth: dateOfBirth,
        height_cm: parseFloat(form.heightCm) || undefined,
        weight_lbs: parseFloat(form.weightLbs) || undefined,
        activity_level: form.activityLevel || undefined,
        target_weight_lbs: parseFloat(form.targetWeightLbs) || undefined,
        target_date: form.targetDate || undefined,
        units: form.units,
        budget_auto: form.budgetAuto,
        calorie_budget: form.budgetAuto ? undefined : (parseInt(form.manualBudget) || undefined),
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

  const numInputCls = 'border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white text-center w-20 focus:outline-none focus:border-stride-500 focus:ring-2 focus:ring-stride-500/10'

  return (
    <>
      {/* Scrollable content — pb-32 leaves room for the fixed save bar */}
      <div className="max-w-xl mx-auto px-4 py-6 pb-32 space-y-6">

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
                  <div className="text-[11px] text-stride-500 mb-0.5 uppercase tracking-wide">Your Budget</div>
                  <div className="text-xl font-bold text-stride-700">{preview.budget.toLocaleString()}</div>
                  <div className="text-[10px] text-stride-400">cal/day</div>
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
                    <span>BMR ({form.sex}, age {form.age}, {form.heightCm} cm, {form.weightLbs} lbs)</span>
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
                        <span className="font-semibold text-stride-700">= Daily budget</span>
                        <span className="font-bold text-stride-700">{preview.budget.toLocaleString()} cal</span>
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

        {/* ── Profile ────────────────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <SectionHeader>Profile</SectionHeader>
          <Row label="Units" sub="Affects displayed values only">
            <SegmentedControl
              options={[{ label: 'US', value: 'us' }, { label: 'Metric', value: 'metric' }]}
              value={form.units}
              onChange={v => set('units', v as 'us' | 'metric')}
            />
          </Row>
        </section>

        {/* ── Body Metrics ───────────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <SectionHeader>Body Metrics</SectionHeader>
          <div className="space-y-4">

            <Row label="Biological sex" sub="Used for BMR calculation">
              <SegmentedControl
                options={[{ label: 'Male', value: 'male' }, { label: 'Female', value: 'female' }]}
                value={form.sex}
                onChange={v => set('sex', v)}
              />
            </Row>

            <Row label="Age">
              <div className="flex items-center gap-2">
                <input
                  type="number" min={18} max={100}
                  value={form.age}
                  onChange={e => set('age', e.target.value)}
                  placeholder="—"
                  className={numInputCls}
                />
                <span className="text-sm text-gray-400">yrs</span>
              </div>
            </Row>

            <Row label="Height">
              {form.units === 'us' ? (
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 py-2 bg-white focus-within:border-stride-500 focus-within:ring-2 focus-within:ring-stride-500/10">
                    <input
                      type="number" min={3} max={8}
                      value={form.heightFt}
                      onChange={e => onHeightFtChange(e.target.value)}
                      placeholder="—"
                      className="w-10 text-sm text-gray-900 bg-transparent outline-none text-center"
                    />
                    <span className="text-xs text-gray-400">ft</span>
                  </div>
                  <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 py-2 bg-white focus-within:border-stride-500 focus-within:ring-2 focus-within:ring-stride-500/10">
                    <input
                      type="number" min={0} max={11}
                      value={form.heightIn}
                      onChange={e => onHeightInChange(e.target.value)}
                      placeholder="—"
                      className="w-10 text-sm text-gray-900 bg-transparent outline-none text-center"
                    />
                    <span className="text-xs text-gray-400">in</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={50} max={300}
                    value={form.heightCm}
                    onChange={e => onHeightCmChange(e.target.value)}
                    placeholder="—"
                    className={numInputCls}
                  />
                  <span className="text-sm text-gray-400">cm</span>
                </div>
              )}
            </Row>

            <Row label="Current weight" sub="Also logs to weight history">
              <div className="flex items-center gap-2">
                {form.units === 'us' ? (
                  <input
                    type="number" min={50} max={700} step={0.1}
                    value={form.weightLbs}
                    onChange={e => onWeightLbsChange(e.target.value)}
                    placeholder="—"
                    className={numInputCls}
                  />
                ) : (
                  <input
                    type="number" min={20} max={320} step={0.1}
                    value={form.weightKg}
                    onChange={e => onWeightKgChange(e.target.value)}
                    placeholder="—"
                    className={numInputCls}
                  />
                )}
                <span className="text-sm text-gray-400">{form.units === 'us' ? 'lbs' : 'kg'}</span>
              </div>
            </Row>

          </div>
        </section>

        {/* ── Activity Level ─────────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <SectionHeader>Activity Level</SectionHeader>
          <p className="text-xs text-gray-400 mb-3">
            Based on your <strong className="text-gray-500">daily movement</strong>, not workouts — log exercise in the calorie log and it counts automatically.
          </p>
          <div className="space-y-2">
            {ACTIVITY_LEVELS.map(level => {
              const selected = form.activityLevel === level.value
              return (
                <button
                  key={level.value}
                  onClick={() => set('activityLevel', level.value)}
                  className={`w-full text-left border-2 rounded-xl p-3.5 flex items-center gap-3 transition-all ${
                    selected
                      ? 'border-stride-500 bg-stride-50 cursor-default'
                      : 'border-gray-100 bg-white hover:border-gray-300 hover:bg-gray-50 cursor-pointer'
                  }`}
                >
                  {/* Radio dot */}
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    selected ? 'border-stride-600 bg-stride-600' : 'border-gray-300'
                  }`}>
                    {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <span className="text-lg flex-shrink-0 leading-none">{level.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-800">{level.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{level.desc}</div>
                  </div>
                  <div className="text-xs text-gray-300 flex-shrink-0 tabular-nums">{level.mult}</div>
                </button>
              )
            })}
          </div>
        </section>

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
                onChange={e => set('targetDate', e.target.value)}
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
                onClick={() => set('budgetAuto', !form.budgetAuto)}
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
                <span className="text-sm font-semibold text-stride-700">
                  {preview ? `${preview.budget.toLocaleString()} cal/day` : '—'}
                </span>
              </Row>
            ) : (
              <Row label="Manual budget">
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={1200} max={5000}
                    value={form.manualBudget}
                    onChange={e => set('manualBudget', e.target.value)}
                    className={`${numInputCls} w-24`}
                  />
                  <span className="text-sm text-gray-400">cal/day</span>
                </div>
              </Row>
            )}

          </div>
        </section>

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

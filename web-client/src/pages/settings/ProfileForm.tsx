// ProfileForm covers Profile, Body Metrics, and Activity Level sections.
// Receives form state and a patch callback — no local state beyond what
// the parent tracks.

import { SectionHeader, Row, SegmentedControl, numInputCls } from './shared'
import { ACTIVITY_LEVELS, cmToFtIn, ftInToCm, lbsToKg, kgToLbs } from './utils'
import type { FormState } from './utils'

interface ProfileFormProps {
  form: FormState
  onFormChange: (patch: Partial<FormState>) => void
}

export default function ProfileForm({ form, onFormChange }: ProfileFormProps) {
  // Height handlers: keep both the display unit (ft/in or cm) and the canonical
  // cm value in sync so the preview always has a valid heightCm to compute from.
  function onHeightFtChange(v: string) {
    onFormChange({
      heightFt: v,
      heightCm: String(ftInToCm(parseFloat(v) || 0, parseFloat(form.heightIn) || 0)),
    })
  }
  function onHeightInChange(v: string) {
    onFormChange({
      heightIn: v,
      heightCm: String(ftInToCm(parseFloat(form.heightFt) || 0, parseFloat(v) || 0)),
    })
  }
  function onHeightCmChange(v: string) {
    const cm = parseFloat(v)
    const { ft, inches } = isNaN(cm) ? { ft: 0, inches: 0 } : cmToFtIn(cm)
    onFormChange({ heightCm: v, heightFt: String(ft), heightIn: String(inches) })
  }

  // Weight handlers: keep lbs (canonical) and kg display value in sync.
  function onWeightLbsChange(v: string) {
    const lbs = parseFloat(v)
    onFormChange({ weightLbs: v, weightKg: isNaN(lbs) ? '' : String(lbsToKg(lbs)) })
  }
  function onWeightKgChange(v: string) {
    const kg = parseFloat(v)
    onFormChange({ weightKg: v, weightLbs: isNaN(kg) ? '' : String(kgToLbs(kg)) })
  }

  return (
    <>
      {/* ── Profile ────────────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <SectionHeader>Profile</SectionHeader>
        <Row label="Units" sub="Affects displayed values only">
          <SegmentedControl
            options={[{ label: 'US', value: 'us' }, { label: 'Metric', value: 'metric' }]}
            value={form.units}
            onChange={v => onFormChange({ units: v as 'us' | 'metric' })}
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
              onChange={v => onFormChange({ sex: v })}
            />
          </Row>

          <Row label="Date of birth">
            <input
              type="date"
              value={form.dateOfBirth}
              onChange={e => onFormChange({ dateOfBirth: e.target.value })}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white cursor-pointer hover:border-gray-400 focus:outline-none focus:border-stride-500 focus:ring-2 focus:ring-stride-500/10"
            />
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
                onClick={() => onFormChange({ activityLevel: level.value })}
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

        {/* Exercise target — daily planned workout burn. Added to food budget so
            net calories stay on target even after logging exercise. */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <Row label="Daily exercise target" sub="Adds to food budget; net stays on track">
            <div className="flex items-center gap-2">
              <input
                type="number" min={0} max={2000} step={50}
                value={form.exerciseTarget}
                onChange={e => onFormChange({ exerciseTarget: e.target.value })}
                placeholder="0"
                className={numInputCls}
              />
              <span className="text-sm text-gray-400">cal/day</span>
            </div>
          </Row>
        </div>
      </section>
    </>
  )
}

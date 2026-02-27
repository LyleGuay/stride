// Settings-local React UI primitives shared across sub-components.

import type { ReactNode } from 'react'

// Shared numeric input class — centered small input with border and focus ring.
export const numInputCls = 'border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white text-center w-20 focus:outline-none focus:border-stride-500 focus:ring-2 focus:ring-stride-500/10'

// Section header: small uppercase label with a bottom border, matching mockup.
export function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 pb-2 border-b border-gray-100 mb-4">
      {children}
    </div>
  )
}

// Horizontal row: label on the left, control on the right.
export function Row({ label, sub, children }: { label: string; sub?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-700">{label}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

// Segmented pill control — gray background with white active pill.
export function SegmentedControl({ options, value, onChange }: {
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

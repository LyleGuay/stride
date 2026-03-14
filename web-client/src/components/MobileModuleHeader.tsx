// MobileModuleHeader — mobile-only header row (lg:hidden) showing the module
// name on the left and a tab-switching dropdown on the right.
//
// On desktop (≥lg) the existing underline tab row is rendered instead — this
// component is only mounted inside a `lg:hidden` container in each page.

import { useState, type ReactNode } from 'react'

/* Tab descriptor — mirrors the shape of each page's tab definitions */
export interface TabDef {
  value: string
  label: string
  icon: ReactNode
}

interface Props {
  moduleName: string
  tabs: TabDef[]
  activeTab: string
  onTabChange: (tab: string) => void
  onOpenSidebar: () => void
}

export default function MobileModuleHeader({ moduleName, tabs, activeTab, onTabChange, onOpenSidebar }: Props) {
  const [open, setOpen] = useState(false)
  const active = tabs.find(t => t.value === activeTab)

  return (
    <div className="flex items-center justify-between px-4 border-b border-gray-200 bg-white" style={{ height: 56 }}>

      {/* Left: hamburger + module name */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenSidebar}
          className="p-1 -ml-1 rounded-md hover:bg-gray-100"
          aria-label="Open sidebar"
        >
          <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <span className="text-base font-semibold text-gray-900">{moduleName}</span>
      </div>

      {/* Right: active tab label + chevron — tapping opens the dropdown */}
      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-semibold transition-colors ${
            open
              ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
              : 'bg-gray-50 border-gray-200 text-gray-700'
          }`}
        >
          {active?.icon}
          {active?.label}
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <>
            {/* Click-away backdrop */}
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-[calc(100%+6px)] z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-36">
              {tabs.map(tab => (
                <button
                  key={tab.value}
                  onClick={() => { onTabChange(tab.value); setOpen(false) }}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                    tab.value === activeTab
                      ? 'text-indigo-700 font-semibold bg-indigo-50'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.value === activeTab && (
                    <svg className="w-3.5 h-3.5 text-indigo-600 ml-auto shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

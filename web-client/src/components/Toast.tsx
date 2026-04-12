/* Toast — fixed bottom-center notification banner with optional action button.
 * Auto-dismisses after `duration` ms (default 4000). Designed for undo flows
 * (task status changes, etc.) and reusable across modules.
 */

import { useEffect } from 'react'

interface ToastProps {
  message: string
  action?: { label: string; onClick: () => void }
  duration?: number
  onClose: () => void
}

export function Toast({ message, action, duration = 4000, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
  }, [duration, onClose])

  return (
    <div data-testid="toast" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg bg-gray-900 px-4 py-3 text-sm text-white shadow-lg">
      <span>{message}</span>
      {action && (
        <button
          onClick={() => { action.onClick(); onClose() }}
          className="font-semibold text-indigo-300 hover:text-indigo-200"
        >
          {action.label}
        </button>
      )}
      <button
        onClick={onClose}
        aria-label="Dismiss"
        className="ml-1 text-gray-400 hover:text-white"
      >
        ✕
      </button>
    </div>
  )
}

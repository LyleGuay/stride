// DateHeader — left/right arrows with "Today"/"Yesterday" or formatted date.
// Sub-label shows full date (e.g. "Thu, Feb 13, 2026").

interface Props {
  date: string // YYYY-MM-DD
  onDateChange: (date: string) => void
}

// Formats a YYYY-MM-DD string into a primary label and sub-label.
function getDateLabels(dateStr: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const date = new Date(dateStr + 'T00:00:00')
  const diffDays = Math.round((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

  let primary: string
  if (diffDays === 0) primary = 'Today'
  else if (diffDays === 1) primary = 'Yesterday'
  else if (diffDays === -1) primary = 'Tomorrow'
  else primary = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  const sub = date.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })

  return { primary, sub }
}

// Shifts a YYYY-MM-DD string forward or backward by a number of days.
function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export default function DateHeader({ date, onDateChange }: Props) {
  const { primary, sub } = getDateLabels(date)

  return (
    <div className="flex items-center justify-between mb-4">
      <button onClick={() => onDateChange(shiftDate(date, -1))} className="p-1.5 rounded hover:bg-gray-100">
        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </button>
      <div className="text-center">
        <span className="text-base font-semibold">{primary}</span>
        <span className="text-xs text-gray-500 ml-2">{sub}</span>
      </div>
      <button onClick={() => onDateChange(shiftDate(date, 1))} className="p-1.5 rounded hover:bg-gray-100">
        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>
    </div>
  )
}

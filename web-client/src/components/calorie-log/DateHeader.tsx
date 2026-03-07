// DateHeader — date navigator capsule with prev/next arrows.
// "Today"/"Yesterday"/"Tomorrow" is shown in blue when applicable; plain date otherwise.

interface Props {
  date: string // YYYY-MM-DD
  onDateChange: (date: string) => void
}

// Formats a YYYY-MM-DD string into display labels.
// isSpecial is true for Today/Yesterday/Tomorrow — the label is shown in blue.
function getDateLabels(dateStr: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const date = new Date(dateStr + 'T00:00:00')
  const diffDays = Math.round((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

  let primary = ''
  let isSpecial = true
  if (diffDays === 0) primary = 'Today'
  else if (diffDays === 1) primary = 'Yesterday'
  else if (diffDays === -1) primary = 'Tomorrow'
  else isSpecial = false

  const sub = date.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })

  return { primary, sub, isSpecial }
}

// Shifts a YYYY-MM-DD string forward or backward by a number of days.
function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export default function DateHeader({ date, onDateChange }: Props) {
  const { primary, sub, isSpecial } = getDateLabels(date)

  return (
    <div className="flex items-center justify-center py-2.5">
      <div className="flex items-center bg-gray-100 rounded-full px-1 py-1">
        <button
          onClick={() => onDateChange(shiftDate(date, -1))}
          className="p-1.5 rounded-full hover:bg-gray-200 text-gray-500 transition-colors flex items-center"
          aria-label="Previous day"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        {/* Fixed-width center so the capsule doesn't jump as the date label changes */}
        <div className="flex items-center justify-center px-2 min-w-[196px]">
          {isSpecial ? (
            <>
              <span className="text-sm font-semibold text-blue-600">{primary}</span>
              <span className="text-xs text-gray-500 ml-2">{sub}</span>
            </>
          ) : (
            <span className="text-sm font-semibold text-gray-800">{sub}</span>
          )}
        </div>
        <button
          onClick={() => onDateChange(shiftDate(date, 1))}
          className="p-1.5 rounded-full hover:bg-gray-200 text-gray-500 transition-colors flex items-center"
          aria-label="Next day"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
    </div>
  )
}

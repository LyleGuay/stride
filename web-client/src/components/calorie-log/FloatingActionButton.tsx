// FloatingActionButton — fixed-position (+) button that opens the bottom sheet
// in create mode. Positioned bottom-right.

interface Props {
  onClick: () => void
}

export default function FloatingActionButton({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 w-14 h-14 bg-stride-600 hover:bg-stride-700 text-white rounded-full shadow-lg flex items-center justify-center z-30 transition-colors"
    >
      <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    </button>
  )
}

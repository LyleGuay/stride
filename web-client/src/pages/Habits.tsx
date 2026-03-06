import { useState } from 'react'
import { useSidebar } from '../components/SidebarContext'

interface Habit {
  id: string
  name: string
  completedDates: string[]
}

// Existing habits page content, moved from App.tsx.
export default function Habits() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [newHabitName, setNewHabitName] = useState('')
  const { setOpen: setSidebarOpen } = useSidebar()

  const today = new Date().toISOString().split('T')[0]

  const addHabit = () => {
    if (!newHabitName.trim()) return
    const habit: Habit = {
      id: crypto.randomUUID(),
      name: newHabitName.trim(),
      completedDates: [],
    }
    setHabits([...habits, habit])
    setNewHabitName('')
  }

  const toggleHabit = (habitId: string) => {
    setHabits(habits.map(habit => {
      if (habit.id !== habitId) return habit
      const isCompleted = habit.completedDates.includes(today)
      return {
        ...habit,
        completedDates: isCompleted
          ? habit.completedDates.filter(d => d !== today)
          : [...habit.completedDates, today],
      }
    }))
  }

  const deleteHabit = (habitId: string) => {
    setHabits(habits.filter(h => h.id !== habitId))
  }

  return (
    <div>
      {/* Sticky h-14 header — matches sidebar logo height for continuous chrome line */}
      <div className="sticky top-0 z-20 bg-white h-14 flex items-center px-6 border-b border-gray-200">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-1 -ml-1 mr-3 rounded-md hover:bg-gray-100 lg:hidden"
        >
          <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <h2 className="text-sm font-semibold text-gray-800">Habits</h2>
      </div>
    <div className="max-w-md mx-auto p-4">
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={newHabitName}
          onChange={(e) => setNewHabitName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addHabit()}
          placeholder="New habit..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stride-500"
        />
        <button
          onClick={addHabit}
          className="px-4 py-2 bg-stride-600 text-white rounded-lg hover:bg-stride-700 transition-colors"
        >
          Add
        </button>
      </div>

      {habits.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          <p>No habits yet.</p>
          <p className="text-sm">Add your first habit above!</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {habits.map(habit => {
            const isCompleted = habit.completedDates.includes(today)
            return (
              <li
                key={habit.id}
                className="flex items-center gap-3 p-4 bg-white rounded-lg shadow-sm border border-gray-100"
              >
                <button
                  onClick={() => toggleHabit(habit.id)}
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors ${
                    isCompleted
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'border-gray-300 hover:border-stride-400'
                  }`}
                >
                  {isCompleted && (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <span className={`flex-1 ${isCompleted ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                  {habit.name}
                </span>
                <button
                  onClick={() => deleteHabit(habit.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
    </div>
  )
}

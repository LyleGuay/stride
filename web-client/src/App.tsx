import { useState } from 'react'

interface Habit {
  id: string
  name: string
  completedDates: string[]
}

function App() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [newHabitName, setNewHabitName] = useState('')

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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-600 text-white p-4 shadow-lg">
        <h1 className="text-2xl font-bold text-center">Stride</h1>
        <p className="text-indigo-200 text-center text-sm">Build better habits</p>
      </header>

      <main className="max-w-md mx-auto p-4">
        <div className="flex gap-2 mb-6">
          <input
            type="text"
            value={newHabitName}
            onChange={(e) => setNewHabitName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addHabit()}
            placeholder="New habit..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={addHabit}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
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
                        : 'border-gray-300 hover:border-indigo-400'
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
      </main>
    </div>
  )
}

export default App

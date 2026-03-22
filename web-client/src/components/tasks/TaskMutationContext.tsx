// TaskMutationContext — lets TasksPage views signal any task mutation
// (status change, create, delete) to AppShell so the overdue badge
// count can be refreshed without prop-drilling through <Outlet />.

import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

interface TaskMutationContextValue {
  // Call after any create / update / delete to invalidate the overdue badge.
  notifyMutation: () => void
  // Increments on each notify — AppShell includes this in a useEffect dep array.
  mutationKey: number
}

const TaskMutationContext = createContext<TaskMutationContextValue>({
  notifyMutation: () => {},
  mutationKey: 0,
})

export function TaskMutationProvider({ children }: { children: ReactNode }) {
  const [mutationKey, setMutationKey] = useState(0)
  return (
    <TaskMutationContext.Provider value={{ notifyMutation: () => setMutationKey(k => k + 1), mutationKey }}>
      {children}
    </TaskMutationContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTaskMutation() {
  return useContext(TaskMutationContext)
}

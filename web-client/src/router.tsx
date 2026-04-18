// App router — defines all routes and wraps authenticated pages in RequireAuth.
// Login is public; all other routes require a token in localStorage.

import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import AppShell from './components/AppShell'
import CalorieLog from './pages/CalorieLog'
import Login from './pages/Login'
import Settings from './pages/settings'
import RecipeList from './pages/RecipeList'
import RecipeDetail from './pages/RecipeDetail'
import RecipeExecution from './pages/RecipeExecution'
import RequireAuth from './components/RequireAuth'
import HabitsPage from './pages/HabitsPage'
import HabitDetail from './pages/HabitDetail'
import JournalPage from './pages/JournalPage'
import TasksPage from './pages/TasksPage'
import MealPlanPage from './pages/MealPlanPage'

export default function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/calorie-log" replace />} />
          <Route path="calorie-log" element={<CalorieLog />} />
          <Route path="meal-plan" element={<MealPlanPage />} />
          <Route path="habits" element={<HabitsPage />} />
          <Route path="journal" element={<JournalPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="habits/:id" element={<HabitDetail />} />
          <Route path="settings" element={<Settings />} />
          <Route path="recipes" element={<RecipeList />} />
          <Route path="recipes/:id" element={<RecipeDetail />} />
          <Route path="recipes/:id/cook" element={<RecipeExecution />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

// App router — defines all routes and wraps authenticated pages in RequireAuth.
// Login is public; all other routes require a token in localStorage.

import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import AppShell from './components/AppShell'
import CalorieLog from './pages/CalorieLog'
import Habits from './pages/Habits'
import Login from './pages/Login'
import Settings from './pages/Settings'
import RequireAuth from './components/RequireAuth'

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
          <Route path="habits" element={<Habits />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

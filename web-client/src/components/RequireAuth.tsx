// RequireAuth redirects unauthenticated users to /login.
// Wrap protected routes with this component in the router.

import { Navigate } from 'react-router'

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/login" replace />
  return children
}

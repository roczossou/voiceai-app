import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store.js'

export function AuthGuard() {
  const isAuthenticated = useAuthStore(s => s.user !== null && s.accessToken !== null)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Outlet />
}

export function GuestGuard() {
  const isAuthenticated = useAuthStore(s => s.user !== null && s.accessToken !== null)
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return <Outlet />
}

export function AdminGuard() {
  const isAdmin = useAuthStore(s => s.user?.role === 'admin')
  if (!isAdmin) return <Navigate to="/dashboard" replace />
  return <Outlet />
}

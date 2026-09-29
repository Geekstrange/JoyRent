// File Name: ProtectedRoute.jsx
// Created Time: 2026-09-22 19:36:31
// Update Time: 2026-09-22 19:36:31


import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'

export default function ProtectedRoute({ children }) {
  const token = useAuthStore((s) => s.token)
  const location = useLocation()

  if (!token) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }
  return children
}

import { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { TkxelLogo } from '@/components/ui/TkxelLogo'
import { useAuth } from '@/contexts/AuthContext'

export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-surface-secondary px-4">
        <div className="grid justify-items-center gap-4">
          <TkxelLogo size="sidebar" />
          <div className="h-1.5 w-44 overflow-hidden rounded-full bg-surface-tertiary">
            <div className="h-full w-1/2 animate-pulse-soft rounded-full bg-brand-blue" />
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children
}

export function GuestRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return null
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return children
}

import { currentUser } from '@/data/mock'
import { useAuth } from '@/contexts/AuthContext'

export function useRole() {
  const { user } = useAuth()
  return user ?? currentUser
}

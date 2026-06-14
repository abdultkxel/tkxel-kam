import { useAuth } from '@/contexts/AuthContext'
import type { User } from '@/types/user'

const unauthenticatedUser: User = {
  id: '',
  name: 'Signed out',
  role: 'guest',
  avatarInitials: '--',
  email: '',
}

export function useRole() {
  const { user } = useAuth()
  return user ?? unauthenticatedUser
}

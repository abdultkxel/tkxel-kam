export type UserRole = 'am' | 'leadership' | 'admin'

export interface User {
  id: string
  name: string
  role: UserRole
  avatarInitials: string
  email: string
}

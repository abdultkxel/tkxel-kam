export type UserRole = 'am' | 'account_manager' | 'leadership' | 'admin' | 'super_admin'

export interface User {
  id: string
  name: string
  role: UserRole
  avatarInitials: string
  email: string
  title?: string | null
  phone?: string | null
}

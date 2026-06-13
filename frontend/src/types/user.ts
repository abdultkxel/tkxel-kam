export type UserRole =
  | 'account_manager'
  | 'admin'
  | 'super_admin'
  | 'kam_head'
  | 'delivery_lead'
  | 'leadership_viewer'
  | 'delivery_stakeholder'
  | (string & {})

export interface User {
  id: string
  name: string
  role: UserRole
  avatarInitials: string
  email: string
  title?: string | null
  phone?: string | null
  primaryGoogleCalendarId?: string | null
}

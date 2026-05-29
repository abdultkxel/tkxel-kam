export type UserRole =
  | 'am'
  | 'account_manager'
  | 'leadership'
  | 'leadership_viewer'
  | 'admin'
  | 'super_admin'
  | 'ops_lead'
  | 'kam_head'
  | 'content_specialist'
  | 'commercial_stakeholder'
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
}

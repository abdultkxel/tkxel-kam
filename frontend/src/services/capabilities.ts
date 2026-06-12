import { apiRequest } from '@/services/api'

export interface UserCapabilities {
  permission_keys: string[]
  can_access_admin: boolean
  can_view_portfolio: boolean
  can_update_assigned_accounts: boolean
  can_update_portfolio_accounts: boolean
  can_assign_account_owners: boolean
  can_approve_onboarding: boolean
  can_view_sensitive_sources: boolean
  can_manage_sensitive_sources: boolean
  can_approve_kyc: boolean
  can_moderate_timeline: boolean
  can_export_reports: boolean
  can_configure_playbooks: boolean
  can_manage_tasks_portfolio: boolean
}

export const emptyCapabilities: UserCapabilities = {
  permission_keys: [],
  can_access_admin: false,
  can_view_portfolio: false,
  can_update_assigned_accounts: false,
  can_update_portfolio_accounts: false,
  can_assign_account_owners: false,
  can_approve_onboarding: false,
  can_view_sensitive_sources: false,
  can_manage_sensitive_sources: false,
  can_approve_kyc: false,
  can_moderate_timeline: false,
  can_export_reports: false,
  can_configure_playbooks: false,
  can_manage_tasks_portfolio: false,
}

export function getCurrentUserCapabilities(token: string) {
  return apiRequest<UserCapabilities>('/api/users/me/capabilities', { token })
}

export function hasPermission(capabilities: UserCapabilities | null | undefined, permissionKey: string) {
  return Boolean(capabilities?.permission_keys.includes(permissionKey))
}

export function hasAnyPermission(capabilities: UserCapabilities | null | undefined, permissionKeys: string[]) {
  return permissionKeys.some(permissionKey => hasPermission(capabilities, permissionKey))
}

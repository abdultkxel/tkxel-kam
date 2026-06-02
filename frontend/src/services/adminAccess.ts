import { apiRequest } from '@/services/api'

export interface AdminUser {
  id: string
  email: string
  full_name: string
  role: string
  title?: string | null
  phone?: string | null
  avatar_initials: string
  primary_google_calendar_id?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Permission {
  id: string
  module: string
  action: string
  description?: string | null
}

export interface RolePermission {
  permission: Permission
  allowed: boolean
}

export interface Role {
  id: string
  slug: string
  name: string
  description?: string | null
  is_system: boolean
  permissions: RolePermission[]
  created_at: string
  updated_at: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface AdminAuditLog {
  id: string
  module: string
  action: string
  entity_type: string
  entity_id?: string | null
  actor_id?: string | null
  actor_name?: string | null
  before_value?: Record<string, unknown> | null
  after_value?: Record<string, unknown> | null
  reason?: string | null
  created_at: string
}

export interface AdminSystemHealth {
  status: string
  generated_at: string
  checks: { key: string; status: string; detail: string }[]
  metrics: Record<string, number>
}

export interface AdminJobLog {
  id: string
  job_type: string
  mode: string
  status: string
  matched_count: number
  affected_count: number
  actor_name?: string | null
  error_message?: string | null
  started_at: string
  finished_at?: string | null
}

export interface AdminErrorLog {
  id: string
  source: string
  severity: string
  message: string
  status: string
  actor_name?: string | null
  created_at: string
}

export interface AllowedEmailDomainsSettings {
  domains: string[]
  domains_input: string
  updated_by_id?: string | null
  updated_by_name?: string | null
  updated_at?: string | null
  duplicates_removed: boolean
}

export type CustomFieldType = 'text' | 'textarea' | 'number' | 'currency' | 'date' | 'datetime' | 'boolean' | 'single_select' | 'multi_select' | 'email' | 'url' | 'phone'
export type CustomFieldStatus = 'all' | 'active' | 'inactive'
export type CustomFieldSort = 'label' | 'module' | 'field_type' | 'sort_order' | 'updated_at'

export interface CustomFieldModule {
  slug: string
  name: string
}

export interface CustomFieldDefinition {
  id: string
  module: string
  field_key: string
  label: string
  description?: string | null
  field_type: CustomFieldType
  placeholder?: string | null
  help_text?: string | null
  options: string[]
  validation_rules: Record<string, unknown>
  default_value?: unknown
  is_required: boolean
  is_sensitive: boolean
  is_active: boolean
  show_in_list: boolean
  show_in_detail: boolean
  sort_order: number
  created_by_id?: string | null
  updated_by_id?: string | null
  created_at: string
  updated_at: string
}

export interface UserListParams {
  search?: string
  status?: 'all' | 'active' | 'inactive'
  role?: string
  page?: number
  page_size?: number
}

export interface RoleListParams {
  search?: string
  type?: 'all' | 'system' | 'custom'
  page?: number
  page_size?: number
}

export interface CustomFieldListParams {
  search?: string
  module?: string
  field_type?: CustomFieldType | ''
  status?: CustomFieldStatus
  sort?: CustomFieldSort
  direction?: 'asc' | 'desc'
  page?: number
  page_size?: number
}

export interface CreateUserPayload {
  email: string
  password: string
  full_name: string
  role: string
  title?: string
  phone?: string
  avatar_initials?: string
  primary_google_calendar_id?: string
  is_active: boolean
}

export interface UpdateUserPayload {
  email?: string
  full_name?: string
  role?: string
  title?: string | null
  phone?: string | null
  avatar_initials?: string
  primary_google_calendar_id?: string | null
  is_active?: boolean
}

export interface CreateRolePayload {
  slug: string
  name: string
  description?: string
}

export interface RolePermissionGrant {
  module: string
  action: string
  allowed: boolean
}

export interface CustomFieldPayload {
  module: string
  field_key: string
  label: string
  description?: string | null
  field_type: CustomFieldType
  placeholder?: string | null
  help_text?: string | null
  options?: string[]
  validation_rules?: Record<string, unknown>
  default_value?: unknown
  is_required: boolean
  is_sensitive: boolean
  is_active: boolean
  show_in_list: boolean
  show_in_detail: boolean
  sort_order: number
}

export function listAdminUsers(token: string, params: UserListParams = {}) {
  return apiRequest<PaginatedResponse<AdminUser>>(`/api/admin/users${queryString(params)}`, { token })
}

export function createAdminUser(token: string, payload: CreateUserPayload) {
  return apiRequest<AdminUser>('/api/admin/users', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export function updateAdminUser(token: string, userId: string, payload: UpdateUserPayload) {
  return apiRequest<AdminUser>(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  })
}

export function deleteAdminUser(token: string, userId: string) {
  return apiRequest<{ message: string }>(`/api/admin/users/${userId}`, {
    method: 'DELETE',
    token,
  })
}

export function getAllowedEmailDomains(token: string) {
  return apiRequest<AllowedEmailDomainsSettings>('/api/admin/settings/allowed-email-domains', { token })
}

export function updateAllowedEmailDomains(token: string, domainsInput: string) {
  return apiRequest<AllowedEmailDomainsSettings>('/api/admin/settings/allowed-email-domains', {
    method: 'PATCH',
    token,
    body: JSON.stringify({ domains_input: domainsInput }),
  })
}

export function listRoles(token: string, params: RoleListParams = {}) {
  return apiRequest<PaginatedResponse<Role>>(`/api/admin/roles${queryString(params)}`, { token })
}

export function createRole(token: string, payload: CreateRolePayload) {
  return apiRequest<Role>('/api/admin/roles', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export function updateRole(token: string, roleSlug: string, payload: Omit<CreateRolePayload, 'slug'>) {
  return apiRequest<Role>(`/api/admin/roles/${roleSlug}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  })
}

export function deleteRole(token: string, roleSlug: string) {
  return apiRequest<{ message: string }>(`/api/admin/roles/${roleSlug}`, {
    method: 'DELETE',
    token,
  })
}

export function listPermissions(token: string) {
  return apiRequest<Permission[]>('/api/admin/permissions', { token })
}

export function updateRolePermissions(token: string, roleSlug: string, permissions: RolePermissionGrant[]) {
  return apiRequest<Role>(`/api/admin/roles/${roleSlug}/permissions`, {
    method: 'PUT',
    token,
    body: JSON.stringify({ permissions }),
  })
}

export function listCustomFieldModules(token: string) {
  return apiRequest<CustomFieldModule[]>('/api/admin/custom-fields/modules', { token })
}

export function listCustomFields(token: string, params: CustomFieldListParams = {}) {
  return apiRequest<PaginatedResponse<CustomFieldDefinition>>(`/api/admin/custom-fields${queryString(params)}`, { token })
}

export function createCustomField(token: string, payload: CustomFieldPayload) {
  return apiRequest<CustomFieldDefinition>('/api/admin/custom-fields', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export function updateCustomField(token: string, fieldId: string, payload: Partial<CustomFieldPayload>) {
  return apiRequest<CustomFieldDefinition>(`/api/admin/custom-fields/${fieldId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  })
}

export function deleteCustomField(token: string, fieldId: string) {
  return apiRequest<{ message: string }>(`/api/admin/custom-fields/${fieldId}`, {
    method: 'DELETE',
    token,
  })
}

export function getAdminAuditLogs(token: string, params: Record<string, string | number | undefined> = {}) {
  return apiRequest<PaginatedResponse<AdminAuditLog>>(`/api/admin/audit-logs${queryString(params)}`, { token })
}

export function exportAdminAuditLogs(token: string, params: Record<string, string | number | undefined> = {}) {
  return apiRequest<string>(`/api/admin/audit-logs/export${queryString(params)}`, { token })
}

export function getAdminSystemHealth(token: string) {
  return apiRequest<AdminSystemHealth>('/api/admin/system-health', { token })
}

export function getAdminJobLogs(token: string, params: Record<string, string | number | undefined> = {}) {
  return apiRequest<PaginatedResponse<AdminJobLog>>(`/api/admin/job-logs${queryString(params)}`, { token })
}

export function getAdminErrorLogs(token: string, params: Record<string, string | number | undefined> = {}) {
  return apiRequest<PaginatedResponse<AdminErrorLog>>(`/api/admin/error-logs${queryString(params)}`, { token })
}

type QueryParams = UserListParams | RoleListParams | CustomFieldListParams | Record<string, string | number | boolean | undefined | null>

function queryString(params: QueryParams) {
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') searchParams.set(key, String(value))
  })
  const query = searchParams.toString()
  return query ? `?${query}` : ''
}

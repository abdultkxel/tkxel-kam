import { apiRequest } from '@/services/api'

export interface AdminUser {
  id: string
  email: string
  full_name: string
  role: string
  title?: string | null
  phone?: string | null
  avatar_initials: string
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

export interface CreateUserPayload {
  email: string
  password: string
  full_name: string
  role: string
  title?: string
  phone?: string
  avatar_initials?: string
  is_active: boolean
}

export interface UpdateUserPayload {
  full_name?: string
  role?: string
  title?: string | null
  phone?: string | null
  avatar_initials?: string
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

export function listAdminUsers(token: string) {
  return apiRequest<AdminUser[]>('/api/admin/users', { token })
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

export function listRoles(token: string) {
  return apiRequest<Role[]>('/api/admin/roles', { token })
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

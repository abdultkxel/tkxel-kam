import * as Dialog from '@radix-ui/react-dialog'
import { Edit3, Plus, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/admin/ConfirmDialog'
import { FieldError } from '@/components/form/FieldError'
import { useAuth } from '@/contexts/AuthContext'
import { ApiError } from '@/services/api'
import {
  Permission,
  Role,
  RolePermissionGrant,
  createRole,
  deleteRole,
  listPermissions,
  listRoles,
  updateRole,
  updateRolePermissions,
} from '@/services/adminAccess'
import { apiFieldErrors, clearFieldError, FieldErrors, hasFieldErrors } from '@/utils/formErrors'
import { cn } from '@/utils/cn'

interface RoleFormState {
  slug: string
  name: string
  description: string
  permissions: Record<string, boolean>
}

const emptyForm: RoleFormState = {
  slug: '',
  name: '',
  description: '',
  permissions: {},
}

function permissionKey(permission: Permission) {
  return `${permission.module}:${permission.action}`
}

function formatSlug(value: string) {
  return value.replace(/_/g, ' ')
}

function formFromRole(role: Role, permissions: Permission[]): RoleFormState {
  const roleGrants = role.permissions.reduce<Record<string, boolean>>((index, grant) => {
    index[permissionKey(grant.permission)] = grant.allowed
    return index
  }, {})
  return {
    slug: role.slug,
    name: role.name,
    description: role.description ?? '',
    permissions: permissions.reduce<Record<string, boolean>>((draft, permission) => {
      draft[permissionKey(permission)] = Boolean(roleGrants[permissionKey(permission)])
      return draft
    }, {}),
  }
}

export function AdminRolesPanel() {
  const { token } = useAuth()
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null)
  const [form, setForm] = useState<RoleFormState>(emptyForm)

  const sortedRoles = useMemo(() => [...roles].sort((first, second) => first.name.localeCompare(second.name)), [roles])
  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, Permission[]>()
    permissions.forEach(permission => groups.set(permission.module, [...(groups.get(permission.module) ?? []), permission]))
    return Array.from(groups, ([module, modulePermissions]) => ({ module, permissions: modulePermissions }))
  }, [permissions])

  useEffect(() => {
    if (!token) return
    void loadData()
  }, [token])

  async function loadData() {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const [nextRoles, nextPermissions] = await Promise.all([listRoles(token), listPermissions(token)])
      setRoles(nextRoles.filter(role => role.slug !== 'super_admin'))
      setPermissions(nextPermissions)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load roles')
    } finally {
      setLoading(false)
    }
  }

  function openCreateDialog() {
    setEditingRole(null)
    setForm({
      ...emptyForm,
      permissions: permissions.reduce<Record<string, boolean>>((draft, permission) => {
        draft[permissionKey(permission)] = false
        return draft
      }, {}),
    })
    setFieldErrors({})
    setFormError('')
    setDialogOpen(true)
  }

  function openEditDialog(role: Role) {
    setEditingRole(role)
    setForm(formFromRole(role, permissions))
    setFieldErrors({})
    setFormError('')
    setDialogOpen(true)
  }

  function updateField(field: keyof Omit<RoleFormState, 'permissions'>, value: string) {
    setForm(current => ({ ...current, [field]: value }))
    setFieldErrors(errors => clearFieldError(errors, field))
  }

  function togglePermission(permission: Permission, allowed: boolean) {
    setForm(current => ({
      ...current,
      permissions: { ...current.permissions, [permissionKey(permission)]: allowed },
    }))
  }

  function toggleAllPermissions(allowed: boolean) {
    setForm(current => ({
      ...current,
      permissions: permissions.reduce<Record<string, boolean>>((draft, permission) => {
        draft[permissionKey(permission)] = allowed
        return draft
      }, {}),
    }))
  }

  async function submitRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    setSaving(true)
    setFieldErrors({})
    setFormError('')
    try {
      const role = editingRole
        ? await updateRole(token, editingRole.slug, { name: form.name, description: form.description || undefined })
        : await createRole(token, { slug: form.slug, name: form.name, description: form.description || undefined })
      const permissionUpdates = buildPermissionUpdates(role, permissions, form.permissions, Boolean(editingRole))
      const savedRole = permissionUpdates.length ? await updateRolePermissions(token, role.slug, permissionUpdates) : role
      setRoles(current => {
        const exists = current.some(item => item.slug === savedRole.slug)
        return exists ? current.map(item => item.slug === savedRole.slug ? savedRole : item) : [...current, savedRole]
      })
      setDialogOpen(false)
      toast.success(editingRole ? 'Role updated successfully' : 'Role created successfully')
    } catch (err) {
      const nextErrors = apiFieldErrors(err)
      setFieldErrors(nextErrors)
      if (err instanceof ApiError && !hasFieldErrors(nextErrors)) setFormError(err.message)
      if (!(err instanceof ApiError)) setFormError('Unable to save role')
      toast.error(err instanceof ApiError ? err.message : 'Unable to save role')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!token || !deleteTarget) return
    setDeleting(true)
    try {
      await deleteRole(token, deleteTarget.slug)
      setRoles(current => current.filter(role => role.slug !== deleteTarget.slug))
      setDeleteTarget(null)
      toast.success('Role deleted successfully')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Unable to delete role')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="tk-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border p-5">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">RBAC</p>
          <h2 className="text-base font-semibold text-ink">Roles Management</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="tk-button-secondary" onClick={() => void loadData()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </button>
          <button type="button" className="tk-button-primary" onClick={openCreateDialog}>
            <Plus className="h-4 w-4" />
            Create role
          </button>
        </div>
      </div>
      {error ? <p className="m-5 rounded-md border border-rag-red/20 bg-rag-red/10 px-3 py-2 text-sm font-medium text-rag-red">{error}</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[940px] text-left text-sm">
          <thead className="border-b border-surface-border bg-surface-tertiary text-xs font-semibold uppercase tracking-wider text-ink-secondary">
            <tr>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Permissions</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedRoles.map(role => (
              <tr key={role.slug} className="border-b border-surface-border last:border-b-0">
                <td className="px-4 py-3">
                  <p className="font-semibold text-ink">{role.name}</p>
                  <p className="text-xs text-ink-secondary">{role.slug}</p>
                </td>
                <td className="max-w-[360px] px-4 py-3 text-ink-secondary">{role.description || '-'}</td>
                <td className="px-4 py-3 text-ink-secondary">{role.permissions.filter(grant => grant.allowed).length} grants</td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-md bg-surface-tertiary px-2 py-1 text-xs font-bold uppercase tracking-wider text-ink-secondary">
                    {role.is_system ? 'System' : 'Custom'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button type="button" className="tk-button-secondary" onClick={() => openEditDialog(role)}>
                      <Edit3 className="h-4 w-4" />
                      Edit
                    </button>
                    <button type="button" className="tk-button-secondary text-rag-red" onClick={() => setDeleteTarget(role)} disabled={role.is_system}>
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <RoleFormDialog
        open={dialogOpen}
        form={form}
        groupedPermissions={groupedPermissions}
        fieldErrors={fieldErrors}
        formError={formError}
        isEditing={Boolean(editingRole)}
        isSaving={saving}
        onOpenChange={setDialogOpen}
        onFieldChange={updateField}
        onPermissionChange={togglePermission}
        onToggleAllPermissions={toggleAllPermissions}
        onSubmit={submitRole}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete role"
        description={`Delete ${deleteTarget?.name ?? 'this role'}? This action cannot be undone.`}
        isBusy={deleting}
        onOpenChange={open => !open && setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  )
}

interface RoleFormDialogProps {
  open: boolean
  form: RoleFormState
  groupedPermissions: { module: string; permissions: Permission[] }[]
  fieldErrors: FieldErrors
  formError: string
  isEditing: boolean
  isSaving: boolean
  onOpenChange: (open: boolean) => void
  onFieldChange: (field: keyof Omit<RoleFormState, 'permissions'>, value: string) => void
  onPermissionChange: (permission: Permission, allowed: boolean) => void
  onToggleAllPermissions: (allowed: boolean) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

function RoleFormDialog({ open, form, groupedPermissions, fieldErrors, formError, isEditing, isSaving, onOpenChange, onFieldChange, onPermissionChange, onToggleAllPermissions, onSubmit }: RoleFormDialogProps) {
  const allPermissions = groupedPermissions.flatMap(group => group.permissions)
  const allPermissionsSelected = allPermissions.length > 0 && allPermissions.every(permission => form.permissions[permissionKey(permission)])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[min(92vh,900px)] w-[min(1040px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-surface-border bg-white shadow-panel">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-surface-border bg-white p-5">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Roles</p>
              <Dialog.Title className="font-display text-2xl font-bold text-ink">{isEditing ? 'Edit role' : 'Create role'}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-secondary">
                Manage role details and module-level permissions in one form.
              </Dialog.Description>
            </div>
            <Dialog.Close className="tk-icon-button" aria-label="Close role form">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <form className="space-y-5 p-5" onSubmit={onSubmit} noValidate>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="tk-label">Slug</span>
                <input className={fieldClass(fieldErrors.slug)} value={form.slug} onChange={event => onFieldChange('slug', event.target.value)} disabled={isEditing} aria-invalid={Boolean(fieldErrors.slug)} />
                <FieldError id="admin-role-slug-error" message={fieldErrors.slug} />
              </label>
              <label className="block">
                <span className="tk-label">Name</span>
                <input className={fieldClass(fieldErrors.name)} value={form.name} onChange={event => onFieldChange('name', event.target.value)} aria-invalid={Boolean(fieldErrors.name)} />
                <FieldError id="admin-role-name-error" message={fieldErrors.name} />
              </label>
              <label className="block md:col-span-2">
                <span className="tk-label">Description</span>
                <input className={fieldClass(fieldErrors.description)} value={form.description} onChange={event => onFieldChange('description', event.target.value)} aria-invalid={Boolean(fieldErrors.description)} />
                <FieldError id="admin-role-description-error" message={fieldErrors.description} />
              </label>
            </div>
            <div className="rounded-lg border border-surface-border">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border bg-surface-tertiary px-4 py-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-brand-blue" />
                  <h3 className="text-sm font-bold text-ink">Permission settings</h3>
                </div>
                <button type="button" className="tk-button-secondary min-h-[36px] px-3 py-1.5 text-xs" onClick={() => onToggleAllPermissions(!allPermissionsSelected)}>
                  {allPermissionsSelected ? 'Clear all permissions' : 'Select all permissions'}
                </button>
              </div>
              <div className="max-h-[420px] overflow-y-auto">
                {groupedPermissions.map(group => (
                  <div key={group.module} className="grid gap-3 border-b border-surface-border p-4 last:border-b-0 lg:grid-cols-[260px_1fr]">
                    <p className="font-semibold capitalize text-ink">{formatSlug(group.module)}</p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {group.permissions.map(permission => (
                        <label key={permission.id} className="flex min-h-[44px] items-center gap-2 rounded-md border border-surface-border bg-white px-3 text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                          <input
                            type="checkbox"
                            checked={Boolean(form.permissions[permissionKey(permission)])}
                            onChange={event => onPermissionChange(permission, event.target.checked)}
                            aria-label={`${permission.module} ${permission.action}`}
                            className="h-4 w-4 rounded border-surface-border text-brand-blue"
                          />
                          {permission.action}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {formError ? <p className="rounded-md border border-rag-red/20 bg-rag-red/10 px-3 py-2 text-sm font-medium text-rag-red">{formError}</p> : null}
            <div className="flex justify-end gap-2">
              <Dialog.Close type="button" className="tk-button-secondary" disabled={isSaving}>Cancel</Dialog.Close>
              <button type="submit" className="tk-button-primary" disabled={isSaving}>{isSaving ? 'Saving' : 'Save role'}</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function buildPermissionUpdates(role: Role, permissions: Permission[], draft: Record<string, boolean>, isEditing: boolean): RolePermissionGrant[] {
  const currentGrants = role.permissions.reduce<Record<string, boolean>>((index, grant) => {
    index[permissionKey(grant.permission)] = grant.allowed
    return index
  }, {})
  return permissions.flatMap(permission => {
    const key = permissionKey(permission)
    const nextAllowed = Boolean(draft[key])
    const currentAllowed = Boolean(currentGrants[key])
    if (isEditing && nextAllowed === currentAllowed) return []
    if (!isEditing && !nextAllowed) return []
    return [{ module: permission.module, action: permission.action, allowed: nextAllowed }]
  })
}

function fieldClass(error?: string) {
  return cn('tk-input mt-2', error && 'border-rag-red focus:border-rag-red focus:ring-rag-red/20')
}

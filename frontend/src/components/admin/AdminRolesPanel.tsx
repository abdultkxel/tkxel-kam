import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, ChevronLeft, ChevronRight, Edit3, Layers3, Plus, RefreshCw, Search, ShieldCheck, Trash2, WandSparkles, X } from 'lucide-react'
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
  return permission.key || `${permission.module}:${permission.action}`
}

function formatSlug(value: string) {
  return value.replace(/_/g, ' ')
}

const PRESETS = [
  { key: 'portfolio_admin', label: 'Portfolio Admin', description: 'Full catalog access for portfolio operators.', mode: 'all', permissions: [] },
  { key: 'kam_head', label: 'KAM Head', description: 'Full governance, approval, reporting, and configuration access.', mode: 'all', permissions: [] },
  {
    key: 'account_manager',
    label: 'Account Manager',
    description: 'Assigned-account operations, onboarding draft work, KYC drafting, and task execution.',
    permissions: [
      'accounts:view_assigned',
      'accounts:create',
      'accounts:update_profile_assigned',
      'accounts:view_health_rollup',
      'accounts:view_sensitive_sources',
      'account_ownership:view',
      'account_ownership:assign_self',
      'source_documents:view',
      'source_documents:upload',
      'source_documents:update_metadata',
      'source_documents:run_extraction',
      'source_documents:view_sensitive',
      'onboarding:view_assigned',
      'onboarding:create_draft',
      'onboarding:update_draft',
      'engagements:view',
      'engagements:create',
      'engagements:update',
      'kyc:view_summary',
      'kyc:run_assistant',
      'kyc:edit_draft',
      'kyc:view_sensitive',
      'kyc:review_sources',
      'stakeholders:view',
      'stakeholders:create',
      'stakeholders:update',
      'stakeholders:manage_relationships',
      'account_plans:view',
      'account_plans:create',
      'account_plans:update',
      'service_catalog:view',
      'whitespace:view',
      'whitespace:update',
      'opportunities:view',
      'opportunities:create',
      'opportunities:update',
      'retention:view',
      'retention:update_plan',
      'signals:view',
      'signals:triage',
      'playbooks:view',
      'playbooks:execute',
      'tasks:view_assigned',
      'tasks:create',
      'tasks:update_own',
      'tasks:add_evidence',
      'timeline:view',
      'timeline:create_entry',
      'timeline:comment',
      'dashboards:view_own',
      'reports:view_own',
      'reports:create',
      'reports:update_own',
      'analytics:view_assigned',
      'ai:view',
      'ai:search',
    ],
  },
  {
    key: 'delivery_lead',
    label: 'Delivery Lead',
    description: 'Delivery health, governance, escalation, and portfolio task operations.',
    permissions: [
      'accounts:view_assigned',
      'accounts:update_profile_assigned',
      'engagements:view',
      'engagements:update',
      'retention:view',
      'retention:update_plan',
      'scoring:view_scores',
      'signals:view',
      'signals:triage',
      'playbooks:view',
      'playbooks:execute',
      'tasks:view_assigned',
      'tasks:view_portfolio',
      'tasks:create',
      'tasks:update_own',
      'tasks:update_portfolio',
      'escalations:view',
      'escalations:create',
      'escalations:update',
      'governance:view',
      'governance:create_event',
      'governance:update_event',
      'timeline:view',
      'timeline:create_entry',
      'handover:view',
      'handover:create',
      'dashboards:view_own',
      'reports:view_own',
      'analytics:view_assigned',
      'ai:view',
    ],
  },
  {
    key: 'leadership_viewer',
    label: 'Leadership Viewer',
    description: 'Read-only strategic visibility across portfolio risk, retention, growth, and decisions.',
    permissions: [
      'accounts:view_portfolio',
      'accounts:export',
      'stakeholders:view',
      'account_plans:view',
      'service_catalog:view',
      'whitespace:view',
      'opportunities:view',
      'retention:view',
      'scoring:view_scores',
      'signals:view',
      'playbooks:view',
      'tasks:view_portfolio',
      'governance:view',
      'timeline:view',
      'timeline:view_sensitive',
      'handover:view',
      'dashboards:view_portfolio',
      'reports:view_portfolio',
      'analytics:view_portfolio',
      'ai:view',
      'ai:search',
    ],
  },
  {
    key: 'integration_admin',
    label: 'Integration Admin',
    description: 'Integration, meeting capture, sync, and operational diagnostics access.',
    permissions: [
      'integrations:view',
      'integrations:configure',
      'integrations:run_sync',
      'integrations:view_credentials',
      'meeting_capture:view',
      'meeting_capture:import',
      'meeting_capture:review',
      'platform_ops:view_health',
      'audit:view_logs',
    ],
  },
  { key: 'custom', label: 'Custom', description: 'Start from an empty grant set.', permissions: [] },
] as const

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
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'system' | 'custom'>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(0)
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

  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, { module: string; sectionName: string; purpose: string; permissions: Permission[] }>()
    permissions
      .forEach(permission => {
        const sectionName = permission.section_name || formatSlug(permission.module)
        const current = groups.get(permission.module) ?? {
          module: permission.module,
          sectionName,
          purpose: permission.section_purpose || '',
          permissions: [],
        }
        groups.set(permission.module, {
          ...current,
          permissions: [...current.permissions, permission].sort((a, b) => a.display_order - b.display_order || a.action.localeCompare(b.action)),
        })
      })
    return Array.from(groups.values()).sort((a, b) => (a.permissions[0]?.display_order ?? 0) - (b.permissions[0]?.display_order ?? 0))
  }, [permissions])

  useEffect(() => {
    if (!token) return
    void loadPermissions()
  }, [token])

  useEffect(() => {
    if (!token) return
    void loadRoles(page)
  }, [token, search, typeFilter, page, pageSize])

  async function loadPermissions() {
    if (!token) return
    setError('')
    try {
      const nextPermissions = await listPermissions(token)
      setPermissions(nextPermissions)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load permissions')
    }
  }

  async function loadRoles(nextPage = page) {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const response = await listRoles(token, {
        search,
        type: typeFilter,
        page: nextPage,
        page_size: pageSize,
      })
      setRoles(response.items)
      setTotal(response.total)
      setPages(response.pages)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load roles')
    } finally {
      setLoading(false)
    }
  }

  function resetFilters() {
    setSearch('')
    setTypeFilter('all')
    setPage(1)
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

  function applyPreset(presetKey: string) {
    const preset = PRESETS.find(item => item.key === presetKey)
    if (!preset) return
    const selectedKeys = 'mode' in preset && preset.mode === 'all'
      ? new Set(permissions.map(permissionKey))
      : new Set(preset.permissions)
    setForm(current => ({
      ...current,
      permissions: permissions.reduce<Record<string, boolean>>((draft, permission) => {
        const key = permissionKey(permission)
        draft[key] = selectedKeys.has(key)
        return draft
      }, {}),
    }))
  }

  function addMissingDependencies() {
    const missing = missingDependencies(form.permissions, permissions)
    setForm(current => ({
      ...current,
      permissions: {
        ...current.permissions,
        ...missing.reduce<Record<string, boolean>>((draft, key) => {
          draft[key] = true
          return draft
        }, {}),
      },
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
      if (permissionUpdates.length) await updateRolePermissions(token, role.slug, permissionUpdates)
      const nextPage = editingRole ? page : 1
      if (!editingRole) setPage(1)
      await loadRoles(nextPage)
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
      const nextPage = page > 1 && roles.length === 1 ? page - 1 : page
      if (nextPage !== page) setPage(nextPage)
      await loadRoles(nextPage)
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
          <button type="button" className="tk-button-secondary" onClick={() => void loadRoles(page)} disabled={loading}>
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
      <div className="grid gap-3 border-b border-surface-border bg-surface-tertiary p-4 lg:grid-cols-[minmax(260px,1fr)_180px_140px_auto]">
        <label className="block">
          <span className="sr-only">Search roles</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
            <input
              className="tk-input pl-9"
              value={search}
              onChange={event => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="Search by slug, name, or description"
            />
          </div>
        </label>
        <select
          className="tk-input"
          value={typeFilter}
          onChange={event => {
            setTypeFilter(event.target.value as typeof typeFilter)
            setPage(1)
          }}
          aria-label="Filter roles by type"
        >
          <option value="all">All types</option>
          <option value="system">System</option>
          <option value="custom">Custom</option>
        </select>
        <select
          className="tk-input"
          value={pageSize}
          onChange={event => {
            setPageSize(Number(event.target.value))
            setPage(1)
          }}
          aria-label="Roles per page"
        >
          <option value={5}>5 per page</option>
          <option value={10}>10 per page</option>
          <option value={25}>25 per page</option>
        </select>
        <button type="button" className="tk-button-secondary" onClick={resetFilters}>Clear</button>
      </div>
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
            {roles.map(role => (
              <tr key={role.slug} className="border-b border-surface-border last:border-b-0">
                <td className="px-4 py-3">
                  <p className="font-semibold text-ink">{role.name}</p>
                  <p className="text-xs text-ink-secondary">{role.slug}</p>
                </td>
                <td className="max-w-[360px] px-4 py-3 text-ink-secondary">{role.description || '-'}</td>
                <td className="px-4 py-3 text-ink-secondary">
                  <RoleGrantSummary role={role} />
                </td>
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
            {!roles.length ? (
              <tr>
                <td className="px-4 py-8 text-center text-sm font-medium text-ink-secondary" colSpan={5}>
                  No roles match the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <PaginationBar
        page={page}
        pages={pages}
        pageSize={pageSize}
        total={total}
        visibleCount={roles.length}
        onPrevious={() => setPage(current => Math.max(1, current - 1))}
        onNext={() => setPage(current => Math.min(Math.max(pages, 1), current + 1))}
      />
      <RoleFormDialog
        open={dialogOpen}
        form={form}
        groupedPermissions={groupedPermissions}
        permissions={permissions}
        fieldErrors={fieldErrors}
        formError={formError}
        isEditing={Boolean(editingRole)}
        isSaving={saving}
        onOpenChange={setDialogOpen}
        onFieldChange={updateField}
        onPermissionChange={togglePermission}
        onPresetApply={applyPreset}
        onAddMissingDependencies={addMissingDependencies}
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

function PaginationBar({
  page,
  pages,
  pageSize,
  total,
  visibleCount,
  onPrevious,
  onNext,
}: {
  page: number
  pages: number
  pageSize: number
  total: number
  visibleCount: number
  onPrevious: () => void
  onNext: () => void
}) {
  const firstItem = total ? (page - 1) * pageSize + 1 : 0
  const lastItem = total ? firstItem + visibleCount - 1 : 0
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-border bg-white px-4 py-3 text-sm text-ink-secondary">
      <span>{firstItem}-{lastItem} of {total} roles</span>
      <div className="flex items-center gap-2">
        <button type="button" className="tk-button-secondary min-h-[38px] px-3 py-1.5" onClick={onPrevious} disabled={page <= 1}>
          <ChevronLeft className="h-4 w-4" />
          Previous
        </button>
        <span className="min-w-[88px] text-center text-xs font-bold uppercase tracking-wider text-ink-secondary">
          Page {total ? page : 0} of {pages}
        </span>
        <button type="button" className="tk-button-secondary min-h-[38px] px-3 py-1.5" onClick={onNext} disabled={!pages || page >= pages}>
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function RoleGrantSummary({ role }: { role: Role }) {
  const allowed = role.permissions.filter(grant => grant.allowed)
  const highRisk = allowed.filter(grant => grant.permission.risk_level === 'high' || grant.permission.risk_level === 'critical').length
  const sections = new Set(allowed.map(grant => grant.permission.module)).size
  return (
    <div className="space-y-1">
      <p>{allowed.length} grants</p>
      <p className="text-xs text-ink-tertiary">{sections} sections · {highRisk} high risk</p>
    </div>
  )
}

interface RoleFormDialogProps {
  open: boolean
  form: RoleFormState
  groupedPermissions: { module: string; sectionName: string; purpose: string; permissions: Permission[] }[]
  permissions: Permission[]
  fieldErrors: FieldErrors
  formError: string
  isEditing: boolean
  isSaving: boolean
  onOpenChange: (open: boolean) => void
  onFieldChange: (field: keyof Omit<RoleFormState, 'permissions'>, value: string) => void
  onPermissionChange: (permission: Permission, allowed: boolean) => void
  onPresetApply: (presetKey: string) => void
  onAddMissingDependencies: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

function RoleFormDialog({ open, form, groupedPermissions, permissions, fieldErrors, formError, isEditing, isSaving, onOpenChange, onFieldChange, onPermissionChange, onPresetApply, onAddMissingDependencies, onSubmit }: RoleFormDialogProps) {
  const allPermissions = groupedPermissions.flatMap(group => group.permissions)
  const selectedPermissions = allPermissions.filter(permission => form.permissions[permissionKey(permission)])
  const dependencies = missingDependencies(form.permissions, permissions)
  const grantSummary = summarizePermissions(selectedPermissions)

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
                Manage role details and service-specific permissions in one form.
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
                  <h3 className="text-sm font-bold text-ink">Permission catalog</h3>
                </div>
              </div>
              <div className="grid gap-3 border-b border-surface-border p-4 lg:grid-cols-[180px_1fr]">
                <div className="flex items-center gap-2 text-sm font-bold text-ink">
                  <WandSparkles className="h-4 w-4 text-brand-blue" />
                  Presets
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {PRESETS.map(preset => (
                    <button key={preset.key} type="button" className="rounded-md border border-surface-border bg-white p-3 text-left transition hover:border-brand-blue hover:bg-brand-blue/5" onClick={() => onPresetApply(preset.key)}>
                      <span className="block text-xs font-bold uppercase tracking-wider text-ink">{preset.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-ink-secondary">{preset.description}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 border-b border-surface-border bg-white p-4 md:grid-cols-3">
                <SummaryTile label="Selected" value={`${selectedPermissions.length}`} />
                <SummaryTile label="High risk" value={`${(grantSummary.high ?? 0) + (grantSummary.critical ?? 0)}`} />
                <SummaryTile label="Sections" value={`${new Set(selectedPermissions.map(permission => permission.module)).size}`} />
              </div>
              {dependencies.length ? (
                <div className="border-b border-amber-200 bg-amber-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <div>
                        <p className="text-sm font-semibold text-amber-900">Missing dependencies</p>
                        <p className="mt-1 text-xs text-amber-800">{dependencies.join(', ')}</p>
                      </div>
                    </div>
                    <button type="button" className="tk-button-secondary min-h-[34px] px-3 py-1.5 text-xs" onClick={onAddMissingDependencies}>
                      Add dependencies
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="max-h-[420px] overflow-y-auto">
                {groupedPermissions.map(group => (
                  <div key={group.module} className="grid gap-3 border-b border-surface-border p-4 last:border-b-0 xl:grid-cols-[280px_1fr]">
                    <div>
                      <div className="flex items-center gap-2">
                        <Layers3 className="h-4 w-4 text-brand-blue" />
                        <p className="font-semibold text-ink">{group.sectionName}</p>
                      </div>
                      {group.purpose ? <p className="mt-2 text-xs leading-5 text-ink-secondary">{group.purpose}</p> : null}
                    </div>
                    <div className="grid gap-2 lg:grid-cols-2">
                      {group.permissions.map(permission => (
                        <label key={permission.id} className={cn('block rounded-md border bg-white p-3 text-sm transition', form.permissions[permissionKey(permission)] ? 'border-brand-blue bg-brand-blue/5' : 'border-surface-border')}>
                          <span className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={Boolean(form.permissions[permissionKey(permission)])}
                              onChange={event => onPermissionChange(permission, event.target.checked)}
                              aria-label={`${permission.section_name || permission.module} ${permission.action_label || permission.action}`}
                              className="mt-0.5 h-4 w-4 rounded border-surface-border text-brand-blue"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-ink">{permission.action_label || formatSlug(permission.action)}</span>
                                <RiskBadge risk={permission.risk_level} />
                              </span>
                              {permission.description ? <span className="mt-1 block text-xs leading-5 text-ink-secondary">{permission.description}</span> : null}
                              {permission.dependencies.length || permission.tags.length ? (
                                <span className="mt-2 flex flex-wrap gap-1">
                                  {permission.dependencies.map(dependency => (
                                    <span key={dependency} className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">{dependency}</span>
                                  ))}
                                  {permission.tags.map(tag => (
                                    <span key={tag} className="rounded bg-surface-tertiary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-secondary">{tag}</span>
                                  ))}
                                </span>
                              ) : null}
                            </span>
                          </span>
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

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-surface-border bg-surface-tertiary px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-secondary">{label}</p>
      <p className="mt-1 text-lg font-bold text-ink">{value}</p>
    </div>
  )
}

function RiskBadge({ risk }: { risk: string }) {
  const className = {
    low: 'bg-emerald-50 text-emerald-700',
    medium: 'bg-sky-50 text-sky-700',
    high: 'bg-amber-50 text-amber-700',
    critical: 'bg-rag-red/10 text-rag-red',
  }[risk] ?? 'bg-surface-tertiary text-ink-secondary'
  return <span className={cn('rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', className)}>{risk}</span>
}

function summarizePermissions(permissions: Permission[]) {
  return permissions.reduce<Record<string, number>>((summary, permission) => {
    summary[permission.risk_level] = (summary[permission.risk_level] ?? 0) + 1
    return summary
  }, {})
}

function missingDependencies(draft: Record<string, boolean>, permissions: Permission[]) {
  const selected = new Set(Object.entries(draft).flatMap(([key, allowed]) => (allowed ? [key] : [])))
  const missing = new Set<string>()
  permissions.forEach(permission => {
    if (!selected.has(permissionKey(permission))) return
    permission.dependencies.forEach(dependency => {
      if (!selected.has(dependency)) missing.add(dependency)
    })
  })
  return Array.from(missing).sort()
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

import * as Dialog from '@radix-ui/react-dialog'
import { ChevronLeft, ChevronRight, Edit3, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/admin/ConfirmDialog'
import { FieldError } from '@/components/form/FieldError'
import { useAuth } from '@/contexts/AuthContext'
import { ApiError } from '@/services/api'
import { AdminUser, Role, createAdminUser, deleteAdminUser, listAdminUsers, listRoles, updateAdminUser } from '@/services/adminAccess'
import { apiFieldErrors, clearFieldError, FieldErrors, hasFieldErrors } from '@/utils/formErrors'
import { cn } from '@/utils/cn'

interface UserFormState {
  email: string
  password: string
  fullName: string
  role: string
  title: string
  phone: string
  avatarInitials: string
  primaryGoogleCalendarId: string
  isActive: boolean
}

const emptyForm: UserFormState = {
  email: '',
  password: '',
  fullName: '',
  role: 'account_manager',
  title: '',
  phone: '',
  avatarInitials: '',
  primaryGoogleCalendarId: '',
  isActive: true,
}

function roleLabel(role: Role) {
  return `${role.name} (${role.slug})`
}

function initialsForName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts.length ? parts.slice(0, 2).map(part => part[0]).join('') : 'KA').toUpperCase()
}

function formFromUser(user: AdminUser): UserFormState {
  return {
    email: user.email,
    password: '',
    fullName: user.full_name,
    role: user.role,
    title: user.title ?? '',
    phone: user.phone ?? '',
    avatarInitials: user.avatar_initials,
    primaryGoogleCalendarId: user.primary_google_calendar_id ?? user.email,
    isActive: user.is_active,
  }
}

export function AdminUsersPanel() {
  const { token } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [roleFilter, setRoleFilter] = useState('')
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
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null)
  const [form, setForm] = useState<UserFormState>(emptyForm)

  const dialogTitle = editingUser ? 'Edit user' : 'Create user'

  useEffect(() => {
    if (!token) return
    void loadRoles()
  }, [token])

  useEffect(() => {
    if (!token) return
    void loadUsers(page)
  }, [token, search, statusFilter, roleFilter, page, pageSize])

  async function loadRoles() {
    if (!token) return
    try {
      const nextRoles = await listRoles(token, { page: 1, page_size: 100 })
      const manageableRoles = nextRoles.items.filter(role => role.slug !== 'super_admin')
      setRoles(manageableRoles)
      setForm(current => ({ ...current, role: current.role || manageableRoles[0]?.slug || 'account_manager' }))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load roles')
    }
  }

  async function loadUsers(nextPage = page) {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const response = await listAdminUsers(token, {
        search,
        status: statusFilter,
        role: roleFilter,
        page: nextPage,
        page_size: pageSize,
      })
      setUsers(response.items.filter(user => user.role !== 'super_admin'))
      setTotal(response.total)
      setPages(response.pages)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load users')
    } finally {
      setLoading(false)
    }
  }

  function resetFilters() {
    setSearch('')
    setStatusFilter('all')
    setRoleFilter('')
    setPage(1)
  }

  function openCreateDialog() {
    setEditingUser(null)
    setForm({ ...emptyForm, role: roles[0]?.slug ?? 'account_manager' })
    setFieldErrors({})
    setFormError('')
    setDialogOpen(true)
  }

  function openEditDialog(user: AdminUser) {
    setEditingUser(user)
    setForm(formFromUser(user))
    setFieldErrors({})
    setFormError('')
    setDialogOpen(true)
  }

  function updateField(field: keyof UserFormState, value: string | boolean) {
    setForm(current => ({ ...current, [field]: value }))
    setFieldErrors(errors => clearFieldError(errors, field))
  }

  async function submitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    setSaving(true)
    setFieldErrors({})
    setFormError('')
    try {
      if (editingUser) {
        await updateAdminUser(token, editingUser.id, {
          email: form.email,
          full_name: form.fullName,
          role: form.role,
          title: form.title || null,
          phone: form.phone || null,
          avatar_initials: form.avatarInitials || initialsForName(form.fullName),
          primary_google_calendar_id: form.primaryGoogleCalendarId || null,
          is_active: form.isActive,
        })
        await loadUsers()
        toast.success('User updated successfully')
      } else {
        await createAdminUser(token, {
          email: form.email,
          password: form.password,
          full_name: form.fullName,
          role: form.role,
          title: form.title || undefined,
          phone: form.phone || undefined,
          avatar_initials: form.avatarInitials || undefined,
          primary_google_calendar_id: form.primaryGoogleCalendarId || undefined,
          is_active: form.isActive,
        })
        setPage(1)
        await loadUsers(1)
        toast.success('User created successfully')
      }
      setDialogOpen(false)
    } catch (err) {
      const nextErrors = apiFieldErrors(err, { full_name: 'fullName', avatar_initials: 'avatarInitials', primary_google_calendar_id: 'primaryGoogleCalendarId', is_active: 'isActive' })
      setFieldErrors(nextErrors)
      if (err instanceof ApiError && !hasFieldErrors(nextErrors)) setFormError(err.message)
      if (!(err instanceof ApiError)) setFormError('Unable to save user')
      toast.error(err instanceof ApiError ? err.message : 'Unable to save user')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!token || !deleteTarget) return
    setDeleting(true)
    try {
      await deleteAdminUser(token, deleteTarget.id)
      const nextPage = page > 1 && users.length === 1 ? page - 1 : page
      if (nextPage !== page) setPage(nextPage)
      await loadUsers(nextPage)
      setDeleteTarget(null)
      toast.success('User deleted successfully')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Unable to delete user')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="tk-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border p-5">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Access control</p>
          <h2 className="text-base font-semibold text-ink">Users Management</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="tk-button-secondary" onClick={() => void loadUsers(page)} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </button>
          <button type="button" className="tk-button-primary" onClick={openCreateDialog}>
            <Plus className="h-4 w-4" />
            Create user
          </button>
        </div>
      </div>
      {error ? <p className="m-5 rounded-md border border-rag-red/20 bg-rag-red/10 px-3 py-2 text-sm font-medium text-rag-red">{error}</p> : null}
      <div className="grid gap-3 border-b border-surface-border bg-surface-tertiary p-4 lg:grid-cols-[minmax(260px,1fr)_180px_220px_140px_auto]">
        <label className="block">
          <span className="sr-only">Search users</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
            <input
              className="tk-input pl-9"
              value={search}
              onChange={event => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="Search by email or name"
            />
          </div>
        </label>
        <select
          className="tk-input"
          value={statusFilter}
          onChange={event => {
            setStatusFilter(event.target.value as typeof statusFilter)
            setPage(1)
          }}
          aria-label="Filter users by status"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select
          className="tk-input"
          value={roleFilter}
          onChange={event => {
            setRoleFilter(event.target.value)
            setPage(1)
          }}
          aria-label="Filter users by role"
        >
          <option value="">All roles</option>
          {roles.map(role => <option key={role.slug} value={role.slug}>{role.name}</option>)}
        </select>
        <select
          className="tk-input"
          value={pageSize}
          onChange={event => {
            setPageSize(Number(event.target.value))
            setPage(1)
          }}
          aria-label="Users per page"
        >
          <option value={5}>5 per page</option>
          <option value={10}>10 per page</option>
          <option value={25}>25 per page</option>
        </select>
        <button type="button" className="tk-button-secondary" onClick={resetFilters}>Clear</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-surface-border bg-surface-tertiary text-xs font-semibold uppercase tracking-wider text-ink-secondary">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} className="border-b border-surface-border last:border-b-0">
                <td className="px-4 py-3">
                  <p className="font-semibold text-ink">{user.full_name}</p>
                  <p className="text-xs text-ink-secondary">{user.email}</p>
                </td>
                <td className="px-4 py-3 text-ink-secondary">{user.role.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3 text-ink-secondary">{user.title || '-'}</td>
                <td className="px-4 py-3">
                  <span className={cn('inline-flex rounded-md px-2 py-1 text-xs font-bold uppercase tracking-wider', user.is_active ? 'bg-rag-green/10 text-rag-green' : 'bg-surface-tertiary text-ink-secondary')}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button type="button" className="tk-button-secondary" onClick={() => openEditDialog(user)}>
                      <Edit3 className="h-4 w-4" />
                      Edit
                    </button>
                    <button type="button" className="tk-button-secondary text-rag-red" onClick={() => setDeleteTarget(user)}>
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!users.length ? (
              <tr>
                <td className="px-4 py-8 text-center text-sm font-medium text-ink-secondary" colSpan={5}>
                  No users match the current filters.
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
        visibleCount={users.length}
        onPrevious={() => setPage(current => Math.max(1, current - 1))}
        onNext={() => setPage(current => Math.min(Math.max(pages, 1), current + 1))}
      />
      <UserFormDialog
        open={dialogOpen}
        title={dialogTitle}
        form={form}
        roles={roles}
        fieldErrors={fieldErrors}
        formError={formError}
        isEditing={Boolean(editingUser)}
        isSaving={saving}
        onOpenChange={setDialogOpen}
        onFieldChange={updateField}
        onSubmit={submitUser}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete user"
        description={`Delete ${deleteTarget?.full_name ?? 'this user'}? This action cannot be undone.`}
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
      <span>{firstItem}-{lastItem} of {total} users</span>
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

interface UserFormDialogProps {
  open: boolean
  title: string
  form: UserFormState
  roles: Role[]
  fieldErrors: FieldErrors
  formError: string
  isEditing: boolean
  isSaving: boolean
  onOpenChange: (open: boolean) => void
  onFieldChange: (field: keyof UserFormState, value: string | boolean) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

function UserFormDialog({ open, title, form, roles, fieldErrors, formError, isEditing, isSaving, onOpenChange, onFieldChange, onSubmit }: UserFormDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[min(92vh,820px)] w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-surface-border bg-white shadow-panel">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-surface-border bg-white p-5">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Users</p>
              <Dialog.Title className="font-display text-2xl font-bold text-ink">{title}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-secondary">
                Manage the user's email, profile, assigned role, and activation status.
              </Dialog.Description>
            </div>
            <Dialog.Close className="tk-icon-button" aria-label="Close user form">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <form className="grid gap-4 p-5 md:grid-cols-2" onSubmit={onSubmit} noValidate>
            <label className="block">
              <span className="tk-label">Email</span>
              <input className={fieldClass(fieldErrors.email)} type="email" value={form.email} onChange={event => onFieldChange('email', event.target.value)} aria-invalid={Boolean(fieldErrors.email)} />
              <FieldError id="admin-user-email-error" message={fieldErrors.email} />
            </label>
            <label className={cn('block', isEditing && 'hidden')}>
              <span className="tk-label">Password</span>
              <input className={fieldClass(fieldErrors.password)} type="password" value={form.password} onChange={event => onFieldChange('password', event.target.value)} aria-invalid={Boolean(fieldErrors.password)} />
              <FieldError id="admin-user-password-error" message={fieldErrors.password} />
            </label>
            <label className="block">
              <span className="tk-label">Full name</span>
              <input className={fieldClass(fieldErrors.fullName)} value={form.fullName} onChange={event => onFieldChange('fullName', event.target.value)} aria-invalid={Boolean(fieldErrors.fullName)} />
              <FieldError id="admin-user-name-error" message={fieldErrors.fullName} />
            </label>
            <label className="block">
              <span className="tk-label">Role</span>
              <select className={fieldClass(fieldErrors.role)} value={form.role} onChange={event => onFieldChange('role', event.target.value)} aria-invalid={Boolean(fieldErrors.role)}>
                {roles.map(role => <option key={role.slug} value={role.slug}>{roleLabel(role)}</option>)}
              </select>
              <FieldError id="admin-user-role-error" message={fieldErrors.role} />
            </label>
            <label className="block">
              <span className="tk-label">Title</span>
              <input className={fieldClass(fieldErrors.title)} value={form.title} onChange={event => onFieldChange('title', event.target.value)} aria-invalid={Boolean(fieldErrors.title)} />
              <FieldError id="admin-user-title-error" message={fieldErrors.title} />
            </label>
            <label className="block">
              <span className="tk-label">Phone</span>
              <input className={fieldClass(fieldErrors.phone)} value={form.phone} onChange={event => onFieldChange('phone', event.target.value)} aria-invalid={Boolean(fieldErrors.phone)} />
              <FieldError id="admin-user-phone-error" message={fieldErrors.phone} />
            </label>
            <label className="block">
              <span className="tk-label">Avatar initials</span>
              <input className={fieldClass(fieldErrors.avatarInitials)} value={form.avatarInitials} onChange={event => onFieldChange('avatarInitials', event.target.value)} aria-invalid={Boolean(fieldErrors.avatarInitials)} maxLength={8} />
              <FieldError id="admin-user-avatar-error" message={fieldErrors.avatarInitials} />
            </label>
            <label className="block md:col-span-2">
              <span className="tk-label">Primary Google Calendar ID</span>
              <input className={fieldClass(fieldErrors.primaryGoogleCalendarId)} value={form.primaryGoogleCalendarId} onChange={event => onFieldChange('primaryGoogleCalendarId', event.target.value)} aria-invalid={Boolean(fieldErrors.primaryGoogleCalendarId)} />
              <FieldError id="admin-user-primary-calendar-error" message={fieldErrors.primaryGoogleCalendarId} />
            </label>
            <label className="flex min-h-[44px] items-center gap-2 pt-6 text-sm font-semibold text-ink">
              <input type="checkbox" checked={form.isActive} onChange={event => onFieldChange('isActive', event.target.checked)} className="h-4 w-4 rounded border-surface-border text-brand-blue" />
              Active
            </label>
            {formError ? <p className="rounded-md border border-rag-red/20 bg-rag-red/10 px-3 py-2 text-sm font-medium text-rag-red md:col-span-2">{formError}</p> : null}
            <div className="flex justify-end gap-2 md:col-span-2">
              <Dialog.Close type="button" className="tk-button-secondary" disabled={isSaving}>Cancel</Dialog.Close>
              <button type="submit" className="tk-button-primary" disabled={isSaving}>{isSaving ? 'Saving' : 'Save user'}</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function fieldClass(error?: string) {
  return cn('tk-input mt-2', error && 'border-rag-red focus:border-rag-red focus:ring-rag-red/20')
}

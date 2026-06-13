import * as Dialog from '@radix-ui/react-dialog'
import { ChevronLeft, ChevronRight, Edit3, Plus, RefreshCw, Search, Settings2, Trash2, X } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/admin/ConfirmDialog'
import { FieldError } from '@/components/form/FieldError'
import { useAuth } from '@/contexts/AuthContext'
import { ApiError } from '@/services/api'
import {
  CustomFieldDefinition,
  CustomFieldModule,
  CustomFieldPayload,
  CustomFieldType,
  createCustomField,
  deleteCustomField,
  listCustomFieldModules,
  listCustomFields,
  updateCustomField,
} from '@/services/adminAccess'
import { cn } from '@/utils/cn'
import { apiFieldErrors, clearFieldError, FieldErrors, hasFieldErrors } from '@/utils/formErrors'
import { formatDate } from '@/utils/formatters'

interface FieldFormState {
  module: string
  fieldKey: string
  label: string
  description: string
  fieldType: CustomFieldType
  placeholder: string
  helpText: string
  optionsText: string
  isRequired: boolean
  isActive: boolean
}

const fieldTypes: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'Date and time' },
  { value: 'boolean', label: 'Toggle' },
  { value: 'single_select', label: 'Single select' },
  { value: 'multi_select', label: 'Multi select' },
  { value: 'email', label: 'Email' },
  { value: 'url', label: 'URL' },
  { value: 'phone', label: 'Phone' },
]

const selectTypes = new Set<CustomFieldType>(['single_select', 'multi_select'])
const defaultModule = 'accounts'
const legacyAccountModules = new Set(['account_onboarding_workspace', 'account_overview', 'onboarding'])

const emptyForm: FieldFormState = {
  module: defaultModule,
  fieldKey: '',
  label: '',
  description: '',
  fieldType: 'text',
  placeholder: '',
  helpText: '',
  optionsText: '',
  isRequired: false,
  isActive: true,
}

function formatSlug(value: string) {
  return value.replace(/_/g, ' ')
}

function fieldKeyFromLabel(label: string) {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!slug) return ''
  return /^[a-z]/.test(slug) ? slug : `field_${slug}`
}

function formFromField(field: CustomFieldDefinition): FieldFormState {
  return {
    module: legacyAccountModules.has(field.module) ? defaultModule : field.module,
    fieldKey: field.field_key,
    label: field.label,
    description: field.description ?? '',
    fieldType: field.field_type,
    placeholder: field.placeholder ?? '',
    helpText: field.help_text ?? '',
    optionsText: field.options.join('\n'),
    isRequired: field.is_required,
    isActive: field.is_active,
  }
}

function optionsFromText(value: string) {
  return value
    .split(/\r?\n/)
    .map(option => option.trim())
    .filter(Boolean)
}

function payloadFromForm(form: FieldFormState): CustomFieldPayload {
  const isSelect = selectTypes.has(form.fieldType)
  return {
    module: form.module,
    field_key: form.fieldKey,
    label: form.label,
    description: form.description || null,
    field_type: form.fieldType,
    placeholder: form.placeholder || null,
    help_text: form.helpText || null,
    options: isSelect ? optionsFromText(form.optionsText) : [],
    validation_rules: {},
    is_required: form.isRequired,
    is_active: form.isActive,
  }
}

function moduleLabel(modules: CustomFieldModule[], slug: string) {
  return modules.find(module => module.slug === slug)?.name ?? formatSlug(slug)
}

export function AdminFieldBuilderPanel() {
  const { token } = useAuth()
  const [modules, setModules] = useState<CustomFieldModule[]>([])
  const [fields, setFields] = useState<CustomFieldDefinition[]>([])
  const [search, setSearch] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<CustomFieldType | ''>('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [sort, setSort] = useState<'label' | 'module' | 'field_type' | 'updated_at'>('label')
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc')
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
  const [editingField, setEditingField] = useState<CustomFieldDefinition | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CustomFieldDefinition | null>(null)
  const [form, setForm] = useState<FieldFormState>(emptyForm)

  const activeCount = useMemo(() => fields.filter(field => field.is_active).length, [fields])

  useEffect(() => {
    if (!token) return
    void loadModules()
  }, [token])

  useEffect(() => {
    if (!token) return
    void loadFields(page)
  }, [token, search, moduleFilter, typeFilter, statusFilter, sort, direction, page, pageSize])

  async function loadModules() {
    if (!token) return
    try {
      const nextModules = await listCustomFieldModules(token)
      setModules(nextModules)
      setForm(current => ({ ...current, module: current.module || nextModules[0]?.slug || defaultModule }))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load field modules')
    }
  }

  async function loadFields(nextPage = page) {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const response = await listCustomFields(token, {
        search,
        module: moduleFilter,
        field_type: typeFilter,
        status: statusFilter,
        sort,
        direction,
        page: nextPage,
        page_size: pageSize,
      })
      setFields(response.items)
      setTotal(response.total)
      setPages(response.pages)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load custom fields')
    } finally {
      setLoading(false)
    }
  }

  function resetFilters() {
    setSearch('')
    setModuleFilter('')
    setTypeFilter('')
    setStatusFilter('all')
    setSort('label')
    setDirection('asc')
    setPage(1)
  }

  function openCreateDialog() {
    setEditingField(null)
    setForm({ ...emptyForm, module: modules[0]?.slug ?? defaultModule })
    setFieldErrors({})
    setFormError('')
    setDialogOpen(true)
  }

  function openEditDialog(field: CustomFieldDefinition) {
    setEditingField(field)
    setForm(formFromField(field))
    setFieldErrors({})
    setFormError('')
    setDialogOpen(true)
  }

  function updateField(field: keyof FieldFormState, value: string | number | boolean) {
    setForm(current => {
      const next = { ...current, [field]: value }
      if (field === 'label' && (!current.fieldKey || current.fieldKey === fieldKeyFromLabel(current.label))) {
        next.fieldKey = fieldKeyFromLabel(String(value))
      }
      return next
    })
    const apiField = fieldAliases[field] ?? field
    setFieldErrors(errors => clearFieldError(clearFieldError(errors, field), apiField))
  }

  async function submitField(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    setSaving(true)
    setFieldErrors({})
    setFormError('')
    try {
      const payload = payloadFromForm(form)
      if (editingField) {
        await updateCustomField(token, editingField.id, payload)
        await loadFields(page)
        toast.success('Custom field updated successfully')
      } else {
        await createCustomField(token, payload)
        setPage(1)
        await loadFields(1)
        toast.success('Custom field created successfully')
      }
      setDialogOpen(false)
    } catch (err) {
      const nextErrors = apiFieldErrors(err, backendFieldAliases)
      setFieldErrors(nextErrors)
      if (err instanceof ApiError && !hasFieldErrors(nextErrors)) setFormError(err.message)
      if (!(err instanceof ApiError)) setFormError('Unable to save custom field')
      toast.error(err instanceof ApiError ? err.message : 'Unable to save custom field')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!token || !deleteTarget) return
    setDeleting(true)
    try {
      await deleteCustomField(token, deleteTarget.id)
      const nextPage = page > 1 && fields.length === 1 ? page - 1 : page
      if (nextPage !== page) setPage(nextPage)
      await loadFields(nextPage)
      setDeleteTarget(null)
      toast.success('Custom field deleted successfully')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Unable to delete custom field')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="tk-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border p-5">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Product configuration</p>
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Settings2 className="h-4 w-4 text-brand-blue" />
            Field Builder
          </h2>
          <p className="mt-1 text-sm text-ink-secondary">Create module-scoped fields with validation settings.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="tk-button-secondary" onClick={() => void loadFields(page)} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </button>
          <button type="button" className="tk-button-primary" onClick={openCreateDialog}>
            <Plus className="h-4 w-4" />
            Create field
          </button>
        </div>
      </div>

      <div className="grid divide-y divide-surface-border border-b border-surface-border bg-white md:grid-cols-2 md:divide-x md:divide-y-0">
        <Stat label="Configured fields" value={String(total)} />
        <Stat label="Active on this page" value={String(activeCount)} />
      </div>

      {error ? <p className="m-5 rounded-md border border-rag-red/20 bg-rag-red/10 px-3 py-2 text-sm font-medium text-rag-red">{error}</p> : null}

      <div className="grid gap-3 border-b border-surface-border bg-surface-tertiary p-4 xl:grid-cols-[minmax(240px,1fr)_220px_170px_150px_150px_140px_auto]">
        <label className="block">
          <span className="sr-only">Search custom fields</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
            <input
              className="tk-input pl-9"
              value={search}
              onChange={event => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="Search label, key, module"
            />
          </div>
        </label>
        <select
          className="tk-input"
          value={moduleFilter}
          onChange={event => {
            setModuleFilter(event.target.value)
            setPage(1)
          }}
          aria-label="Filter fields by module"
        >
          <option value="">All modules</option>
          {modules.map(module => <option key={module.slug} value={module.slug}>{module.name}</option>)}
        </select>
        <select
          className="tk-input"
          value={typeFilter}
          onChange={event => {
            setTypeFilter(event.target.value as CustomFieldType | '')
            setPage(1)
          }}
          aria-label="Filter fields by type"
        >
          <option value="">All types</option>
          {fieldTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
        <select
          className="tk-input"
          value={statusFilter}
          onChange={event => {
            setStatusFilter(event.target.value as typeof statusFilter)
            setPage(1)
          }}
          aria-label="Filter fields by status"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select className="tk-input" value={sort} onChange={event => setSort(event.target.value as typeof sort)} aria-label="Sort fields">
          <option value="label">Label</option>
          <option value="module">Module</option>
          <option value="field_type">Field type</option>
          <option value="updated_at">Updated date</option>
        </select>
        <select className="tk-input" value={direction} onChange={event => setDirection(event.target.value as typeof direction)} aria-label="Sort direction">
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
        <button type="button" className="tk-button-secondary" onClick={resetFilters}>Clear</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="border-b border-surface-border bg-surface-tertiary text-xs font-semibold uppercase tracking-wider text-ink-secondary">
            <tr>
              <th className="px-4 py-3">Field</th>
              <th className="px-4 py-3">Module</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Rules</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-8 text-center text-sm font-medium text-ink-secondary" colSpan={7}>
                  Loading field definitions
                </td>
              </tr>
            ) : fields.map(field => (
              <tr key={field.id} className="border-b border-surface-border last:border-b-0">
                <td className="px-4 py-3">
                  <p className="font-semibold text-ink">{field.label}</p>
                  <p className="text-xs text-ink-secondary">{field.field_key}</p>
                  {field.description ? <p className="mt-1 max-w-[320px] truncate text-xs text-ink-tertiary">{field.description}</p> : null}
                </td>
                <td className="px-4 py-3 text-ink-secondary">{moduleLabel(modules, field.module)}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-md bg-blue-tint-20 px-2 py-1 text-xs font-bold uppercase tracking-wider text-brand-blue">
                    {formatSlug(field.field_type)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {field.is_required ? <Flag label="Required" tone="orange" /> : null}
                    {!field.is_required ? <span className="text-xs text-ink-tertiary">-</span> : null}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={cn('inline-flex rounded-md px-2 py-1 text-xs font-bold uppercase tracking-wider', field.is_active ? 'bg-rag-green/10 text-rag-green' : 'bg-surface-tertiary text-ink-secondary')}>
                    {field.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-secondary">{formatDate(field.updated_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button type="button" className="tk-button-secondary" onClick={() => openEditDialog(field)}>
                      <Edit3 className="h-4 w-4" />
                      Edit
                    </button>
                    <button type="button" className="tk-button-secondary text-rag-red" onClick={() => setDeleteTarget(field)}>
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && !fields.length ? (
              <tr>
                <td className="px-4 py-8 text-center text-sm font-medium text-ink-secondary" colSpan={7}>
                  No custom fields match the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <FieldPagination
        page={page}
        pages={pages}
        pageSize={pageSize}
        total={total}
        visibleCount={fields.length}
        onPageSizeChange={nextSize => {
          setPageSize(nextSize)
          setPage(1)
        }}
        onPrevious={() => setPage(current => Math.max(1, current - 1))}
        onNext={() => setPage(current => Math.min(Math.max(pages, 1), current + 1))}
      />

      <FieldFormDialog
        open={dialogOpen}
        modules={modules}
        form={form}
        fieldErrors={fieldErrors}
        formError={formError}
        isEditing={Boolean(editingField)}
        isSaving={saving}
        onOpenChange={setDialogOpen}
        onFieldChange={updateField}
        onSubmit={submitField}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete custom field"
        description={`Delete ${deleteTarget?.label ?? 'this field'}? This removes the field definition and cannot be undone.`}
        isBusy={deleting}
        onOpenChange={open => !open && setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-ink">{value}</p>
    </div>
  )
}

function Flag({ label, tone }: { label: string; tone: 'blue' | 'orange' | 'red' | 'dark' }) {
  const classes = {
    blue: 'bg-blue-tint-20 text-brand-blue',
    orange: 'bg-brand-orange/10 text-brand-orange',
    red: 'bg-rag-red/10 text-rag-red',
    dark: 'bg-surface-tertiary text-brand-blue-dark',
  }
  return <span className={cn('inline-flex rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider', classes[tone])}>{label}</span>
}

function FieldPagination({
  page,
  pages,
  pageSize,
  total,
  visibleCount,
  onPageSizeChange,
  onPrevious,
  onNext,
}: {
  page: number
  pages: number
  pageSize: number
  total: number
  visibleCount: number
  onPageSizeChange: (pageSize: number) => void
  onPrevious: () => void
  onNext: () => void
}) {
  const firstItem = total ? (page - 1) * pageSize + 1 : 0
  const lastItem = total ? firstItem + visibleCount - 1 : 0
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-border bg-white px-4 py-3 text-sm text-ink-secondary">
      <span>{firstItem}-{lastItem} of {total} fields</span>
      <div className="flex flex-wrap items-center gap-2">
        <select className="tk-input min-h-[38px] w-[130px] py-1.5 text-sm" value={pageSize} onChange={event => onPageSizeChange(Number(event.target.value))} aria-label="Fields per page">
          <option value={5}>5 per page</option>
          <option value={10}>10 per page</option>
          <option value={25}>25 per page</option>
        </select>
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

interface FieldFormDialogProps {
  open: boolean
  modules: CustomFieldModule[]
  form: FieldFormState
  fieldErrors: FieldErrors
  formError: string
  isEditing: boolean
  isSaving: boolean
  onOpenChange: (open: boolean) => void
  onFieldChange: (field: keyof FieldFormState, value: string | number | boolean) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

function FieldFormDialog({ open, modules, form, fieldErrors, formError, isEditing, isSaving, onOpenChange, onFieldChange, onSubmit }: FieldFormDialogProps) {
  const isSelect = selectTypes.has(form.fieldType)

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[min(92vh,900px)] w-[min(980px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-surface-border bg-white shadow-panel">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-surface-border bg-white p-5">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Field Builder</p>
              <Dialog.Title className="font-display text-2xl font-bold text-ink">{isEditing ? 'Edit field' : 'Create field'}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-secondary">
                Configure the field key, module, validation type, and where the field should appear.
              </Dialog.Description>
            </div>
            <Dialog.Close className="tk-icon-button" aria-label="Close field form">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <form className="space-y-5 p-5" onSubmit={onSubmit} noValidate>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="tk-label">Module</span>
                <select className={fieldClass(fieldErrors.module)} value={form.module} onChange={event => onFieldChange('module', event.target.value)} aria-invalid={Boolean(fieldErrors.module)}>
                  {modules.map(module => <option key={module.slug} value={module.slug}>{module.name}</option>)}
                </select>
                <FieldError id="custom-field-module-error" message={fieldErrors.module} />
              </label>
              <label className="block">
                <span className="tk-label">Field type</span>
                <select className={fieldClass(fieldErrors.fieldType)} value={form.fieldType} onChange={event => onFieldChange('fieldType', event.target.value as CustomFieldType)} aria-invalid={Boolean(fieldErrors.fieldType)}>
                  {fieldTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
                <FieldError id="custom-field-type-error" message={fieldErrors.fieldType} />
              </label>
              <label className="block">
                <span className="tk-label">Label</span>
                <input className={fieldClass(fieldErrors.label)} value={form.label} onChange={event => onFieldChange('label', event.target.value)} aria-invalid={Boolean(fieldErrors.label)} />
                <FieldError id="custom-field-label-error" message={fieldErrors.label} />
              </label>
              <label className="block">
                <span className="tk-label">Field key</span>
                <input className={fieldClass(fieldErrors.fieldKey)} value={form.fieldKey} onChange={event => onFieldChange('fieldKey', event.target.value)} aria-invalid={Boolean(fieldErrors.fieldKey)} placeholder="customer_tier" />
                <FieldError id="custom-field-key-error" message={fieldErrors.fieldKey} />
              </label>
              <label className="block md:col-span-2">
                <span className="tk-label">Description</span>
                <input className={fieldClass(fieldErrors.description)} value={form.description} onChange={event => onFieldChange('description', event.target.value)} aria-invalid={Boolean(fieldErrors.description)} />
                <FieldError id="custom-field-description-error" message={fieldErrors.description} />
              </label>
              <label className="block md:col-span-2">
                <span className="tk-label">Placeholder</span>
                <input className={fieldClass(fieldErrors.placeholder)} value={form.placeholder} onChange={event => onFieldChange('placeholder', event.target.value)} aria-invalid={Boolean(fieldErrors.placeholder)} />
                <FieldError id="custom-field-placeholder-error" message={fieldErrors.placeholder} />
              </label>
              <label className="block md:col-span-2">
                <span className="tk-label">Help text</span>
                <textarea className={fieldClass(fieldErrors.helpText)} rows={3} value={form.helpText} onChange={event => onFieldChange('helpText', event.target.value)} aria-invalid={Boolean(fieldErrors.helpText)} />
                <FieldError id="custom-field-help-text-error" message={fieldErrors.helpText} />
              </label>
              {isSelect ? (
                <label className="block md:col-span-2">
                  <span className="tk-label">Options</span>
                  <textarea className={fieldClass(fieldErrors.options)} rows={4} value={form.optionsText} onChange={event => onFieldChange('optionsText', event.target.value)} aria-invalid={Boolean(fieldErrors.options)} placeholder={'Gold\nSilver\nBronze'} />
                  <FieldError id="custom-field-options-error" message={fieldErrors.options} />
                </label>
              ) : null}
            </div>

            <div className="grid gap-3 rounded-lg border border-surface-border bg-surface-tertiary p-4 sm:grid-cols-2">
              <ToggleField label="Active" checked={form.isActive} onChange={value => onFieldChange('isActive', value)} />
              <ToggleField label="Required" checked={form.isRequired} onChange={value => onFieldChange('isRequired', value)} />
            </div>

            {formError ? <p className="rounded-md border border-rag-red/20 bg-rag-red/10 px-3 py-2 text-sm font-medium text-rag-red">{formError}</p> : null}
            <div className="flex justify-end gap-2">
              <Dialog.Close type="button" className="tk-button-secondary" disabled={isSaving}>Cancel</Dialog.Close>
              <button type="submit" className="tk-button-primary" disabled={isSaving}>{isSaving ? 'Saving' : 'Save field'}</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-[44px] items-center gap-2 rounded-md border border-surface-border bg-white px-3 text-sm font-semibold text-ink">
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="h-4 w-4 rounded border-surface-border text-brand-blue" />
      {label}
    </label>
  )
}

const fieldAliases: Partial<Record<keyof FieldFormState, string>> = {
  fieldKey: 'field_key',
  fieldType: 'field_type',
  helpText: 'help_text',
  optionsText: 'options',
  isRequired: 'is_required',
  isActive: 'is_active',
}

const backendFieldAliases = {
  field_key: 'fieldKey',
  field_type: 'fieldType',
  help_text: 'helpText',
  is_required: 'isRequired',
  is_active: 'isActive',
}

function fieldClass(error?: string) {
  return cn('tk-input mt-2', error && 'border-rag-red focus:border-rag-red focus:ring-rag-red/20')
}

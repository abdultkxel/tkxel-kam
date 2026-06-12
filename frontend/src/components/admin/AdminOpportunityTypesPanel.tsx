import { Archive, Loader2, Pencil, Plus, RefreshCw, RotateCcw } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { FieldError } from '@/components/form/FieldError'
import { useAuth } from '@/contexts/AuthContext'
import { ApiError } from '@/services/api'
import { createOpportunityType, deactivateOpportunityType, listAdminOpportunityTypes, updateOpportunityType } from '@/services/opportunities'
import { OpportunityTypeRecord } from '@/types/opportunity'
import { apiFieldErrors, clearFieldError, FieldErrors } from '@/utils/formErrors'

interface TypeForm {
  id: string
  slug: string
  name: string
  description: string
  displayOrder: string
  isActive: boolean
}

const emptyForm: TypeForm = {
  id: '',
  slug: '',
  name: '',
  description: '',
  displayOrder: '10',
  isActive: true,
}

export function AdminOpportunityTypesPanel() {
  const { token } = useAuth()
  const [types, setTypes] = useState<OpportunityTypeRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [activeState, setActiveState] = useState<'all' | 'active' | 'inactive'>('all')
  const [form, setForm] = useState<TypeForm>(emptyForm)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!token) return
    void loadTypes()
  }, [activeState, search, token])

  async function loadTypes() {
    if (!token) return
    setLoading(true)
    try {
      const result = await listAdminOpportunityTypes(token, { activeState, search, pageSize: 100 })
      setTypes(result.items)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Opportunity types could not load')
    } finally {
      setLoading(false)
    }
  }

  function update(field: keyof TypeForm, value: string | boolean) {
    setForm(current => ({ ...current, [field]: value }))
    setFieldErrors(current => clearFieldError(current, field))
  }

  function editType(type: OpportunityTypeRecord) {
    setForm({
      id: type.id,
      slug: type.slug,
      name: type.name,
      description: type.description ?? '',
      displayOrder: String(type.displayOrder),
      isActive: type.isActive,
    })
    setFieldErrors({})
    setFormError('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    setSaving(true)
    setFieldErrors({})
    setFormError('')
    try {
      const payload = {
        slug: form.slug,
        name: form.name,
        description: form.description || null,
        displayOrder: Number(form.displayOrder || 0),
        isActive: form.isActive,
      }
      if (form.id) {
        await updateOpportunityType(token, form.id, payload)
        toast.success('Opportunity type updated')
      } else {
        await createOpportunityType(token, payload)
        toast.success('Opportunity type created')
      }
      setForm(emptyForm)
      await loadTypes()
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(apiFieldErrors(err, { display_order: 'displayOrder' }))
        setFormError(err.message)
      } else {
        setFormError('Opportunity type could not be saved')
      }
    } finally {
      setSaving(false)
    }
  }

  async function deactivate(type: OpportunityTypeRecord) {
    if (!token) return
    setSaving(true)
    try {
      await deactivateOpportunityType(token, type.id)
      toast.success('Opportunity type deactivated')
      await loadTypes()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Opportunity type could not be deactivated')
    } finally {
      setSaving(false)
    }
  }

  async function reactivate(type: OpportunityTypeRecord) {
    if (!token) return
    setSaving(true)
    try {
      await updateOpportunityType(token, type.id, { isActive: true })
      toast.success('Opportunity type reactivated')
      await loadTypes()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Opportunity type could not be reactivated')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="tk-card overflow-hidden">
        <div className="border-b border-surface-border p-5">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Opportunity taxonomy</p>
          <h2 className="text-base font-semibold text-ink">Opportunity types</h2>
          <p className="mt-2 text-sm text-ink-secondary">Configure the type labels used by opportunity forms, filters, reports, and analytics.</p>
        </div>
        <div className="grid gap-3 border-b border-surface-border bg-surface-tertiary p-4 md:grid-cols-[minmax(220px,1fr)_180px_auto]">
          <input className="tk-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search types" />
          <select className="tk-input" value={activeState} onChange={event => setActiveState(event.target.value as typeof activeState)}>
            <option value="all">All states</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button type="button" className="tk-button-secondary" onClick={() => loadTypes()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        </div>
        <div className="divide-y divide-surface-border">
          {types.map(type => (
            <article key={type.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <button type="button" className="min-w-0 text-left" onClick={() => editType(type)} aria-label={`Select ${type.name}`}>
                <h3 className="text-sm font-semibold text-ink">{type.name}</h3>
                <p className="mt-1 text-xs text-ink-secondary">{type.slug} · {type.inUseCount} linked opportunities · order {type.displayOrder}</p>
                {type.description ? <p className="mt-2 text-sm text-ink-secondary">{type.description}</p> : null}
              </button>
              <div className="flex items-center gap-2">
                <span className={type.isActive ? 'rounded-full bg-rag-green/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-rag-green' : 'rounded-full bg-surface-tertiary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary'}>
                  {type.isActive ? 'Active' : 'Inactive'}
                </span>
                <button type="button" className="tk-icon-button text-brand-blue" onClick={() => editType(type)} aria-label={`Edit ${type.name}`} title="Edit type">
                  <Pencil className="h-4 w-4" />
                </button>
                {type.isActive ? (
                  <button type="button" className="tk-icon-button text-rag-red" onClick={() => deactivate(type)} disabled={saving} aria-label={`Deactivate ${type.name}`} title="Deactivate type">
                    <Archive className="h-4 w-4" />
                  </button>
                ) : (
                  <button type="button" className="tk-icon-button text-rag-green" onClick={() => reactivate(type)} disabled={saving} aria-label={`Reactivate ${type.name}`} title="Reactivate type">
                    <RotateCcw className="h-4 w-4" />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>

      <form onSubmit={submit} className="tk-card h-fit overflow-hidden">
        <div className="border-b border-surface-border p-5">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">{form.id ? 'Edit type' : 'Create type'}</p>
          <h2 className="text-base font-semibold text-ink">{form.id ? form.name || 'Opportunity type' : 'New opportunity type'}</h2>
        </div>
        <div className="grid gap-3 p-5">
          <label className="space-y-1">
            <span className="tk-label text-xs">Name</span>
            <input className="tk-input" value={form.name} onChange={event => update('name', event.target.value)} placeholder="Expansion" aria-invalid={Boolean(fieldErrors.name)} />
            <FieldError id="opportunity-type-name-error" message={fieldErrors.name} />
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Slug</span>
            <input className="tk-input" value={form.slug} onChange={event => update('slug', event.target.value)} placeholder="expansion" aria-invalid={Boolean(fieldErrors.slug)} />
            <FieldError id="opportunity-type-slug-error" message={fieldErrors.slug} />
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Display order</span>
            <input type="number" className="tk-input" value={form.displayOrder} onChange={event => update('displayOrder', event.target.value)} />
            <FieldError id="opportunity-type-order-error" message={fieldErrors.displayOrder} />
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Description</span>
            <textarea className="tk-input min-h-[96px]" value={form.description} onChange={event => update('description', event.target.value)} />
            <FieldError id="opportunity-type-description-error" message={fieldErrors.description} />
          </label>
          <label className="flex min-h-[44px] items-center gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" checked={form.isActive} onChange={event => update('isActive', event.target.checked)} />
            Active
          </label>
          {formError ? <p className="rounded-lg bg-rag-red/10 px-3 py-2 text-sm font-semibold text-rag-red">{formError}</p> : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-surface-border p-5">
          <button type="button" className="tk-button-secondary" onClick={() => setForm(emptyForm)}>Reset</button>
          <button type="submit" className="tk-button-primary" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {form.id ? 'Save type' : 'Create type'}
          </button>
        </div>
      </form>
    </section>
  )
}

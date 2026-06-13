import { FileText, Loader2, Plus, Search, Trash2 } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FieldError } from '@/components/form/FieldError'
import { RuntimeCustomFieldValues, RuntimeCustomFields, customValuesForSubmit, requiredCustomFieldErrors } from '@/components/custom-fields/RuntimeCustomFields'
import { EmptyState } from '@/components/ui/EmptyState'
import { ApiError } from '@/services/api'
import { ContentItem, RuntimeCustomField, createContent, deleteContent, listContent, listRuntimeCustomFields, uploadContentFile } from '@/services/contentGovernance'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate } from '@/utils/formatters'

export function AdminContentPanel() {
  const { token } = useAuth()
  const [items, setItems] = useState<ContentItem[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [customFields, setCustomFields] = useState<RuntimeCustomField[]>([])
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({})
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({})
  const [file, setFile] = useState<File | null>(null)
  const [form, setForm] = useState({
    title: '',
    content_type: 'Guide',
    category: 'Governance',
    tags: 'Governance',
    account_stages: 'Expansion Focus',
    source_kind: 'url',
    url: '',
    body_content: '',
  })
  const formCustomFields = customFields
  const listCustomFields = customFields
  const params = useMemo(() => {
    const next = new URLSearchParams()
    if (search) next.set('search', search)
    next.set('active_state', 'all')
    next.set('sort', 'updated_at')
    next.set('direction', 'desc')
    next.set('page', String(page))
    next.set('page_size', '6')
    return next
  }, [page, search])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setLoading(true)
    setError('')
    listContent(token, params)
      .then(response => {
        if (cancelled) return
        setItems(response.items)
        setPages(response.pages)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [params, token])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    listRuntimeCustomFields(token, 'client_education_content')
      .then(fields => {
        if (!cancelled) setCustomFields(Array.isArray(fields) ? fields : [])
      })
      .catch(() => {
        if (!cancelled) setCustomFields([])
      })
    return () => {
      cancelled = true
    }
  }, [token])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    const nextCustomErrors = requiredCustomFieldErrors(formCustomFields, customValues)
    setCustomErrors(nextCustomErrors)
    if (Object.keys(nextCustomErrors).length) return
    if (form.source_kind === 'file' && !file) {
      setFieldErrors({ file: 'File is required.' })
      return
    }
    setSaving(true)
    setFieldErrors({})
    try {
      const commonPayload = {
        title: form.title,
        content_type: form.content_type,
        category: form.category,
        tags: splitList(form.tags),
        account_stages: splitList(form.account_stages),
        service_lines: [],
        custom_field_values: customValuesForSubmit(formCustomFields, customValues),
      }
      const created = form.source_kind === 'file'
        ? await uploadContentFile(token, { ...commonPayload, file: file as File })
        : await createContent(token, {
          ...commonPayload,
          source_kind: form.source_kind as 'manual' | 'url',
          url: form.url,
          body_content: form.body_content,
        })
      setItems(current => [created, ...current])
      setForm(current => ({ ...current, title: '', url: '', body_content: '' }))
      setFile(null)
      setCustomValues({})
      setCustomErrors({})
      toast.success('Content item created')
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(Object.fromEntries(err.fieldErrors.filter(item => !item.field.startsWith('custom_field_values.')).map(item => [item.field, item.message])))
        setCustomErrors(Object.fromEntries(err.fieldErrors.filter(item => item.field.startsWith('custom_field_values.')).map(item => [item.field.replace('custom_field_values.', ''), item.message])))
      }
      toast.error(err instanceof Error ? err.message : 'Content could not be created')
    } finally {
      setSaving(false)
    }
  }

  async function remove(item: ContentItem) {
    if (!token || !window.confirm(`Delete ${item.title}?`)) return
    try {
      const response = await deleteContent(token, item.id)
      setItems(current => current.map(existing => (existing.id === item.id ? { ...existing, is_active: false } : existing)).filter(existing => existing.id !== item.id || response.message.includes('archived')))
      toast.success(response.message)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Content could not be removed')
    }
  }

  return (
    <section className="tk-card overflow-hidden">
      <div className="border-b border-surface-border p-5">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Client education</p>
        <h2 className="text-base font-semibold text-ink">Content catalog</h2>
        <p className="mt-2 text-sm text-ink-secondary">Manage education assets that can be recommended and shared from Account 360.</p>
      </div>
      <form onSubmit={submit} className="grid gap-3 border-b border-surface-border bg-surface-tertiary p-4 lg:grid-cols-[1fr_140px_140px_150px_1fr_auto]">
        <label className="space-y-1">
          <span className="tk-label">Title</span>
          <input className="tk-input" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Executive governance guide" />
          <FieldError id="content-title-error" message={fieldErrors.title} />
        </label>
        <label className="space-y-1">
          <span className="tk-label">Type</span>
          <select className="tk-input" value={form.content_type} onChange={event => setForm({ ...form, content_type: event.target.value })}>
            <option>Guide</option>
            <option>Checklist</option>
            <option>Deck</option>
            <option>Case study</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="tk-label">Category</span>
          <input className="tk-input" value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} />
          <FieldError id="content-category-error" message={fieldErrors.category} />
        </label>
        <label className="space-y-1">
          <span className="tk-label">Source</span>
          <select className="tk-input" value={form.source_kind} onChange={event => setForm({ ...form, source_kind: event.target.value })}>
            <option value="url">URL</option>
            <option value="manual">Manual</option>
            <option value="file">File</option>
          </select>
        </label>
        {form.source_kind === 'file' ? (
          <label className="space-y-1">
            <span className="tk-label">File</span>
            <input type="file" className="tk-input" onChange={event => setFile(event.target.files?.[0] ?? null)} />
            <FieldError id="content-file-error" message={fieldErrors.file || fieldErrors.request} />
          </label>
        ) : form.source_kind === 'manual' ? (
          <label className="space-y-1">
            <span className="tk-label">Content</span>
            <input className="tk-input" value={form.body_content} onChange={event => setForm({ ...form, body_content: event.target.value })} placeholder="Short summary or source note" />
            <FieldError id="content-body-error" message={fieldErrors.body_content || fieldErrors.request} />
          </label>
        ) : (
          <label className="space-y-1">
            <span className="tk-label">URL</span>
            <input className="tk-input" value={form.url} onChange={event => setForm({ ...form, url: event.target.value })} placeholder="https://..." />
            <FieldError id="content-url-error" message={fieldErrors.url || fieldErrors.request} />
          </label>
        )}
        <button type="submit" className="tk-button-primary self-end" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </button>
        <div className="lg:col-span-6">
          <RuntimeCustomFields
            fields={formCustomFields}
            values={customValues}
            errors={customErrors}
            onChange={(fieldKey, value) => {
              setCustomValues(current => ({ ...current, [fieldKey]: value }))
              setCustomErrors(current => ({ ...current, [fieldKey]: '' }))
            }}
          />
        </div>
      </form>
      <div className="flex flex-col gap-3 border-b border-surface-border p-4 md:flex-row md:items-center md:justify-between">
        <label className="relative block md:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
          <input className="tk-input pl-9" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} placeholder="Search content" />
        </label>
        <p className="text-xs font-medium text-ink-secondary">Page {pages ? page : 0} of {pages}</p>
      </div>
      {loading ? (
        <div className="flex min-h-[180px] items-center justify-center text-sm font-semibold text-ink-secondary">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading content
        </div>
      ) : error ? (
        <div className="p-5 text-sm font-semibold text-rag-red">{error}</div>
      ) : items.length ? (
        <div className="divide-y divide-surface-border">
          {items.map(item => (
            <article key={item.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-ink">{item.title}</h3>
                <p className="mt-1 text-xs text-ink-secondary">{item.category} | {item.content_type} | Updated {formatDate(item.updated_at)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(item.tags || []).map(tag => <span key={tag} className="rounded-full bg-blue-tint-20 px-2 py-1 text-[11px] font-semibold text-brand-blue">{tag}</span>)}
                  <span className="rounded-full bg-surface-tertiary px-2 py-1 text-[11px] font-semibold text-ink-secondary">{item.is_active ? 'Active' : 'Inactive'}</span>
                </div>
                <RuntimeCustomFieldValues fields={listCustomFields} values={item.custom_field_values} variant="badges" className="mt-2" />
              </div>
              <button type="button" className="tk-button-secondary justify-self-start lg:justify-self-end" onClick={() => remove(item)}>
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="p-5">
          <EmptyState icon={FileText} heading="No content found" body="Create a content item to start recommending education assets from Account 360." />
        </div>
      )}
      <div className="flex justify-end gap-2 border-t border-surface-border p-4">
        <button className="tk-button-secondary" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</button>
        <button className="tk-button-secondary" disabled={!pages || page >= pages} onClick={() => setPage(value => value + 1)}>Next</button>
      </div>
    </section>
  )
}

function splitList(value: string) {
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

import { AlertTriangle, Loader2, Plus, RefreshCcw, Search, ShieldAlert } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/ui/EmptyState'
import { FieldError } from '@/components/form/FieldError'
import { RuntimeCustomFieldValues, RuntimeCustomFields, customValuesForSubmit, requiredCustomFieldErrors } from '@/components/custom-fields/RuntimeCustomFields'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/contexts/AuthContext'
import { Account } from '@/types/account'
import { ApiError } from '@/services/api'
import { listAccounts } from '@/services/accountWorkspace'
import { closeEscalation, createEscalation, Escalation, listEscalations, listRuntimeCustomFields, reopenEscalation, RuntimeCustomField } from '@/services/contentGovernance'
import { formatDate } from '@/utils/formatters'
import { cn } from '@/utils/cn'

export function Escalations() {
  const { token, user } = useAuth()
  const [items, setItems] = useState<Escalation[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [severity, setSeverity] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(0)
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [customFields, setCustomFields] = useState<RuntimeCustomField[]>([])
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({})
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState({ account_id: '', summary: '', impact: '', severity: 'high', priority: 'high', watchlist: false })
  const formCustomFields = customFields
  const listCustomFields = customFields
  const params = useMemo(() => {
    const next = new URLSearchParams({ page: String(page), page_size: '8', sort: 'sla_due_at', direction: 'asc' })
    if (search) next.set('search', search)
    if (severity) next.set('severity', severity)
    if (status) next.set('status', status)
    return next
  }, [page, search, severity, status])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.all([listEscalations(token, params), listAccounts(token, new URLSearchParams({ page: '1', page_size: '100' }))])
      .then(([escalationPage, accountPage]) => {
        if (cancelled) return
        setItems(escalationPage.items)
        setPages(escalationPage.pages)
        setAccounts(accountPage.items)
        setForm(current => ({ ...current, account_id: current.account_id || accountPage.items[0]?.id || '' }))
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Escalations could not load')
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
    listRuntimeCustomFields(token, 'escalation_management')
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
    if (!token || !user) return
    const nextCustomErrors = requiredCustomFieldErrors(formCustomFields, customValues)
    setCustomErrors(nextCustomErrors)
    if (Object.keys(nextCustomErrors).length) return
    setSaving(true)
    setFieldErrors({})
    try {
      const created = await createEscalation(token, {
        ...form,
        owner_id: user.id,
        severity: form.severity as Escalation['severity'],
        priority: form.priority as Escalation['priority'],
        custom_field_values: customValuesForSubmit(formCustomFields, customValues),
      })
      setItems(current => [created, ...current])
      setForm(current => ({ ...current, summary: '', impact: '' }))
      setCustomValues({})
      setCustomErrors({})
      toast.success('Escalation created')
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(Object.fromEntries(err.fieldErrors.filter(item => !item.field.startsWith('custom_field_values.')).map(item => [item.field, item.message])))
        setCustomErrors(Object.fromEntries(err.fieldErrors.filter(item => item.field.startsWith('custom_field_values.')).map(item => [item.field.replace('custom_field_values.', ''), item.message])))
      }
      toast.error(err instanceof Error ? err.message : 'Escalation could not be created')
    } finally {
      setSaving(false)
    }
  }

  async function closeItem(item: Escalation) {
    if (!token) return
    const evidence = window.prompt('Closure evidence')
    if (!evidence) return
    const rca = item.severity === 'critical' ? window.prompt('RCA for critical escalation') : undefined
    if (item.severity === 'critical' && !rca) return
    try {
      const updated = await closeEscalation(token, item.id, { resolution_summary: 'Escalation resolved.', closure_evidence: evidence, rca: rca || undefined })
      setItems(current => current.map(existing => (existing.id === item.id ? updated : existing)))
      toast.success('Escalation closed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Escalation could not be closed')
    }
  }

  async function reopenItem(item: Escalation) {
    if (!token) return
    try {
      const updated = await reopenEscalation(token, item.id)
      setItems(current => current.map(existing => (existing.id === item.id ? updated : existing)))
      toast.success('Escalation reopened')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Escalation could not be reopened')
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Risk response" title="Escalations" description="Formal escalation management with severity, SLA, owner, mitigation, RCA, and closure evidence." />
      <section className="tk-card mb-4 overflow-hidden">
        <form onSubmit={submit} className="grid gap-3 border-b border-surface-border bg-surface-tertiary p-4 lg:grid-cols-[1fr_1fr_130px_130px_auto]">
          <select className="tk-input" value={form.account_id} onChange={event => setForm({ ...form, account_id: event.target.value })}>
            {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
          <label className="space-y-1">
            <input className="tk-input" value={form.summary} onChange={event => setForm({ ...form, summary: event.target.value })} placeholder="Escalation summary" aria-invalid={Boolean(fieldErrors.summary)} aria-describedby="escalation-summary-error" />
            <FieldError id="escalation-summary-error" message={fieldErrors.summary} />
          </label>
          <select className="tk-input" value={form.severity} onChange={event => setForm({ ...form, severity: event.target.value })}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <select className="tk-input" value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value })}>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <button className="tk-button-primary" disabled={saving || !form.account_id}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create
          </button>
          <label className="space-y-1 lg:col-span-5">
            <textarea className="tk-input min-h-[86px]" value={form.impact} onChange={event => setForm({ ...form, impact: event.target.value })} placeholder="Business/client impact" aria-invalid={Boolean(fieldErrors.impact)} aria-describedby="escalation-impact-error" />
            <FieldError id="escalation-impact-error" message={fieldErrors.impact} />
          </label>
          <div className="lg:col-span-5">
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
        <div className="grid gap-3 border-b border-surface-border p-4 md:grid-cols-[1fr_160px_160px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
            <input className="tk-input pl-9" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} placeholder="Search summary, impact, RCA" />
          </label>
          <select className="tk-input" value={severity} onChange={event => { setSeverity(event.target.value); setPage(1) }}>
            <option value="">All severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select className="tk-input" value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}>
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="watchlist">Watchlist</option>
            <option value="closed">Closed</option>
            <option value="reopened">Reopened</option>
          </select>
        </div>
        {loading ? (
          <div className="flex min-h-[220px] items-center justify-center text-sm font-semibold text-ink-secondary"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading escalations</div>
        ) : error ? (
          <div className="p-5 text-sm font-semibold text-rag-red">{error}</div>
        ) : items.length ? (
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map(item => (
              <article key={item.id} className="rounded-lg border border-surface-border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">{item.summary}</h3>
                    <p className="mt-2 text-sm leading-6 text-ink-secondary">{item.impact}</p>
                  </div>
                  <span className={cn('rounded-full px-2 py-1 text-[11px] font-bold uppercase', item.severity === 'critical' ? 'bg-rag-red/10 text-rag-red' : item.severity === 'high' ? 'bg-brand-orange/10 text-brand-orange' : 'bg-blue-tint-20 text-brand-blue')}>{item.severity}</span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div><dt className="font-semibold uppercase text-ink-secondary">Status</dt><dd className="mt-1 capitalize text-ink">{item.status}</dd></div>
                  <div><dt className="font-semibold uppercase text-ink-secondary">SLA</dt><dd className="mt-1 text-ink">{formatDate(item.sla_due_at)}</dd></div>
                  <div><dt className="font-semibold uppercase text-ink-secondary">Owner</dt><dd className="mt-1 text-ink">{item.owner_name}</dd></div>
                  <div><dt className="font-semibold uppercase text-ink-secondary">Priority</dt><dd className="mt-1 capitalize text-ink">{item.priority}</dd></div>
                </dl>
                <RuntimeCustomFieldValues fields={listCustomFields} values={item.custom_field_values} variant="definition-grid" className="mt-4" />
                <div className="mt-4 flex gap-2">
                  {item.status === 'closed' ? (
                    <button className="tk-button-secondary" onClick={() => reopenItem(item)}><RefreshCcw className="h-4 w-4" />Reopen</button>
                  ) : (
                    <button className="tk-button-secondary" onClick={() => closeItem(item)}><ShieldAlert className="h-4 w-4" />Close</button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon={AlertTriangle} heading="No escalations found" body="Create a formal escalation when client impact needs tracked recovery and governance visibility." />
        )}
        <div className="flex justify-end gap-2 border-t border-surface-border p-4">
          <button className="tk-button-secondary" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</button>
          <button className="tk-button-secondary" disabled={!pages || page >= pages} onClick={() => setPage(value => value + 1)}>Next</button>
        </div>
      </section>
    </div>
  )
}

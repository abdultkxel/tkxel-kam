import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  History,
  Loader2,
  Plus,
  Power,
  RefreshCcw,
  Save,
  Search,
  Send,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import {
  createScoringMetric,
  listScoringMetricVersions,
  listScoringMetrics,
  publishScoringMetric,
  ScoringMetric,
  ScoringMetricVersion,
  updateScoringMetric,
  validateScoringMetric,
} from '@/services/scoring'
import { cn } from '@/utils/cn'

type Scope = 'account' | 'engagement'
type Status = 'draft' | 'published' | 'inactive'
type ActiveState = 'all' | 'active' | 'inactive'
type SortKey = 'name' | 'updated_at' | 'scope' | 'effective_date' | 'weight'
type Dimension = 'relationship' | 'resource' | 'service_line' | 'contract' | 'account_risk' | 'csat'

interface MetricDraft {
  id?: string
  slug: string
  name: string
  description: string
  scope: Scope
  weight: number
  redMax: number
  amberMin: number
  greenMin: number
  freshnessDays: number
  ownerRole: string
  source: string
  effectiveDate: string
  status: Status
  isActive: boolean
  formulaText: string
}

const dimensions: Dimension[] = ['relationship', 'resource', 'service_line', 'contract', 'account_risk', 'csat']
const defaultWeights: Record<Dimension, number> = { relationship: 17, resource: 17, service_line: 16, contract: 17, account_risk: 17, csat: 16 }
const metricSlugByDimension: Record<Dimension, string> = {
  relationship: 'relationship_health',
  resource: 'resource_health',
  service_line: 'service_line_health',
  contract: 'contract_health',
  account_risk: 'account_risk_health',
  csat: 'csat_health',
}
const metricNameByDimension: Record<Dimension, string> = {
  relationship: 'Relationship Health',
  resource: 'Resource Health',
  service_line: 'Service Line Score',
  contract: 'Contract Health',
  account_risk: 'Account Risk Score',
  csat: 'CSAT Score',
}

const formulaByDimension: Record<Dimension, Record<string, unknown>> = {
  relationship: {
    op: 'weighted_sum',
    scale: 3,
    items: [
      { field: 'relationship.ceo', label: 'CEO Engagement', weight: 20 },
      { field: 'relationship.kam', label: 'KAM Engagement', weight: 30 },
      { field: 'relationship.delivery', label: 'Delivery Leadership', weight: 25 },
      { field: 'relationship.finance', label: 'Finance Connection', weight: 5 },
      { field: 'relationship.inperson', label: 'In-Person Meeting', weight: 20 },
    ],
  },
  resource: {
    op: 'weighted_sum',
    scale: 3,
    items: [
      { field: 'resource.keyres', label: 'Number of Key Resources', weight: 50 },
      { field: 'resource.alignment', label: 'Key Resource Alignment', weight: 25 },
      { field: 'resource.backup', label: 'Backup', weight: 25 },
    ],
  },
  service_line: {
    op: 'ratio',
    numerator: { op: 'field', field: 'service_line.selected_count' },
    denominator: { op: 'field', field: 'service_line.total_count' },
    multiplier: 100,
  },
  contract: {
    op: 'average',
    scale: 3,
    values: [
      { op: 'field', field: 'contract.length' },
      { op: 'field', field: 'contract.notice' },
      { op: 'field', field: 'contract.renewal' },
    ],
  },
  account_risk: {
    op: 'weighted_sum',
    scale: 3,
    items: [
      { field: 'account_risk.competitors', label: 'Competitors', weight: 30 },
      { field: 'account_risk.leadership_tenure', label: 'Current Leadership Tenure', weight: 15 },
      { field: 'account_risk.funding_revenue', label: 'Funding and Revenue Changes', weight: 15 },
      { field: 'account_risk.payment_behavior', label: 'Payment Behavior', weight: 15 },
      { field: 'account_risk.roadmap_alignment', label: 'Roadmap Alignment', weight: 20 },
      { field: 'account_risk.geopolitical', label: 'Geopolitical Situation', weight: 5 },
    ],
  },
  csat: {
    op: 'weighted_sum',
    scale: 5,
    items: [
      { field: 'csat.delivery_ex', label: 'Delivery Excellence', weight: 30 },
      { field: 'csat.communication', label: 'Communication', weight: 20 },
      { field: 'csat.proactiveness', label: 'Proactiveness', weight: 15 },
      { field: 'csat.trust', label: 'Trust', weight: 20 },
      { field: 'csat.value', label: 'Value for Money', weight: 15 },
    ],
  },
}

function emptyDraft(): MetricDraft {
  return {
    slug: '',
    name: '',
    description: '',
    scope: 'account',
    weight: 20,
    redMax: 59,
    amberMin: 60,
    greenMin: 75,
    freshnessDays: 30,
    ownerRole: 'kam_head',
    source: 'manual',
    effectiveDate: '',
    status: 'draft',
    isActive: true,
    formulaText: JSON.stringify({ op: 'weighted_sum', scale: 100, items: [{ field: 'health_relationship', weight: 100 }] }, null, 2),
  }
}

function draftFromMetric(metric: ScoringMetric): MetricDraft {
  return {
    id: metric.id,
    slug: metric.slug,
    name: metric.name,
    description: metric.description ?? '',
    scope: metric.scope,
    weight: metric.weight,
    redMax: Number(metric.thresholds?.red_max ?? 59),
    amberMin: Number(metric.thresholds?.amber_min ?? 60),
    greenMin: Number(metric.thresholds?.green_min ?? 75),
    freshnessDays: Number(metric.freshness_rule?.stale_after_days ?? 30),
    ownerRole: metric.owner_role ?? '',
    source: metric.source,
    effectiveDate: toDateTimeLocal(metric.effective_date),
    status: metric.status,
    isActive: metric.is_active,
    formulaText: JSON.stringify(metric.formula || {}, null, 2),
  }
}

function defaultDraft(dimension: Dimension): MetricDraft {
  return {
    ...emptyDraft(),
    slug: metricSlugByDimension[dimension],
    name: metricNameByDimension[dimension],
    description: `Configured account ${dimension.replace('_', ' ')} score dimension.`,
    weight: defaultWeights[dimension],
    source: 'account_health_admin_builder',
    formulaText: JSON.stringify(formulaByDimension[dimension], null, 2),
  }
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 16)
}

function formatShortDate(value?: string | null) {
  if (!value) return 'Not set'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not set' : date.toLocaleDateString()
}

function payloadFromDraft(draft: MetricDraft) {
  return {
    slug: draft.slug.trim(),
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    scope: draft.scope,
    weight: Number(draft.weight),
    thresholds: { red_max: Number(draft.redMax), amber_min: Number(draft.amberMin), green_min: Number(draft.greenMin) },
    formula: JSON.parse(draft.formulaText),
    freshness_rule: { stale_after_days: Number(draft.freshnessDays) },
    owner_role: draft.ownerRole.trim() || null,
    source: draft.source.trim() || 'manual',
    effective_date: draft.effectiveDate ? new Date(draft.effectiveDate).toISOString() : null,
    status: draft.status,
    is_active: draft.isActive,
  }
}

export function ScoringEngineBuilder() {
  const { token } = useAuth()
  const [metrics, setMetrics] = useState<ScoringMetric[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<'all' | Scope>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all')
  const [activeState, setActiveState] = useState<ActiveState>('all')
  const [sourceFilter, setSourceFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [effectiveTo, setEffectiveTo] = useState('')
  const [sort, setSort] = useState<SortKey>('updated_at')
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc')
  const [loading, setLoading] = useState(Boolean(token))
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState('')
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [validationWarnings, setValidationWarnings] = useState<string[]>([])
  const [selected, setSelected] = useState<MetricDraft>(emptyDraft())
  const [versions, setVersions] = useState<ScoringMetricVersion[]>([])
  const [versionPage, setVersionPage] = useState(1)
  const [versionPages, setVersionPages] = useState(1)
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [quickSetupOpen, setQuickSetupOpen] = useState(false)

  const activeWeightTotal = useMemo(
    () => metrics.filter(metric => metric.scope === 'account' && metric.is_active && metric.status === 'published').reduce((sum, metric) => sum + metric.weight, 0),
    [metrics],
  )

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }
    void loadMetrics()
  }, [token, page, search, scope, statusFilter, activeState, sourceFilter, ownerFilter, effectiveFrom, effectiveTo, sort, direction])

  useEffect(() => {
    if (!token || !selected.id) {
      setVersions([])
      return
    }
    void loadVersions(selected.id, versionPage)
  }, [token, selected.id, versionPage])

  async function loadMetrics() {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const response = await listScoringMetrics(token, {
        search,
        scope: scope === 'all' ? undefined : scope,
        status: statusFilter === 'all' ? undefined : statusFilter,
        active_state: activeState,
        source: sourceFilter || undefined,
        owner_role: ownerFilter || undefined,
        effective_from: effectiveFrom ? new Date(effectiveFrom).toISOString() : undefined,
        effective_to: effectiveTo ? new Date(effectiveTo).toISOString() : undefined,
        sort,
        direction,
        page,
        page_size: 8,
      })
      setMetrics(response.items)
      setTotal(response.total)
      setPages(Math.max(1, response.pages))
      if (response.items.length && !selected.id) setSelected(draftFromMetric(response.items[0]))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load scoring metrics')
    } finally {
      setLoading(false)
    }
  }

  async function loadVersions(metricId: string, nextPage = 1) {
    if (!token) return
    setVersionsLoading(true)
    try {
      const response = await listScoringMetricVersions(token, metricId, { page: nextPage, page_size: 5 })
      setVersions(response.items)
      setVersionPages(Math.max(1, response.pages))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to load metric versions')
    } finally {
      setVersionsLoading(false)
    }
  }

  function chooseMetric(metric: ScoringMetric) {
    setSelected(draftFromMetric(metric))
    setValidationErrors([])
    setValidationWarnings([])
    setVersionPage(1)
  }

  function newMetric() {
    setSelected(emptyDraft())
    setValidationErrors([])
    setValidationWarnings([])
    setVersions([])
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    await saveDraft()
  }

  async function saveDraft() {
    if (!token) return
    setSaving(true)
    setError('')
    setValidationErrors([])
    try {
      const payload = payloadFromDraft(selected)
      const metric = selected.id ? await updateScoringMetric(token, selected.id, payload) : await createScoringMetric(token, payload)
      setSelected(draftFromMetric(metric))
      toast.success(selected.id ? 'Metric updated' : 'Metric created')
      await loadMetrics()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save metric')
    } finally {
      setSaving(false)
    }
  }

  async function validateSelected() {
    if (!token || !selected.id) {
      setValidationErrors(['Save the metric before validation.'])
      return
    }
    setValidating(true)
    setValidationErrors([])
    setValidationWarnings([])
    try {
      const result = await validateScoringMetric(token, selected.id)
      setValidationErrors(result.errors)
      setValidationWarnings(result.warnings)
      toast[result.valid ? 'success' : 'error'](result.valid ? 'Metric configuration is valid' : 'Metric configuration needs changes')
    } catch (err) {
      setValidationErrors([err instanceof Error ? err.message : 'Unable to validate metric'])
    } finally {
      setValidating(false)
    }
  }

  async function publishSelected() {
    if (!token || !selected.id) return
    setPublishing(true)
    setValidationErrors([])
    try {
      await publishScoringMetric(token, selected.id)
      toast.success('Metric published as a new version')
      await loadMetrics()
      await loadVersions(selected.id, 1)
    } catch (err) {
      setValidationErrors([err instanceof Error ? err.message : 'Unable to publish metric'])
    } finally {
      setPublishing(false)
    }
  }

  async function toggleActive(metric: ScoringMetric) {
    if (!token) return
    setSaving(true)
    try {
      const nextActive = !metric.is_active
      const updated = await updateScoringMetric(token, metric.id, {
        is_active: nextActive,
        status: nextActive && metric.status === 'inactive' ? 'draft' : nextActive ? metric.status : 'inactive',
      })
      toast.success(nextActive ? 'Metric activated' : 'Metric deactivated')
      setSelected(draftFromMetric(updated))
      await loadMetrics()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update metric state')
    } finally {
      setSaving(false)
    }
  }

  async function publishDefaultMetrics() {
    if (!token) return
    setPublishing(true)
    setError('')
    try {
      const existingPage = await listScoringMetrics(token, { page: 1, page_size: 100, active_state: 'all' })
      for (const dimension of dimensions) {
        const draft = defaultDraft(dimension)
        const existing = existingPage.items.find(metric => metric.slug === draft.slug)
        const payload = { ...payloadFromDraft(draft), status: existing?.status ?? 'published', is_active: true }
        const metric = existing ? await updateScoringMetric(token, existing.id, payload) : await createScoringMetric(token, payload)
        await publishScoringMetric(token, metric.id)
      }
      toast.success('Default account-health metrics published')
      setQuickSetupOpen(false)
      await loadMetrics()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to publish default metrics')
    } finally {
      setPublishing(false)
    }
  }

  const hasFormulaError = validationErrors.some(item => /formula|operation|dependency|weight/i.test(item))
  const hasThresholdError = validationErrors.some(item => /threshold/i.test(item))
  const hasFreshnessError = validationErrors.some(item => /freshness/i.test(item))

  return (
    <section className="tk-card overflow-hidden">
      <div className="border-b border-surface-border p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Configurable scoring</p>
            <h2 className="text-base font-semibold text-ink">Metric engine</h2>
            <p className="mt-1 max-w-3xl text-sm text-ink-secondary">
              Configure active published metrics used by future Account Health and Engagement scoring snapshots.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="tk-button-secondary" onClick={loadMetrics} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              Refresh
            </button>
            <button type="button" className="tk-button-secondary" onClick={() => setQuickSetupOpen(value => !value)}>
              <SlidersHorizontal className="h-4 w-4" />
              Defaults
            </button>
            <button type="button" className="tk-button-primary" onClick={newMetric}>
              <Plus className="h-4 w-4" />
              New metric
            </button>
          </div>
        </div>
        {quickSetupOpen ? (
          <div className="mt-4 rounded-lg border border-blue-tint-40 bg-blue-tint-10 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-ink">Default account-health framework</h3>
                <p className="mt-1 text-sm text-ink-secondary">Publishes Relationship, Resource, Service Line, Contract, Account Risk, and CSAT metrics with balanced weights.</p>
              </div>
              <button type="button" className="tk-button-primary shrink-0" disabled={publishing || !token} onClick={publishDefaultMetrics}>
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Publish defaults
              </button>
            </div>
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-md border border-rag-red/20 bg-rag-red/10 p-3 text-sm text-rag-red">
            <p className="font-semibold">Scoring configuration could not be completed</p>
            <p>{error}</p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-4">
          <div className="rounded-lg border border-surface-border bg-surface-secondary p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(180px,1.5fr)_repeat(4,minmax(120px,1fr))]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-secondary" />
                <input value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} className="tk-input pl-9" placeholder="Search name or slug" />
              </label>
              <select value={scope} onChange={event => { setScope(event.target.value as 'all' | Scope); setPage(1) }} className="tk-input">
                <option value="all">All scopes</option>
                <option value="account">Account</option>
                <option value="engagement">Engagement</option>
              </select>
              <select value={statusFilter} onChange={event => { setStatusFilter(event.target.value as 'all' | Status); setPage(1) }} className="tk-input">
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="inactive">Inactive</option>
              </select>
              <select value={activeState} onChange={event => { setActiveState(event.target.value as ActiveState); setPage(1) }} className="tk-input">
                <option value="all">Active and inactive</option>
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
              </select>
              <select value={`${sort}:${direction}`} onChange={event => {
                const [nextSort, nextDirection] = event.target.value.split(':') as [SortKey, 'asc' | 'desc']
                setSort(nextSort)
                setDirection(nextDirection)
              }} className="tk-input">
                <option value="updated_at:desc">Updated newest</option>
                <option value="updated_at:asc">Updated oldest</option>
                <option value="name:asc">Name A-Z</option>
                <option value="scope:asc">Scope</option>
                <option value="effective_date:desc">Effective newest</option>
                <option value="weight:desc">Weight high-low</option>
              </select>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <input value={sourceFilter} onChange={event => { setSourceFilter(event.target.value); setPage(1) }} className="tk-input" placeholder="Source filter" />
              <input value={ownerFilter} onChange={event => { setOwnerFilter(event.target.value); setPage(1) }} className="tk-input" placeholder="Owner role filter" />
              <div className="grid gap-2 sm:grid-cols-2">
                <input type="date" value={effectiveFrom} onChange={event => { setEffectiveFrom(event.target.value); setPage(1) }} className="tk-input" aria-label="Effective from" />
                <input type="date" value={effectiveTo} onChange={event => { setEffectiveTo(event.target.value); setPage(1) }} className="tk-input" aria-label="Effective to" />
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-surface-border">
            {loading ? (
              <div className="flex items-center gap-2 bg-surface-tertiary p-4 text-sm font-semibold text-ink-secondary">
                <Loader2 className="h-4 w-4 animate-spin text-brand-blue" />
                Loading metric definitions...
              </div>
            ) : null}
            {!loading && !metrics.length ? (
              <div className="border border-dashed border-surface-border bg-surface-tertiary p-6 text-center">
                <h3 className="text-sm font-semibold text-ink">No metrics match this view</h3>
                <p className="mt-1 text-sm text-ink-secondary">Create the first metric or publish the default account-health framework.</p>
                <button type="button" className="tk-button-primary mx-auto mt-4" onClick={newMetric}>
                  <Plus className="h-4 w-4" />
                  Create metric
                </button>
              </div>
            ) : null}
            {metrics.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-surface-tertiary text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                    <tr>
                      <th className="px-4 py-3">Metric</th>
                      <th className="px-4 py-3">Scope</th>
                      <th className="px-4 py-3">Weight</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Source</th>
                      <th className="px-4 py-3">Effective</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.map(metric => (
                      <tr key={metric.id} className={cn('border-t border-surface-border', selected.id === metric.id ? 'bg-blue-tint-10' : 'bg-white')}>
                        <td className="px-4 py-3">
                          <button type="button" className="text-left" onClick={() => chooseMetric(metric)}>
                            <span className="block font-semibold text-ink">{metric.name}</span>
                            <span className="text-xs text-ink-secondary">{metric.slug}</span>
                          </button>
                        </td>
                        <td className="px-4 py-3 capitalize text-ink-secondary">{metric.scope}</td>
                        <td className="px-4 py-3 font-semibold text-ink">{metric.weight}%</td>
                        <td className="px-4 py-3">
                          <span className={cn('rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wider', metric.status === 'published' && metric.is_active ? 'bg-rag-green/10 text-rag-green' : metric.is_active ? 'bg-brand-orange/10 text-brand-orange' : 'bg-rag-red/10 text-rag-red')}>
                            {metric.is_active ? metric.status : 'inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-ink-secondary">{metric.source}</td>
                        <td className="px-4 py-3 text-ink-secondary">{formatShortDate(metric.effective_date)}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button type="button" className="tk-button-secondary px-3 py-2" onClick={() => chooseMetric(metric)}>Edit</button>
                            <button type="button" className="tk-button-secondary px-3 py-2" onClick={() => toggleActive(metric)} disabled={saving}>
                              <Power className="h-4 w-4" />
                              {metric.is_active ? 'Off' : 'On'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-surface-border bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink-secondary">
              {total} metric definitions. Active published account weight total: <span className={activeWeightTotal === 100 ? 'font-semibold text-rag-green' : 'font-semibold text-brand-orange'}>{activeWeightTotal}%</span>
            </p>
            <div className="flex items-center gap-2">
              <button type="button" className="tk-button-secondary px-3 py-2" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-ink">Page {page} of {pages}</span>
              <button type="button" className="tk-button-secondary px-3 py-2" disabled={page >= pages} onClick={() => setPage(value => Math.min(pages, value + 1))}>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <aside className="min-w-0 space-y-4">
          <form onSubmit={submit} className="rounded-lg border border-surface-border bg-white p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Metric editor</p>
                <h3 className="text-sm font-semibold text-ink">{selected.id ? selected.name || 'Selected metric' : 'New metric'}</h3>
              </div>
              <span className="rounded-full bg-surface-tertiary px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">v{metrics.find(metric => metric.id === selected.id)?.current_version ?? 0}</span>
            </div>
            <div className="grid gap-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                Name
                <input value={selected.name} onChange={event => setSelected({ ...selected, name: event.target.value })} className="tk-input mt-1" required />
              </label>
              <label className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                Slug
                <input value={selected.slug} onChange={event => setSelected({ ...selected, slug: event.target.value })} className="tk-input mt-1" required disabled={Boolean(selected.id)} />
              </label>
              <label className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                Description
                <textarea value={selected.description} onChange={event => setSelected({ ...selected, description: event.target.value })} className="tk-input mt-1 min-h-20" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                  Scope
                  <select value={selected.scope} onChange={event => setSelected({ ...selected, scope: event.target.value as Scope })} className="tk-input mt-1">
                    <option value="account">Account</option>
                    <option value="engagement">Engagement</option>
                  </select>
                </label>
                <label className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                  Weight
                  <input type="number" min={0} max={100} value={selected.weight} onChange={event => setSelected({ ...selected, weight: Number(event.target.value) })} className="tk-input mt-1" />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                  Red max
                  <input type="number" min={0} max={100} value={selected.redMax} onChange={event => setSelected({ ...selected, redMax: Number(event.target.value) })} className={cn('tk-input mt-1', hasThresholdError ? 'border-rag-red' : '')} />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                  Amber min
                  <input type="number" min={0} max={100} value={selected.amberMin} onChange={event => setSelected({ ...selected, amberMin: Number(event.target.value) })} className={cn('tk-input mt-1', hasThresholdError ? 'border-rag-red' : '')} />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                  Green min
                  <input type="number" min={0} max={100} value={selected.greenMin} onChange={event => setSelected({ ...selected, greenMin: Number(event.target.value) })} className={cn('tk-input mt-1', hasThresholdError ? 'border-rag-red' : '')} />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                  Freshness days
                  <input type="number" min={1} max={3650} value={selected.freshnessDays} onChange={event => setSelected({ ...selected, freshnessDays: Number(event.target.value) })} className={cn('tk-input mt-1', hasFreshnessError ? 'border-rag-red' : '')} />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                  Effective date
                  <input type="datetime-local" value={selected.effectiveDate} onChange={event => setSelected({ ...selected, effectiveDate: event.target.value })} className="tk-input mt-1" />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                  Owner role
                  <input value={selected.ownerRole} onChange={event => setSelected({ ...selected, ownerRole: event.target.value })} className="tk-input mt-1" />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                  Source
                  <input value={selected.source} onChange={event => setSelected({ ...selected, source: event.target.value })} className="tk-input mt-1" />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                  Status
                  <select value={selected.status} onChange={event => setSelected({ ...selected, status: event.target.value as Status })} className="tk-input mt-1">
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 pt-6 text-sm font-semibold text-ink">
                  <input type="checkbox" checked={selected.isActive} onChange={event => setSelected({ ...selected, isActive: event.target.checked })} className="h-4 w-4 accent-brand-blue" />
                  Active
                </label>
              </div>
              <label className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                Formula JSON
                <textarea
                  value={selected.formulaText}
                  onChange={event => setSelected({ ...selected, formulaText: event.target.value })}
                  className={cn('tk-input mt-1 min-h-48 font-mono text-xs leading-5', hasFormulaError ? 'border-rag-red' : '')}
                  spellCheck={false}
                />
              </label>
            </div>
            {validationErrors.length ? (
              <div className="mt-4 rounded-md border border-rag-red/20 bg-rag-red/10 p-3 text-sm text-rag-red">
                <div className="mb-2 flex items-center gap-2 font-semibold"><XCircle className="h-4 w-4" /> Validation errors</div>
                <ul className="list-disc space-y-1 pl-5">
                  {validationErrors.map(error => <li key={error}>{error}</li>)}
                </ul>
              </div>
            ) : null}
            {validationWarnings.length ? (
              <div className="mt-4 rounded-md border border-brand-orange/20 bg-brand-orange/10 p-3 text-sm text-brand-orange">
                {validationWarnings.map(warning => <p key={warning}>{warning}</p>)}
              </div>
            ) : null}
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <button type="submit" className="tk-button-primary" disabled={saving || !token}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </button>
              <button type="button" className="tk-button-secondary" disabled={validating || !selected.id} onClick={validateSelected}>
                {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Validate
              </button>
              <button type="button" className="tk-button-secondary" disabled={publishing || !selected.id || !selected.isActive} onClick={publishSelected}>
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Publish
              </button>
            </div>
          </form>

          <section className="rounded-lg border border-surface-border bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-brand-blue" />
                <h3 className="text-sm font-semibold text-ink">Version history</h3>
              </div>
              {versionsLoading ? <Loader2 className="h-4 w-4 animate-spin text-brand-blue" /> : null}
            </div>
            {!selected.id ? <p className="rounded-md border border-dashed border-surface-border bg-surface-tertiary p-3 text-sm text-ink-secondary">Save a metric to view versions.</p> : null}
            {selected.id && !versionsLoading && !versions.length ? <p className="rounded-md border border-dashed border-surface-border bg-surface-tertiary p-3 text-sm text-ink-secondary">No published versions yet.</p> : null}
            <div className="space-y-2">
              {versions.map(version => (
                <article key={version.id} className="rounded-md border border-surface-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-ink">Version {version.version}</span>
                    <span className="text-xs text-ink-secondary">{formatShortDate(version.published_at)}</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-secondary">Published by {version.published_by_name}</p>
                  <p className="mt-1 text-xs text-ink-secondary">Weight {Number(version.config_json?.weight ?? 0)}% · {String(version.config_json?.source ?? 'manual')}</p>
                </article>
              ))}
            </div>
            {selected.id ? (
              <div className="mt-3 flex items-center justify-between">
                <button type="button" className="tk-button-secondary px-3 py-2" disabled={versionPage <= 1} onClick={() => setVersionPage(value => Math.max(1, value - 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs font-semibold text-ink-secondary">Page {versionPage} of {versionPages}</span>
                <button type="button" className="tk-button-secondary px-3 py-2" disabled={versionPage >= versionPages} onClick={() => setVersionPage(value => Math.min(versionPages, value + 1))}>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </section>
  )
}

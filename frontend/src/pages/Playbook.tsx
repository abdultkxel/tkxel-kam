import { ArrowDown, ArrowUp, BookOpen, CheckCircle2, ClipboardList, Edit3, Layers3, Loader2, Play, Plus, RefreshCw, Save, Target, Trash2, UsersRound, X } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { RuntimeCustomFields, customValuesForSubmit, requiredCustomFieldErrors } from '@/components/custom-fields/RuntimeCustomFields'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { listRuntimeCustomFields, RuntimeCustomField } from '@/services/contentGovernance'
import {
  createPlaybookGuideSection,
  createPlaybookTemplate,
  deletePlaybookGuideSection,
  executePlaybook,
  listExecutablePlaybookTemplates,
  listPlaybookGuideSections,
  listPlaybookTemplates,
  listRecommendedPlaybooks,
  PlaybookGuideSection,
  PlaybookGuideSectionPayload,
  PlaybookTemplate,
  PlaybookTemplatePayload,
  RecommendedPlaybook,
  reorderPlaybookGuideSections,
  updatePlaybookGuideSection,
  updatePlaybookTemplate,
} from '@/services/playbooksTasks'
import { useAccountStore } from '@/stores/accountStore'
import { useV3Store } from '@/stores/v3Store'
import { cn } from '@/utils/cn'
import { formatDate } from '@/utils/formatters'

const blankActivity = {
  title: '',
  description: '',
  owner_rule: 'account_primary_am',
  due_offset_days: 7,
  priority: 'medium' as const,
  success_criteria: [''],
  skip_allowed: true,
  requires_evidence: false,
  sort_order: 0,
}

const blankTemplate: PlaybookTemplatePayload = {
  name: '',
  objective: '',
  description: '',
  signal_types: [''],
  weak_metrics: [''],
  default_owner_rule: 'account_primary_am',
  due_date_rule: { basis: 'execution_date', offset_days: 7 },
  success_criteria: [''],
  skip_rules: [''],
  activities: [{ ...blankActivity }],
  is_active: true,
  custom_field_values: {},
}

export function Playbook() {
  const { token } = useAuth()
  const user = useRole()
  const accounts = useAccountStore(state => state.accounts)
  const signals = useV3Store(state => state.signals)
  const [mode, setMode] = useState<'operations' | 'manual' | 'execution'>('operations')
  const [templates, setTemplates] = useState<PlaybookTemplate[]>([])
  const [recommendations, setRecommendations] = useState<RecommendedPlaybook[]>([])
  const [customFields, setCustomFields] = useState<RuntimeCustomField[]>([])
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({})
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [recommendationLoading, setRecommendationLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [executingId, setExecutingId] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [activeState, setActiveState] = useState<'active' | 'inactive' | 'all'>('active')
  const [ownerRuleFilter, setOwnerRuleFilter] = useState('')
  const [sort, setSort] = useState<'updated_at' | 'name' | 'active_state'>('updated_at')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? '')
  const [signalType, setSignalType] = useState<string>(signals[0]?.type ?? '')
  const [weakMetric, setWeakMetric] = useState<string>(signals[0]?.reasonCodes?.[0] ?? '')
  const [form, setForm] = useState<PlaybookTemplatePayload>(blankTemplate)
  const [editingId, setEditingId] = useState('')
  const canConfigure = ['super_admin', 'admin'].includes(user.role)
  const canExecutePlaybooks = user.role === 'account_manager'
  const readOnly = user.role === 'leadership_viewer'
  const selectedTemplate = useMemo(() => templates.find(template => template.id === selectedTemplateId) ?? templates[0], [selectedTemplateId, templates])
  const activeTemplates = templates.filter(template => template.is_active)
  const selectedAccount = accounts.find(account => account.id === selectedAccountId)

  useEffect(() => {
    if (!selectedAccountId && accounts[0]) setSelectedAccountId(accounts[0].id)
  }, [accounts, selectedAccountId])

  useEffect(() => {
    if (!token || !canConfigure) return
    let cancelled = false
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ page: String(page), page_size: '8', sort, direction: 'desc', active_state: activeState })
    if (search) params.set('search', search)
    if (ownerRuleFilter) params.set('owner_rule', ownerRuleFilter)
    listPlaybookTemplates(token, params)
      .then(response => {
        if (cancelled) return
        setTemplates(response.items)
        setTotal(response.total)
        if (!selectedTemplateId && response.items[0]) setSelectedTemplateId(response.items[0].id)
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Playbooks could not load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeState, canConfigure, ownerRuleFilter, page, search, selectedTemplateId, sort, token])

  useEffect(() => {
    if (!token || !canConfigure) return
    listRuntimeCustomFields(token, 'playbooks_tasks_calendar')
      .then(setCustomFields)
      .catch(() => setCustomFields([]))
  }, [canConfigure, token])

  useEffect(() => {
    if (!token || !canConfigure) return
    let cancelled = false
    setRecommendationLoading(true)
    const params = new URLSearchParams()
    if (selectedAccountId) params.set('account_id', selectedAccountId)
    if (signalType) params.set('signal_type', signalType)
    if (weakMetric) params.set('weak_metric', weakMetric)
    listRecommendedPlaybooks(token, signals[0]?.id ?? 'manual-signal', params)
      .then(items => {
        if (!cancelled) setRecommendations(items)
      })
      .catch(() => {
        if (!cancelled) setRecommendations([])
      })
      .finally(() => {
        if (!cancelled) setRecommendationLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [canConfigure, selectedAccountId, signalType, signals, token, weakMetric])

  async function refreshTemplates() {
    setPage(1)
    setSearch(value => value.trim())
  }

  function startEdit(template: PlaybookTemplate) {
    setEditingId(template.id)
    setCustomValues(template.custom_field_values ?? {})
    setCustomErrors({})
    setForm({
      name: template.name,
      objective: template.objective,
      description: template.description ?? '',
      signal_types: template.signal_types.length ? template.signal_types : [''],
      weak_metrics: template.weak_metrics.length ? template.weak_metrics : [''],
      default_owner_rule: template.default_owner_rule,
      due_date_rule: template.due_date_rule,
      success_criteria: template.success_criteria.length ? template.success_criteria : [''],
      skip_rules: template.skip_rules.length ? template.skip_rules : [''],
      is_active: template.is_active,
      activities: template.activities.length
        ? template.activities.map(activity => ({
            title: activity.title,
            description: activity.description ?? '',
            owner_rule: activity.owner_rule,
            due_offset_days: activity.due_offset_days,
            priority: activity.priority,
            success_criteria: activity.success_criteria.length ? activity.success_criteria : [''],
            skip_allowed: activity.skip_allowed,
            requires_evidence: activity.requires_evidence,
            sort_order: activity.sort_order,
          }))
        : [{ ...blankActivity }],
    })
  }

  function resetForm() {
    setEditingId('')
    setForm({ ...blankTemplate, activities: [{ ...blankActivity }] })
    setCustomValues({})
    setCustomErrors({})
  }

  async function submitTemplate(event: FormEvent) {
    event.preventDefault()
    if (!token || !canConfigure) return
    const errors = requiredCustomFieldErrors(customFields, customValues)
    setCustomErrors(errors)
    if (Object.keys(errors).length) return
    const payload = normalizeTemplatePayload({ ...form, custom_field_values: customValuesForSubmit(customFields, customValues) })
    if (!payload.name || !payload.objective || !payload.success_criteria.length || !payload.activities.length) {
      toast.error('Name, objective, success criteria, and at least one activity are required')
      return
    }
    setSaving(true)
    try {
      const saved = editingId ? await updatePlaybookTemplate(token, editingId, payload) : await createPlaybookTemplate(token, payload)
      toast.success(editingId ? 'Playbook template updated' : 'Playbook template created')
      setTemplates(items => [saved, ...items.filter(item => item.id !== saved.id)])
      setSelectedTemplateId(saved.id)
      resetForm()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Playbook template could not be saved')
    } finally {
      setSaving(false)
    }
  }

  async function runTemplate(template: PlaybookTemplate) {
    if (!selectedAccountId) {
      toast.error('Select an account before executing a playbook')
      return
    }
    if (!token || readOnly) return
    setExecutingId(template.id)
    try {
      const execution = await executePlaybook(token, template.id, {
        account_id: selectedAccountId,
        source_signal_id: signals[0]?.id,
        source_signal_type: signalType || undefined,
        source_metric: weakMetric || undefined,
        confirmed: true,
      })
      toast.success(`${execution.tasks.length} task${execution.tasks.length === 1 ? '' : 's'} generated`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Playbook could not be executed')
    } finally {
      setExecutingId('')
    }
  }

  if (!canConfigure && mode === 'execution') {
    return <ExecutionPlaybooks onManual={() => setMode('manual')} />
  }

  if (!canConfigure || mode === 'manual') {
    return (
      <ManualPlaybook
        canManage={canConfigure}
        onExecution={!canConfigure && canExecutePlaybooks ? () => setMode('execution') : undefined}
        onOperations={canConfigure ? () => setMode('operations') : undefined}
      />
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Playbook execution"
        title="Playbooks, activities, tasks, and calendar"
        description="Configure repeatable account plays, select recommendations, and generate owner-backed tasks with evidence expectations."
        actions={
          <>
            <button className="tk-button-secondary" onClick={() => setMode('manual')}>
              <BookOpen className="h-4 w-4" />
              Manual
            </button>
            <button className="tk-button-secondary" onClick={refreshTemplates}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Templates" value={total} />
        <Metric label="Active" value={activeTemplates.length} />
        <Metric label="Recommendations" value={recommendations.length} />
        <Metric label="Selected Account" value={selectedAccount?.name ?? 'None'} compact />
      </div>

      <section className="tk-card mt-5 p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_180px_180px_180px]">
          <label className="space-y-1">
            <span className="tk-label text-xs">Search</span>
            <input className="tk-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search playbooks, objectives, activities" />
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">State</span>
            <select className="tk-input" value={activeState} onChange={event => setActiveState(event.target.value as typeof activeState)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Owner rule</span>
            <select className="tk-input" value={ownerRuleFilter} onChange={event => setOwnerRuleFilter(event.target.value)}>
              <option value="">All</option>
              <option value="account_primary_am">Primary AM</option>
              <option value="ops_lead">Ops Lead</option>
              <option value="task_creator">Task Creator</option>
              <option value="template_owner">Template Owner</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Sort</span>
            <select className="tk-input" value={sort} onChange={event => setSort(event.target.value as typeof sort)}>
              <option value="updated_at">Updated</option>
              <option value="name">Name</option>
              <option value="active_state">Active state</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Signal type</span>
            <input className="tk-input" value={signalType} onChange={event => setSignalType(event.target.value)} placeholder="relationship_gap" />
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Weak metric</span>
            <input className="tk-input" value={weakMetric} onChange={event => setWeakMetric(event.target.value)} placeholder="relationship" />
          </label>
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-4">
          <div className="tk-card p-4">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Template catalog</p>
                <h2 className="text-base font-semibold text-ink">Configured playbooks</h2>
              </div>
              <div className="flex gap-2">
                <button className="tk-button-secondary" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</button>
                <button className="tk-button-secondary" disabled={page * 8 >= total} onClick={() => setPage(value => value + 1)}>Next</button>
              </div>
            </div>
            {loading ? (
              <LoadingBlock label="Loading playbooks" />
            ) : error ? (
              <div className="rounded-lg border border-rag-red/20 bg-rag-red/10 p-4 text-sm font-semibold text-rag-red">{error}</div>
            ) : templates.length === 0 ? (
              <EmptyState icon={ClipboardList} heading="No playbooks found" body="Create an active template or broaden the filters." />
            ) : (
              <div className="grid gap-3">
                {templates.map(template => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    selected={selectedTemplate?.id === template.id}
                    canConfigure={canConfigure}
                    readOnly={readOnly}
                    executing={executingId === template.id}
                    onSelect={() => setSelectedTemplateId(template.id)}
                    onEdit={() => startEdit(template)}
                    onRun={() => runTemplate(template)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="tk-card p-4">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Recommended plays</p>
                <h2 className="text-base font-semibold text-ink">Signal-driven recommendations</h2>
              </div>
              <select className="tk-input w-auto min-w-[220px]" value={selectedAccountId} onChange={event => setSelectedAccountId(event.target.value)}>
                <option value="">Select account</option>
                {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </div>
            {recommendationLoading ? (
              <LoadingBlock label="Loading recommendations" />
            ) : recommendations.length === 0 ? (
              <EmptyState icon={Target} heading="No recommendations" body="Active templates appear here when their signal or weak-metric rules match." />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {recommendations.map(item => (
                  <article key={item.template.id} className="rounded-lg border border-surface-border bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-ink">{item.template.name}</h3>
                        <p className="mt-1 text-xs leading-5 text-ink-secondary">{item.rationale}</p>
                      </div>
                      <span className="rounded-full border border-blue-tint-20 bg-blue-tint-20 px-2 py-1 text-xs font-semibold text-brand-blue">{item.match_score}%</span>
                    </div>
                    <button className="tk-button-primary mt-3 w-full" disabled={readOnly || executingId === item.template.id || !selectedAccountId} onClick={() => runTemplate(item.template)}>
                      {executingId === item.template.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      Execute
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="tk-card h-fit p-4 xl:sticky xl:top-20">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">{editingId ? 'Edit template' : 'Create template'}</p>
              <h2 className="text-base font-semibold text-ink">Playbook configuration</h2>
            </div>
            {editingId ? (
              <button className="tk-icon-button" aria-label="Cancel edit" onClick={resetForm}>
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          {!canConfigure ? (
            <div className="rounded-lg border border-surface-border bg-surface-secondary p-4 text-sm text-ink-secondary">Template configuration is read-only for your role.</div>
          ) : (
            <TemplateForm
              form={form}
              setForm={setForm}
              customFields={customFields}
              customValues={customValues}
              customErrors={customErrors}
              onCustomChange={(fieldKey, value) => setCustomValues(values => ({ ...values, [fieldKey]: value }))}
              saving={saving}
              editing={Boolean(editingId)}
              onSubmit={submitTemplate}
            />
          )}
        </aside>
      </div>
    </div>
  )
}

function TemplateCard({ template, selected, canConfigure, readOnly, executing, onSelect, onEdit, onRun }: { template: PlaybookTemplate; selected: boolean; canConfigure: boolean; readOnly: boolean; executing: boolean; onSelect: () => void; onEdit: () => void; onRun: () => void }) {
  return (
    <article className={cn('rounded-lg border bg-white p-4', selected ? 'border-brand-blue shadow-card' : 'border-surface-border')}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <button type="button" onClick={onSelect} className="min-w-0 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', template.is_active ? 'border-rag-green/20 bg-rag-green/10 text-rag-green' : 'border-surface-border bg-surface-tertiary text-ink-secondary')}>{template.is_active ? 'active' : 'inactive'}</span>
            <span className="rounded-full border border-surface-border bg-surface-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">v{template.version}</span>
          </div>
          <h3 className="mt-2 text-base font-semibold text-ink">{template.name}</h3>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink-secondary">{template.objective}</p>
          <p className="mt-2 text-xs font-medium text-ink-secondary">{template.activities.length} activities | Updated {formatDate(template.updated_at)}</p>
          <p className="mt-1 text-xs font-medium text-ink-secondary">Version history: {Array.from({ length: Math.max(1, template.version) }, (_, index) => `v${index + 1}`).join(' -> ')}</p>
        </button>
        <div className="flex shrink-0 flex-wrap gap-2">
          {canConfigure ? (
            <button className="tk-button-secondary" onClick={onEdit}>
              <Save className="h-4 w-4" />
              Edit
            </button>
          ) : null}
          <button className="tk-button-primary" disabled={readOnly || executing || !template.is_active} onClick={onRun}>
            {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Execute
          </button>
        </div>
      </div>
    </article>
  )
}

function TemplateForm({ form, setForm, customFields, customValues, customErrors, onCustomChange, saving, editing, onSubmit }: { form: PlaybookTemplatePayload; setForm: (updater: PlaybookTemplatePayload | ((value: PlaybookTemplatePayload) => PlaybookTemplatePayload)) => void; customFields: RuntimeCustomField[]; customValues: Record<string, unknown>; customErrors: Record<string, string>; onCustomChange: (fieldKey: string, value: unknown) => void; saving: boolean; editing: boolean; onSubmit: (event: FormEvent) => void }) {
  function setList(field: 'signal_types' | 'weak_metrics' | 'success_criteria' | 'skip_rules', value: string) {
    setForm(current => ({ ...current, [field]: value.split(',').map(item => item.trim()) }))
  }

  function updateActivity(index: number, patch: Partial<PlaybookTemplatePayload['activities'][number]>) {
    setForm(current => ({
      ...current,
      activities: current.activities.map((activity, activityIndex) => (activityIndex === index ? { ...activity, ...patch } : activity)),
    }))
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="space-y-1">
        <span className="tk-label text-xs">Name *</span>
        <input className="tk-input" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Executive recovery play" />
      </label>
      <label className="space-y-1">
        <span className="tk-label text-xs">Objective *</span>
        <textarea className="tk-input min-h-[84px]" value={form.objective} onChange={event => setForm(current => ({ ...current, objective: event.target.value }))} placeholder="Stabilize executive confidence and confirm next governance actions." />
      </label>
      <label className="space-y-1">
        <span className="tk-label text-xs">Signal types</span>
        <input className="tk-input" value={(form.signal_types ?? []).join(', ')} onChange={event => setList('signal_types', event.target.value)} placeholder="relationship_gap, health_drop" />
      </label>
      <label className="space-y-1">
        <span className="tk-label text-xs">Weak metrics</span>
        <input className="tk-input" value={(form.weak_metrics ?? []).join(', ')} onChange={event => setList('weak_metrics', event.target.value)} placeholder="relationship, delivery" />
      </label>
      <label className="space-y-1">
        <span className="tk-label text-xs">Success criteria *</span>
        <textarea className="tk-input min-h-[72px]" value={form.success_criteria.join(', ')} onChange={event => setList('success_criteria', event.target.value)} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex min-h-[44px] items-center gap-2 rounded-md border border-surface-border bg-white px-3 text-sm font-semibold text-ink">
          <input type="checkbox" checked={Boolean(form.is_active)} onChange={event => setForm(current => ({ ...current, is_active: event.target.checked }))} />
          Active
        </label>
        <label className="space-y-1">
          <span className="tk-label text-xs">Owner rule</span>
          <select className="tk-input" value={form.default_owner_rule} onChange={event => setForm(current => ({ ...current, default_owner_rule: event.target.value }))}>
            <option value="account_primary_am">Primary AM</option>
            <option value="ops_lead">Ops Lead</option>
            <option value="task_creator">Task Creator</option>
            <option value="template_owner">Template Owner</option>
          </select>
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Activities</p>
          <button type="button" className="tk-button-secondary" onClick={() => setForm(current => ({ ...current, activities: [...current.activities, { ...blankActivity, sort_order: current.activities.length }] }))}>
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
        {form.activities.map((activity, index) => (
          <div key={index} className="rounded-lg border border-surface-border bg-surface-secondary p-3">
            <div className="grid gap-3">
              <input className="tk-input" value={activity.title} onChange={event => updateActivity(index, { title: event.target.value })} placeholder="Activity title" />
              <textarea className="tk-input min-h-[64px]" value={activity.description} onChange={event => updateActivity(index, { description: event.target.value })} placeholder="Activity details" />
              <div className="grid gap-3 sm:grid-cols-2">
                <input type="number" min={0} className="tk-input" value={activity.due_offset_days} onChange={event => updateActivity(index, { due_offset_days: Number(event.target.value) })} aria-label="Due offset days" />
                <select className="tk-input" value={activity.priority} onChange={event => updateActivity(index, { priority: event.target.value as PlaybookTemplatePayload['activities'][number]['priority'] })}>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-ink-secondary">
                  <input type="checkbox" checked={activity.skip_allowed ?? true} onChange={event => updateActivity(index, { skip_allowed: event.target.checked })} />
                  Skip allowed
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-ink-secondary">
                  <input type="checkbox" checked={Boolean(activity.requires_evidence)} onChange={event => updateActivity(index, { requires_evidence: event.target.checked })} />
                  Evidence required
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>

      <RuntimeCustomFields fields={customFields} values={customValues} errors={customErrors} onChange={onCustomChange} />

      <button type="submit" className="tk-button-primary w-full" disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {editing ? 'Update template' : 'Create template'}
      </button>
    </form>
  )
}

function ExecutionPlaybooks({ onManual }: { onManual: () => void }) {
  const { token } = useAuth()
  const accounts = useAccountStore(state => state.accounts)
  const signals = useV3Store(state => state.signals)
  const [templates, setTemplates] = useState<PlaybookTemplate[]>([])
  const [recommendations, setRecommendations] = useState<RecommendedPlaybook[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? '')
  const [signalType, setSignalType] = useState<string>(signals[0]?.type ?? '')
  const [weakMetric, setWeakMetric] = useState<string>(signals[0]?.reasonCodes?.[0] ?? '')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [recommendationLoading, setRecommendationLoading] = useState(false)
  const [executingId, setExecutingId] = useState('')
  const [error, setError] = useState('')
  const selectedTemplate = useMemo(() => templates.find(template => template.id === selectedTemplateId) ?? templates[0], [selectedTemplateId, templates])
  const selectedAccount = accounts.find(account => account.id === selectedAccountId)

  useEffect(() => {
    if (!selectedAccountId && accounts[0]) setSelectedAccountId(accounts[0].id)
  }, [accounts, selectedAccountId])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ page: String(page), page_size: '8', sort: 'updated_at', direction: 'desc' })
    if (search) params.set('search', search)
    if (signalType) params.set('signal_type', signalType)
    if (weakMetric) params.set('weak_metric', weakMetric)
    listExecutablePlaybookTemplates(token, params)
      .then(response => {
        if (cancelled) return
        setTemplates(response.items)
        setTotal(response.total)
        setSelectedTemplateId(current => current || response.items[0]?.id || '')
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Executable playbooks could not load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [page, search, signalType, token, weakMetric])

  useEffect(() => {
    if (!token || !selectedAccountId) {
      setRecommendations([])
      return
    }
    let cancelled = false
    setRecommendationLoading(true)
    const params = new URLSearchParams({ account_id: selectedAccountId })
    if (signalType) params.set('signal_type', signalType)
    if (weakMetric) params.set('weak_metric', weakMetric)
    listRecommendedPlaybooks(token, signals[0]?.id ?? 'manual-signal', params)
      .then(items => {
        if (!cancelled) setRecommendations(items)
      })
      .catch(() => {
        if (!cancelled) setRecommendations([])
      })
      .finally(() => {
        if (!cancelled) setRecommendationLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedAccountId, signalType, signals, token, weakMetric])

  async function runTemplate(template: PlaybookTemplate) {
    if (!selectedAccountId) {
      toast.error('Select an account before executing a playbook')
      return
    }
    if (!token) return
    setExecutingId(template.id)
    try {
      const execution = await executePlaybook(token, template.id, {
        account_id: selectedAccountId,
        source_signal_id: signals[0]?.id,
        source_signal_type: signalType || undefined,
        source_metric: weakMetric || undefined,
        confirmed: true,
      })
      toast.success(`${execution.tasks.length} task${execution.tasks.length === 1 ? '' : 's'} generated`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Playbook could not be executed')
    } finally {
      setExecutingId('')
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Playbook execution"
        title="Run account playbooks"
        description="Select an assigned account, review recommended plays, and generate owner-backed tasks from active playbooks."
        actions={<button className="tk-button-secondary" onClick={onManual}><BookOpen className="h-4 w-4" />Manual</button>}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Active Playbooks" value={total} />
        <Metric label="Recommendations" value={recommendations.length} />
        <Metric label="Selected Account" value={selectedAccount?.name ?? 'None'} compact />
        <Metric label="Selected Playbook" value={selectedTemplate?.name ?? 'None'} compact />
      </div>

      <section className="tk-card mt-5 p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_180px_180px]">
          <label className="space-y-1">
            <span className="tk-label text-xs">Search</span>
            <input className="tk-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search active playbooks" />
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Account</span>
            <select className="tk-input" value={selectedAccountId} onChange={event => setSelectedAccountId(event.target.value)}>
              <option value="">Select account</option>
              {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Signal type</span>
            <input className="tk-input" value={signalType} onChange={event => setSignalType(event.target.value)} placeholder="relationship_gap" />
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Weak metric</span>
            <input className="tk-input" value={weakMetric} onChange={event => setWeakMetric(event.target.value)} placeholder="relationship" />
          </label>
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="tk-card p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Recommended plays</p>
              <h2 className="text-base font-semibold text-ink">Signal-driven recommendations</h2>
            </div>
          </div>
          {recommendationLoading ? (
            <LoadingBlock label="Loading recommendations" />
          ) : recommendations.length === 0 ? (
            <EmptyState icon={Target} heading="No recommendations" body="Active playbooks appear here when signal or weak-metric rules match." />
          ) : (
            <div className="grid gap-3">
              {recommendations.map(item => (
                <article key={item.template.id} className="rounded-lg border border-surface-border bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-ink">{item.template.name}</h3>
                      <p className="mt-1 text-xs leading-5 text-ink-secondary">{item.rationale}</p>
                    </div>
                    <span className="rounded-full border border-blue-tint-20 bg-blue-tint-20 px-2 py-1 text-xs font-semibold text-brand-blue">{item.match_score}%</span>
                  </div>
                  <button className="tk-button-primary mt-3 w-full" disabled={executingId === item.template.id || !selectedAccountId} onClick={() => runTemplate(item.template)}>
                    {executingId === item.template.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    Execute
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="tk-card p-4">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Available playbooks</p>
              <h2 className="text-base font-semibold text-ink">Active execution catalog</h2>
            </div>
            <div className="flex gap-2">
              <button className="tk-button-secondary" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</button>
              <button className="tk-button-secondary" disabled={page * 8 >= total} onClick={() => setPage(value => value + 1)}>Next</button>
            </div>
          </div>
          {loading ? (
            <LoadingBlock label="Loading active playbooks" />
          ) : error ? (
            <div className="rounded-lg border border-rag-red/20 bg-rag-red/10 p-4 text-sm font-semibold text-rag-red">{error}</div>
          ) : templates.length === 0 ? (
            <EmptyState icon={ClipboardList} heading="No active playbooks" body="No active playbooks match the current filters." />
          ) : (
            <div className="grid gap-3">
              {templates.map(template => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  selected={selectedTemplate?.id === template.id}
                  canConfigure={false}
                  readOnly={!selectedAccountId}
                  executing={executingId === template.id}
                  onSelect={() => setSelectedTemplateId(template.id)}
                  onEdit={() => undefined}
                  onRun={() => runTemplate(template)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

const blankGuideTopic = { title: '', body: '', bullets: [] as string[] }

const blankGuideSection: PlaybookGuideSectionPayload = {
  title: '',
  summary: '',
  body: '',
  icon_key: 'book_open',
  topics: [{ ...blankGuideTopic }],
  is_active: true,
}

function ManualPlaybook({ canManage, onExecution, onOperations }: { canManage: boolean; onExecution?: () => void; onOperations?: () => void }) {
  const { token } = useAuth()
  const [sections, setSections] = useState<PlaybookGuideSection[]>([])
  const [activeSection, setActiveSection] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState<PlaybookGuideSectionPayload>(blankGuideSection)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ active_state: canManage ? 'all' : 'active' })
    listPlaybookGuideSections(token, params)
      .then(items => {
        if (cancelled) return
        const ordered = [...items].sort((a, b) => a.sort_order - b.sort_order)
        setSections(ordered)
        setActiveSection(current => current || ordered[0]?.id || '')
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Playbook guide could not load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [canManage, token])

  function scrollToSection(id: string) {
    const target = document.getElementById(id)
    if (!target) return
    setActiveSection(id)
    window.scrollTo({ top: Math.max(target.getBoundingClientRect().top + window.scrollY - 88, 0), behavior: 'smooth' })
  }

  function startEdit(section: PlaybookGuideSection) {
    setEditingId(section.id)
    setForm({
      title: section.title,
      summary: section.summary,
      body: section.body ?? '',
      icon_key: section.icon_key,
      topics: section.topics.length ? section.topics.map(topic => ({ ...topic, bullets: topic.bullets ?? [] })) : [{ ...blankGuideTopic }],
      sort_order: section.sort_order,
      is_active: section.is_active,
    })
  }

  function resetSectionForm() {
    setEditingId('')
    setForm({ ...blankGuideSection, topics: [{ ...blankGuideTopic }] })
  }

  async function saveSection(event: FormEvent) {
    event.preventDefault()
    if (!token || !canManage) return
    const payload = normalizeGuideSectionPayload({ ...form, sort_order: editingId ? form.sort_order : sections.length })
    if (!payload.title || !payload.summary) {
      toast.error('Title and summary are required')
      return
    }
    setSaving(true)
    try {
      const saved = editingId ? await updatePlaybookGuideSection(token, editingId, payload) : await createPlaybookGuideSection(token, payload)
      setSections(items => [saved, ...items.filter(item => item.id !== saved.id)].sort((a, b) => a.sort_order - b.sort_order))
      setActiveSection(saved.id)
      resetSectionForm()
      toast.success(editingId ? 'Playbook section updated' : 'Playbook section created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Playbook section could not be saved')
    } finally {
      setSaving(false)
    }
  }

  async function moveSection(index: number, direction: -1 | 1) {
    if (!token || !canManage) return
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= sections.length) return
    const ordered = [...sections]
    const [moved] = ordered.splice(index, 1)
    ordered.splice(nextIndex, 0, moved)
    setSections(ordered.map((section, sort_order) => ({ ...section, sort_order })))
    try {
      const saved = await reorderPlaybookGuideSections(token, ordered.map(section => section.id))
      setSections(saved)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Section order could not be saved')
    }
  }

  async function deleteSection(section: PlaybookGuideSection) {
    if (!token || !canManage) return
    if (!window.confirm(`Delete "${section.title}" from the playbook guide?`)) return
    try {
      await deletePlaybookGuideSection(token, section.id)
      setSections(items => items.filter(item => item.id !== section.id))
      if (editingId === section.id) resetSectionForm()
      toast.success('Playbook section deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Playbook section could not be deleted')
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Customer success playbook"
        title="TKXEL KEY ACCOUNT MANAGEMENT (KAM) PLAYBOOK"
        description="A structured operating manual for account managers, leadership, and partner teams running the Tkxel KAM motion."
        actions={
          onExecution || onOperations ? (
            <>
              {onExecution ? <button className="tk-button-primary" onClick={onExecution}><Play className="h-4 w-4" />Run playbooks</button> : null}
              {onOperations ? <button className="tk-button-primary" onClick={onOperations}><Play className="h-4 w-4" />Operations</button> : null}
            </>
          ) : undefined
        }
      />
      {canManage ? (
        <section className="tk-card mb-4 p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">{editingId ? 'Edit manual section' : 'Add manual section'}</p>
              <h2 className="text-base font-semibold text-ink">Guide content</h2>
            </div>
            {editingId ? (
              <button className="tk-icon-button" type="button" aria-label="Cancel section edit" onClick={resetSectionForm}>
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <GuideSectionForm form={form} setForm={setForm} saving={saving} editing={Boolean(editingId)} onSubmit={saveSection} />
        </section>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="tk-card h-fit p-3 xl:sticky xl:top-20">
          <nav className="grid gap-1">
            {sections.map((section, index) => (
              <button key={section.id} type="button" onClick={() => scrollToSection(section.id)} aria-current={activeSection === section.id ? 'location' : undefined} className={cn('flex min-h-[44px] w-full items-center gap-3 rounded-md px-3 text-left text-sm font-semibold transition-colors', activeSection === section.id ? 'bg-blue-tint-20 text-brand-blue' : 'text-ink-secondary hover:bg-surface-tertiary hover:text-ink')}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-xs font-bold text-brand-blue">{index + 1}</span>
                <span>{section.title}</span>
              </button>
            ))}
          </nav>
        </aside>
        <div className="grid gap-4">
          {loading ? <LoadingBlock label="Loading playbook guide" /> : null}
          {error ? <div className="rounded-lg border border-rag-red/20 bg-rag-red/10 p-4 text-sm font-semibold text-rag-red">{error}</div> : null}
          {!loading && !error && sections.length === 0 ? <EmptyState icon={BookOpen} heading="No guide sections" body="The playbook guide is not available yet." /> : null}
          {sections.map((section, index) => {
            const Icon = guideIcon(section.icon_key)
            return (
              <section key={section.id} id={section.id} className="tk-card scroll-mt-24 overflow-hidden">
                <header className="border-b border-surface-border bg-surface-secondary p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Section {index + 1}</p>
                        {!section.is_active ? <span className="rounded-full border border-surface-border bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">inactive</span> : null}
                      </div>
                      <h2 className="mt-1 text-xl font-semibold text-ink">{section.title}</h2>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">{section.summary}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {canManage ? (
                        <>
                          <button className="tk-icon-button" type="button" aria-label={`Move ${section.title} up`} disabled={index === 0} onClick={() => moveSection(index, -1)}><ArrowUp className="h-4 w-4" /></button>
                          <button className="tk-icon-button" type="button" aria-label={`Move ${section.title} down`} disabled={index === sections.length - 1} onClick={() => moveSection(index, 1)}><ArrowDown className="h-4 w-4" /></button>
                          <button className="tk-icon-button" type="button" aria-label={`Edit ${section.title}`} onClick={() => startEdit(section)}><Edit3 className="h-4 w-4" /></button>
                          <button className="tk-icon-button text-rag-red" type="button" aria-label={`Delete ${section.title}`} onClick={() => deleteSection(section)}><Trash2 className="h-4 w-4" /></button>
                        </>
                      ) : null}
                      <Icon className="h-5 w-5 text-brand-blue" />
                    </div>
                  </div>
                </header>
                <div className="divide-y divide-surface-border">
                  {section.body ? <p className="p-5 text-sm leading-6 text-ink-secondary">{section.body}</p> : null}
                  {section.topics.map(topic => (
                    <article key={topic.title} className="grid gap-3 p-5 lg:grid-cols-[minmax(220px,0.35fr)_minmax(0,1fr)]">
                      <h3 className="text-sm font-semibold leading-6 text-ink">{topic.title}</h3>
                      <div>
                        <p className="text-sm leading-6 text-ink-secondary">{topic.body}</p>
                        {topic.bullets?.length ? (
                          <ul className="mt-3 grid gap-2">
                            {topic.bullets.map(bullet => <li key={bullet} className="flex gap-2 text-sm leading-6 text-ink"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-rag-green" /><span>{bullet}</span></li>)}
                          </ul>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function GuideSectionForm({ form, setForm, saving, editing, onSubmit }: { form: PlaybookGuideSectionPayload; setForm: (updater: PlaybookGuideSectionPayload | ((value: PlaybookGuideSectionPayload) => PlaybookGuideSectionPayload)) => void; saving: boolean; editing: boolean; onSubmit: (event: FormEvent) => void }) {
  function updateTopic(index: number, patch: Partial<PlaybookGuideSectionPayload['topics'][number]>) {
    setForm(current => ({
      ...current,
      topics: current.topics.map((topic, topicIndex) => (topicIndex === index ? { ...topic, ...patch } : topic)),
    }))
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-2">
      <label className="space-y-1">
        <span className="tk-label text-xs">Title *</span>
        <input className="tk-input" value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} />
      </label>
      <label className="space-y-1">
        <span className="tk-label text-xs">Icon</span>
        <select className="tk-input" value={form.icon_key ?? 'book_open'} onChange={event => setForm(current => ({ ...current, icon_key: event.target.value }))}>
          <option value="book_open">Book</option>
          <option value="users_round">Users</option>
          <option value="layers_3">Layers</option>
          <option value="target">Target</option>
          <option value="clipboard_list">Checklist</option>
        </select>
      </label>
      <label className="space-y-1 lg:col-span-2">
        <span className="tk-label text-xs">Summary *</span>
        <textarea className="tk-input min-h-[72px]" value={form.summary} onChange={event => setForm(current => ({ ...current, summary: event.target.value }))} />
      </label>
      <label className="space-y-1 lg:col-span-2">
        <span className="tk-label text-xs">Body</span>
        <textarea className="tk-input min-h-[92px]" value={form.body ?? ''} onChange={event => setForm(current => ({ ...current, body: event.target.value }))} />
      </label>
      <label className="flex min-h-[44px] items-center gap-2 rounded-md border border-surface-border bg-white px-3 text-sm font-semibold text-ink">
        <input type="checkbox" checked={form.is_active ?? true} onChange={event => setForm(current => ({ ...current, is_active: event.target.checked }))} />
        Active
      </label>
      <div className="lg:col-span-2">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Topics</p>
          <button type="button" className="tk-button-secondary" onClick={() => setForm(current => ({ ...current, topics: [...current.topics, { ...blankGuideTopic }] }))}>
            <Plus className="h-4 w-4" />
            Add topic
          </button>
        </div>
        <div className="grid gap-3">
          {form.topics.map((topic, index) => (
            <div key={index} className="rounded-lg border border-surface-border bg-surface-secondary p-3">
              <div className="grid gap-3">
                <input className="tk-input" value={topic.title} onChange={event => updateTopic(index, { title: event.target.value })} placeholder="Topic title" />
                <textarea className="tk-input min-h-[72px]" value={topic.body} onChange={event => updateTopic(index, { body: event.target.value })} placeholder="Topic body" />
                <input className="tk-input" value={(topic.bullets ?? []).join(', ')} onChange={event => updateTopic(index, { bullets: event.target.value.split(',').map(item => item.trim()).filter(Boolean) })} placeholder="Bullet points" />
                <button type="button" className="tk-button-secondary w-fit text-rag-red" disabled={form.topics.length === 1} onClick={() => setForm(current => ({ ...current, topics: current.topics.filter((_, topicIndex) => topicIndex !== index) }))}>
                  <Trash2 className="h-4 w-4" />
                  Remove topic
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-end lg:col-span-2">
        <button type="submit" className="tk-button-primary" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {editing ? 'Update section' : 'Create section'}
        </button>
      </div>
    </form>
  )
}

function guideIcon(iconKey: string) {
  const icons: Record<string, typeof BookOpen> = {
    book_open: BookOpen,
    users_round: UsersRound,
    layers_3: Layers3,
    target: Target,
    clipboard_list: ClipboardList,
  }
  return icons[iconKey] ?? BookOpen
}

function Metric({ label, value, compact = false }: { label: string; value: string | number; compact?: boolean }) {
  return (
    <article className="tk-card p-4">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-ink-secondary">{label}</p>
      <p className={cn('mt-3 font-display font-bold text-ink', compact ? 'truncate text-lg' : 'text-3xl')}>{value}</p>
    </article>
  )
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center text-sm font-semibold text-ink-secondary">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {label}
    </div>
  )
}

function normalizeTemplatePayload(payload: PlaybookTemplatePayload): PlaybookTemplatePayload {
  const cleanList = (items?: string[]) => (items ?? []).map(item => item.trim()).filter(Boolean)
  return {
    ...payload,
    signal_types: cleanList(payload.signal_types),
    weak_metrics: cleanList(payload.weak_metrics),
    success_criteria: cleanList(payload.success_criteria),
    skip_rules: cleanList(payload.skip_rules),
    activities: payload.activities
      .map((activity, index) => ({
        ...activity,
        title: activity.title.trim(),
        description: activity.description?.trim(),
        owner_rule: activity.owner_rule || payload.default_owner_rule || 'account_primary_am',
        due_offset_days: Number(activity.due_offset_days ?? 7),
        priority: activity.priority ?? 'medium',
        success_criteria: cleanList(activity.success_criteria),
        sort_order: index,
      }))
      .filter(activity => activity.title),
  }
}

function normalizeGuideSectionPayload(payload: PlaybookGuideSectionPayload): PlaybookGuideSectionPayload {
  const cleanText = (value?: string | null) => value?.trim() ?? ''
  return {
    ...payload,
    title: cleanText(payload.title),
    summary: cleanText(payload.summary),
    body: cleanText(payload.body) || undefined,
    icon_key: payload.icon_key || 'book_open',
    topics: payload.topics
      .map(topic => ({
        title: cleanText(topic.title),
        body: cleanText(topic.body),
        bullets: (topic.bullets ?? []).map(item => item.trim()).filter(Boolean),
      }))
      .filter(topic => topic.title || topic.body),
  }
}

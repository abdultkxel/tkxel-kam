import { AlertTriangle, CalendarClock, CheckCircle2, Loader2, Plus, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { FormEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { RuntimeCustomFields, customValuesForSubmit, requiredCustomFieldErrors } from '@/components/custom-fields/RuntimeCustomFields'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/contexts/AuthContext'
import {
  AccountRetention,
  RetentionPlan,
  RetentionRecommendation,
  createRetentionPlan,
  createRetentionPlanTask,
  getAccountRetention,
  getRetentionRecommendations,
  listRetentionPlans,
  listRuntimeCustomFields,
  updateRetentionPlanAction,
  type RuntimeCustomField,
} from '@/services/retention'
import { Account } from '@/types/account'
import { cn } from '@/utils/cn'
import { formatCompactCurrency, formatDate } from '@/utils/formatters'

export function RetentionPanel({ account }: { account: Account }) {
  const { token, user } = useAuth()
  const [retention, setRetention] = useState<AccountRetention | null>(null)
  const [plans, setPlans] = useState<RetentionPlan[]>([])
  const [recommendations, setRecommendations] = useState<RetentionRecommendation[]>([])
  const [customFields, setCustomFields] = useState<RuntimeCustomField[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(() => initialPlanForm(account.ownerId || user?.id || ''))
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({})
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({})
  const readOnly = user?.role === 'leadership_viewer' || !token

  useEffect(() => {
    if (!token) return
    let active = true
    setLoading(true)
    setError('')
    Promise.all([
      getAccountRetention(token, account.id),
      listRetentionPlans(token, account.id, new URLSearchParams({ page: '1', page_size: '10', sort: 'due_date', direction: 'asc' })),
      getRetentionRecommendations(token, account.id),
      listRuntimeCustomFields(token, 'retention_stability'),
    ])
      .then(([retentionResult, planResult, recommendationResult, fieldResult]) => {
        if (!active) return
        setRetention(retentionResult)
        setPlans(planResult.items)
        setRecommendations(recommendationResult.recommendations)
        setCustomFields(fieldResult)
        setForm(current => ({ ...current, owner_id: retentionResult.owner_id || account.ownerId || user?.id || current.owner_id }))
      })
      .catch(err => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Unable to load retention context')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [account.id, account.ownerId, token, user?.id])

  const primaryPlan = plans.find(plan => plan.status !== 'completed' && plan.status !== 'archived') ?? plans[0]
  const empty = !retention?.renewals.length && !plans.length && !recommendations.length

  async function refresh() {
    if (!token) return
    const [nextRetention, nextPlans, nextRecommendations] = await Promise.all([
      getAccountRetention(token, account.id),
      listRetentionPlans(token, account.id, new URLSearchParams({ page: '1', page_size: '10', sort: 'due_date', direction: 'asc' })),
      getRetentionRecommendations(token, account.id),
    ])
    setRetention(nextRetention)
    setPlans(nextPlans.items)
    setRecommendations(nextRecommendations.recommendations)
  }

  async function submitPlan(event: FormEvent) {
    event.preventDefault()
    if (!token || readOnly) return
    const nextCustomErrors = requiredCustomFieldErrors(customFields, customValues)
    setCustomErrors(nextCustomErrors)
    if (Object.keys(nextCustomErrors).length) return
    if (!form.title.trim() || !form.owner_id || !form.due_at || !form.success_criteria.trim()) {
      toast.error('Plan title, owner, due date, and success criteria are required')
      return
    }
    setSaving(true)
    try {
      await createRetentionPlan(token, account.id, {
        title: form.title.trim(),
        plan_type: form.plan_type,
        status: 'active',
        risk_level: form.risk_level,
        owner_id: form.owner_id,
        due_at: toIso(form.due_at),
        renewal_milestone_at: form.renewal_milestone_at ? toIso(form.renewal_milestone_at) : null,
        success_criteria: form.success_criteria.split('\n').map(item => item.trim()).filter(Boolean),
        milestones: form.renewal_milestone_at ? [{ title: 'Renewal decision', milestone_type: 'renewal', due_at: toIso(form.renewal_milestone_at) }] : [],
        custom_field_values: customValuesForSubmit(customFields, customValues),
      })
      setForm(initialPlanForm(retention?.owner_id || account.ownerId || user?.id || ''))
      setCustomValues({})
      await refresh()
      toast.success('Retention plan created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to create retention plan')
    } finally {
      setSaving(false)
    }
  }

  async function createActionFromRecommendation(recommendation: RetentionRecommendation) {
    if (!token || readOnly || !primaryPlan) return
    setSaving(true)
    try {
      await createRetentionPlanTask(token, primaryPlan.id, {
        title: recommendation.suggested_action,
        owner_id: recommendation.owner_id || primaryPlan.owner_id || user?.id || '',
        due_at: recommendation.due_at || defaultIso(7),
        success_criteria: recommendation.rationale,
        source_recommendation_id: recommendation.id,
        confirmed: true,
      })
      await refresh()
      toast.success('Action added to retention plan')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to create action')
    } finally {
      setSaving(false)
    }
  }

  async function completeAction(actionId: string) {
    if (!token || readOnly) return
    setSaving(true)
    try {
      await updateRetentionPlanAction(token, actionId, { status: 'done' })
      await refresh()
      toast.success('Retention action completed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update action')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  if (error) {
    return <EmptyState icon={AlertTriangle} heading="Retention context could not be loaded" body={error} />
  }

  if (empty) {
    return <EmptyState icon={CalendarClock} heading="No retention context yet" body="Renewal records, recommendations, and retention plans will appear here once engagements are created or plan work begins." />
  }

  return (
    <div className="space-y-5">
      <section className="tk-card overflow-hidden">
        <div className="border-b border-surface-border bg-surface-secondary p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Retention readiness</p>
              <h2 className="mt-1 font-display text-3xl font-bold text-ink">{account.name}</h2>
              <p className="mt-2 text-sm text-ink-secondary">Owner: {retention?.owner_name || account.ownerName || 'Unassigned'}</p>
            </div>
            <StatusPill value={retention?.renewal_risk || 'warning'} />
          </div>
        </div>
        <div className="grid gap-0 divide-y divide-surface-border md:grid-cols-4 md:divide-x md:divide-y-0">
          <Metric label="Readiness" value={labelize(retention?.readiness_status || 'not_started')} />
          <Metric label="Exposure" value={formatCompactCurrency(retention?.commercial_exposure || account.arr)} />
          <Metric label="Nearest notice" value={daysLabel(retention?.days_to_nearest_notice)} tone="orange" />
          <Metric label="Renewals" value={`${retention?.renewal_count || 0}`} tone="blue" />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <main className="space-y-5">
          <Panel title="Renewal summary" icon={CalendarClock}>
            <div className="overflow-hidden rounded-lg border border-surface-border">
              <table className="min-w-full divide-y divide-surface-border text-sm">
                <thead className="bg-surface-secondary text-left text-[10px] uppercase tracking-wider text-ink-secondary">
                  <tr>
                    <th className="px-3 py-2">Engagement</th>
                    <th className="px-3 py-2">Notice</th>
                    <th className="px-3 py-2">Renewal</th>
                    <th className="px-3 py-2">Risk</th>
                    <th className="px-3 py-2">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border bg-white">
                  {(retention?.renewals || []).map(renewal => (
                    <tr key={renewal.engagement_id}>
                      <td className="px-3 py-3 font-semibold text-ink">{renewal.engagement_name}</td>
                      <td className="px-3 py-3 text-ink-secondary">{dateLabel(renewal.notice_deadline)}</td>
                      <td className="px-3 py-3 text-ink-secondary">{dateLabel(renewal.renewal_date || renewal.sow_end_date)}</td>
                      <td className="px-3 py-3"><StatusPill value={renewal.renewal_risk} compact /></td>
                      <td className="px-3 py-3 text-ink-secondary">{renewal.confidence ?? 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Recommendations" icon={Sparkles}>
            <div className="space-y-3">
              {recommendations.map(recommendation => (
                <div key={recommendation.id} className="rounded-lg border border-surface-border bg-white p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink">{recommendation.title}</p>
                      <p className="mt-1 text-sm leading-6 text-ink-secondary">{recommendation.rationale}</p>
                      <p className="mt-2 text-xs font-semibold text-brand-blue">{recommendation.priority} priority | {recommendation.confidence}% confidence</p>
                    </div>
                    {!readOnly ? (
                      <button className="tk-button-secondary shrink-0" disabled={!primaryPlan || saving} onClick={() => createActionFromRecommendation(recommendation)}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Add action
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-3 rounded-md bg-surface-secondary p-2 text-xs text-ink-secondary">{recommendation.source_context}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Retention plans" icon={CheckCircle2}>
            <div className="space-y-3">
              {plans.length ? plans.map(plan => (
                <div key={plan.id} className="rounded-lg border border-surface-border bg-white p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink">{plan.title}</p>
                      <p className="mt-1 text-xs text-ink-secondary">{labelize(plan.plan_type)} | Owner: {plan.owner_name} | Due {formatDate(plan.due_at)}</p>
                    </div>
                    <StatusPill value={plan.risk_level} compact />
                  </div>
                  <div className="mt-3 space-y-2">
                    {plan.actions.length ? plan.actions.map(action => (
                      <div key={action.id} className="flex flex-col gap-2 rounded-md bg-surface-secondary p-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-sm font-medium text-ink">{action.title}</p>
                          <p className="text-xs text-ink-secondary">{action.owner_name} | {formatDate(action.due_at)} | {labelize(action.status)}</p>
                        </div>
                        {!readOnly && action.status !== 'done' ? (
                          <button className="tk-button-secondary bg-white" disabled={saving} onClick={() => completeAction(action.id)}>
                            <CheckCircle2 className="h-4 w-4" />
                            Complete
                          </button>
                        ) : null}
                      </div>
                    )) : <p className="rounded-md bg-surface-secondary p-3 text-sm text-ink-secondary">No actions yet.</p>}
                  </div>
                </div>
              )) : <p className="rounded-lg border border-surface-border bg-white p-4 text-sm text-ink-secondary">No retention plans yet.</p>}
            </div>
          </Panel>
        </main>

        <aside className="space-y-5">
          <Panel title="Plan builder" icon={Plus}>
            {readOnly ? (
              <p className="rounded-lg border border-surface-border bg-surface-secondary p-4 text-sm text-ink-secondary">You have read-only retention access.</p>
            ) : (
              <form className="space-y-3" onSubmit={submitPlan}>
                <label className="space-y-1">
                  <span className="tk-label">Title</span>
                  <input className="tk-input" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="tk-label">Plan type</span>
                    <select className="tk-input" value={form.plan_type} onChange={event => setForm({ ...form, plan_type: event.target.value as typeof form.plan_type })}>
                      <option value="retention">Retention</option>
                      <option value="renewal">Renewal</option>
                      <option value="stabilization">Stabilization</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="tk-label">Risk</span>
                    <select className="tk-input" value={form.risk_level} onChange={event => setForm({ ...form, risk_level: event.target.value as typeof form.risk_level })}>
                      <option value="warning">Warning</option>
                      <option value="critical">Critical</option>
                      <option value="healthy">Healthy</option>
                    </select>
                  </label>
                </div>
                <label className="space-y-1">
                  <span className="tk-label">Owner ID</span>
                  <input className="tk-input" value={form.owner_id} onChange={event => setForm({ ...form, owner_id: event.target.value })} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="tk-label">Due</span>
                    <input type="datetime-local" className="tk-input" value={form.due_at} onChange={event => setForm({ ...form, due_at: event.target.value })} />
                  </label>
                  <label className="space-y-1">
                    <span className="tk-label">Renewal milestone</span>
                    <input type="datetime-local" className="tk-input" value={form.renewal_milestone_at} onChange={event => setForm({ ...form, renewal_milestone_at: event.target.value })} />
                  </label>
                </div>
                <label className="space-y-1">
                  <span className="tk-label">Success criteria</span>
                  <textarea className="tk-input min-h-[104px]" value={form.success_criteria} onChange={event => setForm({ ...form, success_criteria: event.target.value })} />
                </label>
                <RuntimeCustomFields fields={customFields} values={customValues} errors={customErrors} onChange={(fieldKey, value) => setCustomValues(current => ({ ...current, [fieldKey]: value }))} />
                <button className="tk-button-primary w-full justify-center" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Create plan
                </button>
              </form>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  )
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof CalendarClock; children: ReactNode }) {
  return (
    <section className="tk-card p-5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-brand-blue" />
        <h3 className="text-base font-semibold text-ink">{title}</h3>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Metric({ label, value, tone = 'dark' }: { label: string; value: string; tone?: 'dark' | 'orange' | 'blue' }) {
  const toneClass = tone === 'orange' ? 'text-brand-orange' : tone === 'blue' ? 'text-brand-blue' : 'text-ink'
  return (
    <div className="bg-white p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
      <p className={`mt-1 font-display text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  )
}

function StatusPill({ value, compact = false }: { value: string; compact?: boolean }) {
  const tone = value === 'critical' ? 'border-rag-red/20 bg-rag-red/10 text-rag-red' : value === 'warning' ? 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange' : 'border-rag-green/20 bg-rag-green/10 text-rag-green'
  return <span className={cn('inline-flex rounded-full border font-semibold uppercase tracking-wider', compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs', tone)}>{labelize(value)}</span>
}

function initialPlanForm(ownerId: string) {
  return {
    title: 'Retention readiness plan',
    plan_type: 'retention' as const,
    risk_level: 'warning' as const,
    owner_id: ownerId,
    due_at: inputDate(14),
    renewal_milestone_at: inputDate(45),
    success_criteria: 'Renewal decision owner confirmed\nNotice path validated\nClient communication plan approved',
  }
}

function inputDate(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(17, 0, 0, 0)
  return date.toISOString().slice(0, 16)
}

function defaultIso(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

function toIso(value: string) {
  return new Date(value).toISOString()
}

function daysLabel(value?: number | null) {
  if (value === null || value === undefined) return 'Not set'
  if (value < 0) return `${Math.abs(value)}d overdue`
  return `${value}d`
}

function dateLabel(value?: string | null) {
  return value ? formatDate(value) : 'Not set'
}

function labelize(value: string) {
  return value.replace(/_/g, ' ')
}

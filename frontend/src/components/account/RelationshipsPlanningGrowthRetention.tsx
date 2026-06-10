import { AlertTriangle, ArrowRight, BriefcaseBusiness, CheckCircle2, CheckSquare, ClipboardList, Loader2, Plus, RefreshCcw, Save, Target, TrendingUp } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import {
  createOpportunityFromRecommendation,
  createRetentionPlan,
  createRetentionTasks,
  getAccountPlan,
  listAccountRetention,
  listServiceCatalog,
  listRetentionPlans,
  listRetentionRecommendations,
  listServiceRecommendations,
  listWhitespace,
  saveAccountPlan,
  saveWhitespace,
} from '@/services/relationshipsPlanning'
import { useOpportunityStore } from '@/stores/opportunityStore'
import type { Account } from '@/types/account'
import type { AccountPlan, RenewalProfile, RetentionPlan, RetentionRecommendation, ServiceCatalogItem, ServiceRecommendation, WhitespaceItem } from '@/types/relationshipsPlanning'
import { formatCompactCurrency, formatDate } from '@/utils/formatters'

function ownerFor(account: Account, user: ReturnType<typeof useRole>) {
  return account.ownerId || user.id
}

export function AccountPlanPanel({ account }: { account: Account }) {
  const { token } = useAuth()
  const user = useRole()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState<AccountPlan | null>(null)
  const [retentionFocus, setRetentionFocus] = useState('')
  const [growthFocus, setGrowthFocus] = useState('')
  const [risks, setRisks] = useState('')
  const [commitments, setCommitments] = useState('')
  const [serviceGaps, setServiceGaps] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [nextActionDue, setNextActionDue] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError('')
      try {
        if (!token) throw new Error('You must be logged in to view the account plan')
        const result = await getAccountPlan(token, account.id)
        if (!active) return
        setPlan(result)
        setRetentionFocus(result?.retentionFocus ?? '')
        setGrowthFocus(result?.growthFocus ?? '')
        setRisks((result?.risks ?? []).join(', '))
        setCommitments((result?.commitments ?? []).join(', '))
        setServiceGaps((result?.serviceGaps ?? []).join(', '))
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load account plan')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [account.id, token])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (!token) throw new Error('You must be logged in to save the account plan')
      const actions = nextAction.trim() && nextActionDue
        ? [{ title: nextAction.trim(), ownerId: ownerFor(account, user), dueAt: new Date(nextActionDue).toISOString(), priority: 'medium', status: 'open', successCriteria: ['Owner confirmed', 'Next step completed'] }]
        : []
      const saved = await saveAccountPlan(token, account.id, {
        retentionFocus,
        growthFocus,
        risks: splitList(risks),
        commitments: splitList(commitments),
        serviceGaps: splitList(serviceGaps),
        status: 'active',
        actions,
        changeSummary: plan ? 'Account plan updated from Account 360.' : 'Account plan created from Account 360.',
      })
      setPlan(saved)
      setNextAction('')
      setNextActionDue('')
      toast.success('Account plan saved')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Account plan could not be saved'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PanelShell title="Account plan"><LoadingRow label="Loading account plan" /></PanelShell>
  if (error) return <PanelShell title="Account plan"><ErrorRow message={error} /></PanelShell>

  return (
    <PanelShell title="Account plan" detail={plan ? `Last updated ${formatDate(plan.updatedAt)}` : 'No plan saved yet'}>
      {!plan && !retentionFocus && !growthFocus ? (
        <EmptyState icon={ClipboardList} heading="No account plan yet" body="Capture retention focus, growth focus, risks, commitments, service gaps, and next actions." className="py-8" />
      ) : null}
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <TextArea label="Retention focus" value={retentionFocus} onChange={setRetentionFocus} />
          <TextArea label="Growth focus" value={growthFocus} onChange={setGrowthFocus} />
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <TextInput label="Risks" value={risks} onChange={setRisks} placeholder="Comma-separated risks" />
          <TextInput label="Commitments" value={commitments} onChange={setCommitments} placeholder="Comma-separated commitments" />
          <TextInput label="Service gaps" value={serviceGaps} onChange={setServiceGaps} placeholder="Comma-separated gaps" />
        </div>
        <div className="grid gap-3 rounded-lg border border-surface-border bg-surface-secondary p-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <TextInput label="Next action" value={nextAction} onChange={setNextAction} placeholder="Owner-backed next step" />
          <TextInput label="Due date" value={nextActionDue} onChange={setNextActionDue} type="date" />
        </div>
        {plan?.actions.length ? (
          <div className="grid gap-2">
            {plan.actions.map(action => (
              <div key={action.id} className="flex flex-col gap-2 rounded-lg border border-surface-border p-3 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  <span className="block text-sm font-semibold text-ink">{action.title}</span>
                  <span className="block text-xs text-ink-secondary">{action.ownerName} · {formatDate(action.dueAt)} · {action.status}</span>
                </span>
                <span className="rounded-full bg-blue-tint-20 px-3 py-1 text-xs font-semibold text-brand-blue">{action.priority}</span>
              </div>
            ))}
          </div>
        ) : null}
        <button type="submit" className="tk-button-primary w-fit" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save plan
        </button>
      </form>
    </PanelShell>
  )
}

export function GrowthWhitespacePanel({ account }: { account: Account }) {
  const { token } = useAuth()
  const user = useRole()
  const upsertOpportunity = useOpportunityStore(state => state.upsertOpportunity)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [catalog, setCatalog] = useState<ServiceCatalogItem[]>([])
  const [whitespace, setWhitespace] = useState<WhitespaceItem[]>([])
  const [recommendations, setRecommendations] = useState<ServiceRecommendation[]>([])
  const [coverage, setCoverage] = useState<Record<string, string>>({})

  async function load() {
    setLoading(true)
    setError('')
    try {
      if (!token) throw new Error('You must be logged in to view whitespace')
      const [catalogPage, whitespaceItems, recommendationPage] = await Promise.all([
        listServiceCatalog(token),
        listWhitespace(token, account.id),
        listServiceRecommendations(token, account.id),
      ])
      setCatalog(catalogPage.items)
      setWhitespace(whitespaceItems)
      setRecommendations(recommendationPage.items)
      setCoverage(Object.fromEntries(whitespaceItems.map(item => [item.serviceId, item.coverageStatus])))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load growth planning data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [account.id, token])

  async function saveCoverage() {
    setSaving(true)
    try {
      if (!token) throw new Error('You must be logged in to save whitespace')
      const saved = await saveWhitespace(token, account.id, Object.entries(coverage).map(([serviceId, coverageStatus]) => ({ serviceId, coverageStatus, source: 'manual' })))
      const recPage = await listServiceRecommendations(token, account.id)
      setWhitespace(saved)
      setRecommendations(recPage.items)
      toast.success('Whitespace saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Whitespace could not be saved')
    } finally {
      setSaving(false)
    }
  }

  async function convertRecommendation(recommendation: ServiceRecommendation) {
    try {
      if (!token) throw new Error('You must be logged in to create an opportunity')
      const opportunity = await createOpportunityFromRecommendation(token, account.id, recommendation.id, {
        ownerId: ownerFor(account, user),
        targetDate: futureDate(30),
        value: 0,
        currency: 'USD',
      })
      upsertOpportunity(opportunity)
      const recPage = await listServiceRecommendations(token, account.id)
      setRecommendations(recPage.items)
      toast.success('Opportunity created from recommendation')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Opportunity could not be created')
    }
  }

  if (loading) return <PanelShell title="Recommendations"><LoadingRow label="Loading service coverage" /></PanelShell>
  if (error) return <PanelShell title="Recommendations"><ErrorRow message={error} onRetry={load} /></PanelShell>

  return (
    <PanelShell title="Recommendations" detail={`${catalog.length} configured services · ${recommendations.length} recommendations`}>
      {!catalog.length ? <EmptyState icon={BriefcaseBusiness} heading="No services configured" body="Configure the service catalog in Admin Settings to capture whitespace." className="py-8" /> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {catalog.map(service => (
          <label key={service.id} className="grid gap-2 rounded-lg border border-surface-border p-3">
            <span className="text-sm font-semibold text-ink">{service.name}</span>
            <span className="text-xs text-ink-secondary">{service.category || 'Uncategorized'} · {service.tags.slice(0, 3).join(', ') || 'No tags'}</span>
            <select className="tk-input" value={coverage[service.id] ?? 'unknown'} onChange={event => setCoverage(current => ({ ...current, [service.id]: event.target.value }))}>
              <option value="unknown">Unknown</option>
              <option value="active">Active</option>
              <option value="potential">Potential</option>
              <option value="not_relevant">Not relevant</option>
            </select>
          </label>
        ))}
      </div>
      <button type="button" className="tk-button-primary w-fit" disabled={saving} onClick={saveCoverage}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save coverage
      </button>
      <div className="grid gap-3 lg:grid-cols-2">
        {recommendations.length ? recommendations.map(recommendation => (
          <div key={recommendation.id} className="rounded-lg border border-blue-tint-20 bg-blue-tint-20 p-4">
            <div className="flex items-start justify-between gap-3">
              <span>
                <span className="block text-sm font-semibold text-ink">{recommendation.targetServiceName}</span>
                <span className="mt-1 block text-xs leading-5 text-ink-secondary">{recommendation.rationale}</span>
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-brand-blue">{recommendation.relevanceScore}%</span>
            </div>
            <button type="button" className="tk-button-secondary mt-3 bg-white" disabled={recommendation.status === 'converted'} onClick={() => convertRecommendation(recommendation)}>
              <ArrowRight className="h-4 w-4" />
              {recommendation.status === 'converted' ? 'Converted' : 'Create opportunity'}
            </button>
          </div>
        )) : <EmptyState icon={Target} heading="No recommendations yet" body="Mark at least one service active to generate adjacent-service recommendations." className="py-8 lg:col-span-2" />}
      </div>
    </PanelShell>
  )
}

export function RenewalIntelligencePanel({ account }: { account: Account }) {
  const { token } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [renewals, setRenewals] = useState<RenewalProfile[]>([])

  async function load() {
    setLoading(true)
    setError('')
    try {
      if (!token) throw new Error('You must be logged in to view renewals')
      const page = await listAccountRetention(token, account.id)
      setRenewals(page.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load renewal intelligence')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [account.id, token])

  if (loading) return <PanelShell title="Renewal intelligence"><LoadingRow label="Loading renewal intelligence" /></PanelShell>
  if (error) return <PanelShell title="Renewal intelligence"><ErrorRow message={error} onRetry={load} /></PanelShell>

  return (
    <PanelShell title="Renewal intelligence" detail={`${renewals.length} engagement renewal records`}>
      {!renewals.length ? <EmptyState icon={AlertTriangle} heading="No renewal data" body="Add SOW dates or renewal terms on engagements to surface renewal intelligence." className="py-8" /> : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {renewals.map(renewal => (
          <div key={renewal.id} className="rounded-lg border border-surface-border p-4">
            <div className="flex items-start justify-between gap-3">
              <span>
                <span className="block text-sm font-semibold text-ink">{renewal.renewalStatus.replace(/_/g, ' ')}</span>
                <span className="mt-1 block text-xs text-ink-secondary">Risk {renewal.renewalRisk} · Confidence {renewal.confidence}% · {renewal.sourceType}</span>
              </span>
              <span className="rounded-full bg-surface-secondary px-3 py-1 text-xs font-semibold text-ink-secondary">{renewal.daysToExpiry ?? 'N/A'} days</span>
            </div>
            <div className="mt-3 grid gap-2 text-sm text-ink-secondary sm:grid-cols-2">
              <span>Renewal: {renewal.renewalDate ? formatDate(renewal.renewalDate) : 'Not set'}</span>
              <span>Notice: {renewal.noticeDeadline ? formatDate(renewal.noticeDeadline) : 'Not set'}</span>
              <span>Exposure: {formatCompactCurrency(renewal.commercialExposure)}</span>
              <span>Owner: {renewal.ownerName || 'Unassigned'}</span>
            </div>
            {renewal.sourceCitation ? <p className="mt-3 text-xs leading-5 text-ink-secondary">Source: {renewal.sourceCitation}</p> : null}
          </div>
        ))}
      </div>
    </PanelShell>
  )
}

export function RetentionPlanPanel({ account }: { account: Account }) {
  const { token } = useAuth()
  const user = useRole()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [plans, setPlans] = useState<RetentionPlan[]>([])
  const [recommendations, setRecommendations] = useState<RetentionRecommendation[]>([])
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [milestone, setMilestone] = useState('')
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [selectedRecommendationIds, setSelectedRecommendationIds] = useState<string[]>([])
  const [taskDueDate, setTaskDueDate] = useState('')
  const [taskConfirmed, setTaskConfirmed] = useState(false)
  const [creatingTasks, setCreatingTasks] = useState(false)

  const openPlans = useMemo(() => plans.filter(plan => !['completed', 'closed'].includes(plan.status)), [plans])
  const actionableRecommendations = useMemo(() => recommendations.filter(item => item.status !== 'converted' && !item.createdTaskId), [recommendations])

  async function load() {
    setLoading(true)
    setError('')
    try {
      if (!token) throw new Error('You must be logged in to view retention plans')
      const [planPage, recommendationItems] = await Promise.all([listRetentionPlans(token, account.id), listRetentionRecommendations(token, account.id)])
      setPlans(planPage.items)
      setRecommendations(recommendationItems)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load retention plans')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [account.id, token])

  useEffect(() => {
    if (!openPlans.length) {
      setSelectedPlanId('')
      return
    }
    if (!selectedPlanId || !openPlans.some(plan => plan.id === selectedPlanId)) {
      setSelectedPlanId(openPlans[0].id)
    }
  }, [openPlans, selectedPlanId])

  async function createPlan(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      if (!token) throw new Error('You must be logged in to create a retention plan')
      if (!title.trim()) throw new Error('Plan title is required')
      const plan = await createRetentionPlan(token, account.id, {
        title,
        summary,
        ownerId: ownerFor(account, user),
        renewalMilestoneAt: milestone ? new Date(milestone).toISOString() : null,
        successCriteria: ['Renewal risks reviewed', 'Owners and due dates confirmed'],
      })
      setPlans(current => [plan, ...current])
      setTitle('')
      setSummary('')
      setMilestone('')
      toast.success('Retention plan created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Retention plan could not be created')
    } finally {
      setSaving(false)
    }
  }

  function toggleRecommendation(recommendationId: string, checked: boolean) {
    setSelectedRecommendationIds(current => checked ? [...new Set([...current, recommendationId])] : current.filter(id => id !== recommendationId))
  }

  async function createTasks() {
    setCreatingTasks(true)
    try {
      if (!token) throw new Error('You must be logged in to create tasks')
      if (!selectedPlanId) throw new Error('Select an active retention plan before creating tasks')
      if (!selectedRecommendationIds.length) throw new Error('Select at least one recommendation')
      if (!taskDueDate) throw new Error('Task due date is required')
      if (!taskConfirmed) throw new Error('Confirm task creation before continuing')
      const tasks = await createRetentionTasks(token, selectedPlanId, {
        recommendationIds: selectedRecommendationIds,
        ownerId: ownerFor(account, user),
        dueAt: new Date(taskDueDate).toISOString(),
        confirm: taskConfirmed,
      })
      toast.success(`${tasks.length} task${tasks.length === 1 ? '' : 's'} created from retention recommendations`)
      setSelectedRecommendationIds([])
      setTaskDueDate('')
      setTaskConfirmed(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Retention tasks could not be created')
    } finally {
      setCreatingTasks(false)
    }
  }

  if (loading) return <PanelShell title="Retention plans"><LoadingRow label="Loading retention plans" /></PanelShell>
  if (error) return <PanelShell title="Retention plans"><ErrorRow message={error} onRetry={load} /></PanelShell>

  return (
    <PanelShell title="Retention plans" detail={`${openPlans.length} active · ${plans.length} historical`}>
      <form onSubmit={createPlan} className="grid gap-3 rounded-lg border border-surface-border bg-surface-secondary p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_190px_auto]">
        <TextInput label="Plan title" value={title} onChange={setTitle} placeholder="Renewal stabilization plan" />
        <TextInput label="Summary" value={summary} onChange={setSummary} placeholder="Risk, outcome, or success focus" />
        <TextInput label="Milestone" value={milestone} onChange={setMilestone} type="date" />
        <button type="submit" className="tk-button-primary self-end" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create
        </button>
      </form>
      <div className="grid gap-3 lg:grid-cols-2">
        {plans.length ? plans.map(plan => (
          <div key={plan.id} className="rounded-lg border border-surface-border p-4">
            <div className="flex items-start justify-between gap-3">
              <span>
                <span className="block text-sm font-semibold text-ink">{plan.title}</span>
                <span className="mt-1 block text-xs text-ink-secondary">{plan.planType} · {plan.status} · {plan.ownerName}</span>
              </span>
              <span className="rounded-full bg-blue-tint-20 px-3 py-1 text-xs font-semibold text-brand-blue">{plan.actions.length} actions</span>
            </div>
            {plan.summary ? <p className="mt-3 text-sm leading-6 text-ink-secondary">{plan.summary}</p> : null}
            {plan.renewalMilestoneAt ? <p className="mt-2 text-xs font-medium text-ink-secondary">Milestone {formatDate(plan.renewalMilestoneAt)}</p> : null}
          </div>
        )) : <EmptyState icon={CheckCircle2} heading="No retention plans" body="Create a plan when a renewal, stabilization, or recovery workflow needs owned actions." className="py-8 lg:col-span-2" />}
      </div>
      <div className="rounded-lg border border-surface-border p-4">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-brand-blue" />
          <h3 className="text-sm font-semibold text-ink">Recommendations</h3>
        </div>
        {recommendations.length ? (
          <div className="grid gap-3">
            {recommendations.map(item => (
              <label key={item.id} className="flex items-start gap-3 rounded-md bg-surface-secondary p-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-surface-border text-brand-blue focus:ring-brand-blue"
                  checked={selectedRecommendationIds.includes(item.id)}
                  disabled={item.status === 'converted' || Boolean(item.createdTaskId)}
                  onChange={event => toggleRecommendation(item.id, event.target.checked)}
                  aria-label={`Select ${item.title}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{item.title}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-ink-secondary">{item.severity}</span>
                    {item.status === 'converted' || item.createdTaskId ? <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold uppercase text-green-700">Task created</span> : null}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-ink-secondary">{item.rationale}</span>
                  <span className="mt-1 block text-xs font-medium text-ink-secondary">Action: {item.recommendedAction}</span>
                </span>
              </label>
            ))}
            <div className="grid gap-3 rounded-md border border-surface-border bg-surface-secondary p-3 lg:grid-cols-[minmax(0,1fr)_180px_minmax(180px,220px)_auto]">
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-ink-secondary">Retention plan</span>
                <select className="tk-input" value={selectedPlanId} onChange={event => setSelectedPlanId(event.target.value)} disabled={!openPlans.length}>
                  {openPlans.length ? openPlans.map(plan => <option key={plan.id} value={plan.id}>{plan.title}</option>) : <option value="">Create an active plan first</option>}
                </select>
              </label>
              <TextInput label="Task due date" value={taskDueDate} onChange={setTaskDueDate} type="date" />
              <label className="flex min-h-[44px] items-center gap-2 self-end rounded-md border border-surface-border bg-white px-3 text-sm font-semibold text-ink">
                <input type="checkbox" className="h-4 w-4 rounded border-surface-border text-brand-blue focus:ring-brand-blue" checked={taskConfirmed} onChange={event => setTaskConfirmed(event.target.checked)} />
                Confirm task creation
              </label>
              <button
                type="button"
                className="tk-button-primary self-end"
                disabled={creatingTasks || !openPlans.length || !selectedRecommendationIds.length || !taskDueDate || !taskConfirmed || !actionableRecommendations.length}
                onClick={() => void createTasks()}
              >
                {creatingTasks ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckSquare className="h-4 w-4" />}
                Create tasks
              </button>
            </div>
          </div>
        ) : <p className="text-sm text-ink-secondary">No retention recommendations are active.</p>}
      </div>
    </PanelShell>
  )
}

function PanelShell({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) {
  return (
    <section className="tk-card overflow-hidden">
      <div className="border-b border-surface-border bg-surface-secondary p-5">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Relationships planning growth retention</p>
        <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          {detail ? <p className="text-xs font-medium text-ink-secondary">{detail}</p> : null}
        </div>
      </div>
      <div className="grid gap-4 p-5">{children}</div>
    </section>
  )
}

function LoadingRow({ label }: { label: string }) {
  return <div className="flex min-h-[140px] items-center justify-center gap-2 text-sm font-medium text-ink-secondary"><Loader2 className="h-4 w-4 animate-spin" />{label}</div>
}

function ErrorRow({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex min-h-[140px] flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm font-medium text-rag-red">{message}</p>
      {onRetry ? <button type="button" className="tk-button-secondary" onClick={onRetry}><RefreshCcw className="h-4 w-4" />Retry</button> : null}
    </div>
  )
}

function TextInput({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold text-ink-secondary">{label}</span>
      <input type={type} className="tk-input" value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} />
    </label>
  )
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold text-ink-secondary">{label}</span>
      <textarea className="tk-input min-h-[120px] resize-y" value={value} onChange={event => onChange(event.target.value)} />
    </label>
  )
}

function splitList(value: string) {
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

function futureDate(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

import {
  AlertTriangle,
  Archive,
  CalendarClock,
  CheckCircle2,
  Edit3,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { RuntimeCustomFields, customValuesForSubmit, requiredCustomFieldErrors } from '@/components/custom-fields/RuntimeCustomFields'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/contexts/AuthContext'
import {
  AccountRetention,
  EngagementRenewal,
  RetentionPlan,
  RetentionPlanAction,
  RetentionRecommendation,
  createRetentionPlan,
  createRetentionPlanTask,
  getAccountRetention,
  getRetentionRecommendations,
  listRetentionPlans,
  listRuntimeCustomFields,
  updateAccountRetention,
  updateEngagementRenewal,
  updateRetentionPlan,
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
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileForm, setProfileForm] = useState(() => profileFormFromRetention(null, account, user?.id || ''))
  const [planForm, setPlanForm] = useState(() => initialPlanForm(account.ownerId || user?.id || ''))
  const [editingPlanId, setEditingPlanId] = useState('')
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({})
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({})
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [actionForm, setActionForm] = useState(() => initialActionForm(account.ownerId || user?.id || ''))
  const [editingActionId, setEditingActionId] = useState('')
  const [editingRenewalId, setEditingRenewalId] = useState('')
  const [renewalForm, setRenewalForm] = useState(() => renewalFormFromRenewal())
  const readOnly = user?.role === 'leadership_viewer' || !token

  const activePlans = useMemo(() => plans.filter(plan => plan.status !== 'archived'), [plans])
  const primaryPlan = activePlans.find(plan => plan.status !== 'completed') ?? activePlans[0] ?? plans[0]
  const selectedPlan = plans.find(plan => plan.id === selectedPlanId) ?? primaryPlan

  useEffect(() => {
    if (!token) {
      setLoading(false)
      setError('Authentication is required to load account retention.')
      return
    }
    let active = true
    setLoading(true)
    setError('')
    Promise.all([
      getAccountRetention(token, account.id),
      listRetentionPlans(token, account.id, new URLSearchParams({ page: '1', page_size: '25', sort: 'due_date', direction: 'asc' })),
      getRetentionRecommendations(token, account.id),
      listRuntimeCustomFields(token, 'retention_stability'),
    ])
      .then(([retentionResult, planResult, recommendationResult, fieldResult]) => {
        if (!active) return
        setRetention(retentionResult)
        setPlans(planResult.items)
        setRecommendations(recommendationResult.recommendations)
        setCustomFields(fieldResult)
        setProfileForm(profileFormFromRetention(retentionResult, account, user?.id || ''))
        setPlanForm(current => ({ ...current, owner_id: retentionResult.owner_id || account.ownerId || user?.id || current.owner_id }))
        setActionForm(current => ({ ...current, owner_id: retentionResult.owner_id || account.ownerId || user?.id || current.owner_id }))
        setSelectedPlanId(current => current || planResult.items.find(plan => plan.status !== 'archived')?.id || planResult.items[0]?.id || '')
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
  }, [account, account.id, account.ownerId, token, user?.id])

  async function refresh() {
    if (!token) return
    const [nextRetention, nextPlans, nextRecommendations] = await Promise.all([
      getAccountRetention(token, account.id),
      listRetentionPlans(token, account.id, new URLSearchParams({ page: '1', page_size: '25', sort: 'due_date', direction: 'asc' })),
      getRetentionRecommendations(token, account.id),
    ])
    setRetention(nextRetention)
    setPlans(nextPlans.items)
    setRecommendations(nextRecommendations.recommendations)
    setProfileForm(profileFormFromRetention(nextRetention, account, user?.id || ''))
    setSelectedPlanId(current => current && nextPlans.items.some(plan => plan.id === current) ? current : nextPlans.items.find(plan => plan.status !== 'archived')?.id || nextPlans.items[0]?.id || '')
  }

  async function submitProfile(event: FormEvent) {
    event.preventDefault()
    if (!token || readOnly) return
    setSaving(true)
    try {
      await updateAccountRetention(token, account.id, {
        readiness_status: profileForm.readiness_status,
        renewal_risk: profileForm.renewal_risk,
        owner_id: profileForm.owner_id || null,
        commercial_exposure: Number(profileForm.commercial_exposure || 0),
        currency: profileForm.currency,
        confidence: Number(profileForm.confidence || 0),
        source_kind: profileForm.source_kind,
        source_title: profileForm.source_title || null,
        source_citation: profileForm.source_citation || null,
        manual_override_reason: profileForm.manual_override_reason || null,
        notes: profileForm.notes || null,
      })
      await refresh()
      setEditingProfile(false)
      toast.success('Account stability profile updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update account stability')
    } finally {
      setSaving(false)
    }
  }

  async function submitRenewal(event: FormEvent) {
    event.preventDefault()
    if (!token || readOnly || !editingRenewalId) return
    setSaving(true)
    try {
      await updateEngagementRenewal(token, editingRenewalId, {
        owner_id: renewalForm.owner_id || null,
        readiness_status: renewalForm.readiness_status,
        renewal_risk: renewalForm.renewal_risk,
        sow_start_date: toIsoOrNull(renewalForm.sow_start_date),
        sow_end_date: toIsoOrNull(renewalForm.sow_end_date),
        renewal_date: toIsoOrNull(renewalForm.renewal_date),
        notice_deadline: toIsoOrNull(renewalForm.notice_deadline),
        notice_period_days: Number(renewalForm.notice_period_days || 0),
        auto_renewal: renewalForm.auto_renewal,
        commercial_exposure: Number(renewalForm.commercial_exposure || 0),
        currency: renewalForm.currency,
        confidence: Number(renewalForm.confidence || 0),
        source_kind: renewalForm.source_kind,
        source_title: renewalForm.source_title || null,
        source_citation: renewalForm.source_citation || null,
        manual_override_reason: renewalForm.manual_override_reason || null,
      })
      await refresh()
      setEditingRenewalId('')
      toast.success('Renewal terms updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update renewal terms')
    } finally {
      setSaving(false)
    }
  }

  async function submitPlan(event: FormEvent) {
    event.preventDefault()
    if (!token || readOnly) return
    const nextCustomErrors = requiredCustomFieldErrors(customFields, customValues)
    setCustomErrors(nextCustomErrors)
    if (Object.keys(nextCustomErrors).length) return
    if (!planForm.title.trim() || !planForm.owner_id || !planForm.due_at || !planForm.success_criteria.trim()) {
      toast.error('Plan title, owner, due date, and success criteria are required')
      return
    }
    setSaving(true)
    const commonPayload = {
      engagement_id: planForm.engagement_id || null,
      title: planForm.title.trim(),
      plan_type: planForm.plan_type,
      status: planForm.status,
      risk_level: planForm.risk_level,
      owner_id: planForm.owner_id,
      due_at: toIso(planForm.due_at),
      renewal_milestone_at: planForm.renewal_milestone_at ? toIso(planForm.renewal_milestone_at) : null,
      success_criteria: lines(planForm.success_criteria),
      custom_field_values: customValuesForSubmit(customFields, customValues),
    }
    try {
      if (editingPlanId) {
        await updateRetentionPlan(token, editingPlanId, commonPayload)
        toast.success('Retention plan updated')
      } else {
        await createRetentionPlan(token, account.id, {
          ...commonPayload,
          milestones: planForm.renewal_milestone_at ? [{ title: 'Renewal decision', milestone_type: 'renewal', due_at: toIso(planForm.renewal_milestone_at) }] : [],
        })
        toast.success('Retention plan created')
      }
      resetPlanBuilder()
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save retention plan')
    } finally {
      setSaving(false)
    }
  }

  async function archivePlan(plan: RetentionPlan) {
    if (!token || readOnly) return
    setSaving(true)
    try {
      await updateRetentionPlan(token, plan.id, { status: 'archived' })
      if (editingPlanId === plan.id) resetPlanBuilder()
      await refresh()
      toast.success('Retention plan archived')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to archive retention plan')
    } finally {
      setSaving(false)
    }
  }

  async function submitAction(event: FormEvent) {
    event.preventDefault()
    if (!token || readOnly || !selectedPlan) return
    if (!actionForm.title.trim() || !actionForm.owner_id || !actionForm.due_at) {
      toast.error('Action title, owner, and due date are required')
      return
    }
    setSaving(true)
    try {
      if (editingActionId) {
        await updateRetentionPlanAction(token, editingActionId, {
          title: actionForm.title.trim(),
          owner_id: actionForm.owner_id,
          due_at: toIso(actionForm.due_at),
          status: actionForm.status,
          success_criteria: actionForm.success_criteria || null,
        })
        toast.success('Retention action updated')
      } else {
        await createRetentionPlanTask(token, selectedPlan.id, {
          title: actionForm.title.trim(),
          owner_id: actionForm.owner_id,
          due_at: toIso(actionForm.due_at),
          success_criteria: actionForm.success_criteria || undefined,
          confirmed: true,
        })
        toast.success('Retention action created')
      }
      resetActionBuilder()
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save retention action')
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

  async function updateActionStatus(action: RetentionPlanAction, status: RetentionPlanAction['status']) {
    if (!token || readOnly) return
    setSaving(true)
    try {
      await updateRetentionPlanAction(token, action.id, { status })
      await refresh()
      toast.success(status === 'cancelled' ? 'Retention action removed' : 'Retention action updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update action')
    } finally {
      setSaving(false)
    }
  }

  function beginRenewalEdit(renewal: EngagementRenewal) {
    setEditingRenewalId(renewal.engagement_id)
    setRenewalForm(renewalFormFromRenewal(renewal))
  }

  function beginPlanEdit(plan: RetentionPlan) {
    setEditingPlanId(plan.id)
    setPlanForm(planFormFromPlan(plan))
    setCustomValues(plan.custom_field_values || {})
    setCustomErrors({})
  }

  function beginActionEdit(action: RetentionPlanAction) {
    setEditingActionId(action.id)
    setSelectedPlanId(action.plan_id)
    setActionForm(actionFormFromAction(action))
  }

  function resetPlanBuilder() {
    setEditingPlanId('')
    setPlanForm(initialPlanForm(retention?.owner_id || account.ownerId || user?.id || ''))
    setCustomValues({})
    setCustomErrors({})
  }

  function resetActionBuilder() {
    setEditingActionId('')
    setActionForm(initialActionForm(retention?.owner_id || account.ownerId || user?.id || ''))
  }

  if (loading) {
    return (
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (error) {
    return <EmptyState icon={AlertTriangle} heading="Retention context could not be loaded" body={error} />
  }

  return (
    <div className="space-y-5">
      <section className="tk-card overflow-hidden">
        <div className="border-b border-surface-border bg-surface-secondary p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Account stability stage</p>
              <h2 className="mt-1 font-display text-3xl font-bold text-ink">{account.name}</h2>
              <p className="mt-2 text-sm text-ink-secondary">Retention readiness, renewal risk, stabilization actions, and source-backed plan history for this account.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill value={retention?.renewal_risk || 'warning'} />
              {!readOnly ? (
                <button className="tk-button-secondary bg-white" onClick={() => setEditingProfile(value => !value)}>
                  {editingProfile ? <X className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
                  {editingProfile ? 'Cancel' : 'Edit profile'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <div className="grid gap-0 divide-y divide-surface-border md:grid-cols-4 md:divide-x md:divide-y-0">
          <Metric label="Readiness" value={labelize(retention?.readiness_status || 'not_started')} />
          <Metric label="Exposure" value={formatCompactCurrency(retention?.commercial_exposure || account.arr)} />
          <Metric label="Nearest notice" value={daysLabel(retention?.days_to_nearest_notice)} tone="orange" />
          <Metric label="Renewals" value={`${retention?.renewal_count || 0}`} tone="blue" />
        </div>
        {editingProfile ? (
          <form className="grid gap-3 border-t border-surface-border p-5 xl:grid-cols-4" onSubmit={submitProfile}>
            <SelectField label="Readiness" value={profileForm.readiness_status} onChange={value => setProfileForm({ ...profileForm, readiness_status: value as typeof profileForm.readiness_status })} options={['not_started', 'draft', 'in_review', 'ready', 'blocked']} />
            <SelectField label="Risk" value={profileForm.renewal_risk} onChange={value => setProfileForm({ ...profileForm, renewal_risk: value as typeof profileForm.renewal_risk })} options={['healthy', 'warning', 'critical']} />
            <label className="space-y-1">
              <span className="tk-label">Owner ID</span>
              <input className="tk-input" value={profileForm.owner_id} onChange={event => setProfileForm({ ...profileForm, owner_id: event.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="tk-label">Exposure</span>
              <input type="number" min={0} className="tk-input" value={profileForm.commercial_exposure} onChange={event => setProfileForm({ ...profileForm, commercial_exposure: event.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="tk-label">Currency</span>
              <input className="tk-input" maxLength={3} value={profileForm.currency} onChange={event => setProfileForm({ ...profileForm, currency: event.target.value.toUpperCase() })} />
            </label>
            <label className="space-y-1">
              <span className="tk-label">Confidence</span>
              <input type="number" min={0} max={100} className="tk-input" value={profileForm.confidence} onChange={event => setProfileForm({ ...profileForm, confidence: event.target.value })} />
            </label>
            <SelectField label="Source" value={profileForm.source_kind} onChange={value => setProfileForm({ ...profileForm, source_kind: value as typeof profileForm.source_kind })} options={['manual', 'sow', 'extracted', 'imported']} />
            <label className="space-y-1">
              <span className="tk-label">Source title</span>
              <input className="tk-input" value={profileForm.source_title} onChange={event => setProfileForm({ ...profileForm, source_title: event.target.value })} />
            </label>
            <label className="space-y-1 xl:col-span-2">
              <span className="tk-label">Source citation</span>
              <textarea className="tk-input min-h-[88px]" value={profileForm.source_citation} onChange={event => setProfileForm({ ...profileForm, source_citation: event.target.value })} />
            </label>
            <label className="space-y-1 xl:col-span-2">
              <span className="tk-label">Manual override reason</span>
              <textarea className="tk-input min-h-[88px]" value={profileForm.manual_override_reason} onChange={event => setProfileForm({ ...profileForm, manual_override_reason: event.target.value })} />
            </label>
            <label className="space-y-1 xl:col-span-4">
              <span className="tk-label">Notes</span>
              <textarea className="tk-input min-h-[96px]" value={profileForm.notes} onChange={event => setProfileForm({ ...profileForm, notes: event.target.value })} />
            </label>
            <div className="xl:col-span-4">
              <button className="tk-button-primary" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save account stability
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <main className="space-y-5">
          <Panel title="Renewal intelligence" icon={CalendarClock}>
            {retention?.renewals.length ? (
              <div className="space-y-4">
                <div className="overflow-x-auto rounded-lg border border-surface-border">
                  <table className="min-w-full divide-y divide-surface-border text-sm">
                    <thead className="bg-surface-secondary text-left text-[10px] uppercase tracking-wider text-ink-secondary">
                      <tr>
                        <th className="px-3 py-2">Engagement</th>
                        <th className="px-3 py-2">Notice</th>
                        <th className="px-3 py-2">Renewal</th>
                        <th className="px-3 py-2">Risk</th>
                        <th className="px-3 py-2">Exposure</th>
                        <th className="px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border bg-white">
                      {retention.renewals.map(renewal => (
                        <tr key={renewal.engagement_id}>
                          <td className="px-3 py-3 font-semibold text-ink">{renewal.engagement_name}</td>
                          <td className="px-3 py-3 text-ink-secondary">{dateLabel(renewal.notice_deadline)}</td>
                          <td className="px-3 py-3 text-ink-secondary">{dateLabel(renewal.renewal_date || renewal.sow_end_date)}</td>
                          <td className="px-3 py-3"><StatusPill value={renewal.renewal_risk} compact /></td>
                          <td className="px-3 py-3 font-semibold text-ink">{formatCompactCurrency(renewal.commercial_exposure)}</td>
                          <td className="px-3 py-3">
                            {!readOnly ? (
                              <button className="tk-button-secondary bg-white" onClick={() => beginRenewalEdit(renewal)}>
                                <Edit3 className="h-4 w-4" />
                                Edit
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {editingRenewalId ? (
                  <form className="rounded-lg border border-surface-border bg-surface-secondary p-4" onSubmit={submitRenewal}>
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Edit renewal terms</p>
                        <p className="mt-1 text-sm font-semibold text-ink">{retention.renewals.find(item => item.engagement_id === editingRenewalId)?.engagement_name}</p>
                      </div>
                      <button type="button" className="tk-button-secondary bg-white" onClick={() => setEditingRenewalId('')}>
                        <X className="h-4 w-4" />
                        Cancel
                      </button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <SelectField label="Readiness" value={renewalForm.readiness_status} onChange={value => setRenewalForm({ ...renewalForm, readiness_status: value as typeof renewalForm.readiness_status })} options={['not_started', 'draft', 'in_review', 'ready', 'blocked']} />
                      <SelectField label="Risk" value={renewalForm.renewal_risk} onChange={value => setRenewalForm({ ...renewalForm, renewal_risk: value as typeof renewalForm.renewal_risk })} options={['healthy', 'warning', 'critical']} />
                      <label className="space-y-1">
                        <span className="tk-label">Owner ID</span>
                        <input className="tk-input" value={renewalForm.owner_id} onChange={event => setRenewalForm({ ...renewalForm, owner_id: event.target.value })} />
                      </label>
                      <DateField label="SOW start" value={renewalForm.sow_start_date} onChange={value => setRenewalForm({ ...renewalForm, sow_start_date: value })} />
                      <DateField label="SOW end" value={renewalForm.sow_end_date} onChange={value => setRenewalForm({ ...renewalForm, sow_end_date: value })} />
                      <DateField label="Renewal date" value={renewalForm.renewal_date} onChange={value => setRenewalForm({ ...renewalForm, renewal_date: value })} />
                      <DateField label="Notice deadline" value={renewalForm.notice_deadline} onChange={value => setRenewalForm({ ...renewalForm, notice_deadline: value })} />
                      <label className="space-y-1">
                        <span className="tk-label">Notice period</span>
                        <input type="number" min={0} className="tk-input" value={renewalForm.notice_period_days} onChange={event => setRenewalForm({ ...renewalForm, notice_period_days: event.target.value })} />
                      </label>
                      <label className="space-y-1">
                        <span className="tk-label">Exposure</span>
                        <input type="number" min={0} className="tk-input" value={renewalForm.commercial_exposure} onChange={event => setRenewalForm({ ...renewalForm, commercial_exposure: event.target.value })} />
                      </label>
                      <label className="space-y-1">
                        <span className="tk-label">Currency</span>
                        <input className="tk-input" maxLength={3} value={renewalForm.currency} onChange={event => setRenewalForm({ ...renewalForm, currency: event.target.value.toUpperCase() })} />
                      </label>
                      <label className="space-y-1">
                        <span className="tk-label">Confidence</span>
                        <input type="number" min={0} max={100} className="tk-input" value={renewalForm.confidence} onChange={event => setRenewalForm({ ...renewalForm, confidence: event.target.value })} />
                      </label>
                      <SelectField label="Source" value={renewalForm.source_kind} onChange={value => setRenewalForm({ ...renewalForm, source_kind: value as typeof renewalForm.source_kind })} options={['manual', 'sow', 'extracted', 'imported']} />
                    </div>
                    <label className="mt-3 flex min-h-[44px] items-center gap-2 rounded-md border border-surface-border bg-white px-3 text-sm font-semibold text-ink">
                      <input type="checkbox" checked={renewalForm.auto_renewal} onChange={event => setRenewalForm({ ...renewalForm, auto_renewal: event.target.checked })} />
                      Auto-renewal
                    </label>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="space-y-1">
                        <span className="tk-label">Source title</span>
                        <input className="tk-input" value={renewalForm.source_title} onChange={event => setRenewalForm({ ...renewalForm, source_title: event.target.value })} />
                      </label>
                      <label className="space-y-1">
                        <span className="tk-label">Manual override reason</span>
                        <input className="tk-input" value={renewalForm.manual_override_reason} onChange={event => setRenewalForm({ ...renewalForm, manual_override_reason: event.target.value })} />
                      </label>
                    </div>
                    <label className="mt-3 block space-y-1">
                      <span className="tk-label">Source citation</span>
                      <textarea className="tk-input min-h-[88px]" value={renewalForm.source_citation} onChange={event => setRenewalForm({ ...renewalForm, source_citation: event.target.value })} />
                    </label>
                    <button className="tk-button-primary mt-4" disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save renewal
                    </button>
                  </form>
                ) : null}
              </div>
            ) : (
              <EmptyState icon={CalendarClock} heading="No renewal rows yet" body="Create or update account engagements to populate renewal intelligence for this account." />
            )}
          </Panel>

          <Panel title="Recommendations" icon={Sparkles}>
            {recommendations.length ? (
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
            ) : (
              <p className="rounded-lg border border-surface-border bg-white p-4 text-sm text-ink-secondary">No account stability recommendations are available yet.</p>
            )}
          </Panel>

          <Panel title="Retention plans" icon={CheckCircle2}>
            {plans.length ? (
              <div className="space-y-3">
                {plans.map(plan => (
                  <div key={plan.id} className={cn('rounded-lg border bg-white p-4', plan.status === 'archived' ? 'border-surface-border opacity-70' : 'border-surface-border')}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-ink">{plan.title}</p>
                        <p className="mt-1 text-xs text-ink-secondary">{labelize(plan.plan_type)} | {labelize(plan.status)} | Owner: {plan.owner_name} | Due {formatDate(plan.due_at)}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill value={plan.risk_level} compact />
                        {!readOnly ? (
                          <>
                            <button className="tk-button-secondary bg-white" onClick={() => beginPlanEdit(plan)}>
                              <Edit3 className="h-4 w-4" />
                              Edit
                            </button>
                            {plan.status !== 'archived' ? (
                              <button className="tk-button-secondary bg-white" disabled={saving} onClick={() => archivePlan(plan)}>
                                <Archive className="h-4 w-4" />
                                Archive
                              </button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {plan.success_criteria.map(item => (
                        <p key={item} className="rounded-md bg-surface-secondary p-2 text-xs text-ink-secondary">{item}</p>
                      ))}
                    </div>
                    <div className="mt-3 space-y-2">
                      {plan.actions.length ? plan.actions.map(action => (
                        <div key={action.id} className="flex flex-col gap-2 rounded-md bg-surface-secondary p-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-sm font-medium text-ink">{action.title}</p>
                            <p className="text-xs text-ink-secondary">{action.owner_name} | {formatDate(action.due_at)} | {labelize(action.status)}</p>
                          </div>
                          {!readOnly ? (
                            <div className="flex flex-wrap gap-2">
                              <button className="tk-button-secondary bg-white" onClick={() => beginActionEdit(action)}>
                                <Edit3 className="h-4 w-4" />
                                Edit
                              </button>
                              {action.status !== 'done' ? (
                                <button className="tk-button-secondary bg-white" disabled={saving} onClick={() => updateActionStatus(action, 'done')}>
                                  <CheckCircle2 className="h-4 w-4" />
                                  Complete
                                </button>
                              ) : (
                                <button className="tk-button-secondary bg-white" disabled={saving} onClick={() => updateActionStatus(action, 'in_progress')}>
                                  <RotateCcw className="h-4 w-4" />
                                  Reopen
                                </button>
                              )}
                              {action.status !== 'cancelled' ? (
                                <button className="tk-button-secondary bg-white" disabled={saving} onClick={() => updateActionStatus(action, 'cancelled')}>
                                  <Archive className="h-4 w-4" />
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      )) : <p className="rounded-md bg-surface-secondary p-3 text-sm text-ink-secondary">No actions yet.</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-surface-border bg-white p-4 text-sm text-ink-secondary">No retention plans yet. Use the plan builder to create the first account-specific plan.</p>
            )}
          </Panel>
        </main>

        <aside className="space-y-5">
          <Panel title={editingPlanId ? 'Edit plan' : 'Plan builder'} icon={Plus}>
            {readOnly ? (
              <p className="rounded-lg border border-surface-border bg-surface-secondary p-4 text-sm text-ink-secondary">You have read-only retention access.</p>
            ) : (
              <form className="space-y-3" onSubmit={submitPlan}>
                {editingPlanId ? (
                  <button type="button" className="tk-button-secondary w-full justify-center" onClick={resetPlanBuilder}>
                    <X className="h-4 w-4" />
                    Cancel edit
                  </button>
                ) : null}
                <label className="space-y-1">
                  <span className="tk-label">Title</span>
                  <input className="tk-input" value={planForm.title} onChange={event => setPlanForm({ ...planForm, title: event.target.value })} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField label="Plan type" value={planForm.plan_type} onChange={value => setPlanForm({ ...planForm, plan_type: value as typeof planForm.plan_type })} options={['retention', 'renewal', 'stabilization']} />
                  <SelectField label="Status" value={planForm.status} onChange={value => setPlanForm({ ...planForm, status: value as typeof planForm.status })} options={['draft', 'active', 'completed', 'archived']} />
                </div>
                <SelectField label="Risk" value={planForm.risk_level} onChange={value => setPlanForm({ ...planForm, risk_level: value as typeof planForm.risk_level })} options={['warning', 'critical', 'healthy']} />
                <label className="space-y-1">
                  <span className="tk-label">Engagement ID</span>
                  <input className="tk-input" value={planForm.engagement_id} onChange={event => setPlanForm({ ...planForm, engagement_id: event.target.value })} placeholder="Optional" />
                </label>
                <label className="space-y-1">
                  <span className="tk-label">Owner ID</span>
                  <input className="tk-input" value={planForm.owner_id} onChange={event => setPlanForm({ ...planForm, owner_id: event.target.value })} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DateField label="Due" value={planForm.due_at} onChange={value => setPlanForm({ ...planForm, due_at: value })} />
                  <DateField label="Renewal milestone" value={planForm.renewal_milestone_at} onChange={value => setPlanForm({ ...planForm, renewal_milestone_at: value })} />
                </div>
                <label className="space-y-1">
                  <span className="tk-label">Success criteria</span>
                  <textarea className="tk-input min-h-[104px]" value={planForm.success_criteria} onChange={event => setPlanForm({ ...planForm, success_criteria: event.target.value })} />
                </label>
                <RuntimeCustomFields fields={customFields} values={customValues} errors={customErrors} onChange={(fieldKey, value) => setCustomValues(current => ({ ...current, [fieldKey]: value }))} />
                <button className="tk-button-primary w-full justify-center" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {editingPlanId ? 'Save plan' : 'Create plan'}
                </button>
              </form>
            )}
          </Panel>

          <Panel title={editingActionId ? 'Edit action' : 'Action builder'} icon={CheckCircle2}>
            {readOnly ? (
              <p className="rounded-lg border border-surface-border bg-surface-secondary p-4 text-sm text-ink-secondary">You have read-only retention access.</p>
            ) : plans.length ? (
              <form className="space-y-3" onSubmit={submitAction}>
                {editingActionId ? (
                  <button type="button" className="tk-button-secondary w-full justify-center" onClick={resetActionBuilder}>
                    <X className="h-4 w-4" />
                    Cancel edit
                  </button>
                ) : null}
                <label className="space-y-1">
                  <span className="tk-label">Plan</span>
                  <select className="tk-input" value={selectedPlan?.id || ''} onChange={event => setSelectedPlanId(event.target.value)} disabled={Boolean(editingActionId)}>
                    {plans.filter(plan => plan.status !== 'archived').map(plan => <option key={plan.id} value={plan.id}>{plan.title}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="tk-label">Title</span>
                  <input className="tk-input" value={actionForm.title} onChange={event => setActionForm({ ...actionForm, title: event.target.value })} />
                </label>
                <label className="space-y-1">
                  <span className="tk-label">Owner ID</span>
                  <input className="tk-input" value={actionForm.owner_id} onChange={event => setActionForm({ ...actionForm, owner_id: event.target.value })} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DateField label="Due" value={actionForm.due_at} onChange={value => setActionForm({ ...actionForm, due_at: value })} />
                  <SelectField label="Status" value={actionForm.status} onChange={value => setActionForm({ ...actionForm, status: value as typeof actionForm.status })} options={['todo', 'in_progress', 'done', 'blocked', 'cancelled']} />
                </div>
                <label className="space-y-1">
                  <span className="tk-label">Success criteria</span>
                  <textarea className="tk-input min-h-[88px]" value={actionForm.success_criteria} onChange={event => setActionForm({ ...actionForm, success_criteria: event.target.value })} />
                </label>
                <button className="tk-button-primary w-full justify-center" disabled={saving || !selectedPlan}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {editingActionId ? 'Save action' : 'Create action'}
                </button>
              </form>
            ) : (
              <p className="rounded-lg border border-surface-border bg-surface-secondary p-4 text-sm text-ink-secondary">Create a retention plan before adding plan actions.</p>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  )
}

function Panel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
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
      <p className={`mt-1 font-display text-2xl font-bold capitalize ${toneClass}`}>{value}</p>
    </div>
  )
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1">
      <span className="tk-label">{label}</span>
      <select className="tk-input" value={value} onChange={event => onChange(event.target.value)}>
        {options.map(option => <option key={option} value={option}>{labelize(option)}</option>)}
      </select>
    </label>
  )
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1">
      <span className="tk-label">{label}</span>
      <input type="datetime-local" className="tk-input" value={value} onChange={event => onChange(event.target.value)} />
    </label>
  )
}

function StatusPill({ value, compact = false }: { value: string; compact?: boolean }) {
  const tone = value === 'critical' ? 'border-rag-red/20 bg-rag-red/10 text-rag-red' : value === 'warning' ? 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange' : 'border-rag-green/20 bg-rag-green/10 text-rag-green'
  return <span className={cn('inline-flex rounded-full border font-semibold uppercase tracking-wider', compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs', tone)}>{labelize(value)}</span>
}

function initialPlanForm(ownerId: string) {
  return {
    engagement_id: '',
    title: 'Retention readiness plan',
    plan_type: 'retention' as 'retention' | 'renewal' | 'stabilization',
    status: 'active' as 'draft' | 'active' | 'completed' | 'archived',
    risk_level: 'warning' as 'healthy' | 'warning' | 'critical',
    owner_id: ownerId,
    due_at: inputDate(14),
    renewal_milestone_at: inputDate(45),
    success_criteria: 'Renewal decision owner confirmed\nNotice path validated\nClient communication plan approved',
  }
}

function planFormFromPlan(plan: RetentionPlan) {
  return {
    engagement_id: plan.engagement_id || '',
    title: plan.title,
    plan_type: plan.plan_type as 'retention' | 'renewal' | 'stabilization',
    status: plan.status as 'draft' | 'active' | 'completed' | 'archived',
    risk_level: plan.risk_level,
    owner_id: plan.owner_id || '',
    due_at: toInputDate(plan.due_at),
    renewal_milestone_at: toInputDate(plan.renewal_milestone_at),
    success_criteria: plan.success_criteria.join('\n'),
  }
}

function initialActionForm(ownerId: string) {
  return {
    title: '',
    owner_id: ownerId,
    due_at: inputDate(7),
    status: 'todo' as 'todo' | 'in_progress' | 'done' | 'blocked' | 'cancelled',
    success_criteria: '',
  }
}

function actionFormFromAction(action: RetentionPlanAction) {
  return {
    title: action.title,
    owner_id: action.owner_id || '',
    due_at: toInputDate(action.due_at),
    status: action.status as 'todo' | 'in_progress' | 'done' | 'blocked' | 'cancelled',
    success_criteria: action.success_criteria || '',
  }
}

function profileFormFromRetention(retention: AccountRetention | null, account: Account, fallbackOwnerId: string) {
  return {
    readiness_status: (retention?.readiness_status || 'not_started') as 'not_started' | 'draft' | 'in_review' | 'ready' | 'blocked',
    renewal_risk: (retention?.renewal_risk || account.riskStatus || 'warning') as 'healthy' | 'warning' | 'critical',
    owner_id: retention?.owner_id || account.ownerId || fallbackOwnerId,
    commercial_exposure: String(retention?.commercial_exposure ?? account.arr ?? 0),
    currency: retention?.currency || 'USD',
    confidence: String(retention?.confidence ?? 75),
    source_kind: (retention?.source_kind || 'manual') as 'manual' | 'sow' | 'extracted' | 'imported',
    source_title: retention?.source_title || '',
    source_citation: retention?.source_citation || '',
    manual_override_reason: retention?.manual_override_reason || '',
    notes: retention?.notes || '',
  }
}

function renewalFormFromRenewal(renewal?: EngagementRenewal) {
  return {
    owner_id: renewal?.owner_id || '',
    readiness_status: (renewal?.readiness_status || 'not_started') as 'not_started' | 'draft' | 'in_review' | 'ready' | 'blocked',
    renewal_risk: (renewal?.renewal_risk || 'warning') as 'healthy' | 'warning' | 'critical',
    sow_start_date: toInputDate(renewal?.sow_start_date),
    sow_end_date: toInputDate(renewal?.sow_end_date),
    renewal_date: toInputDate(renewal?.renewal_date),
    notice_deadline: toInputDate(renewal?.notice_deadline),
    notice_period_days: String(renewal?.notice_period_days ?? 0),
    auto_renewal: Boolean(renewal?.auto_renewal),
    commercial_exposure: String(renewal?.commercial_exposure ?? 0),
    currency: renewal?.currency || 'USD',
    confidence: String(renewal?.confidence ?? 75),
    source_kind: (renewal?.source_kind || 'manual') as 'manual' | 'sow' | 'extracted' | 'imported',
    source_title: renewal?.source_title || '',
    source_citation: renewal?.source_citation || '',
    manual_override_reason: renewal?.manual_override_reason || '',
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

function toIsoOrNull(value: string) {
  return value ? new Date(value).toISOString() : null
}

function toInputDate(value?: string | null) {
  if (!value) return ''
  return new Date(value).toISOString().slice(0, 16)
}

function lines(value: string) {
  return value.split('\n').map(item => item.trim()).filter(Boolean)
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

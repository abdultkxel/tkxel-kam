import * as Tabs from '@radix-ui/react-tabs'
import { AlertTriangle, BriefcaseBusiness, CalendarClock, CheckCircle2, Clock3, Loader2, RefreshCcw, Target, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { HealthScoreRing } from '@/components/account/HealthScoreRing'
import { AccountWorkspacePanel } from '@/components/account/AccountWorkspacePanel'
import { EngagementsPanel } from '@/components/account/EngagementsPanel'
import { KYCAgentOverview } from '@/components/account/KYCAgentOverview'
import { KYCAssistedReview } from '@/components/account/KYCAssistedReview'
import { ScoreHistoryPanel } from '@/components/account/ScoreHistoryPanel'
import { ScoreCalculators, ScoreCalculatorSummary } from '@/components/account/ScoreCalculators'
import { GrowthWhitespacePanel, RetentionPlanPanel } from '@/components/account/RelationshipsPlanningGrowthRetention'
import { StakeholderTab } from '@/components/account/StakeholderTab'
import { AIBriefCard } from '@/components/ai/AIBriefCard'
import { OpportunityBoard } from '@/components/opportunities/OpportunityBoard'
import { EmptyState } from '@/components/ui/EmptyState'
import { TimelineFeed } from '@/components/timeline/TimelineFeed'
import { AddOpportunityDialog, OpportunityDetailDialog, type OwnerOption } from '@/pages/Opportunities'
import { RuntimeCustomFieldValues } from '@/components/custom-fields/RuntimeCustomFields'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { RuntimeCustomField, listRuntimeCustomFields } from '@/services/contentGovernance'
import { AlertRecord, evaluateAlerts, getAlerts, updateAlertStatus } from '@/services/alerts'
import { recalculateAccountScore } from '@/services/scoringSignalsTasks'
import type { ScoreRead } from '@/services/scoringSignalsTasks'
import { getAccountTimeline } from '@/services/timeline'
import { useGovernanceStore } from '@/stores/governanceStore'
import { useOpportunityStore } from '@/stores/opportunityStore'
import { useUIStore } from '@/stores/uiStore'
import { Account } from '@/types/account'
import { TimelineEntry } from '@/types/timeline'
import { formatCompactCurrency, formatCurrency, formatDate } from '@/utils/formatters'

export const accountDetailTabs = ['Overview', 'Engagement', 'Stakeholders', 'KYC', 'Health', 'Stage', 'Opportunities', 'Governance', 'Education', 'Timeline', 'Notes', 'Documents'] as const

type AccountDetailTab = typeof accountDetailTabs[number]
type StageWorkspaceTab = 'Growth' | 'Retention'

const accountDetailTabAliases: Record<string, AccountDetailTab> = {
  engagements: 'Engagement',
  growth: 'Stage',
  retention: 'Stage',
  renewal: 'Stage',
  planning: 'Stage',
  escalation: 'Overview',
}

export function resolveAccountDetailTab(value?: string | null): AccountDetailTab {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return 'Overview'
  return accountDetailTabs.find(tab => tab.toLowerCase() === normalized) ?? accountDetailTabAliases[normalized] ?? 'Overview'
}

export function resolveStageWorkspaceTab(value?: string | null): StageWorkspaceTab {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'retention' || normalized === 'renewal') return 'Retention'
  return 'Growth'
}

export function scoreReadToAccountHealth(score: ScoreRead, fallback: Account['health']): Account['health'] {
  const scoreByKey = Object.fromEntries(score.drivers.map(driver => [driver.key, driver.score]))
  const driverScore = (...keys: string[]) => {
    for (const key of keys) {
      const value = scoreByKey[key]
      if (typeof value === 'number' && Number.isFinite(value)) return value
    }
    return undefined
  }
  const commercialDrivers = [
    driverScore('contract_health_score', 'contract_health', 'contract'),
    driverScore('account_risk_score', 'risk_score', 'commercial'),
  ].filter((value): value is number => value !== undefined)
  const commercial = commercialDrivers.length
    ? Math.round(commercialDrivers.reduce((sum, value) => sum + value, 0) / commercialDrivers.length)
    : driverScore('commercial_score', 'commercial')

  return {
    overall: score.overall,
    relationship: driverScore('relationship_score', 'relationship') ?? fallback.relationship,
    usage: driverScore('service_line_score', 'service_lines_score', 'usage') ?? fallback.usage,
    delivery: driverScore('resource_score', 'resource_health', 'resource', 'delivery') ?? fallback.delivery,
    commercial: commercial ?? fallback.commercial,
  }
}

export function Account360({ account }: { account: Account }) {
  const { token } = useAuth()
  const user = useRole()
  const [searchParams, setSearchParams] = useSearchParams()
  const [savingHealth, setSavingHealth] = useState(false)
  const [accountCustomFields, setAccountCustomFields] = useState<RuntimeCustomField[]>([])
  const [accountAlerts, setAccountAlerts] = useState<AlertRecord[]>([])
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([])
  const [currentHealth, setCurrentHealth] = useState(account.health)
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertActionId, setAlertActionId] = useState('')
  const requestedTab = searchParams.get('tab')
  const requestedAlertId = searchParams.get('alert')
  const [activeTab, setActiveTab] = useState<AccountDetailTab>(() => resolveAccountDetailTab(requestedTab))
  const [stageWorkspaceTab, setStageWorkspaceTab] = useState<StageWorkspaceTab>(() => resolveStageWorkspaceTab(requestedTab))
  const allOpportunities = useOpportunityStore(state => state.opportunities)
  const opportunityTypes = useOpportunityStore(state => state.types)
  const opportunities = useMemo(() => allOpportunities.filter(item => item.accountId === account.id), [account.id, allOpportunities])
  const governanceEvents = useGovernanceStore(state => state.events)
  const setActiveAccountId = useUIStore(state => state.setActiveAccountId)
  const visibleEntries = timelineEntries
  const accountGovernance = useMemo(
    () =>
      governanceEvents
        .filter(event => event.accountId === account.id)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [account.id, governanceEvents],
  )
  const nextGovernance = accountGovernance.find(event => new Date(event.date) >= new Date()) ?? accountGovernance[0]
  const openOpportunityValue = opportunities
    .filter(opportunity => opportunity.stage !== 'Won' && opportunity.stage !== 'Lost')
    .reduce((sum, opportunity) => sum + opportunity.estimatedValue, 0)
  const recentDecisions = visibleEntries.filter(entry => entry.eventType === 'approval_event' || entry.eventType === 'executive_event').length
  const focusedAlert = accountAlerts.find(alert => alert.id === requestedAlertId) ?? null
  const healthDimensions = [
    { key: 'relationship', label: 'Relationship', value: currentHealth.relationship },
    { key: 'usage', label: 'Usage', value: currentHealth.usage },
    { key: 'delivery', label: 'Delivery', value: currentHealth.delivery },
    { key: 'commercial', label: 'Commercial', value: currentHealth.commercial },
  ]
  const riskTone =
    account.riskStatus === 'critical'
      ? 'border-rag-red/20 bg-rag-red/10 text-rag-red'
      : account.riskStatus === 'warning'
        ? 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange'
      : 'border-rag-green/20 bg-rag-green/10 text-rag-green'
  const [selectedOpportunityId, setSelectedOpportunityId] = useState('')
  const selectedOpportunity = opportunities.find(opportunity => opportunity.id === selectedOpportunityId) ?? null
  const ownerOptions = useMemo(() => {
    const options = new Map<string, OwnerOption>()
    if (user.id) options.set(user.id, { id: user.id, name: user.name, email: user.email })
    if (account.ownerId) options.set(account.ownerId, { id: account.ownerId, name: account.ownerName, email: account.ownerEmail })
    return Array.from(options.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [account.ownerEmail, account.ownerId, account.ownerName, user.email, user.id, user.name])
  const displayAccount = useMemo(() => ({ ...account, health: currentHealth }), [account, currentHealth])

  const refreshAccountAlerts = useCallback(async () => {
    if (!token) {
      setAccountAlerts([])
      return
    }
    setAlertsLoading(true)
    try {
      const result = await getAlerts(token, { account_id: account.id, status: 'active', page: 1, page_size: 25 })
      setAccountAlerts(result.items)
    } catch {
      setAccountAlerts([])
    } finally {
      setAlertsLoading(false)
    }
  }, [account.id, token])

  useEffect(() => {
    setActiveAccountId(account.id)
  }, [account.id, setActiveAccountId])

  useEffect(() => {
    setCurrentHealth(account.health)
  }, [account.health, account.id])

  useEffect(() => {
    if (!token) {
      setTimelineEntries([])
      return
    }
    let cancelled = false
    getAccountTimeline(token, account.id, { page: 1, page_size: 25, direction: 'desc' })
      .then(result => {
        if (!cancelled) setTimelineEntries(result.items)
      })
      .catch(() => {
        if (!cancelled) setTimelineEntries([])
      })
    return () => {
      cancelled = true
    }
  }, [account.id, token])

  useEffect(() => {
    if (!token) {
      setAccountCustomFields([])
      return
    }
    let cancelled = false
    listRuntimeCustomFields(token, 'accounts')
      .then(fields => {
        if (!cancelled) setAccountCustomFields(Array.isArray(fields) ? fields : [])
      })
      .catch(() => {
        if (!cancelled) setAccountCustomFields([])
      })
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    refreshAccountAlerts()
  }, [refreshAccountAlerts])

  useEffect(() => {
    setActiveTab(resolveAccountDetailTab(requestedTab))
    if (resolveAccountDetailTab(requestedTab) === 'Stage') setStageWorkspaceTab(resolveStageWorkspaceTab(requestedTab))
  }, [requestedTab])

  function changeTab(value: string) {
    const nextTab = resolveAccountDetailTab(value)
    setActiveTab(nextTab)
    const next = new URLSearchParams(searchParams)
    if (nextTab === 'Overview') next.delete('tab')
    else next.set('tab', nextTab.toLowerCase())
    setSearchParams(next, { replace: true })
  }

  function changeStageWorkspace(value: string) {
    const nextTab = resolveStageWorkspaceTab(value)
    setStageWorkspaceTab(nextTab)
    const next = new URLSearchParams(searchParams)
    next.set('tab', nextTab.toLowerCase())
    setSearchParams(next, { replace: true })
  }

  function openAlertDetails(alertId: string) {
    const next = new URLSearchParams(searchParams)
    next.set('tab', 'overview')
    next.set('alert', alertId)
    setSearchParams(next, { replace: true })
  }

  function closeAlertDetails() {
    const next = new URLSearchParams(searchParams)
    next.delete('alert')
    setSearchParams(next, { replace: true })
  }

  async function setAlertStatus(alert: AlertRecord, status: 'acknowledged' | 'snoozed' | 'resolved') {
    if (!token) return
    setAlertActionId(alert.id)
    try {
      const payload = status === 'snoozed'
        ? { status, snoozed_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), reason: 'Snoozed from alert details drawer.' }
        : { status, reason: `${status} from alert details drawer.` }
      await updateAlertStatus(token, alert.id, payload)
      await refreshAccountAlerts()
      if (status === 'resolved') closeAlertDetails()
      toast.success(`Alert ${status}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Alert status could not be updated')
    } finally {
      setAlertActionId('')
    }
  }

  async function recalcHealth() {
    setSavingHealth(true)
    try {
      if (!token) throw new Error('You must be logged in to recalculate health')
      const score = await recalculateAccountScore(token, account.id, { trigger_source: 'account_health_tab', include_signal_evaluation: true })
      setCurrentHealth(scoreReadToAccountHealth(score, currentHealth))
      await evaluateAlerts(token, { scope: 'account', account_id: account.id })
      await refreshAccountAlerts()
      toast.success('Health score recalculated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Health score recalculation failed')
    } finally {
      setSavingHealth(false)
    }
  }

  async function applyCalculatorScores(summary: ScoreCalculatorSummary) {
    setSavingHealth(true)
    try {
      if (!token) throw new Error('You must be logged in to save calculator scores')
      const score = await recalculateAccountScore(token, account.id, {
        trigger_source: 'score_calculator',
        include_signal_evaluation: true,
        manual_submission: {
          calculator_id: 'account_health',
          values: summary.platformHealth,
          evidence: summary.activityEvidence,
        },
      })
      setCurrentHealth(scoreReadToAccountHealth(score, currentHealth))
      await evaluateAlerts(token, { scope: 'account', account_id: account.id })
      await refreshAccountAlerts()
      toast.success('Calculator scores saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Calculator scores could not be saved')
    } finally {
      setSavingHealth(false)
    }
  }

  function reviewKYCData() {
    changeTab('KYC')
    toast.info('AI KYC data is ready for review')
  }

  return (
    <>
      <Tabs.Root value={activeTab} onValueChange={changeTab} className="space-y-5">
        <div className="sticky top-14 z-20 -mx-1 overflow-x-auto bg-surface-secondary/95 px-1 pb-1 pt-1 sm:top-16">
          <label className="grid gap-1 rounded-lg border border-surface-border bg-white p-2 shadow-card md:hidden">
            <span className="px-1 text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Account section</span>
            <select className="tk-input" value={activeTab} onChange={event => changeTab(event.target.value)}>
              {accountDetailTabs.map(tab => (
                <option key={tab} value={tab}>{tab}</option>
              ))}
            </select>
          </label>
          <Tabs.List
            className="hidden min-w-[1320px] gap-1 rounded-lg border border-surface-border bg-white p-1 shadow-card md:grid"
            style={{ gridTemplateColumns: `repeat(${accountDetailTabs.length}, minmax(104px, 1fr))` }}
          >
            {accountDetailTabs.map(tab => (
              <Tabs.Trigger
                key={tab}
                value={tab}
                className="flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-md px-3 text-center text-xs font-semibold text-ink-secondary transition-colors hover:bg-surface-tertiary hover:text-ink data-[state=active]:bg-brand-blue data-[state=active]:text-white"
              >
                {tab}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </div>

        <Tabs.Content value="Overview" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="tk-card overflow-hidden">
              <div className="border-b border-surface-border bg-surface-secondary p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Account command center</p>
                    <h2 className="mt-1 font-display text-3xl font-bold leading-tight text-ink">{account.name}</h2>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <AccountFlag label={account.stage} tone="blue" />
                      <AccountFlag label={account.riskStatus} tone={account.riskStatus === 'healthy' ? 'green' : account.riskStatus === 'warning' ? 'orange' : 'red'} />
                      <span className="text-xs font-medium text-ink-secondary">Owner: {account.ownerName}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid gap-0 divide-y divide-surface-border md:grid-cols-3 md:divide-x md:divide-y-0">
                <OverviewMetric icon={BriefcaseBusiness} label="ARR" value={formatCurrency(account.arr)} detail={`${formatCompactCurrency(openOpportunityValue)} open pipeline`} />
                <OverviewMetric icon={Target} label="Open opportunities" value={opportunities.length} detail={`${opportunities.filter(item => item.stage !== 'Won' && item.stage !== 'Lost').length} active pursuits`} />
                <OverviewMetric icon={CalendarClock} label="Next governance" value={nextGovernance ? formatDate(nextGovernance.date) : 'Not set'} detail={nextGovernance ? nextGovernance.type : 'Schedule from Governance'} />
              </div>
              <RuntimeCustomFieldValues fields={accountCustomFields} values={account.customFieldValues} className="m-5 bg-surface-secondary" />
              {accountAlerts.length ? (
                <div className="m-5 rounded-lg border border-brand-orange/20 bg-brand-orange/10 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-brand-orange" />
                      <div>
                        <p className="text-sm font-semibold text-ink">{accountAlerts.length} active alert{accountAlerts.length === 1 ? '' : 's'}</p>
                        <p className="mt-1 text-xs text-ink-secondary">{accountAlerts[0].title}</p>
                      </div>
                    </div>
                    <button className="tk-button-secondary bg-white" onClick={() => openAlertDetails(accountAlerts[0].id)}>
                      Alert details
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {accountAlerts.slice(0, 3).map(alert => (
                      <button key={alert.id} className="grid gap-1 rounded-md border border-brand-orange/20 bg-white px-3 py-2 text-left" onClick={() => openAlertDetails(alert.id)}>
                        <span className="text-xs font-semibold uppercase tracking-wider text-brand-orange">{alert.severity}</span>
                        <span className="text-sm font-semibold text-ink">{alert.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : alertsLoading ? (
                <div className="m-5 flex items-center gap-2 rounded-lg border border-surface-border bg-surface-secondary p-4 text-sm text-ink-secondary">
                  <Loader2 className="h-4 w-4 animate-spin" />Loading alerts
                </div>
              ) : null}
            </section>
            <section className="tk-card flex flex-col items-center justify-center p-5 text-center">
              <p className="mb-3 text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Health posture</p>
              <HealthScoreRing value={currentHealth.overall} />
              <p className="mt-4 text-sm font-semibold text-ink">Current score: {currentHealth.overall}/100</p>
              <p className="mt-1 text-xs text-ink-secondary">{recentDecisions} decision events visible in this account</p>
            </section>
          </div>
          <AIBriefCard
            account={displayAccount}
            entries={visibleEntries}
            opportunities={opportunities}
            governance={governanceEvents}
            role={user.role}
            userId={user.id}
            userName={user.name}
          />
          <KYCAgentOverview accountId={account.id} onReview={reviewKYCData} />
        </Tabs.Content>

        <Tabs.Content value="KYC">
          <div className="space-y-4">
            <KYCAssistedReview account={account} />
          </div>
        </Tabs.Content>
        <Tabs.Content value="Engagement">
          <EngagementsPanel account={account} />
        </Tabs.Content>
        <Tabs.Content value="Stakeholders">
          <StakeholderTab account={account} />
        </Tabs.Content>
        <Tabs.Content value="Health">
          <div className="space-y-4">
            <section className="tk-card p-5">
              <div className="grid gap-6 xl:grid-cols-[260px_1fr]">
                <div className="flex flex-col items-center justify-center rounded-lg bg-surface-secondary p-5 text-center">
                  <HealthScoreRing value={currentHealth.overall} size={176} />
                  <span className={`mt-4 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${riskTone}`}>
                    {account.riskStatus}
                  </span>
                </div>

                <div className="min-w-0">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Health scoring</p>
                      <h3 className="mt-1 text-base font-semibold text-ink">Current score breakdown</h3>
                      <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
                        Review the live score, complete evidence-linked activities, then save calculator changes with timeline audit.
                      </p>
                    </div>
                    <button className="tk-button-primary shrink-0" disabled={savingHealth} onClick={recalcHealth}>
                      {savingHealth ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                      Recalculate
                    </button>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <HealthDimensionMeter label="Overall" value={currentHealth.overall} prominent />
                    {healthDimensions.map(dimension => (
                      <HealthDimensionMeter key={dimension.key} label={dimension.label} value={dimension.value} />
                    ))}
                  </div>
                </div>
              </div>
            </section>
            <ScoreCalculators account={displayAccount} saving={savingHealth} onApply={applyCalculatorScores} />
            <ScoreHistoryPanel accountId={account.id} />
          </div>
        </Tabs.Content>
        <Tabs.Content value="Stage">
          <Tabs.Root value={stageWorkspaceTab} onValueChange={changeStageWorkspace} className="space-y-4">
            <Tabs.List aria-label="Stage workspace sections" className="inline-grid w-full max-w-md grid-cols-2 gap-1 rounded-lg border border-surface-border bg-white p-1 shadow-card">
              {(['Growth', 'Retention'] as const).map(tab => (
                <Tabs.Trigger
                  key={tab}
                  value={tab}
                  className="flex min-h-[44px] items-center justify-center rounded-md px-3 text-sm font-semibold text-ink-secondary transition-colors hover:bg-surface-tertiary hover:text-ink data-[state=active]:bg-brand-blue data-[state=active]:text-white"
                >
                  {tab}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <Tabs.Content value="Growth">
              <GrowthWhitespacePanel account={account} />
            </Tabs.Content>
            <Tabs.Content value="Retention">
              <RetentionPlanPanel account={account} />
            </Tabs.Content>
          </Tabs.Root>
        </Tabs.Content>
        <Tabs.Content value="Opportunities">
          <section className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-ink">Account opportunities</h2>
              <p className="mt-1 text-sm text-ink-secondary">{opportunities.length} opportunities tied to this account.</p>
            </div>
            <AddOpportunityDialog accounts={[account]} types={opportunityTypes} ownerOptions={ownerOptions} initialAccountId={account.id} onCreated={opportunity => setSelectedOpportunityId(opportunity.id)} />
          </section>
          <OpportunityBoard items={opportunities} onOpen={opportunity => setSelectedOpportunityId(opportunity.id)} />
          <OpportunityDetailDialog
            opportunity={selectedOpportunity}
            open={Boolean(selectedOpportunity)}
            onOpenChange={open => {
              if (!open) setSelectedOpportunityId('')
            }}
            types={opportunityTypes}
            ownerOptions={ownerOptions}
            onArchived={() => setSelectedOpportunityId('')}
          />
        </Tabs.Content>
        {['Education', 'Governance', 'Notes', 'Documents'].map(tab => (
          <Tabs.Content key={tab} value={tab}>
            <AccountWorkspacePanel account={account} tab={tab} />
          </Tabs.Content>
        ))}
        <Tabs.Content value="Timeline">
          <TimelineFeed accountId={account.id} />
        </Tabs.Content>
      </Tabs.Root>
      {focusedAlert ? <AlertDetailsDrawer alert={focusedAlert} busy={alertActionId === focusedAlert.id} onClose={closeAlertDetails} onStatus={status => setAlertStatus(focusedAlert, status)} /> : null}
    </>
  )
}

function AlertDetailsDrawer({ alert, busy, onClose, onStatus }: { alert: AlertRecord; busy: boolean; onClose: () => void; onStatus: (status: 'acknowledged' | 'snoozed' | 'resolved') => void }) {
  const tone =
    alert.severity === 'critical' || alert.severity === 'high'
      ? 'border-rag-red/20 bg-rag-red/10 text-rag-red'
      : alert.severity === 'medium'
        ? 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange'
        : 'border-brand-blue/20 bg-blue-tint-20 text-brand-blue'

  return (
    <div className="fixed inset-0 z-50 bg-ink/30">
      <aside className="ml-auto flex h-full w-full max-w-xl flex-col border-l border-surface-border bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-surface-border p-5">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Alert details</p>
            <h2 className="mt-1 text-lg font-bold text-ink">{alert.title}</h2>
          </div>
          <button className="tk-icon-button" onClick={onClose} aria-label="Close alert details">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${tone}`}>{alert.severity}</span>
            <span className="rounded-full border border-surface-border bg-surface-tertiary px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">{alert.status}</span>
          </div>
          <p className="text-sm leading-6 text-ink-secondary">{alert.detail}</p>
          <div className="rounded-md border border-surface-border bg-surface-secondary p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Recommended action</p>
            <p className="mt-2 text-sm text-ink">{alert.recommended_action}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Evidence</p>
            <div className="mt-2 grid gap-2">
              {alert.source_evidence_json.length ? alert.source_evidence_json.slice(0, 6).map((item, index) => (
                <div key={`${alert.id}-evidence-${index}`} className="rounded-md border border-surface-border bg-white p-3 text-xs text-ink-secondary">
                  {Object.entries(item).map(([key, value]) => (
                    <p key={key}><span className="font-semibold text-ink">{key.replace(/_/g, ' ')}:</span> {String(value)}</p>
                  ))}
                </div>
              )) : <p className="text-sm text-ink-secondary">No source evidence was attached.</p>}
            </div>
          </div>
          <div className="grid gap-2 text-xs text-ink-secondary">
            <p><span className="font-semibold text-ink">Owner:</span> {alert.owner_name ?? 'Unassigned'}</p>
            <p><span className="font-semibold text-ink">Source:</span> {alert.source_record_type.replace(/_/g, ' ')}</p>
            <p><span className="font-semibold text-ink">Last triggered:</span> {formatDate(alert.last_triggered_at)}</p>
          </div>
        </div>
        <div className="grid gap-2 border-t border-surface-border p-5 sm:grid-cols-3">
          <button className="tk-button-secondary justify-center" disabled={busy || alert.status === 'acknowledged'} onClick={() => onStatus('acknowledged')}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Acknowledge
          </button>
          <button className="tk-button-secondary justify-center" disabled={busy || alert.status === 'snoozed'} onClick={() => onStatus('snoozed')}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}
            Snooze
          </button>
          <button className="tk-button-primary justify-center" disabled={busy} onClick={() => onStatus('resolved')}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Resolve
          </button>
        </div>
      </aside>
    </div>
  )
}

function HealthDimensionMeter({ label, value, prominent = false }: { label: string; value: number; prominent?: boolean }) {
  const tone = value < 60 ? 'bg-brand-orange' : 'bg-brand-blue'

  return (
    <div className={prominent ? 'rounded-lg bg-surface-secondary p-4 sm:col-span-2' : 'rounded-md bg-surface-secondary p-3'}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className={prominent ? 'text-sm font-semibold text-ink' : 'text-sm font-medium text-ink'}>{label}</span>
        <span className={prominent ? 'font-display text-3xl font-bold text-ink' : 'text-sm font-semibold text-ink'}>{value}</span>
      </div>
      <div className="h-2 rounded-full bg-surface-tertiary">
        <div className={`h-2 rounded-full ${tone}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

function OverviewMetric({ icon: Icon, label, value, detail }: { icon: typeof BriefcaseBusiness; label: string; value: string | number; detail: string }) {
  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
          <p className="mt-1 font-display text-2xl font-bold leading-none text-ink">{value}</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-tint-20 text-brand-blue">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-secondary">{detail}</p>
    </div>
  )
}

function AccountFlag({ label, tone }: { label: string; tone: 'blue' | 'green' | 'orange' | 'red' }) {
  const toneClass = {
    blue: 'border-blue-tint-20 bg-blue-tint-20 text-brand-blue',
    green: 'border-rag-green/20 bg-rag-green/10 text-rag-green',
    orange: 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange',
    red: 'border-rag-red/20 bg-rag-red/10 text-rag-red',
  }[tone]

  return <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${toneClass}`}>{label}</span>
}

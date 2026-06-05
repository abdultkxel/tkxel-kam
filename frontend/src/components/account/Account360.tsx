import * as Tabs from '@radix-ui/react-tabs'
import { AlertTriangle, BriefcaseBusiness, CalendarClock, CalendarPlus, FileText, Loader2, PhoneCall, RefreshCcw, Target } from 'lucide-react'
import { nanoid } from 'nanoid'
import { useEffect, useMemo, useState } from 'react'
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
import { HandoverSummary } from '@/components/timeline/HandoverSummary'
import { AddOpportunityDialog, OpportunityDetailDialog, type OwnerOption } from '@/pages/Opportunities'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { recalculateAccountScore, ScoreRead } from '@/services/scoringSignalsTasks'
import { useAccountStore } from '@/stores/accountStore'
import { useAlertStore } from '@/stores/alertStore'
import { useGovernanceStore } from '@/stores/governanceStore'
import { useOpportunityStore } from '@/stores/opportunityStore'
import { useScoreStore } from '@/stores/scoreStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { useUIStore } from '@/stores/uiStore'
import { Account } from '@/types/account'
import { canViewTimelineEntry } from '@/types/timeline'
import { emit } from '@/utils/emitTimelineEvent'
import { emitTimelineEvent } from '@/utils/emitTimelineEvent'
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

export function Account360({ account }: { account: Account }) {
  const { token } = useAuth()
  const user = useRole()
  const [searchParams, setSearchParams] = useSearchParams()
  const [handoverOpen, setHandoverOpen] = useState(false)
  const [savingHealth, setSavingHealth] = useState(false)
  const requestedTab = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState<AccountDetailTab>(() => resolveAccountDetailTab(requestedTab))
  const [stageWorkspaceTab, setStageWorkspaceTab] = useState<StageWorkspaceTab>(() => resolveStageWorkspaceTab(requestedTab))
  const setHealth = useAccountStore(state => state.setHealth)
  const addScoreSnapshot = useScoreStore(state => state.addSnapshot)
  const evaluateAccount = useAlertStore(state => state.evaluateAccount)
  const alerts = useAlertStore(state => state.alerts)
  const allOpportunities = useOpportunityStore(state => state.opportunities)
  const opportunityTypes = useOpportunityStore(state => state.types)
  const opportunities = useMemo(() => allOpportunities.filter(item => item.accountId === account.id), [account.id, allOpportunities])
  const governanceEvents = useGovernanceStore(state => state.events)
  const entries = useTimelineStore(state => state.entries)
  const setActiveAccountId = useUIStore(state => state.setActiveAccountId)
  const visibleEntries = useMemo(
    () =>
      entries
        .filter(entry => entry.accountId === account.id)
        .filter(entry => canViewTimelineEntry(entry, user.role, user.id))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [account.id, entries, user.id, user.role],
  )
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
  const privileged = user.role === 'leadership' || user.role === 'admin' || user.role === 'super_admin'
  const accountAlerts = useMemo(
    () => alerts.filter(alert => alert.accountId === account.id && !alert.dismissedAt),
    [account.id, alerts],
  )
  const healthDimensions = [
    { key: 'relationship', label: 'Relationship', value: account.health.relationship },
    { key: 'usage', label: 'Usage', value: account.health.usage },
    { key: 'delivery', label: 'Delivery', value: account.health.delivery },
    { key: 'commercial', label: 'Commercial', value: account.health.commercial },
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

  function healthFromScore(score: ScoreRead) {
    const scoreByKey = Object.fromEntries(score.drivers.map(driver => [driver.key, driver.score]))
    return {
      overall: score.overall,
      relationship: Number(scoreByKey.relationship ?? account.health.relationship),
      usage: Number(scoreByKey.usage ?? account.health.usage),
      delivery: Number(scoreByKey.delivery ?? account.health.delivery),
      commercial: Number(scoreByKey.commercial ?? account.health.commercial),
    }
  }

  useEffect(() => {
    setActiveAccountId(account.id)
  }, [account.id, setActiveAccountId])

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

  async function recalcHealth() {
    setSavingHealth(true)
    const before = { ...account.health, scoringVersion: 'v1.3' }
    try {
      if (!token) throw new Error('You must be logged in to recalculate health')
      const score = await recalculateAccountScore(token, account.id, { trigger_source: 'account_health_tab', include_signal_evaluation: true })
      const after = { ...healthFromScore(score), scoringVersion: score.metric_version }
      setHealth(account.id, after)
      const entry = emit.scoreChanged(account.id, user.id, user.name, before, after, score.metric_version)
      addScoreSnapshot({
        id: score.latest_snapshot?.id ?? `score-${nanoid(8)}`,
        accountId: account.id,
        timestamp: score.latest_snapshot?.calculated_at ?? entry.timestamp,
        overall: after.overall,
        dimensions: {
          relationship: after.relationship,
          usage: after.usage,
          delivery: after.delivery,
          commercial: after.commercial,
        },
        calculatorVersion: score.metric_version,
        changedBy: user.id,
        changedByName: score.latest_snapshot?.calculated_by_name ?? user.name,
        triggerEntryId: entry.id,
      })
      evaluateAccount({ ...account, health: after }, [entry, ...entries])
      toast.success('Health score recalculated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Health score recalculation failed')
    } finally {
      setSavingHealth(false)
    }
  }

  async function applyCalculatorScores(summary: ScoreCalculatorSummary) {
    setSavingHealth(true)
    const before = { ...account.health, scoringVersion: 'v1.3' }
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
      const after = healthFromScore(score)
      const afterValue = {
        ...after,
        scoringVersion: score.metric_version,
        calculatorBreakdown: {
          relationship: summary.relationship,
          contract: summary.contract,
          resource: summary.resource,
          csat: summary.csat,
          risk: summary.risk,
          overallLegacyScore: summary.overallLegacyScore,
          legacyOverall: summary.legacyOverall,
          serviceCoverage: summary.serviceCoverage,
          selectedServiceLines: summary.selectedServiceLines,
          activityEvidence: summary.activityEvidence,
        },
      }
      setHealth(account.id, after)
      const entry = emit.scoreChanged(account.id, user.id, user.name, before, afterValue, score.metric_version)
      addScoreSnapshot({
        id: score.latest_snapshot?.id ?? `score-${nanoid(8)}`,
        accountId: account.id,
        timestamp: score.latest_snapshot?.calculated_at ?? entry.timestamp,
        overall: after.overall,
        dimensions: {
          relationship: after.relationship,
          usage: after.usage,
          delivery: after.delivery,
          commercial: after.commercial,
        },
        calculatorVersion: score.metric_version,
        changedBy: user.id,
        changedByName: score.latest_snapshot?.calculated_by_name ?? user.name,
        triggerEntryId: entry.id,
      })
      evaluateAccount({ ...account, health: after }, [entry, ...entries])
      toast.success('Calculator scores saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Calculator scores could not be saved')
    } finally {
      setSavingHealth(false)
    }
  }

  function handleAlertAction(action: string) {
    if (action === 'Log a check-in call') {
      emitTimelineEvent({
        accountId: account.id,
        eventType: 'manual_note',
        module: 'activity',
        title: 'Check-in call logged from alert',
        description: 'Alert action completed: check-in call recorded for follow-up.',
        performedBy: user.id,
        performedByName: user.name,
        tags: ['alert-action', 'check-in'],
        isSensitive: false,
        isSystemGenerated: false,
        isImmutable: false,
      })
      toast.success('Check-in call logged')
      return
    }
    if (action === 'Schedule QBR') {
      emitTimelineEvent({
        accountId: account.id,
        eventType: 'governance_event',
        module: 'governance',
        title: 'QBR scheduled from alert',
        description: 'Alert action completed: QBR scheduling workflow started for this account.',
        performedBy: user.id,
        performedByName: user.name,
        sourceRecordType: 'governance',
        sourceRecordRoute: '/governance',
        tags: ['alert-action', 'qbr'],
        isSensitive: false,
        isSystemGenerated: true,
        isImmutable: false,
      })
      toast.success('QBR scheduling action recorded')
      return
    }
    emitTimelineEvent({
      accountId: account.id,
      eventType: 'retention_event',
      module: 'stage',
      title: `${action} started`,
      description: `Alert action completed: ${action}.`,
      performedBy: user.id,
      performedByName: user.name,
      tags: ['alert-action'],
      isSensitive: false,
      isSystemGenerated: false,
      isImmutable: false,
    })
    toast.success(`${action} started`)
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
                  {privileged ? (
                    <button className="tk-button-primary" onClick={() => setHandoverOpen(true)}>
                      <FileText className="h-4 w-4" />
                      Generate handover
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-0 divide-y divide-surface-border md:grid-cols-3 md:divide-x md:divide-y-0">
                <OverviewMetric icon={BriefcaseBusiness} label="ARR" value={formatCurrency(account.arr)} detail={`${formatCompactCurrency(openOpportunityValue)} open pipeline`} />
                <OverviewMetric icon={Target} label="Open opportunities" value={opportunities.length} detail={`${opportunities.filter(item => item.stage !== 'Won' && item.stage !== 'Lost').length} active pursuits`} />
                <OverviewMetric icon={CalendarClock} label="Next governance" value={nextGovernance ? formatDate(nextGovernance.date) : 'Not set'} detail={nextGovernance ? nextGovernance.type : 'Schedule from Governance'} />
              </div>
              {accountAlerts.length ? (
                <div className="m-5 rounded-lg border border-brand-orange/20 bg-brand-orange/10 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-brand-orange" />
                      <div>
                        <p className="text-sm font-semibold text-ink">{accountAlerts.length} active alerts</p>
                        <p className="mt-1 text-xs text-ink-secondary">{accountAlerts[0].headline}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {accountAlerts[0].suggestedActions.slice(0, 3).map(action => (
                        <button key={action} className="tk-button-secondary bg-white" onClick={() => handleAlertAction(action)}>
                          {action === 'Schedule QBR' ? <CalendarPlus className="h-4 w-4" /> : <PhoneCall className="h-4 w-4" />}
                          {action}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
            <section className="tk-card flex flex-col items-center justify-center p-5 text-center">
              <p className="mb-3 text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Health posture</p>
              <HealthScoreRing value={account.health.overall} />
              <p className="mt-4 text-sm font-semibold text-ink">Current score: {account.health.overall}/100</p>
              <p className="mt-1 text-xs text-ink-secondary">{recentDecisions} decision events visible in this account</p>
            </section>
          </div>
          <AIBriefCard
            account={account}
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
                  <HealthScoreRing value={account.health.overall} size={176} />
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
                    <HealthDimensionMeter label="Overall" value={account.health.overall} prominent />
                    {healthDimensions.map(dimension => (
                      <HealthDimensionMeter key={dimension.key} label={dimension.label} value={dimension.value} />
                    ))}
                  </div>
                </div>
              </div>
            </section>
            <ScoreCalculators account={account} saving={savingHealth} onApply={applyCalculatorScores} />
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

      <HandoverSummary account={account} entries={visibleEntries} opportunities={opportunities} open={handoverOpen} onOpenChange={setHandoverOpen} />
    </>
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

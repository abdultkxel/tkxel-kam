import * as Tabs from '@radix-ui/react-tabs'
import { differenceInCalendarDays } from 'date-fns'
import { AlertTriangle, ArrowRight, BriefcaseBusiness, CalendarClock, CalendarPlus, CheckCircle2, Clock3, FileText, History, Loader2, PhoneCall, RefreshCcw, ShieldCheck, Sparkles, Target, TrendingUp } from 'lucide-react'
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
import { useNotificationStore } from '@/stores/notificationStore'
import { useOpportunityStore } from '@/stores/opportunityStore'
import { useScoreStore } from '@/stores/scoreStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { useUIStore } from '@/stores/uiStore'
import { useV3Store } from '@/stores/v3Store'
import { Account, AccountStage } from '@/types/account'
import { canViewTimelineEntry } from '@/types/timeline'
import { EngagementRecord, KYCDraft, SourceDocument } from '@/types/v3'
import { emit } from '@/utils/emitTimelineEvent'
import { emitTimelineEvent } from '@/utils/emitTimelineEvent'
import { formatCompactCurrency, formatCurrency, formatDate, formatRelative } from '@/utils/formatters'

const tabs = ['Overview', 'Engagements', 'KYC', 'Health', 'Stage', 'Opportunities', 'Education', 'Escalation', 'Governance', 'Notes', 'Timeline', 'Documents']

export function Account360({ account }: { account: Account }) {
  const { token } = useAuth()
  const user = useRole()
  const [searchParams, setSearchParams] = useSearchParams()
  const [handoverOpen, setHandoverOpen] = useState(false)
  const [savingHealth, setSavingHealth] = useState(false)
  const [savingStage, setSavingStage] = useState(false)
  const requestedTab = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState(() => tabs.find(tab => tab.toLowerCase() === requestedTab?.toLowerCase()) ?? 'Overview')
  const setHealth = useAccountStore(state => state.setHealth)
  const setStage = useAccountStore(state => state.setStage)
  const addNotification = useNotificationStore(state => state.addNotification)
  const addScoreSnapshot = useScoreStore(state => state.addSnapshot)
  const evaluateAccount = useAlertStore(state => state.evaluateAccount)
  const alerts = useAlertStore(state => state.alerts)
  const allOpportunities = useOpportunityStore(state => state.opportunities)
  const opportunityTypes = useOpportunityStore(state => state.types)
  const opportunities = useMemo(() => allOpportunities.filter(item => item.accountId === account.id), [account.id, allOpportunities])
  const governanceEvents = useGovernanceStore(state => state.events)
  const entries = useTimelineStore(state => state.entries)
  const setActiveAccountId = useUIStore(state => state.setActiveAccountId)
  const v3Engagements = useV3Store(state => state.engagements)
  const sourceDocuments = useV3Store(state => state.sourceDocuments)
  const onboardingDrafts = useV3Store(state => state.onboardingDrafts)
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
  const latestEntry = visibleEntries[0]
  const accountEngagements = useMemo(
    () => v3Engagements.filter(engagement => engagement.accountId === account.id),
    [account.id, v3Engagements],
  )
  const accountDocuments = useMemo(
    () => sourceDocuments.filter(document => document.accountId === account.id),
    [account.id, sourceDocuments],
  )
  const accountKYCDraft = useMemo(
    () => onboardingDrafts.map(draft => draft.kycDraft).find(draft => draft.accountId === account.id),
    [account.id, onboardingDrafts],
  )
  const stagePrediction = useMemo(
    () => buildStagePrediction(account, accountEngagements, accountDocuments, visibleEntries, opportunities, accountKYCDraft),
    [account, accountDocuments, accountEngagements, accountKYCDraft, opportunities, visibleEntries],
  )
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
    const nextTab = tabs.find(tab => tab.toLowerCase() === requestedTab?.toLowerCase())
    if (nextTab) setActiveTab(nextTab)
  }, [requestedTab])

  function changeTab(value: string) {
    setActiveTab(value)
    const next = new URLSearchParams(searchParams)
    if (value === 'Overview') next.delete('tab')
    else next.set('tab', value.toLowerCase())
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

  async function transitionStage() {
    setSavingStage(true)
    const next: AccountStage = stagePrediction.predictedStage !== account.stage ? stagePrediction.predictedStage : account.stage === 'Expansion' ? 'Renewal' : 'Expansion'
    await new Promise(resolve => window.setTimeout(resolve, 450))
    setStage(account.id, next)
    const entry = emit.stageChanged(account.id, user.id, user.name, account.stage, next, `AI stage prediction reviewed: ${stagePrediction.basis}`, false, 'stage-v2.1')
    evaluateAccount({ ...account, stage: next }, [entry, ...entries])
    addNotification({
      userId: account.ownerId,
      trigger: 'account_stage_changed',
      sentence: `${account.name} moved to ${next}`,
      accountId: account.id,
      accountName: account.name,
      contentPreview: 'Stage criteria reviewed and updated.',
      route: `/accounts/${account.id}`,
    })
    setSavingStage(false)
    toast.success('Stage updated')
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
              {tabs.map(tab => (
                <option key={tab} value={tab}>{tab}</option>
              ))}
            </select>
          </label>
          <Tabs.List
            className="hidden min-w-[1210px] gap-1 rounded-lg border border-surface-border bg-white p-1 shadow-card md:grid"
            style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(104px, 1fr))` }}
          >
            {tabs.map(tab => (
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
              <div className="grid gap-0 divide-y divide-surface-border md:grid-cols-4 md:divide-x md:divide-y-0">
                <OverviewMetric icon={BriefcaseBusiness} label="ARR" value={formatCurrency(account.arr)} detail={`${formatCompactCurrency(openOpportunityValue)} open pipeline`} />
                <OverviewMetric icon={Target} label="Open opportunities" value={opportunities.length} detail={`${opportunities.filter(item => item.stage !== 'Won' && item.stage !== 'Lost').length} active pursuits`} />
                <OverviewMetric icon={CalendarClock} label="Next governance" value={nextGovernance ? formatDate(nextGovernance.date) : 'Not set'} detail={nextGovernance ? nextGovernance.type : 'Schedule from Governance'} />
                <OverviewMetric icon={History} label="Timeline" value={visibleEntries.length} detail={latestEntry ? `Last event ${formatRelative(latestEntry.timestamp)}` : 'No events yet'} />
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
        <Tabs.Content value="Engagements">
          <EngagementsPanel account={account} />
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
          <section className="tk-card overflow-hidden">
            <div className="border-b border-surface-border bg-surface-secondary p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Stage control</p>
                  <h3 className="mt-1 font-display text-3xl font-bold text-ink">{account.stage}</h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-secondary">
                    Stage changes are immutable timeline events. Review AI prediction, source evidence, and governance context before transition.
                  </p>
                </div>
                <button className="tk-button-primary shrink-0" disabled={savingStage} onClick={transitionStage}>
                  {savingStage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  Apply stage review
                </button>
              </div>
            </div>
            <div className="grid gap-5 p-5">
              <div>
                <h4 className="text-sm font-semibold text-ink">Lifecycle path</h4>
                <StagePath current={account.stage} />
              </div>
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <StagePredictionCard prediction={stagePrediction} />
                <div className="rounded-lg border border-surface-border bg-white p-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-brand-blue" />
                    <h4 className="text-sm font-semibold text-ink">Transition checklist</h4>
                  </div>
                  <div className="mt-4 grid gap-3">
                    <StageCheck label="Health evidence reviewed" done={account.health.overall >= 70} />
                    <StageCheck label="Governance cadence available" done={Boolean(nextGovernance)} />
                    <StageCheck label="Recent timeline activity present" done={Boolean(latestEntry)} />
                    <StageCheck label="Source documents reviewed" done={accountDocuments.length > 0} />
                  </div>
                </div>
              </div>
            </div>
          </section>
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

type StagePrediction = {
  predictedStage: AccountStage
  confidence: number
  basis: string
  factors: { label: string; value: string; tone: 'blue' | 'green' | 'orange' | 'red' }[]
  evidence: { label: string; detail: string; tone: 'blue' | 'green' | 'orange' | 'red' }[]
  nextActions: string[]
}

function StagePredictionCard({ prediction }: { prediction: StagePrediction }) {
  return (
    <section className="rounded-lg border border-blue-tint-20 bg-blue-tint-20 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-blue" />
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">AI stage prediction</p>
          </div>
          <h4 className="mt-2 text-xl font-semibold text-ink">{prediction.predictedStage}</h4>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">{prediction.basis}</p>
        </div>
        <div className="min-w-[180px] rounded-lg border border-surface-border bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">Confidence</p>
          <p className="mt-1 font-display text-3xl font-bold leading-none text-brand-blue">{prediction.confidence}%</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-tertiary">
            <div className="h-full rounded-full bg-brand-blue" style={{ width: `${prediction.confidence}%` }} />
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {prediction.factors.map(factor => (
          <div key={factor.label} className="rounded-lg border border-surface-border bg-white p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{factor.label}</p>
            <p className={`mt-1 text-sm font-semibold ${stageToneText(factor.tone)}`}>{factor.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="rounded-lg border border-surface-border bg-white p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-brand-blue" />
            <h5 className="text-sm font-semibold text-ink">Prediction evidence</h5>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {prediction.evidence.map(item => (
              <div key={item.label} className="rounded-md bg-surface-secondary p-3">
                <p className={`text-xs font-semibold uppercase tracking-wider ${stageToneText(item.tone)}`}>{item.label}</p>
                <p className="mt-1 text-sm leading-5 text-ink-secondary">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-surface-border bg-white p-4">
          <h5 className="text-sm font-semibold text-ink">Recommended next actions</h5>
          <div className="mt-3 space-y-2">
            {prediction.nextActions.map(action => (
              <div key={action} className="flex items-start gap-2 rounded-md bg-surface-secondary p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />
                <p className="text-sm leading-5 text-ink-secondary">{action}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function buildStagePrediction(
  account: Account,
  engagements: EngagementRecord[],
  documents: SourceDocument[],
  entries: ReturnType<typeof useTimelineStore.getState>['entries'],
  opportunities: ReturnType<typeof useOpportunityStore.getState>['opportunities'],
  kycDraft?: KYCDraft,
): StagePrediction {
  const today = new Date()
  const openPipeline = opportunities
    .filter(opportunity => opportunity.stage !== 'Won' && opportunity.stage !== 'Lost')
    .reduce((sum, opportunity) => sum + opportunity.estimatedValue, 0)
  const recentChanges = entries.filter(entry => differenceInCalendarDays(today, new Date(entry.timestamp)) <= 45)
  const sowDocuments = documents.filter(document => document.type === 'sow')
  const soonestRenewal = engagements
    .map(engagement => ({
      engagement,
      noticeDays: differenceInCalendarDays(new Date(engagement.renewalTerms.noticeDeadline), today),
      expiryDays: differenceInCalendarDays(new Date(engagement.renewalTerms.endDate), today),
    }))
    .sort((a, b) => a.noticeDays - b.noticeDays)[0]
  const kycConfidence = kycDraft?.confidence ?? (documents.length ? Math.round(documents.reduce((sum, document) => sum + document.confidence, 0) / documents.length) : 58)
  const fundingText = kycDraft?.sections.funding ?? account.risks.find(risk => /fund|payment|commercial|pricing|finance/i.test(risk)) ?? 'No verified funding note attached yet.'

  let predictedStage: AccountStage = account.stage
  if (account.riskStatus === 'critical' || account.health.overall < 58) predictedStage = 'At Risk'
  else if (soonestRenewal && soonestRenewal.noticeDays <= 60) predictedStage = soonestRenewal.noticeDays <= 30 ? 'Renewal Focus' : 'Renewal'
  else if (openPipeline >= Math.max(account.arr * 0.2, 250000) && account.health.relationship >= 70) predictedStage = 'Expansion'
  else if (account.stage === 'Onboarding' && kycConfidence >= 80 && documents.length >= 2) predictedStage = 'Adoption'
  else if (account.stage === 'Onboarding') predictedStage = 'Onboarding'
  else if (account.health.overall >= 74 && recentChanges.length >= 2) predictedStage = 'Active'

  const renewalDetail = soonestRenewal
    ? `${soonestRenewal.engagement.name}: notice ${soonestRenewal.noticeDays}d, expiry ${soonestRenewal.expiryDays}d.`
    : 'No SOW renewal terms detected for this account.'
  const basis = `Prediction uses ${documents.length} source document${documents.length === 1 ? '' : 's'}, ${sowDocuments.length} SOW${sowDocuments.length === 1 ? '' : 's'}, ${recentChanges.length} recent timeline change${recentChanges.length === 1 ? '' : 's'}, KYC confidence ${kycConfidence}%, and ${formatCompactCurrency(openPipeline)} open pipeline.`
  const confidence = Math.min(94, Math.max(58, Math.round((kycConfidence * 0.36) + (documents.length ? 22 : 8) + (recentChanges.length ? 12 : 4) + (openPipeline ? 10 : 4) + (soonestRenewal ? 12 : 5))))

  return {
    predictedStage,
    confidence,
    basis,
    factors: [
      { label: 'KYC', value: `${kycConfidence}% confidence`, tone: kycConfidence >= 80 ? 'green' : 'orange' },
      { label: 'SOW posture', value: soonestRenewal ? `${soonestRenewal.noticeDays}d notice` : 'Not detected', tone: soonestRenewal && soonestRenewal.noticeDays <= 60 ? 'orange' : 'blue' },
      { label: 'Recent changes', value: `${recentChanges.length} events`, tone: recentChanges.length ? 'blue' : 'orange' },
      { label: 'Pipeline', value: formatCompactCurrency(openPipeline), tone: openPipeline ? 'green' : 'blue' },
    ],
    evidence: [
      { label: 'KYC research', detail: kycDraft ? kycDraft.sections.market : 'KYC enrichment is not yet fully source-backed for this account.', tone: kycDraft ? 'green' : 'orange' },
      { label: 'SOW renewal', detail: renewalDetail, tone: soonestRenewal && soonestRenewal.noticeDays <= 60 ? 'orange' : 'blue' },
      { label: 'Recent changes', detail: recentChanges[0] ? `${recentChanges[0].title}: ${recentChanges[0].description}` : 'No recent timeline change found in the visible account history.', tone: recentChanges[0] ? 'blue' : 'orange' },
      { label: 'Funding context', detail: fundingText, tone: /missing|risk|delay|not verified|No verified/i.test(fundingText) ? 'orange' : 'green' },
    ],
    nextActions: [
      predictedStage === account.stage ? `Keep ${account.stage} and review again after the next governance or score update.` : `Review transition from ${account.stage} to ${predictedStage}.`,
      soonestRenewal && soonestRenewal.noticeDays <= 60 ? 'Confirm renewal owner, notice deadline, and commercial exposure from the SOW.' : 'Confirm the latest SOW and renewal terms are attached.',
      kycDraft ? 'Review AI-enriched KYC citations before approving the stage change.' : 'Refresh KYC research so funding and stakeholder assumptions are source-backed.',
    ],
  }
}

function stageToneText(tone: 'blue' | 'green' | 'orange' | 'red') {
  if (tone === 'green') return 'text-rag-green'
  if (tone === 'orange') return 'text-brand-orange'
  if (tone === 'red') return 'text-rag-red'
  return 'text-brand-blue'
}

function StagePath({ current }: { current: AccountStage }) {
  const stages: AccountStage[] = ['Onboarding', 'Adoption', 'Active', 'Expansion', 'Expansion Focus', 'Renewal', 'Renewal Focus', 'At Risk']
  const currentIndex = Math.max(0, stages.indexOf(current))

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
      {stages.map((stage, index) => {
        const active = stage === current
        const complete = index < currentIndex
        return (
          <div key={stage} className={`rounded-lg border p-4 ${active ? 'border-brand-blue bg-blue-tint-20' : 'border-surface-border bg-white'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${active || complete ? 'bg-brand-blue text-white' : 'bg-surface-tertiary text-ink-secondary'}`}>
                {complete ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
              </span>
              {active ? <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-blue">Current</span> : null}
            </div>
            <p className="mt-3 text-sm font-semibold text-ink">{stage}</p>
          </div>
        )
      })}
    </div>
  )
}

function StageCheck({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-surface-secondary p-3">
      <span className="text-sm font-medium text-ink">{label}</span>
      <span className={`flex h-8 w-8 items-center justify-center rounded-full ${done ? 'bg-rag-green/10 text-rag-green' : 'bg-brand-orange/10 text-brand-orange'}`}>
        {done ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
      </span>
    </div>
  )
}

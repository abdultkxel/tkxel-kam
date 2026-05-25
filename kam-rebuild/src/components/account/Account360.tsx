import * as Tabs from '@radix-ui/react-tabs'
import { AlertTriangle, ArrowRight, CalendarPlus, FileText, Loader2, PhoneCall, RefreshCcw, ShieldCheck } from 'lucide-react'
import { nanoid } from 'nanoid'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { HealthScoreRing } from '@/components/account/HealthScoreRing'
import { KYCWorkflow } from '@/components/account/KYCWorkflow'
import { ScoreHistoryPanel } from '@/components/account/ScoreHistoryPanel'
import { ScoreCalculators, ScoreCalculatorSummary } from '@/components/account/ScoreCalculators'
import { AIBriefCard } from '@/components/ai/AIBriefCard'
import { OpportunityBoard } from '@/components/opportunities/OpportunityBoard'
import { EmptyState } from '@/components/ui/EmptyState'
import { TimelineFeed } from '@/components/timeline/TimelineFeed'
import { HandoverSummary } from '@/components/timeline/HandoverSummary'
import { useRole } from '@/hooks/useRole'
import { useAccountStore } from '@/stores/accountStore'
import { useAlertStore } from '@/stores/alertStore'
import { useGovernanceStore } from '@/stores/governanceStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useOpportunityStore } from '@/stores/opportunityStore'
import { useScoreStore } from '@/stores/scoreStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { useUIStore } from '@/stores/uiStore'
import { Account, AccountStage } from '@/types/account'
import { canViewTimelineEntry } from '@/types/timeline'
import { emit } from '@/utils/emitTimelineEvent'
import { emitTimelineEvent } from '@/utils/emitTimelineEvent'
import { formatCurrency, formatDate } from '@/utils/formatters'

const tabs = ['Overview', 'KYC', 'Health', 'Stage', 'Opportunities', 'Activities', 'Education', 'Escalation', 'Governance', 'Notes', 'Timeline', 'Documents']

export function Account360({ account }: { account: Account }) {
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
  const privileged = user.role === 'leadership' || user.role === 'admin'
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
    const after = {
      overall: Math.min(100, account.health.overall + 3),
      relationship: Math.min(100, account.health.relationship + 2),
      usage: Math.min(100, account.health.usage + 4),
      delivery: account.health.delivery,
      commercial: Math.min(100, account.health.commercial + 2),
      scoringVersion: 'v1.3',
    }
    await new Promise(resolve => window.setTimeout(resolve, 450))
    setHealth(account.id, after)
    const entry = emit.scoreChanged(account.id, user.id, user.name, before, after, 'v1.3')
    addScoreSnapshot({
      id: `score-${nanoid(8)}`,
      accountId: account.id,
      timestamp: entry.timestamp,
      overall: after.overall,
      dimensions: {
        relationship: after.relationship,
        usage: after.usage,
        delivery: after.delivery,
        commercial: after.commercial,
      },
      calculatorVersion: 'v1.3',
      changedBy: user.id,
      changedByName: user.name,
      triggerEntryId: entry.id,
    })
    evaluateAccount({ ...account, health: after }, [entry, ...entries])
    setSavingHealth(false)
    toast.success('Health score recalculated')
  }

  async function applyCalculatorScores(summary: ScoreCalculatorSummary) {
    setSavingHealth(true)
    const before = { ...account.health, scoringVersion: 'v1.3' }
    const after = summary.platformHealth
    const afterValue = {
      ...after,
      scoringVersion: 'v1.3',
      calculatorBreakdown: {
        relationship: summary.relationship,
        contract: summary.contract,
        resource: summary.resource,
        csat: summary.csat,
        risk: summary.risk,
        legacyOverall: summary.legacyOverall,
        serviceCoverage: summary.serviceCoverage,
        selectedServiceLines: summary.selectedServiceLines,
        activityEvidence: summary.activityEvidence,
      },
    }
    await new Promise(resolve => window.setTimeout(resolve, 450))
    setHealth(account.id, after)
    const entry = emit.scoreChanged(account.id, user.id, user.name, before, afterValue, 'v1.3')
    addScoreSnapshot({
      id: `score-${nanoid(8)}`,
      accountId: account.id,
      timestamp: entry.timestamp,
      overall: after.overall,
      dimensions: {
        relationship: after.relationship,
        usage: after.usage,
        delivery: after.delivery,
        commercial: after.commercial,
      },
      calculatorVersion: 'v1.3',
      changedBy: user.id,
      changedByName: user.name,
      triggerEntryId: entry.id,
    })
    evaluateAccount({ ...account, health: after }, [entry, ...entries])
    setSavingHealth(false)
    toast.success('Calculator scores saved')
  }

  async function transitionStage() {
    setSavingStage(true)
    const next: AccountStage = account.stage === 'Expansion' ? 'Renewal' : 'Expansion'
    await new Promise(resolve => window.setTimeout(resolve, 450))
    setStage(account.id, next)
    const entry = emit.stageChanged(account.id, user.id, user.name, account.stage, next, 'Stage criteria reviewed and updated.', false, 'stage-v2.1')
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

  return (
    <>
      <Tabs.Root value={activeTab} onValueChange={changeTab} className="space-y-5">
        <Tabs.List className="grid grid-cols-3 gap-1 rounded-lg border border-surface-border bg-white p-1 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12">
          {tabs.map(tab => (
            <Tabs.Trigger
              key={tab}
              value={tab}
              className="min-h-[44px] min-w-0 rounded-md px-2 text-center text-xs font-semibold text-ink-secondary transition-colors data-[state=active]:bg-brand-blue data-[state=active]:text-white sm:text-sm"
            >
              {tab}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="Overview" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
            <section className="tk-card p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Account 360</p>
                  <h2 className="font-display text-3xl font-bold text-ink">{account.name}</h2>
                  <p className="mt-2 text-sm text-ink-secondary">Stage: {account.stage} | Owner: {account.ownerName} | Next QBR: {formatDate(account.nextQbr)}</p>
                </div>
                {privileged ? (
                  <button className="tk-button-primary" onClick={() => setHandoverOpen(true)}>
                    <FileText className="h-4 w-4" />
                    Generate Handover Summary
                  </button>
                ) : null}
              </div>
              <div className="mt-6 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-surface-border p-4">
                  <p className="text-xs text-ink-secondary">ARR</p>
                  <p className="font-display text-3xl font-bold text-ink">{formatCurrency(account.arr)}</p>
                </div>
                <div className="rounded-lg border border-surface-border p-4">
                  <p className="text-xs text-ink-secondary">Open opportunities</p>
                  <p className="font-display text-3xl font-bold text-ink">{opportunities.length}</p>
                </div>
                <div className="rounded-lg border border-surface-border p-4">
                  <p className="text-xs text-ink-secondary">Visible timeline events</p>
                  <p className="font-display text-3xl font-bold text-ink">{visibleEntries.length}</p>
                </div>
              </div>
              {accountAlerts.length ? (
                <div className="mt-5 rounded-lg border border-brand-orange/20 bg-brand-orange/10 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-brand-orange" />
                      <div>
                        <p className="text-sm font-semibold text-ink">{accountAlerts.length} active alerts - view details</p>
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
            <section className="tk-card flex items-center justify-center p-5">
              <HealthScoreRing value={account.health.overall} />
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
        </Tabs.Content>

        <Tabs.Content value="KYC">
          <KYCWorkflow accountId={account.id} />
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
                        Review the live score, then use the calculators below to adjust relationship, usage, delivery, and commercial inputs.
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
          <section className="tk-card p-5">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Current stage</p>
            <h3 className="mt-1 font-display text-3xl font-bold text-ink">{account.stage}</h3>
            <button className="tk-button-primary mt-5" disabled={savingStage} onClick={transitionStage}>
              {savingStage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Transition stage
            </button>
          </section>
        </Tabs.Content>
        <Tabs.Content value="Opportunities">
          <OpportunityBoard accountId={account.id} />
        </Tabs.Content>
        {['Activities', 'Education', 'Escalation', 'Governance', 'Notes', 'Documents'].map(tab => (
          <Tabs.Content key={tab} value={tab}>
            <EmptyState icon={ShieldCheck} heading={`${tab} workspace`} body="This module has its MVP shell and will use the same mutation, loading, empty-state, and timeline emit patterns." />
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

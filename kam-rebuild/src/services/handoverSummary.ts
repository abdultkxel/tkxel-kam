import { Account, AccountStage, HealthScore } from '@/types/account'
import { Opportunity } from '@/types/opportunity'
import { TimelineEntry } from '@/types/timeline'

export interface GovernanceSnapshot {
  id: string
  title: string
  type: 'QBR' | 'SteerCo' | 'Executive Review'
  date: string
}

export interface HandoverSummaryData {
  account: Account
  generatedAt: string
  currentStage: AccountStage
  stageHistory: TimelineEntry[]
  healthScores: HealthScore
  scoreHistory: TimelineEntry[]
  openRisks: string[]
  activeEscalations: TimelineEntry[]
  openOpportunities: Opportunity[]
  recentDecisions: TimelineEntry[]
  lastTimeline: TimelineEntry[]
  upcomingGovernance: GovernanceSnapshot[]
  keyStakeholders: string[]
  contentSent: TimelineEntry[]
}

function newestFirst(entries: TimelineEntry[]) {
  return [...entries].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

function withinDays(timestamp: string, days: number) {
  return Date.now() - new Date(timestamp).getTime() <= days * 24 * 60 * 60 * 1000
}

export async function assembleHandoverSummary(
  account: Account,
  entries: TimelineEntry[],
  opportunities: Opportunity[],
): Promise<HandoverSummaryData> {
  await new Promise(resolve => window.setTimeout(resolve, 420))
  const accountEntries = newestFirst(entries.filter(entry => entry.accountId === account.id))
  const nextQbrDate = new Date(account.nextQbr)
  const withinNext60Days = nextQbrDate.getTime() - Date.now() <= 60 * 24 * 60 * 60 * 1000

  return {
    account,
    generatedAt: new Date().toISOString(),
    currentStage: account.stage,
    stageHistory: accountEntries.filter(entry => entry.eventType === 'stage_change'),
    healthScores: account.health,
    scoreHistory: accountEntries.filter(entry => entry.eventType === 'score_change').slice(0, 6),
    openRisks: account.risks,
    activeEscalations: accountEntries.filter(entry => entry.module === 'escalation' && !entry.title.toLowerCase().includes('closed')),
    openOpportunities: opportunities.filter(opportunity => !['Won', 'Lost'].includes(opportunity.stage)),
    recentDecisions: accountEntries.filter(entry => ['approval_event', 'executive_event'].includes(entry.eventType) && withinDays(entry.timestamp, 90)),
    lastTimeline: accountEntries.slice(0, 10),
    upcomingGovernance: withinNext60Days
      ? [{ id: 'next-qbr', title: `${account.name} QBR`, type: 'QBR', date: account.nextQbr }]
      : [],
    keyStakeholders: account.stakeholders,
    contentSent: accountEntries.filter(entry => entry.eventType === 'client_education'),
  }
}

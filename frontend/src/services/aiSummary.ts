import { subDays } from 'date-fns'
import { Account } from '@/types/account'
import { GovernanceEventRecord } from '@/types/governance'
import { Opportunity } from '@/types/opportunity'
import { AISummary, SummarySection, SummaryType } from '@/types/aiSummary'
import { TimelineEntry } from '@/types/timeline'
import { formatCurrency, formatDate } from '@/utils/formatters'

function newestFirst(entries: TimelineEntry[]) {
  return [...entries].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

function citation(entries: TimelineEntry[], fallback = '') {
  return entries[0]?.id ? [entries[0].id] : fallback ? [fallback] : []
}

function sentenceWithCitation(text: string, citations: string[]) {
  return citations.length ? `${text} [${citations.join(', ')}]` : text
}

function accountBrief(account: Account, entries: TimelineEntry[], opportunities: Opportunity[], governance: GovernanceEventRecord[]): SummarySection[] {
  const scoreEvents = newestFirst(entries.filter(entry => entry.eventType === 'score_change'))
  const riskEvents = newestFirst(entries.filter(entry => entry.module === 'escalation' || entry.isSensitive || account.risks.some(risk => entry.description.toLowerCase().includes(risk.toLowerCase().slice(0, 10)))))
  const oppEvents = newestFirst(entries.filter(entry => entry.module === 'opportunity'))
  const govEvents = newestFirst(entries.filter(entry => entry.module === 'governance'))
  const openOpps = opportunities.filter(opportunity => !['Won', 'Lost'].includes(opportunity.stage))
  const upcomingGov = governance.filter(event => event.accountId === account.id && new Date(event.date) >= new Date())

  return [
    {
      title: 'Health',
      body: sentenceWithCitation(`${account.name} is in ${account.stage} with health ${account.health.overall}/100 and ARR of ${formatCurrency(account.arr)}.`, citation(scoreEvents)),
      citations: citation(scoreEvents),
    },
    {
      title: 'Risks',
      body: riskEvents.length
        ? sentenceWithCitation(`The most recent recorded risk signal is "${riskEvents[0].title}", and current open risks include ${account.risks.join(', ') || 'no open risks'}.`, citation(riskEvents))
        : `No recorded risk timeline events were found in the provided data; current open risks show ${account.risks.join(', ') || 'none'}.`,
      citations: citation(riskEvents),
    },
    {
      title: 'Opportunities',
      body: oppEvents.length
        ? sentenceWithCitation(`${openOpps.length} open opportunities are visible, with latest pipeline activity "${oppEvents[0].title}".`, citation(oppEvents))
        : `${openOpps.length} open opportunities are visible, but no opportunity timeline event was provided.`,
      citations: citation(oppEvents),
    },
    {
      title: 'Governance',
      body: govEvents.length
        ? sentenceWithCitation(`The latest governance record is "${govEvents[0].title}"; ${upcomingGov.length} upcoming governance event is scheduled in the current data.`, citation(govEvents))
        : `${upcomingGov.length} upcoming governance event is scheduled, but no governance timeline event was provided.`,
      citations: citation(govEvents),
    },
  ]
}

function periodSummary(entries: TimelineEntry[]) {
  return newestFirst(entries).slice(0, 6).map(entry => ({
    title: entry.title,
    body: `${formatDate(entry.timestamp)}: ${entry.description} [${entry.id}]`,
    citations: [entry.id],
  }))
}

function preMeetingBrief(account: Account, entries: TimelineEntry[], governance: GovernanceEventRecord[]) {
  const recent = newestFirst(entries).slice(0, 4)
  const nextGov = governance.find(event => event.accountId === account.id && new Date(event.date) >= new Date())
  return [
    {
      title: 'Context',
      body: `${account.name} is currently ${account.stage}; next governance date is ${nextGov ? formatDate(nextGov.date) : 'not scheduled in the provided data'}.`,
      citations: [],
    },
    ...recent.map(entry => ({ title: 'Recent change', body: `${entry.title}: ${entry.description} [${entry.id}]`, citations: [entry.id] })),
    {
      title: 'Talking points',
      body: `Confirm open risks, validate next-step owners, and align on the ${account.stage.toLowerCase()} motion before client communications.`,
      citations: recent.map(entry => entry.id).slice(0, 2),
    },
  ]
}

function riskNarrative(account: Account, entries: TimelineEntry[]) {
  const scoreEvents = newestFirst(entries.filter(entry => entry.eventType === 'score_change'))
  const escalationEvents = newestFirst(entries.filter(entry => entry.module === 'escalation'))
  const criticalDimensions = Object.entries(account.health).filter(([, value]) => value < 60).map(([key]) => key)
  return [
    {
      title: 'Root cause',
      body: escalationEvents.length
        ? sentenceWithCitation(`Risk appears tied to escalation activity: "${escalationEvents[0].title}".`, [escalationEvents[0].id])
        : `No escalation event is visible, so the risk narrative is limited to health dimensions.`,
      citations: citation(escalationEvents),
    },
    {
      title: 'Health driver',
      body: scoreEvents.length
        ? sentenceWithCitation(`Current low dimensions are ${criticalDimensions.join(', ') || 'none below the configured critical band'} after the latest score movement.`, [scoreEvents[0].id])
        : `No score-change timeline event was provided for the risk explanation.`,
      citations: citation(scoreEvents),
    },
  ]
}

export function generateAISummary({
  account,
  entries,
  opportunities,
  governance,
  type,
}: {
  account: Account
  entries: TimelineEntry[]
  opportunities: Opportunity[]
  governance: GovernanceEventRecord[]
  type: SummaryType
}): AISummary {
  const relevantEntries = newestFirst(entries.filter(entry => entry.accountId === account.id && new Date(entry.timestamp) >= subDays(new Date(), 180)))
  const sourceEntryIds = relevantEntries.map(entry => entry.id)
  let sections: SummarySection[]

  if (type === 'period_summary') sections = periodSummary(relevantEntries)
  else if (type === 'pre_meeting_brief') sections = preMeetingBrief(account, relevantEntries, governance)
  else if (type === 'risk_narrative') sections = riskNarrative(account, relevantEntries)
  else sections = accountBrief(account, relevantEntries, opportunities.filter(opportunity => opportunity.accountId === account.id), governance)

  return {
    id: `summary-${account.id}-${type}`,
    accountId: account.id,
    type,
    generatedAt: new Date().toISOString(),
    sourceEntryIds,
    sections,
    disclaimer: `Generated from ${sourceEntryIds.length} recorded events. Verify before use in client communications.`,
  }
}

import { Account } from '@/types/account'
import { Opportunity } from '@/types/opportunity'
import { TimelineEntry, UserRole, canViewTimelineEntry } from '@/types/timeline'
import { formatCurrency, formatDate, formatRelative } from '@/utils/formatters'

export type AISearchScope = 'timeline' | 'opportunities' | 'escalations' | 'governance' | 'notes' | 'kyc'

export interface AISearchQuery {
  accountId: string
  query: string
  scope: AISearchScope[]
  role: UserRole
  userId?: string
}

export interface AISearchState {
  timeline: TimelineEntry[]
  opportunities: Opportunity[]
  accounts: Account[]
}

export interface AISearchResult {
  answer: string
  sourceEntries: TimelineEntry[]
  queryIntent: string
  confidence: 'high' | 'medium' | 'low'
  disclaimer?: string
}

type IntentResolver = (accountId: string, state: AISearchState, query: string) => TimelineEntry[]

export const INTENT_EXAMPLES = [
  'Summarise this account',
  'What changed in this account in the last 90 days?',
  'Show the escalation history',
  'Who approved the stage override?',
  'What content was sent to this client?',
  'Show stage changes',
  'Show score changes',
]

export const INTENT_KEYS = [
  'escalation history',
  'stage changes',
  'last 90 days',
  'score changes',
  'who approved',
  'content sent',
  'since last qbr',
  'open opportunities',
  'summarise this account',
]

function isWithin90Days(timestamp: string) {
  const age = Date.now() - new Date(timestamp).getTime()
  return age <= 90 * 24 * 60 * 60 * 1000
}

function filterSinceLastGovernanceEvent(accountId: string, state: AISearchState, label: string) {
  const lastEvent = state.timeline
    .filter(entry => entry.accountId === accountId && entry.module === 'governance' && entry.title.toLowerCase().includes(label.toLowerCase()))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]

  if (!lastEvent) return []
  return state.timeline.filter(entry => entry.accountId === accountId && new Date(entry.timestamp) >= new Date(lastEvent.timestamp))
}

const INTENT_MAP: Record<string, IntentResolver> = {
  'escalation history': (id, state) => state.timeline.filter(entry => entry.accountId === id && entry.module === 'escalation'),
  'stage changes': (id, state) => state.timeline.filter(entry => entry.accountId === id && entry.eventType === 'stage_change'),
  'last 90 days': (id, state) => state.timeline.filter(entry => entry.accountId === id && isWithin90Days(entry.timestamp)),
  'score changes': (id, state) => state.timeline.filter(entry => entry.accountId === id && entry.eventType === 'score_change'),
  'who approved': (id, state) => state.timeline.filter(entry => entry.accountId === id && entry.eventType === 'approval_event'),
  'content sent': (id, state) => state.timeline.filter(entry => entry.accountId === id && entry.module === 'education'),
  'since last qbr': (id, state) => filterSinceLastGovernanceEvent(id, state, 'QBR'),
  'open opportunities': (id, state) =>
    state.opportunities
      .filter(opportunity => opportunity.accountId === id && !['Won', 'Lost'].includes(opportunity.stage))
      .map(opportunity => opportunityToTimelineSource(opportunity)),
  'summarise this account': (id, state) => state.timeline.filter(entry => entry.accountId === id),
}

function opportunityToTimelineSource(opportunity: Opportunity): TimelineEntry {
  return {
    id: opportunity.id,
    accountId: opportunity.accountId,
    eventType: 'opportunity_event',
    module: 'opportunity',
    title: opportunity.name,
    description: `${formatCurrency(opportunity.estimatedValue)} opportunity in ${opportunity.stage}; target close ${formatDate(opportunity.closeDate)}.`,
    performedBy: opportunity.ownerId,
    performedByName: opportunity.ownerName,
    timestamp: opportunity.closeDate,
    sourceRecordId: opportunity.id,
    sourceRecordType: 'opportunity',
    sourceRecordRoute: '/opportunities',
    isSensitive: false,
    isSystemGenerated: true,
    isImmutable: false,
  }
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function detectStructuredIntent(query: string) {
  const normalized = normalize(query)
  return INTENT_KEYS.find(intent => {
    const words = intent.split(' ')
    return normalized.includes(intent) || words.every(word => normalized.includes(word))
  })
}

function visibleTimeline(query: AISearchQuery, state: AISearchState) {
  return state.timeline
    .filter(entry => entry.accountId === query.accountId)
    .filter(entry => canViewTimelineEntry(entry, query.role, query.userId))
}

function applyRBAC(entries: TimelineEntry[], query: AISearchQuery) {
  return entries.filter(entry => canViewTimelineEntry(entry, query.role, query.userId))
}

function scopeFilter(entries: TimelineEntry[], scope: AISearchScope[]) {
  if (!scope.length || scope.includes('timeline')) return entries
  const allowedModules = new Set<string>(scope.map(item => (item === 'notes' ? 'manual' : item === 'kyc' ? 'kyc' : item === 'escalations' ? 'escalation' : item)))
  return entries.filter(entry => allowedModules.has(entry.module))
}

function rankSemanticEntries(query: AISearchQuery, state: AISearchState) {
  const terms = normalize(query.query)
    .split(' ')
    .filter(term => term.length > 2)

  const entries = scopeFilter(visibleTimeline(query, state), query.scope)
  return entries
    .map(entry => {
      const haystack = normalize([entry.title, entry.description, entry.performedByName, entry.module, entry.eventType, ...(entry.tags ?? [])].join(' '))
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0)
      return { entry, score }
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.entry.timestamp).getTime() - new Date(a.entry.timestamp).getTime())
    .slice(0, 6)
    .map(item => item.entry)
}

function timelineSummary(entries: TimelineEntry[]) {
  return entries
    .slice(0, 4)
    .map(entry => `${entry.title} (${formatRelative(entry.timestamp)}, ${entry.performedByName})`)
    .join('; ')
}

function accountSummary(account?: Account) {
  if (!account) return ''
  return `${account.name} is in ${account.stage} with ${account.health.overall} health score and ${formatCurrency(account.arr)} ARR.`
}

function structuredAnswer(intent: string, sourceEntries: TimelineEntry[], state: AISearchState, query: AISearchQuery) {
  const account = state.accounts.find(item => item.id === query.accountId)
  if (!sourceEntries.length) {
    return `I could not find recorded ${intent} for ${account?.name ?? 'this account'} in the visible data.`
  }

  if (intent === 'open opportunities') {
    return `I found ${sourceEntries.length} open opportunit${sourceEntries.length === 1 ? 'y' : 'ies'} for ${account?.name ?? 'this account'}: ${timelineSummary(sourceEntries)}.`
  }

  if (intent === 'summarise this account') {
    return `${accountSummary(account)} The latest visible account signals are ${timelineSummary(sourceEntries)}.`
  }

  if (intent === 'who approved') {
    const latest = sourceEntries[0]
    return `${latest.performedByName} approved the latest recorded approval event: "${latest.title}" (${formatRelative(latest.timestamp)}).`
  }

  return `I found ${sourceEntries.length} recorded event${sourceEntries.length === 1 ? '' : 's'} for ${intent}: ${timelineSummary(sourceEntries)}.`
}

function semanticAnswer(sourceEntries: TimelineEntry[], state: AISearchState, query: AISearchQuery) {
  const account = state.accounts.find(item => item.id === query.accountId)
  if (!sourceEntries.length) {
    return `${accountSummary(account)} I could not find enough visible recorded events to answer that query with confidence.`
  }

  return `${accountSummary(account)} The most relevant recorded events are ${timelineSummary(sourceEntries)}.`
}

function withCitations(answer: string, sourceEntries: TimelineEntry[]) {
  if (!sourceEntries.length) return answer
  return `${answer} Source IDs: ${sourceEntries.map(entry => entry.id).join(', ')}.`
}

export async function runAISearch(query: AISearchQuery, state: AISearchState): Promise<AISearchResult> {
  const intent = detectStructuredIntent(query.query)
  const visibleState: AISearchState = {
    ...state,
    timeline: visibleTimeline(query, state),
  }

  if (intent) {
    const sourceEntries = applyRBAC(INTENT_MAP[intent](query.accountId, visibleState, query.query), query)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 8)

    return {
      answer: withCitations(structuredAnswer(intent, sourceEntries, state, query), sourceEntries),
      sourceEntries,
      queryIntent: `Structured: ${intent}`,
      confidence: sourceEntries.length ? 'high' : 'medium',
      disclaimer: `This answer is based on ${sourceEntries.length} recorded event${sourceEntries.length === 1 ? '' : 's'}. Verify before use in client comms.`,
    }
  }

  const sourceEntries = rankSemanticEntries(query, state)

  return {
    answer: withCitations(semanticAnswer(sourceEntries, state, query), sourceEntries),
    sourceEntries,
    queryIntent: 'Semantic synthesis',
    confidence: sourceEntries.length >= 3 ? 'medium' : 'low',
    disclaimer: `This answer is based on ${sourceEntries.length} recorded event${sourceEntries.length === 1 ? '' : 's'}. Verify before use in client comms.`,
  }
}

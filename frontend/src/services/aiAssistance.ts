import { apiRequest } from '@/services/api'
import { AISearchResult, AISearchScope } from '@/services/aiSearch'
import { TimelineEntry, TimelineEventType, TimelineModule } from '@/types/timeline'

interface ApiAiSource {
  id: string
  account_id: string
  account_name: string
  source_type: string
  title: string
  excerpt: string
  source_route?: string | null
  event_at?: string | null
  relevance: number
}

interface ApiAiSearchResponse {
  query: string
  answer: string
  query_intent: string
  confidence: 'high' | 'medium' | 'low'
  disclaimer: string
  source_entries: ApiAiSource[]
  run_id?: string | null
}

interface KamAiSearchPayload {
  query: string
  accountId?: string
  scopes: AISearchScope[]
  documentSearch: boolean
  limit?: number
}

export async function runKamAiSearch(token: string, payload: KamAiSearchPayload): Promise<AISearchResult> {
  const response = await apiRequest<ApiAiSearchResponse>('/api/ai/search', {
    method: 'POST',
    token,
    body: JSON.stringify({
      query: payload.query,
      account_id: payload.accountId,
      scopes: payload.scopes,
      document_search: payload.documentSearch,
      limit: payload.limit ?? 10,
    }),
  })

  return {
    answer: response.answer,
    sourceEntries: response.source_entries.map(mapAiSourceToTimelineEntry),
    queryIntent: response.query_intent,
    confidence: response.confidence,
    disclaimer: response.disclaimer,
  }
}

function mapAiSourceToTimelineEntry(source: ApiAiSource): TimelineEntry {
  return {
    id: source.id,
    accountId: source.account_id,
    eventType: sourceTypeToEventType(source.source_type),
    module: sourceTypeToModule(source.source_type),
    title: `${source.account_name}: ${source.title}`,
    description: source.excerpt,
    performedBy: 'kam-ai',
    performedByName: 'KAM AI',
    timestamp: source.event_at ?? new Date().toISOString(),
    sourceRecordId: source.id,
    sourceRecordType: source.source_type,
    sourceRecordRoute: source.source_route ?? undefined,
    isSensitive: false,
    isSystemGenerated: true,
    isImmutable: true,
  }
}

function sourceTypeToEventType(sourceType: string): TimelineEventType {
  if (sourceType.includes('opportunity')) return 'opportunity_event'
  if (sourceType.includes('governance')) return 'governance_event'
  if (sourceType.includes('kyc')) return 'kyc_update'
  if (sourceType.includes('score')) return 'score_change'
  if (sourceType.includes('engagement')) return 'engagement_updated'
  return 'ai_event'
}

function sourceTypeToModule(sourceType: string): TimelineModule {
  if (sourceType.includes('opportunity')) return 'opportunity'
  if (sourceType.includes('governance')) return 'governance'
  if (sourceType.includes('kyc')) return 'kyc'
  if (sourceType.includes('score')) return 'scoring'
  if (sourceType.includes('engagement')) return 'engagements'
  return 'ai'
}

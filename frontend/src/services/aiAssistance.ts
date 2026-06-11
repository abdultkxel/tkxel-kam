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

interface KamAiForecastPayload {
  accountId?: string
  months?: number
}

interface ApiForecastPoint {
  month: string
  baseline_revenue: number
  weighted_opportunity: number
  growth_adjustment: number
  risk_adjustment: number
  forecast_revenue: number
  commercial_value: number
  health: number
  open_opportunities: number
}

interface ApiForecastTotals {
  account_count: number
  active_sow_count: number
  open_opportunities: number
  at_risk_accounts: number
  contracted_baseline: number
  baseline_revenue: number
  pipeline_value: number
  weighted_opportunity: number
  growth_adjustment: number
  risk_adjustment: number
  forecast_revenue: number
}

interface ApiForecastWaterfallItem {
  label: string
  value: number
  kind: 'baseline' | 'opportunity' | 'growth' | 'risk' | 'forecast'
}

interface ApiForecastResponse {
  title: string
  summary: string
  points: ApiForecastPoint[]
  months: number
  scope: 'account' | 'portfolio' | 'empty'
  forecast_type: 'monthly_revenue'
  confidence: 'high' | 'medium' | 'low' | 'not_available'
  trend_label: 'positive' | 'stable' | 'declining' | 'insufficient_data'
  totals: ApiForecastTotals
  waterfall: ApiForecastWaterfallItem[]
  basis: string[]
  assumptions: string[]
  missing_data: string[]
  recommended_actions: string[]
  highlights: string[]
  citations: Record<string, unknown>[]
  disclaimer: string
  run_id?: string | null
}

export interface KamAiForecastPoint {
  month: string
  baselineRevenue: number
  weightedOpportunity: number
  growthAdjustment: number
  riskAdjustment: number
  forecastRevenue: number
  health: number
  openOpportunities: number
}

export interface KamAiForecastTotals {
  accountCount: number
  activeSowCount: number
  openOpportunities: number
  atRiskAccounts: number
  contractedBaseline: number
  baselineRevenue: number
  pipelineValue: number
  weightedOpportunity: number
  growthAdjustment: number
  riskAdjustment: number
  forecastRevenue: number
}

export interface KamAiForecastWaterfallItem {
  label: string
  value: number
  kind: 'baseline' | 'opportunity' | 'growth' | 'risk' | 'forecast'
}

export interface KamAiForecastResult {
  title: string
  summary: string
  points: KamAiForecastPoint[]
  months: number
  scope: 'account' | 'portfolio' | 'empty'
  confidence: 'high' | 'medium' | 'low' | 'not_available'
  trendLabel: 'positive' | 'stable' | 'declining' | 'insufficient_data'
  totals: KamAiForecastTotals
  waterfall: KamAiForecastWaterfallItem[]
  basis: string[]
  assumptions: string[]
  missingData: string[]
  recommendedActions: string[]
  highlights: string[]
  citations: Record<string, unknown>[]
  disclaimer: string
  runId?: string | null
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

export async function runKamAiForecast(token: string, payload: KamAiForecastPayload = {}): Promise<KamAiForecastResult> {
  const response = await apiRequest<ApiForecastResponse>('/api/ai/forecast', {
    method: 'POST',
    token,
    body: JSON.stringify({
      account_id: payload.accountId,
      months: payload.months ?? 6,
    }),
  })

  return {
    title: response.title,
    summary: response.summary,
    points: response.points.map(point => ({
      month: point.month,
      baselineRevenue: point.baseline_revenue,
      weightedOpportunity: point.weighted_opportunity,
      growthAdjustment: point.growth_adjustment,
      riskAdjustment: point.risk_adjustment,
      forecastRevenue: point.forecast_revenue,
      health: point.health,
      openOpportunities: point.open_opportunities,
    })),
    months: response.months,
    scope: response.scope,
    confidence: response.confidence,
    trendLabel: response.trend_label,
    totals: {
      accountCount: response.totals.account_count,
      activeSowCount: response.totals.active_sow_count,
      openOpportunities: response.totals.open_opportunities,
      atRiskAccounts: response.totals.at_risk_accounts,
      contractedBaseline: response.totals.contracted_baseline,
      baselineRevenue: response.totals.baseline_revenue,
      pipelineValue: response.totals.pipeline_value,
      weightedOpportunity: response.totals.weighted_opportunity,
      growthAdjustment: response.totals.growth_adjustment,
      riskAdjustment: response.totals.risk_adjustment,
      forecastRevenue: response.totals.forecast_revenue,
    },
    waterfall: response.waterfall,
    basis: response.basis,
    assumptions: response.assumptions,
    missingData: response.missing_data,
    recommendedActions: response.recommended_actions,
    highlights: response.highlights,
    citations: response.citations,
    disclaimer: response.disclaimer,
    runId: response.run_id,
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

import { apiRequest } from '@/services/api'
import type { Page } from '@/services/accountWorkspace'

export interface CsatScore {
  id: string
  account_id: string
  engagement_id?: string | null
  customer_name?: string | null
  customer_email?: string | null
  score: number
  scale_min: number
  scale_max: number
  normalized_score: number
  category_scores_json: Record<string, number>
  category_weights_json: Record<string, number>
  weighted_score: number
  feedback?: string | null
  source_label: string
  source_id: string
  source_link?: string | null
  source_recorded_at: string
  freshness_status: string
  score_impact_json: Record<string, unknown>
  trend_json: Record<string, unknown>
  timeline_entry_id?: string | null
  scoring_snapshot_id?: string | null
  created_by_name: string
  created_at: string
  updated_at: string
}

export interface CsatScorePayload {
  account_id: string
  engagement_id?: string | null
  customer_name?: string | null
  customer_email?: string | null
  score?: number | null
  scale_min?: number
  scale_max?: number
  category_scores_json: Record<string, number>
  category_weights_json?: Record<string, number>
  feedback?: string | null
  source_label: string
  source_id?: string | null
  source_link?: string | null
  source_recorded_at?: string | null
}

export function listCsatScores(token: string, params: Record<string, string | number | undefined> = {}) {
  return apiRequest<Page<CsatScore>>(`/api/csat/scores${queryString(params)}`, { token })
}

export function createCsatScore(token: string, payload: CsatScorePayload) {
  return apiRequest<CsatScore>('/api/csat/scores', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

function queryString(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value))
  })
  const value = query.toString()
  return value ? `?${value}` : ''
}

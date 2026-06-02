import { apiRequest } from '@/services/api'

export interface AnalyticsMetric {
  label: string
  value: number | string
  tone: 'default' | 'warning' | 'success' | string
}

export interface AnalyticsSeries {
  name: string
  rows: Record<string, unknown>[]
}

export interface AnalyticsPortfolio {
  generated_at: string
  filters: Record<string, unknown>
  metrics: AnalyticsMetric[]
  series: AnalyticsSeries[]
  drilldowns: Record<string, Record<string, unknown>[]>
  redactions: Record<string, unknown>
}

export interface KamPerformance {
  owner_id?: string | null
  owner_name: string
  account_count: number
  average_health: number
  overdue_action_rate: number
  governance_cadence_rate: number
  renewal_readiness: number
  open_pipeline: number
  open_escalations: number
}

export interface AccountChangeAlert {
  id: string
  account_id: string
  alert_type: string
  reason_code: string
  affected_metric: string
  severity: string
  status: string
  owner_id?: string | null
  owner_name?: string | null
  recommended_action: string
  created_at: string
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

function query(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  })
  const value = search.toString()
  return value ? `?${value}` : ''
}

export function getAnalyticsPortfolio(token: string, params: Record<string, string | number | undefined> = {}) {
  return apiRequest<AnalyticsPortfolio>(`/api/analytics/portfolio${query(params)}`, { token })
}

export function getKamPerformance(token: string, params: Record<string, string | number | undefined> = {}) {
  return apiRequest<Page<KamPerformance>>(`/api/analytics/kam-performance${query(params)}`, { token })
}

export function getAccountChangeAlerts(token: string, params: Record<string, string | number | boolean | undefined> = {}) {
  return apiRequest<Page<AccountChangeAlert>>(`/api/analytics/account-change-alerts${query(params)}`, { token })
}

import { apiRequest } from '@/services/api'

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical'
export type AlertStatus = 'open' | 'acknowledged' | 'snoozed' | 'resolved'

export interface AlertStatusHistory {
  id: string
  alert_id: string
  from_status?: string | null
  to_status: string
  reason?: string | null
  actor_id?: string | null
  actor_name?: string | null
  metadata_json: Record<string, unknown>
  created_at: string
}

export interface AlertRecord {
  id: string
  rule_id?: string | null
  rule_key: string
  alert_type: string
  title: string
  detail: string
  severity: AlertSeverity
  status: AlertStatus
  owner_id?: string | null
  owner_name?: string | null
  owner_email?: string | null
  account_id?: string | null
  account_name?: string | null
  engagement_id?: string | null
  engagement_name?: string | null
  project_name?: string | null
  source_record_type: string
  source_record_id: string
  source_record_route?: string | null
  source_evidence_json: Record<string, unknown>[]
  previous_value_json?: Record<string, unknown> | null
  new_value_json?: Record<string, unknown> | null
  recommended_action: string
  deduplication_key: string
  first_triggered_at: string
  last_triggered_at: string
  snoozed_until?: string | null
  resolved_at?: string | null
  resolved_reason?: string | null
  created_at: string
  updated_at: string
  status_history: AlertStatusHistory[]
}

export interface AlertPage {
  items: AlertRecord[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface AlertRule {
  id: string
  rule_key: string
  name: string
  description: string
  alert_type: string
  source_type: string
  threshold_value: number
  threshold_unit: string
  severity: AlertSeverity
  snooze_days: number
  recipient_policy: 'source_owner_first' | 'account_owner_first' | string
  escalation_enabled: boolean
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface AlertRulePreview {
  rule_id: string
  rule_key: string
  total_matches: number
  sample: {
    account_id?: string | null
    account_name?: string | null
    engagement_id?: string | null
    engagement_name?: string | null
    source_record_type: string
    source_record_id: string
    title: string
    detail: string
    severity: AlertSeverity
    evidence: Record<string, unknown>[]
  }[]
}

export interface AlertEvaluationResult {
  evaluated: number
  matched: number
  created: number
  updated: number
  resolved: number
  reactivated: number
  notifications_created: number
  worker_run_id?: string | null
}

function query(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  })
  const value = search.toString()
  return value ? `?${value}` : ''
}

export function getAlerts(token: string, params: Record<string, string | number | undefined | null> = {}) {
  return apiRequest<AlertPage>(`/api/alerts${query(params)}`, { token })
}

export function getAlert(token: string, alertId: string) {
  return apiRequest<AlertRecord>(`/api/alerts/${alertId}`, { token })
}

export function updateAlertStatus(token: string, alertId: string, payload: { status: AlertStatus; reason?: string; snoozed_until?: string | null }) {
  return apiRequest<AlertRecord>(`/api/alerts/${alertId}/status`, { token, method: 'PATCH', body: JSON.stringify(payload) })
}

export function evaluateAlerts(token: string, payload: { scope: 'all' | 'account'; account_id?: string; rule_id?: string }) {
  return apiRequest<AlertEvaluationResult>('/api/alerts/evaluate', { token, method: 'POST', body: JSON.stringify(payload) })
}

export function getAlertRules(token: string) {
  return apiRequest<AlertRule[]>('/api/admin/alert-rules', { token })
}

export function updateAlertRule(token: string, ruleId: string, payload: Partial<Pick<AlertRule, 'is_active' | 'threshold_value' | 'severity' | 'snooze_days' | 'recipient_policy' | 'escalation_enabled'>>) {
  return apiRequest<AlertRule>(`/api/admin/alert-rules/${ruleId}`, { token, method: 'PATCH', body: JSON.stringify(payload) })
}

export function previewAlertRule(token: string, ruleId: string) {
  return apiRequest<AlertRulePreview>(`/api/admin/alert-rules/${ruleId}/preview`, { token, method: 'POST' })
}

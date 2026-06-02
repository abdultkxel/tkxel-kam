import { apiRequest } from '@/services/api'

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface ScoringMetric {
  id: string
  slug: string
  name: string
  description?: string | null
  scope: 'account' | 'engagement'
  weight: number
  thresholds: Record<string, unknown>
  formula: Record<string, unknown>
  freshness_rule: Record<string, unknown>
  owner_role?: string | null
  source: string
  status: 'draft' | 'published' | 'inactive'
  is_active: boolean
  current_version: number
  created_at: string
  updated_at: string
}

export interface ScoreDriver {
  key: string
  label: string
  score: number
  weight?: number
  [key: string]: unknown
}

export interface ScoreSnapshot {
  id: string
  account_id: string
  engagement_id?: string | null
  scope: string
  overall: number
  rag_status: 'red' | 'amber' | 'green' | 'unknown'
  drivers: ScoreDriver[]
  reason_codes: { code: string; label: string }[]
  metric_version: string
  freshness_status: string
  is_dirty: boolean
  trend: number
  status: string
  source_context: Record<string, unknown>
  calculated_by_name?: string | null
  calculated_at: string
  created_at: string
}

export interface ScoreRead {
  account_id: string
  engagement_id?: string | null
  scope: string
  overall: number
  rag_status: string
  drivers: ScoreDriver[]
  reason_codes: { code: string; label: string }[]
  metric_version: string
  freshness_status: string
  is_dirty: boolean
  trend: number
  status: string
  latest_snapshot?: ScoreSnapshot | null
}

export interface SignalRead {
  id: string
  account_id: string
  engagement_id?: string | null
  rule_id?: string | null
  signal_type: string
  severity: 'info' | 'warning' | 'critical'
  status: 'new' | 'reviewed' | 'accepted' | 'dismissed' | 'converted' | 'resolved'
  owner_id?: string | null
  owner_name?: string | null
  title: string
  detail: string
  reason_codes: { code: string; label: string }[]
  evidence_json: Record<string, unknown>[]
  citations_json: Record<string, unknown>[]
  source_record_type?: string | null
  source_record_id?: string | null
  source_record_route?: string | null
  confidence?: number | null
  condition_key?: string | null
  due_at?: string | null
  created_at: string
  updated_at: string
}

export interface PlaybookTemplate {
  id: string
  slug: string
  name: string
  objective: string
  signal_types: string[]
  weak_metrics: string[]
  activities_json: Record<string, unknown>[]
  status: string
  is_active: boolean
  current_version: number
  updated_at: string
}

export interface TaskRead {
  id: string
  account_id: string
  engagement_id?: string | null
  playbook_execution_id?: string | null
  source_type: string
  source_record_id?: string | null
  source_record_route?: string | null
  title: string
  description?: string | null
  owner_id?: string | null
  owner_name?: string | null
  due_at: string
  status: 'open' | 'in_progress' | 'blocked' | 'done' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  notes?: string | null
  evidence_json: Record<string, unknown>[]
  outcome?: string | null
  skip_reason?: string | null
  completed_at?: string | null
  created_by_name: string
  created_at: string
  updated_at: string
}

export interface UnifiedCalendarItem {
  id: string
  kind: string
  source_record_id: string
  source_record_type: string
  account_id: string
  account_name: string
  engagement_id?: string | null
  owner_id?: string | null
  date: string
  title: string
  detail: string
  status: string
  priority?: string | null
  route: string
}

export function listScoringMetrics(token: string, params: Record<string, string | number | boolean | undefined> = {}) {
  return apiRequest<Page<ScoringMetric>>(`/api/admin/metrics${queryString(params)}`, { token })
}

export function createScoringMetric(token: string, payload: Record<string, unknown>) {
  return apiRequest<ScoringMetric>('/api/admin/metrics', { method: 'POST', token, body: JSON.stringify(payload) })
}

export function updateScoringMetric(token: string, metricId: string, payload: Record<string, unknown>) {
  return apiRequest<ScoringMetric>(`/api/admin/metrics/${metricId}`, { method: 'PATCH', token, body: JSON.stringify(payload) })
}

export function publishScoringMetric(token: string, metricId: string) {
  return apiRequest(`/api/admin/metrics/${metricId}/publish`, { method: 'POST', token })
}

export function getAccountScore(token: string, accountId: string) {
  return apiRequest<ScoreRead>(`/api/accounts/${accountId}/scores`, { token })
}

export function recalculateAccountScore(token: string, accountId: string, payload: Record<string, unknown> = { trigger_source: 'manual' }) {
  return apiRequest<ScoreRead>(`/api/accounts/${accountId}/scores/recalculate`, { method: 'POST', token, body: JSON.stringify(payload) })
}

export function listScoreSnapshots(token: string, accountId: string, params: Record<string, string | number | boolean | undefined> = {}) {
  return apiRequest<Page<ScoreSnapshot>>(`/api/accounts/${accountId}/score-snapshots${queryString(params)}`, { token })
}

export function listSignals(token: string, params: Record<string, string | number | boolean | undefined> = {}) {
  return apiRequest<Page<SignalRead>>(`/api/signals${queryString(params)}`, { token })
}

export function listAttentionSignals(token: string, params: Record<string, string | number | boolean | undefined> = {}) {
  return apiRequest<Page<SignalRead>>(`/api/attention-center${queryString(params)}`, { token })
}

export function evaluateSignals(token: string, payload: { account_id?: string; engagement_id?: string; trigger_source?: string } = {}) {
  return apiRequest('/api/signals/evaluate', { method: 'POST', token, body: JSON.stringify(payload) })
}

export function updateSignalStatus(token: string, signalId: string, status: SignalRead['status'], reason?: string) {
  return apiRequest<SignalRead>(`/api/signals/${signalId}/status`, { method: 'PATCH', token, body: JSON.stringify({ status, reason }) })
}

export function convertSignal(token: string, signalId: string, payload: Record<string, unknown>) {
  return apiRequest(`/api/signals/${signalId}/convert`, { method: 'POST', token, body: JSON.stringify(payload) })
}

export function listPlaybookTemplates(token: string, params: Record<string, string | number | boolean | undefined> = {}) {
  return apiRequest<Page<PlaybookTemplate>>(`/api/admin/playbook-templates${queryString(params)}`, { token })
}

export function executePlaybook(token: string, templateId: string, payload: Record<string, unknown>) {
  return apiRequest(`/api/playbooks/${templateId}/execute`, { method: 'POST', token, body: JSON.stringify(payload) })
}

export function listTasks(token: string, params: Record<string, string | number | boolean | undefined> = {}) {
  return apiRequest<Page<TaskRead>>(`/api/tasks${queryString(params)}`, { token })
}

export function createTask(token: string, payload: Record<string, unknown>) {
  return apiRequest<TaskRead>('/api/tasks', { method: 'POST', token, body: JSON.stringify(payload) })
}

export function updateTask(token: string, taskId: string, payload: Record<string, unknown>) {
  return apiRequest<TaskRead>(`/api/tasks/${taskId}`, { method: 'PATCH', token, body: JSON.stringify(payload) })
}

export function addTaskEvidence(token: string, taskId: string, payload: Record<string, unknown>) {
  return apiRequest(`/api/tasks/${taskId}/evidence`, { method: 'POST', token, body: JSON.stringify(payload) })
}

export function listCalendarItems(token: string, params: Record<string, string | number | boolean | undefined> = {}) {
  return apiRequest<Page<UnifiedCalendarItem>>(`/api/calendar/items${queryString(params)}`, { token })
}

function queryString(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === '') return
    search.set(key, String(value))
  })
  const value = search.toString()
  return value ? `?${value}` : ''
}

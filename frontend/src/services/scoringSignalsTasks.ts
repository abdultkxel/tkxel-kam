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
  effective_date?: string | null
  status: 'draft' | 'published' | 'inactive'
  is_active: boolean
  current_version: number
  created_at: string
  updated_at: string
}

export interface ScoringMetricVersion {
  id: string
  metric_id: string
  version: number
  config_json: Record<string, unknown>
  published_by_id?: string | null
  published_by_name: string
  published_at: string
  created_at: string
}

export interface MetricValidation {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface ScoreDriver {
  key: string
  label: string
  score: number
  weight?: number
  [key: string]: unknown
}

export interface MetricSnapshot {
  id: string
  score_snapshot_id: string
  metric_id?: string | null
  metric_slug: string
  metric_name: string
  category: string
  criterion_key?: string | null
  raw_score?: number | null
  raw_scale?: number | null
  normalized_score?: number | null
  weight: number
  weighted_score: number
  status: string
  freshness_status: string
  evidence_json: Record<string, unknown>[]
  source_context: Record<string, unknown>
  created_at: string
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
  metric_snapshots?: MetricSnapshot[]
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

export interface SignalEvidence {
  signal_id: string
  evidence: Record<string, unknown>[]
  citations: Record<string, unknown>[]
}

export interface SignalAIExplanation {
  signal_id: string
  provider: string
  advisory_only: boolean
  explanation: string
  citations: Record<string, unknown>[]
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

export interface RecommendedPlaybook {
  template: PlaybookTemplate
  rationale: string
  match_score: number
  matched_signal_types: string[]
  matched_metrics: string[]
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
  status: 'todo' | 'in_progress' | 'blocked' | 'done' | 'skipped'
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

export function validateScoringMetric(token: string, metricId: string) {
  return apiRequest<MetricValidation>(`/api/admin/metrics/${metricId}/validate`, { method: 'POST', token })
}

export function publishScoringMetric(token: string, metricId: string) {
  return apiRequest<ScoringMetricVersion>(`/api/admin/metrics/${metricId}/publish`, { method: 'POST', token })
}

export function listScoringMetricVersions(token: string, metricId: string, params: Record<string, string | number | boolean | undefined> = {}) {
  return apiRequest<Page<ScoringMetricVersion>>(`/api/admin/metrics/${metricId}/versions${queryString(params)}`, { token })
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

export function getSignalEvidence(token: string, signalId: string) {
  return apiRequest<SignalEvidence>(`/api/signals/${signalId}/evidence`, { token })
}

export function explainSignal(token: string, signalId: string) {
  return apiRequest<SignalAIExplanation>(`/api/signals/${signalId}/ai-explanation`, { method: 'POST', token })
}

export function listRecommendedPlaybooksForSignal(token: string, signalId: string) {
  return apiRequest<RecommendedPlaybook[]>(`/api/signals/${signalId}/recommended-playbooks`, { token })
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

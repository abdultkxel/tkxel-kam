import { apiRequest } from '@/services/api'
import { Page } from '@/services/accountWorkspace'
export { listRuntimeCustomFields } from '@/services/contentGovernance'
export type { RuntimeCustomField } from '@/services/contentGovernance'

function queryString(params: URLSearchParams) {
  const query = params.toString()
  return query ? `?${query}` : ''
}

export type RetentionRisk = 'healthy' | 'warning' | 'critical'
export type RetentionReadiness = 'not_started' | 'draft' | 'in_review' | 'ready' | 'blocked'
export type RetentionPlanType = 'retention' | 'renewal' | 'stabilization'
export type RetentionPlanStatus = 'draft' | 'active' | 'completed' | 'archived'
export type RetentionActionStatus = 'todo' | 'in_progress' | 'done' | 'blocked' | 'cancelled'
export type RetentionSourceKind = 'manual' | 'sow' | 'extracted' | 'imported'

export interface EngagementRenewal {
  id?: string | null
  account_id: string
  account_name?: string | null
  engagement_id: string
  engagement_name?: string | null
  owner_id?: string | null
  owner_name?: string | null
  readiness_status: RetentionReadiness | string
  renewal_risk: RetentionRisk
  sow_start_date?: string | null
  sow_end_date?: string | null
  renewal_date?: string | null
  notice_deadline?: string | null
  notice_period_days?: number | null
  auto_renewal: boolean
  commercial_exposure: number
  currency: string
  confidence?: number | null
  source_kind: RetentionSourceKind | string
  source_title?: string | null
  source_document_id?: string | null
  source_citation?: string | null
  manual_override_reason?: string | null
  days_to_expiry?: number | null
  days_to_notice?: number | null
  updated_at?: string | null
}

export interface AccountRetention {
  id?: string | null
  account_id: string
  readiness_status: RetentionReadiness | string
  renewal_risk: RetentionRisk
  owner_id?: string | null
  owner_name?: string | null
  commercial_exposure: number
  currency: string
  confidence?: number | null
  source_kind: RetentionSourceKind | string
  source_title?: string | null
  source_citation?: string | null
  manual_override_reason?: string | null
  notes?: string | null
  days_to_nearest_notice?: number | null
  days_to_nearest_renewal?: number | null
  renewal_count: number
  high_risk_count: number
  renewals: EngagementRenewal[]
  updated_at?: string | null
}

export interface RetentionPlanMilestone {
  id: string
  plan_id: string
  title: string
  milestone_type: string
  due_at: string
  status: string
}

export interface RetentionPlanAction {
  id: string
  plan_id: string
  title: string
  owner_id?: string | null
  owner_name: string
  due_at: string
  status: RetentionActionStatus | string
  success_criteria?: string | null
  source_recommendation_id?: string | null
  completed_at?: string | null
}

export interface RetentionPlan {
  id: string
  account_id: string
  engagement_id?: string | null
  title: string
  plan_type: RetentionPlanType | string
  status: RetentionPlanStatus | string
  risk_level: RetentionRisk
  owner_id?: string | null
  owner_name: string
  due_at: string
  renewal_milestone_at?: string | null
  success_criteria: string[]
  recommendation_context?: Record<string, unknown> | null
  timeline_history: Record<string, unknown>[]
  custom_field_values: Record<string, unknown>
  milestones: RetentionPlanMilestone[]
  actions: RetentionPlanAction[]
  updated_at: string
}

export interface RetentionRecommendation {
  id: string
  recommendation_type: string
  title: string
  rationale: string
  priority: string
  source_context: string
  suggested_action: string
  owner_id?: string | null
  owner_name?: string | null
  due_at?: string | null
  confidence: number
  source_items: string[]
  required_inputs_missing: string[]
}

export interface RetentionRecommendationResponse {
  account_id: string
  inputs_available: boolean
  missing_inputs: string[]
  recommendations: RetentionRecommendation[]
}

export interface RetentionPortfolioReport {
  total_renewals: number
  critical_renewals: number
  warning_renewals: number
  healthy_renewals: number
  upcoming_notice_30: number
  upcoming_renewal_90: number
  total_commercial_exposure: number
  open_retention_actions: number
  overdue_retention_actions: number
  signal_count: number
}

export interface RetentionPortfolioTask {
  id: string
  account_id: string
  account_name: string
  plan_id: string
  plan_title: string
  title: string
  owner_id?: string | null
  owner_name: string
  due_at: string
  status: string
}

export interface RetentionSignal {
  id: string
  account_id: string
  account_name: string
  engagement_id?: string | null
  engagement_name?: string | null
  signal_type: string
  severity: string
  headline: string
  detail: string
  reason_codes: string[]
  evidence: string[]
  due_at?: string | null
  source_record_route: string
}

export interface RetentionCalendarItem {
  id: string
  account_id: string
  account_name: string
  title: string
  starts_at: string
  item_type: string
  source_record_route: string
  owner_name?: string | null
  severity?: string | null
}

export async function getAccountRetention(token: string, accountId: string) {
  return apiRequest<AccountRetention>(`/api/accounts/${accountId}/retention`, { token })
}

export async function updateAccountRetention(token: string, accountId: string, payload: Partial<AccountRetention>) {
  return apiRequest<AccountRetention>(`/api/accounts/${accountId}/retention`, { method: 'PATCH', token, body: JSON.stringify(payload) })
}

export async function getEngagementRenewal(token: string, engagementId: string) {
  return apiRequest<EngagementRenewal>(`/api/engagements/${engagementId}/renewal`, { token })
}

export async function updateEngagementRenewal(token: string, engagementId: string, payload: Partial<EngagementRenewal>) {
  return apiRequest<EngagementRenewal>(`/api/engagements/${engagementId}/renewal`, { method: 'PATCH', token, body: JSON.stringify(payload) })
}

export async function listPortfolioRenewals(token: string, params = new URLSearchParams()) {
  return apiRequest<Page<EngagementRenewal>>(`/api/retention/renewals${queryString(params)}`, { token })
}

export async function listRetentionTasks(token: string, params = new URLSearchParams()) {
  return apiRequest<Page<RetentionPortfolioTask>>(`/api/retention/tasks${queryString(params)}`, { token })
}

export async function listRetentionSignals(token: string, params = new URLSearchParams()) {
  return apiRequest<Page<RetentionSignal>>(`/api/retention/signals${queryString(params)}`, { token })
}

export async function listRetentionCalendarItems(token: string, params = new URLSearchParams()) {
  return apiRequest<RetentionCalendarItem[]>(`/api/retention/calendar-items${queryString(params)}`, { token })
}

export async function getRetentionPortfolioReport(token: string) {
  return apiRequest<RetentionPortfolioReport>('/api/retention/reports/portfolio', { token })
}

export async function listRetentionPlans(token: string, accountId: string, params = new URLSearchParams()) {
  return apiRequest<Page<RetentionPlan>>(`/api/accounts/${accountId}/retention-plans${queryString(params)}`, { token })
}

export async function createRetentionPlan(token: string, accountId: string, payload: {
  engagement_id?: string | null
  title: string
  plan_type: RetentionPlanType
  status?: RetentionPlanStatus
  risk_level?: RetentionRisk
  owner_id: string
  due_at: string
  renewal_milestone_at?: string | null
  success_criteria: string[]
  recommendation_context?: Record<string, unknown>
  milestones?: { title: string; milestone_type: string; due_at: string }[]
  custom_field_values?: Record<string, unknown>
}) {
  return apiRequest<RetentionPlan>(`/api/accounts/${accountId}/retention-plans`, { method: 'POST', token, body: JSON.stringify(payload) })
}

export async function updateRetentionPlan(token: string, planId: string, payload: Partial<RetentionPlan>) {
  return apiRequest<RetentionPlan>(`/api/retention-plans/${planId}`, { method: 'PATCH', token, body: JSON.stringify(payload) })
}

export async function createRetentionPlanTask(token: string, planId: string, payload: {
  title: string
  owner_id: string
  due_at: string
  success_criteria?: string
  source_recommendation_id?: string
  confirmed: boolean
}) {
  return apiRequest<RetentionPlanAction>(`/api/retention-plans/${planId}/tasks`, { method: 'POST', token, body: JSON.stringify(payload) })
}

export async function updateRetentionPlanAction(token: string, actionId: string, payload: Partial<RetentionPlanAction>) {
  return apiRequest<RetentionPlanAction>(`/api/retention-plan-actions/${actionId}`, { method: 'PATCH', token, body: JSON.stringify(payload) })
}

export async function getRetentionRecommendations(token: string, accountId: string) {
  return apiRequest<RetentionRecommendationResponse>(`/api/accounts/${accountId}/retention-recommendations`, { token })
}

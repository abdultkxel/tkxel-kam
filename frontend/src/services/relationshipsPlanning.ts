import { apiRequest } from '@/services/api'
import type {
  AccountPlan,
  AccountPlanInput,
  Page,
  OpportunityStageConfig,
  OpportunityStageTransitionConfig,
  RenewalProfile,
  RetentionPlan,
  RetentionRecommendation,
  ServiceAdjacencyRule,
  ServiceCatalogItem,
  ServiceRecommendation,
  StakeholderGapRule,
  StakeholderRoleConfig,
  WhitespaceItem,
} from '@/types/relationshipsPlanning'
import type { Opportunity } from '@/types/opportunity'
import { mapApiOpportunity, type ApiOpportunity } from '@/services/opportunities'

interface ApiAccountPlan {
  id: string
  account_id: string
  retention_focus?: string | null
  growth_focus?: string | null
  risks: string[]
  opportunities?: string | null
  commitments: string[]
  service_gaps: string[]
  review_cadence?: string | null
  next_review_at?: string | null
  status: string
  actions: ApiAction[]
  updated_at: string
}

interface ApiAction {
  id: string
  title: string
  owner_id?: string | null
  owner_name: string
  owner_email?: string | null
  due_at: string
  status: string
  priority: string
  success_criteria: string[]
}

interface ApiServiceCatalogItem {
  id: string
  slug: string
  name: string
  category?: string | null
  description?: string | null
  tags: string[]
  is_active: boolean
  display_order: number
  in_use_count: number
}

interface ApiStakeholderRoleConfig {
  id: string
  slug: string
  name: string
  description?: string | null
  is_active: boolean
  display_order: number
  in_use_count: number
}

interface ApiStakeholderGapRule {
  id: string
  rule_key: string
  title: string
  description: string
  severity: string
  condition_json: Record<string, unknown>
  is_active: boolean
  display_order: number
}

interface ApiOpportunityStageConfig {
  id: string
  slug: string
  name: string
  is_terminal: boolean
  requires_outcome_reason: boolean
  is_active: boolean
  display_order: number
}

interface ApiOpportunityStageTransitionConfig {
  id: string
  from_stage: string
  to_stage: string
  is_active: boolean
  requires_reason: boolean
}

interface ApiWhitespaceItem {
  id: string
  account_id: string
  engagement_id?: string | null
  service_id: string
  service_name: string
  coverage_status: string
  notes?: string | null
  source: string
}

interface ApiServiceRecommendation {
  id: string
  account_id: string
  source_service_id?: string | null
  source_service_name?: string | null
  target_service_id: string
  target_service_name: string
  relevance_score: number
  rationale: string
  status: string
  source_context: string
  created_opportunity_id?: string | null
}

interface ApiRenewalProfile {
  id: string
  account_id: string
  engagement_id: string
  renewal_readiness: string
  renewal_risk: string
  confidence: number
  commercial_exposure: number
  commercial_exposure_currency: string
  owner_id?: string | null
  owner_name?: string | null
  source_type: string
  source_citation?: string | null
  manual_override_reason?: string | null
  sow_start_date?: string | null
  sow_end_date?: string | null
  renewal_date?: string | null
  notice_deadline?: string | null
  notice_period_days?: number | null
  auto_renewal: boolean
  days_to_expiry?: number | null
  renewal_status: string
}

interface ApiRetentionPlan {
  id: string
  account_id: string
  engagement_id?: string | null
  plan_type: string
  status: string
  title: string
  summary?: string | null
  owner_id?: string | null
  owner_name: string
  owner_email?: string | null
  renewal_milestone_at?: string | null
  success_criteria: string[]
  source_context?: string | null
  actions: ApiAction[]
}

interface ApiRetentionRecommendation {
  id: string
  account_id: string
  engagement_id?: string | null
  title: string
  rationale: string
  severity: string
  recommended_action: string
  source_context: string
  status: string
  created_task_id?: string | null
}

interface ApiRetentionTask {
  id: string
  title: string
  source_type: string
}

interface ApiAdjacency {
  id: string
  source_service_id: string
  source_service_name: string
  target_service_id: string
  target_service_name: string
  relevance_score: number
  rationale: string
  is_active: boolean
}

export async function getAccountPlan(token: string, accountId: string) {
  const plan = await apiRequest<ApiAccountPlan | null>(`/api/accounts/${accountId}/plan`, { token })
  return plan ? mapPlan(plan) : null
}

export async function saveAccountPlan(token: string, accountId: string, input: AccountPlanInput) {
  return mapPlan(await apiRequest<ApiAccountPlan>(`/api/accounts/${accountId}/plan`, {
    method: 'PUT',
    token,
    body: JSON.stringify({
      retention_focus: input.retentionFocus ?? null,
      growth_focus: input.growthFocus ?? null,
      risks: input.risks ?? [],
      opportunities: input.opportunities ?? null,
      commitments: input.commitments ?? [],
      service_gaps: input.serviceGaps ?? [],
      review_cadence: input.reviewCadence ?? null,
      next_review_at: input.nextReviewAt ?? null,
      status: input.status ?? 'draft',
      actions: (input.actions ?? []).map(action => ({
        title: action.title,
        owner_id: action.ownerId,
        due_at: action.dueAt,
        status: action.status ?? 'open',
        priority: action.priority ?? 'medium',
        success_criteria: action.successCriteria ?? [],
      })),
      change_summary: input.changeSummary ?? null,
    }),
  }))
}

export async function listAdminServiceCatalog(token: string) {
  const page = await apiRequest<Page<ApiServiceCatalogItem>>('/api/admin/service-catalog?active_state=all&page=1&page_size=100', { token })
  return { ...page, items: page.items.map(mapService) }
}

export async function listServiceCatalog(token: string) {
  const page = await apiRequest<Page<ApiServiceCatalogItem>>('/api/service-catalog?page=1&page_size=100', { token })
  return { ...page, items: page.items.map(mapService) }
}

export async function createServiceCatalogItem(token: string, payload: { slug: string; name: string; category?: string; description?: string; tags?: string[] }) {
  return mapService(await apiRequest<ApiServiceCatalogItem>('/api/admin/service-catalog', {
    method: 'POST',
    token,
    body: JSON.stringify({ ...payload, tags: payload.tags ?? [], is_active: true }),
  }))
}

export async function updateServiceCatalogItem(token: string, serviceId: string, payload: { slug?: string; name?: string; category?: string | null; description?: string | null; tags?: string[]; isActive?: boolean; displayOrder?: number }) {
  return mapService(await apiRequest<ApiServiceCatalogItem>(`/api/admin/service-catalog/${serviceId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({
      slug: payload.slug,
      name: payload.name,
      category: payload.category,
      description: payload.description,
      tags: payload.tags,
      is_active: payload.isActive,
      display_order: payload.displayOrder,
    }),
  }))
}

export async function listStakeholderRoles(token: string) {
  const page = await apiRequest<Page<ApiStakeholderRoleConfig>>('/api/admin/stakeholder-roles?active_state=all&page=1&page_size=100', { token })
  return { ...page, items: page.items.map(mapStakeholderRole) }
}

export async function createStakeholderRole(token: string, payload: { slug: string; name: string; description?: string | null; displayOrder?: number; isActive?: boolean }) {
  return mapStakeholderRole(await apiRequest<ApiStakeholderRoleConfig>('/api/admin/stakeholder-roles', {
    method: 'POST',
    token,
    body: JSON.stringify({
      slug: payload.slug,
      name: payload.name,
      description: payload.description ?? null,
      display_order: payload.displayOrder ?? 0,
      is_active: payload.isActive ?? true,
    }),
  }))
}

export async function updateStakeholderRole(token: string, roleId: string, payload: { slug?: string; name?: string; description?: string | null; displayOrder?: number; isActive?: boolean }) {
  return mapStakeholderRole(await apiRequest<ApiStakeholderRoleConfig>(`/api/admin/stakeholder-roles/${roleId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({
      slug: payload.slug,
      name: payload.name,
      description: payload.description,
      display_order: payload.displayOrder,
      is_active: payload.isActive,
    }),
  }))
}

export async function listStakeholderGapRules(token: string) {
  const page = await apiRequest<Page<ApiStakeholderGapRule>>('/api/admin/stakeholder-gap-rules?active_state=all&page=1&page_size=100', { token })
  return { ...page, items: page.items.map(mapStakeholderGapRule) }
}

export async function createStakeholderGapRule(token: string, payload: { ruleKey: string; title: string; description: string; severity: string; conditionJson: Record<string, unknown>; displayOrder?: number; isActive?: boolean }) {
  return mapStakeholderGapRule(await apiRequest<ApiStakeholderGapRule>('/api/admin/stakeholder-gap-rules', {
    method: 'POST',
    token,
    body: JSON.stringify({
      rule_key: payload.ruleKey,
      title: payload.title,
      description: payload.description,
      severity: payload.severity,
      condition_json: payload.conditionJson,
      display_order: payload.displayOrder ?? 0,
      is_active: payload.isActive ?? true,
    }),
  }))
}

export async function updateStakeholderGapRule(token: string, ruleId: string, payload: { ruleKey?: string; title?: string; description?: string; severity?: string; conditionJson?: Record<string, unknown>; displayOrder?: number; isActive?: boolean }) {
  return mapStakeholderGapRule(await apiRequest<ApiStakeholderGapRule>(`/api/admin/stakeholder-gap-rules/${ruleId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({
      rule_key: payload.ruleKey,
      title: payload.title,
      description: payload.description,
      severity: payload.severity,
      condition_json: payload.conditionJson,
      display_order: payload.displayOrder,
      is_active: payload.isActive,
    }),
  }))
}

export async function listAdminOpportunityStages(token: string) {
  return (await apiRequest<ApiOpportunityStageConfig[]>('/api/admin/opportunity-stages', { token })).map(mapOpportunityStage)
}

export async function createOpportunityStageConfig(token: string, payload: { slug: string; name: string; displayOrder?: number; isTerminal?: boolean; requiresOutcomeReason?: boolean; isActive?: boolean }) {
  return mapOpportunityStage(await apiRequest<ApiOpportunityStageConfig>('/api/admin/opportunity-stages', {
    method: 'POST',
    token,
    body: JSON.stringify({
      slug: payload.slug,
      name: payload.name,
      display_order: payload.displayOrder ?? 0,
      is_terminal: payload.isTerminal ?? false,
      requires_outcome_reason: payload.requiresOutcomeReason ?? false,
      is_active: payload.isActive ?? true,
    }),
  }))
}

export async function updateOpportunityStageConfig(token: string, stageId: string, payload: { slug?: string; name?: string; displayOrder?: number; isTerminal?: boolean; requiresOutcomeReason?: boolean; isActive?: boolean }) {
  return mapOpportunityStage(await apiRequest<ApiOpportunityStageConfig>(`/api/admin/opportunity-stages/${stageId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({
      slug: payload.slug,
      name: payload.name,
      display_order: payload.displayOrder,
      is_terminal: payload.isTerminal,
      requires_outcome_reason: payload.requiresOutcomeReason,
      is_active: payload.isActive,
    }),
  }))
}

export async function listOpportunityStageTransitions(token: string) {
  return (await apiRequest<ApiOpportunityStageTransitionConfig[]>('/api/admin/opportunity-stage-transitions', { token })).map(mapOpportunityStageTransition)
}

export async function replaceOpportunityStageTransitions(token: string, transitions: { fromStage: string; toStage: string; isActive?: boolean; requiresReason?: boolean }[]) {
  return (await apiRequest<ApiOpportunityStageTransitionConfig[]>('/api/admin/opportunity-stage-transitions', {
    method: 'PUT',
    token,
    body: JSON.stringify({ transitions: transitions.map(item => ({ from_stage: item.fromStage, to_stage: item.toStage, is_active: item.isActive ?? true, requires_reason: item.requiresReason ?? false })) }),
  })).map(mapOpportunityStageTransition)
}

export async function listServiceAdjacencies(token: string) {
  return (await apiRequest<ApiAdjacency[]>('/api/admin/service-adjacencies', { token })).map(mapAdjacency)
}

export async function replaceServiceAdjacencies(token: string, rules: { sourceServiceId: string; targetServiceId: string; relevanceScore: number; rationale: string; isActive?: boolean }[]) {
  return (await apiRequest<ApiAdjacency[]>('/api/admin/service-adjacencies', {
    method: 'PUT',
    token,
    body: JSON.stringify({ rules: rules.map(rule => ({ source_service_id: rule.sourceServiceId, target_service_id: rule.targetServiceId, relevance_score: rule.relevanceScore, rationale: rule.rationale, is_active: rule.isActive ?? true })) }),
  })).map(mapAdjacency)
}

export async function listWhitespace(token: string, accountId: string) {
  return (await apiRequest<ApiWhitespaceItem[]>(`/api/accounts/${accountId}/whitespace`, { token })).map(mapWhitespace)
}

export async function saveWhitespace(token: string, accountId: string, items: { serviceId: string; coverageStatus: string; notes?: string | null; source?: string }[]) {
  return (await apiRequest<ApiWhitespaceItem[]>(`/api/accounts/${accountId}/whitespace`, {
    method: 'PUT',
    token,
    body: JSON.stringify({ items: items.map(item => ({ service_id: item.serviceId, coverage_status: item.coverageStatus, notes: item.notes ?? null, source: item.source ?? 'manual' })) }),
  })).map(mapWhitespace)
}

export async function listServiceRecommendations(token: string, accountId: string) {
  const page = await apiRequest<Page<ApiServiceRecommendation>>(`/api/accounts/${accountId}/service-recommendations?page=1&page_size=100`, { token })
  return { ...page, items: page.items.map(mapRecommendation) }
}

export async function createOpportunityFromRecommendation(token: string, accountId: string, recommendationId: string, payload: { ownerId: string; targetDate: string; value?: number; currency?: string }) {
  return mapApiOpportunity(await apiRequest<ApiOpportunity>(`/api/accounts/${accountId}/service-recommendations/${recommendationId}/opportunity`, {
    method: 'POST',
    token,
    body: JSON.stringify({ owner_id: payload.ownerId, target_date: payload.targetDate, value: payload.value ?? 0, currency: payload.currency ?? 'USD', confirm: true }),
  })) satisfies Opportunity
}

export async function listAccountRetention(token: string, accountId: string) {
  const page = await apiRequest<Page<ApiRenewalProfile>>(`/api/accounts/${accountId}/retention`, { token })
  return { ...page, items: page.items.map(mapRenewal) }
}

export async function listRetentionPlans(token: string, accountId: string) {
  const page = await apiRequest<Page<ApiRetentionPlan>>(`/api/accounts/${accountId}/retention-plans?page=1&page_size=100`, { token })
  return { ...page, items: page.items.map(mapRetentionPlan) }
}

export async function createRetentionPlan(token: string, accountId: string, payload: { title: string; summary?: string | null; ownerId: string; renewalMilestoneAt?: string | null; successCriteria?: string[] }) {
  return mapRetentionPlan(await apiRequest<ApiRetentionPlan>(`/api/accounts/${accountId}/retention-plans`, {
    method: 'POST',
    token,
    body: JSON.stringify({
      title: payload.title,
      summary: payload.summary ?? null,
      owner_id: payload.ownerId,
      renewal_milestone_at: payload.renewalMilestoneAt ?? null,
      success_criteria: payload.successCriteria ?? [],
      plan_type: 'retention',
      source_context: 'manual',
    }),
  }))
}

export async function listRetentionRecommendations(token: string, accountId: string) {
  return (await apiRequest<ApiRetentionRecommendation[]>(`/api/accounts/${accountId}/retention-recommendations`, { token })).map(mapRetentionRecommendation)
}

export async function createRetentionTasks(token: string, planId: string, payload: { recommendationIds: string[]; ownerId: string; dueAt: string; confirm: boolean }) {
  return apiRequest<ApiRetentionTask[]>(`/api/retention-plans/${planId}/tasks`, {
    method: 'POST',
    token,
    body: JSON.stringify({
      recommendation_ids: payload.recommendationIds,
      owner_id: payload.ownerId,
      due_at: payload.dueAt,
      confirm: payload.confirm,
    }),
  })
}

function mapAction(action: ApiAction) {
  return {
    id: action.id,
    title: action.title,
    ownerId: action.owner_id,
    ownerName: action.owner_name,
    ownerEmail: action.owner_email,
    dueAt: action.due_at,
    status: action.status,
    priority: action.priority,
    successCriteria: action.success_criteria,
  }
}

function mapPlan(plan: ApiAccountPlan): AccountPlan {
  return {
    id: plan.id,
    accountId: plan.account_id,
    retentionFocus: plan.retention_focus,
    growthFocus: plan.growth_focus,
    risks: plan.risks,
    opportunities: plan.opportunities,
    commitments: plan.commitments,
    serviceGaps: plan.service_gaps,
    reviewCadence: plan.review_cadence,
    nextReviewAt: plan.next_review_at,
    status: plan.status,
    actions: plan.actions.map(mapAction),
    updatedAt: plan.updated_at,
  }
}

function mapService(item: ApiServiceCatalogItem): ServiceCatalogItem {
  return { id: item.id, slug: item.slug, name: item.name, category: item.category, description: item.description, tags: item.tags, isActive: item.is_active, displayOrder: item.display_order, inUseCount: item.in_use_count }
}

function mapStakeholderRole(item: ApiStakeholderRoleConfig): StakeholderRoleConfig {
  return { id: item.id, slug: item.slug, name: item.name, description: item.description, isActive: item.is_active, displayOrder: item.display_order, inUseCount: item.in_use_count }
}

function mapStakeholderGapRule(item: ApiStakeholderGapRule): StakeholderGapRule {
  return { id: item.id, ruleKey: item.rule_key, title: item.title, description: item.description, severity: item.severity, conditionJson: item.condition_json, isActive: item.is_active, displayOrder: item.display_order }
}

function mapOpportunityStage(item: ApiOpportunityStageConfig): OpportunityStageConfig {
  return { id: item.id, slug: item.slug, name: item.name, isTerminal: item.is_terminal, requiresOutcomeReason: item.requires_outcome_reason, isActive: item.is_active, displayOrder: item.display_order }
}

function mapOpportunityStageTransition(item: ApiOpportunityStageTransitionConfig): OpportunityStageTransitionConfig {
  return { id: item.id, fromStage: item.from_stage, toStage: item.to_stage, isActive: item.is_active, requiresReason: item.requires_reason }
}

function mapAdjacency(item: ApiAdjacency): ServiceAdjacencyRule {
  return { id: item.id, sourceServiceId: item.source_service_id, sourceServiceName: item.source_service_name, targetServiceId: item.target_service_id, targetServiceName: item.target_service_name, relevanceScore: item.relevance_score, rationale: item.rationale, isActive: item.is_active }
}

function mapWhitespace(item: ApiWhitespaceItem): WhitespaceItem {
  return { id: item.id, accountId: item.account_id, engagementId: item.engagement_id, serviceId: item.service_id, serviceName: item.service_name, coverageStatus: item.coverage_status, notes: item.notes, source: item.source }
}

function mapRecommendation(item: ApiServiceRecommendation): ServiceRecommendation {
  return { id: item.id, accountId: item.account_id, sourceServiceId: item.source_service_id, sourceServiceName: item.source_service_name, targetServiceId: item.target_service_id, targetServiceName: item.target_service_name, relevanceScore: item.relevance_score, rationale: item.rationale, status: item.status, sourceContext: item.source_context, createdOpportunityId: item.created_opportunity_id }
}

function mapRenewal(item: ApiRenewalProfile): RenewalProfile {
  return { id: item.id, accountId: item.account_id, engagementId: item.engagement_id, renewalReadiness: item.renewal_readiness, renewalRisk: item.renewal_risk, confidence: item.confidence, commercialExposure: item.commercial_exposure, commercialExposureCurrency: item.commercial_exposure_currency, ownerId: item.owner_id, ownerName: item.owner_name, sourceType: item.source_type, sourceCitation: item.source_citation, manualOverrideReason: item.manual_override_reason, sowStartDate: item.sow_start_date, sowEndDate: item.sow_end_date, renewalDate: item.renewal_date, noticeDeadline: item.notice_deadline, noticePeriodDays: item.notice_period_days, autoRenewal: item.auto_renewal, daysToExpiry: item.days_to_expiry, renewalStatus: item.renewal_status }
}

function mapRetentionPlan(item: ApiRetentionPlan): RetentionPlan {
  return { id: item.id, accountId: item.account_id, engagementId: item.engagement_id, planType: item.plan_type, status: item.status, title: item.title, summary: item.summary, ownerId: item.owner_id, ownerName: item.owner_name, ownerEmail: item.owner_email, renewalMilestoneAt: item.renewal_milestone_at, successCriteria: item.success_criteria, sourceContext: item.source_context, actions: item.actions.map(mapAction) }
}

function mapRetentionRecommendation(item: ApiRetentionRecommendation): RetentionRecommendation {
  return { id: item.id, accountId: item.account_id, engagementId: item.engagement_id, title: item.title, rationale: item.rationale, severity: item.severity, recommendedAction: item.recommended_action, sourceContext: item.source_context, status: item.status, createdTaskId: item.created_task_id }
}
